/**
 * The file of ignored patterns ArchUnit looks up on the classpath its rules run on: a file of the project, in the
 * resources of a module or in the test resources of the module that hosts the rules, silences no rule of the
 * adopted map, since the lookup finds first the empty file 495 writes with the rules.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DOMAIN_MAP, DOMAIN_SOURCES } from "../helpers/architecture-survey.ts";
import { outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { mavenBench, mavenReference, qualifyByWitnesses, widenForMaven } from "../helpers/maven-bench.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const mavenAvailable = spawnSync("mvn", ["-v"], { stdio: "ignore" }).status === 0;

const REFS = [{ requirement_id: "ARC-01", revision: 1 }];

const pom = (artifactId: string, dependsOn: readonly string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version></parent>
  <artifactId>${artifactId}</artifactId>
  <dependencies>
${dependsOn.map((d) => `    <dependency><groupId>io.demo</groupId><artifactId>${d}</artifactId><version>1.0.0</version></dependency>\n`).join("")}  </dependencies>
</project>
`;

const USER = "domain/src/main/java/io/demo/domain/user/User.java";
const USER_SERVICE = "domain/src/main/java/io/demo/domain/service/UserService.java";

/** The model of the domain calls a service of the domain, which the onion of the part `domain` forbids. */
const USER_CALLS_SERVICE =
	"package io.demo.domain.user;\n\nimport io.demo.domain.service.UserService;\n\npublic class User {\n    public String name() {\n        return UserService.describe();\n    }\n}\n";

/** The pattern that covers the line of that violation, which names the method called. */
const IGNORED = ".*UserService\\.describe.*\n";

/** In `domain`, the resources of the module; in `infrastructure`, which hosts the rules, its test resources. */
const PROJECT_IGNORE_FILES = [
	"domain/src/main/resources/archunit_ignore_patterns.txt",
	"infrastructure/src/test/resources/archunit_ignore_patterns.txt",
];

/** The reactor of `domain` and `infrastructure`, whose model calls a service of the domain, with the project's files of ignored patterns. */
const REACTOR: Record<string, string> = {
	"pom.xml": `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version>
  <packaging>pom</packaging>
  <modules><module>domain</module><module>infrastructure</module></modules>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.10.2</version><scope>test</scope></dependency>
  </dependencies>
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
	"domain/pom.xml": pom("domain", []),
	"infrastructure/pom.xml": pom("infrastructure", ["domain"]),
	...DOMAIN_SOURCES,
	[USER]: USER_CALLS_SERVICE,
	[USER_SERVICE]:
		'package io.demo.domain.service;\n\npublic class UserService {\n    public static String describe() {\n        return "a user";\n    }\n}\n',
	...Object.fromEntries(PROJECT_IGNORE_FILES.map((path) => [path, IGNORED])),
};

describe("ArchUnit's file of ignored patterns on a Maven reactor", {
	skip: !mavenAvailable && "mvn is not on PATH",
}, () => {
	const cleanups = removedAfterEach();

	it("sur le réacteur domain et infrastructure dont la classe User du modèle appelle UserService, un archunit_ignore_patterns.txt du projet qui vise la ligne de cette violation, dans les ressources de domain et dans les ressources de test d'infrastructure, laisse le contrôle d'architecture qualifié par ses témoins, et la passe de référence rapporte la règle des anneaux de domain à User.java et à la ligne de l'appel", async () => {
		const root = outputDir("maven-architecture-ignore-", cleanups);
		const project = join(root, "project");
		writeFiles(project, REACTOR);
		const offered = STACKS_OF_495.recognise(project, REFS, process.execPath, [], DOMAIN_MAP).architecture_verification;
		assert.ok(
			offered?.kind === "proposed",
			`the adapter declares ArchUnit for the adopted map: ${JSON.stringify(offered)}`,
		);
		const { edit, install } = offered.recommendation;
		assert.ok(edit && install, "the recommendation carries the declaration of ArchUnit and its resolution");
		const reference = mavenReference(root, project, edit, install);
		const detection = STACKS_OF_495.recognise(reference, REFS, process.execPath, [], DOMAIN_MAP);
		const architecture = detection.controls.find((c) => c.control_id === "architecture");
		const own = detection.own_negative_witness.architecture;
		assert.ok(architecture && own, "the copy that declares ArchUnit gets the architecture control and its own witness");

		const bench = mavenBench(root);
		const q = await qualifyByWitnesses(bench, root, reference, architecture, detection.positive_witness, own);
		assert.deepEqual([q.positive, q.negative, q.qualified], ["PASS", "FAIL", true], JSON.stringify(q.notes));

		const pass = (
			await bench.runner.runControl({ ...bench.base, control: widenForMaven(architecture), workspace_path: reference })
		).evidence;
		const line = USER_CALLS_SERVICE.split("\n").findIndex((l) => l.includes("UserService.describe()")) + 1;
		const located = pass.findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);
		assert.equal(pass.verdict, "FAIL", `no file of the project silences a rule of the map:\n${located.join("\n")}`);
		assert.ok(
			located.includes(`part domain keeps the rings of its onion | ${USER}:${line}`),
			`the call of the model on a service of the domain is reported at its line although the project ignores it:\n${located.join("\n")}`,
		);
		for (const path of PROJECT_IGNORE_FILES)
			assert.equal(readFileSync(join(reference, path), "utf8"), IGNORED, `${path} of the project is not changed`);
	});
});
