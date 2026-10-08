/**
 * The reactor of `domain`, `infrastructure` and `app` whose POMs do not say what its code uses, the map adopted for
 * it, and the copy where the controls run once it declares the verification of that map by 495's declarations.
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { editedFile } from "../../src/application/complement.ts";
import type { ArchitectureHint, ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import { mavenReference } from "./maven-bench.ts";
import { writeFiles } from "./fixtures.ts";
import { STACKS_OF_495 } from "./technologies.ts";

export const REFS = [{ requirement_id: "ARC-01", revision: 1 }];

const dependency = (group: string, artifact: string, version: string, scope = "") =>
	`    <dependency>\n      <groupId>${group}</groupId>\n      <artifactId>${artifact}</artifactId>\n      <version>${version}</version>\n${scope ? `      <scope>${scope}</scope>\n` : ""}    </dependency>\n`;

const pom = (artifactId: string, dependencies: string) => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version></parent>
  <artifactId>${artifactId}</artifactId>
  <dependencies>
${dependencies}  </dependencies>
</project>
`;

export const MAIN = "app/src/main/java/io/demo/app/Main.java";
export const INFRASTRUCTURE_POM = "infrastructure/pom.xml";

/**
 * The reactor of `domain`, `infrastructure` and `app`: `app` declares `infrastructure` and imports a class of
 * `domain` without declaring it, and receives JUnit from the aggregate `junit-jupiter`; `infrastructure` declares
 * Guava, which none of its classes uses, and H2 for the runtime alone.
 */
export const DEPENDENCIES_REACTOR: Record<string, string> = {
	"pom.xml": `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version>
  <packaging>pom</packaging>
  <modules><module>domain</module><module>infrastructure</module><module>app</module></modules>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.2.5</version>
      </plugin>
    </plugins>
  </build>
</project>
`,
	"domain/pom.xml": pom("domain", ""),
	[INFRASTRUCTURE_POM]: pom(
		"infrastructure",
		dependency("io.demo", "domain", "1.0.0") +
			dependency("com.google.guava", "guava", "33.5.0-jre") +
			dependency("com.h2database", "h2", "2.4.240", "runtime"),
	),
	"app/pom.xml": pom(
		"app",
		dependency("io.demo", "infrastructure", "1.0.0") +
			dependency("org.junit.jupiter", "junit-jupiter", "5.10.2", "test"),
	),
	"domain/src/main/java/io/demo/domain/User.java": "package io.demo.domain;\n\npublic class User {}\n",
	"domain/src/main/java/io/demo/domain/port/UserRepository.java":
		"package io.demo.domain.port;\n\nimport io.demo.domain.User;\n\npublic interface UserRepository {\n    User load();\n}\n",
	"infrastructure/src/main/java/io/demo/infra/UserStore.java":
		"package io.demo.infra;\n\nimport io.demo.domain.User;\nimport io.demo.domain.port.UserRepository;\n\npublic class UserStore implements UserRepository {\n    public User load() {\n        return new User();\n    }\n}\n",
	[MAIN]:
		"package io.demo.app;\n\nimport io.demo.domain.User;\nimport io.demo.infra.UserStore;\n\npublic class Main {\n    public User run() {\n        return new UserStore().load();\n    }\n}\n",
	"app/src/test/java/io/demo/app/MainTest.java":
		"package io.demo.app;\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertNotNull;\n\nclass MainTest {\n    @Test\n    void runs() {\n        assertNotNull(new Main().run());\n    }\n}\n",
};

/** The line of `path` in the reactor that holds `text`, counted from 1. */
export const lineOf = (path: string, text: string) =>
	DEPENDENCIES_REACTOR[path]!.split("\n").findIndex((l) => l.includes(text)) + 1;

const at = (path: string): ArchitectureHint[] => [{ path, line: 1, says: "its package" }];

/** `domain` in onion, its model and its port; `infrastructure` and `app` simple, each may depend on what it uses. */
export const DEPENDENCIES_MAP: ArchitectureMap = {
	parts: [
		{
			name: "domain",
			perimeter: ["domain"],
			style: "onion",
			roles: [
				{ package: "io.demo.domain", role: "domain model", hints: at("domain/src/main/java/io/demo/domain/User.java") },
				{
					package: "io.demo.domain.port",
					role: "domain services",
					hints: at("domain/src/main/java/io/demo/domain/port/UserRepository.java"),
				},
			],
			hints: at("domain/pom.xml"),
		},
		{
			name: "infrastructure",
			perimeter: ["infrastructure"],
			style: "simple",
			roles: [{ package: "io.demo.infra", role: "persistence", hints: at(INFRASTRUCTURE_POM) }],
			hints: at(INFRASTRUCTURE_POM),
		},
		{
			name: "app",
			perimeter: ["app"],
			style: "simple",
			roles: [{ package: "io.demo.app", role: "application", hints: at(MAIN) }],
			hints: at("app/pom.xml"),
		},
	],
	relations: [
		{ from: "infrastructure", to: "domain", hints: at(INFRASTRUCTURE_POM) },
		{ from: "app", to: "infrastructure", hints: at("app/pom.xml") },
		{ from: "app", to: "domain", hints: at(MAIN) },
	],
};

/**
 * The copy of `reactor` where the controls run, carrying every declaration the verification of the map writes in a
 * copy: ArchUnit in the POM of its host, and each other file it declares itself in; and its detection.
 */
export function declaredReference(root: string, reactor: Record<string, string> = DEPENDENCIES_REACTOR) {
	const project = join(root, "project");
	writeFiles(project, reactor);
	const offered = STACKS_OF_495.recognise(project, REFS, process.execPath, [], DEPENDENCIES_MAP);
	const verification = offered.architecture_verification;
	assert.ok(
		verification?.kind === "proposed",
		`the adapter declares ArchUnit for the adopted map: ${JSON.stringify(verification)}`,
	);
	const { edit, install } = verification.recommendation;
	assert.ok(edit && install, "the recommendation carries the declaration of ArchUnit and its resolution");
	const reference = mavenReference(root, project, edit, install);
	for (const declaration of verification.declarations ?? [])
		writeFileSync(join(reference, declaration.path), editedFile(project, declaration) ?? "");
	return { reference, detection: STACKS_OF_495.recognise(reference, REFS, process.execPath, [], DEPENDENCIES_MAP) };
}

export const USED_UNDECLARED = "every module declares the dependencies its code uses";
export const UNUSED_DECLARED = "every module uses the dependencies it declares";
