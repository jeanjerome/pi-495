import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function tempDir(prefix = "495-"): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

export function gitCmd(cwd: string, args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x", GIT_TERMINAL_PROMPT: "0" } });
}

export function writeFiles(root: string, files: Record<string, string>): void {
	mkdirSync(root, { recursive: true });
	for (const [rel, content] of Object.entries(files)) {
		mkdirSync(join(root, rel, ".."), { recursive: true });
		writeFileSync(join(root, rel), content);
	}
}

/** F-TS: small JavaScript project with node:test tests and a lint script. */
export function fixtureTs(root: string): void {
	writeFiles(root, {
		"package.json": JSON.stringify({ name: "f-ts", version: "1.0.0", type: "module", scripts: { test: "node --test", lint: "node scripts/lint.js" } }, null, 2),
		"src/greet.js": "export function greet(name) {\n  return `Hello, ${name}`;\n}\n",
		"test/greet.test.js": 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { greet } from "../src/greet.js";\n\ntest("greet", () => {\n  assert.equal(greet("x"), "Hello, x");\n});\n',
		"scripts/lint.js": 'import { readFileSync } from "node:fs";\nconst src = readFileSync(new URL("../src/greet.js", import.meta.url), "utf8");\nif (/\\bvar\\b/.test(src)) { console.error("lint: var is forbidden"); process.exit(1); }\nconsole.log("lint ok");\n',
		"README.md": "# f-ts\n",
	});
}

export function initRepo(root: string, commit = true): void {
	gitCmd(root, ["init", "-q", "-b", "main"]);
	if (commit) {
		gitCmd(root, ["add", "-A"]);
		gitCmd(root, ["commit", "-qm", "initial"]);
	}
}

const ESC = String.fromCharCode(27);

/** F-SPECIAL: binary, escaping symlink, directory symlink, executable, hostile file name. */
export function fixtureSpecial(root: string): void {
	mkdirSync(join(root, "bin"), { recursive: true });
	writeFileSync(join(root, "bin", "data.bin"), Buffer.from([0, 1, 2, 255, 254]));
	writeFileSync(join(root, `hostile${ESC}[31mname.txt`), "x");
	symlinkSync("../etc/passwd", join(root, "escape-link"));
	symlinkSync("src", join(root, "src-link"));
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "src", "exec.sh"), "#!/bin/sh\necho hi\n");
	chmodSync(join(root, "src", "exec.sh"), 0o755);
}

export { ESC };

/** F-JAVA: minimal Maven project with JUnit 5 (Surefire XML reports under target/surefire-reports). */
export function fixtureJava(root: string): void {
	writeFiles(root, {
		"pom.xml": `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.h495</groupId>
  <artifactId>f-java</artifactId>
  <version>1.0.0</version>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.10.2</version>
      <scope>test</scope>
    </dependency>
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
		"src/main/java/io/h495/Greeter.java": "package io.h495;\n\npublic final class Greeter {\n    private Greeter() {}\n\n    public static String greet(String name) {\n        return \"Hello, \" + name;\n    }\n}\n",
		"src/test/java/io/h495/GreeterTest.java": "package io.h495;\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\nclass GreeterTest {\n    @Test\n    void greets() {\n        assertEquals(\"Hello, x\", Greeter.greet(\"x\"));\n    }\n}\n",
	});
}

/** Maven reactor with an aggregator root and two leaf modules. */
export function fixtureMavenMultiModule(root: string, withTests = false): void {
	const modulePom = (artifactId: string) => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>io.h495</groupId><artifactId>reactor</artifactId><version>1.0.0</version></parent>
  <artifactId>${artifactId}</artifactId>
</project>
`;
	const files: Record<string, string> = {
		"pom.xml": `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.h495</groupId><artifactId>reactor</artifactId><version>1.0.0</version>
  <packaging>pom</packaging>
  <modules><module>domain</module><module>infrastructure</module><module>../outside</module></modules>
</project>
`,
		"domain/pom.xml": modulePom("domain"),
		"infrastructure/pom.xml": modulePom("infrastructure"),
		"domain/src/main/java/io/h495/Address.java": "package io.h495; public final class Address {}\n",
		"infrastructure/src/main/java/io/h495/Adapter.java": "package io.h495; public final class Adapter {}\n",
	};
	if (withTests) {
		files["domain/src/test/java/io/h495/AddressTest.java"] = "package io.h495; public final class AddressTest {}\n";
		files["infrastructure/src/test/java/io/h495/AdapterTest.java"] = "package io.h495; public final class AdapterTest {}\n";
	}
	writeFiles(root, files);
}
