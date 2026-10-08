/**
 * What `dependency:analyze` of maven-dependency-plugin 3.11.0 writes for each module of a reactor, read by the
 * runner: one finding per gap, with its rule, its module and the dependency. A use the module does not declare
 * is located at each of its sources that imports a class the analysis names, at the line of the import; a
 * declaration the module does not use, at the POM that declares it, the module's or a parent's, at the line of
 * its `artifactId`. The lists of ignored dependencies are not gaps, and an output that is absent or cannot be
 * read concludes nothing.
 */
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let workspace: string;
let root: string;
const cleanups = removedAfterEach();

const MAIN = "app/src/main/java/io/demo/app/Main.java";
const MAIN_TEST = "app/src/test/java/io/demo/app/MainTest.java";

const modulePom = (artifactId: string, dependencies: string) => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version></parent>
  <artifactId>${artifactId}</artifactId>
  <dependencies>
${dependencies}  </dependencies>
</project>
`;

const FILES: Record<string, string> = {
	"pom.xml": `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version>
  <packaging>pom</packaging>
  <modules><module>domain</module><module>infrastructure</module><module>app</module></modules>
  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>org.slf4j</groupId>
        <artifactId>slf4j-api</artifactId>
        <version>2.0.17</version>
      </dependency>
    </dependencies>
  </dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.slf4j</groupId>
      <artifactId>slf4j-api</artifactId>
    </dependency>
  </dependencies>
</project>
`,
	"domain/pom.xml": modulePom("domain", ""),
	"infrastructure/pom.xml": modulePom(
		"infrastructure",
		`    <dependency><groupId>io.demo</groupId><artifactId>domain</artifactId><version>1.0.0</version></dependency>
    <dependency>
      <groupId>com.google.guava</groupId>
      <artifactId>guava</artifactId>
      <version>33.5.0-jre</version>
    </dependency>
`,
	),
	"app/pom.xml": modulePom(
		"app",
		"    <dependency><groupId>io.demo</groupId><artifactId>infrastructure</artifactId><version>1.0.0</version></dependency>\n",
	),
	"domain/src/main/java/io/demo/domain/User.java": "package io.demo.domain;\n\npublic class User {}\n",
	"infrastructure/src/main/java/io/demo/infra/UserStore.java":
		"package io.demo.infra;\n\nimport io.demo.domain.User;\n\npublic class UserStore {\n    public User load() {\n        return new User();\n    }\n}\n",
	[MAIN]:
		"package io.demo.app;\n\nimport io.demo.infra.UserStore;\nimport io.demo.domain.User;\n\npublic class Main {\n    public User run() {\n        return new UserStore().load();\n    }\n}\n",
	[MAIN_TEST]: "package io.demo.app;\n\nclass MainTest {}\n",
};

beforeEach(() => {
	root = tempDir("495-dependency-analyze-", cleanups);
	workspace = join(root, "ws");
	writeFiles(workspace, FILES);
});

/** The line of `path` that holds `text`, counted from 1. */
const lineOf = (path: string, text: string) => FILES[path]!.split("\n").findIndex((l) => l.includes(text)) + 1;

/** The section Maven 3.9 writes for one module, with what `dependency:analyze` 3.11.0 logs in it. */
function moduleSection(artifactId: string, index: number, analysis: readonly string[]): string {
	return [
		"[INFO] ",
		`[INFO] ${`< io.demo:${artifactId} >`.padStart(40, "-").padEnd(72, "-")}`,
		`[INFO] Building ${artifactId} 1.0.0                                              [${index}/4]`,
		`[INFO]   from ${artifactId}/pom.xml`,
		"[INFO] --------------------------------[ jar ]---------------------------------",
		"[INFO] ",
		`[INFO] --- compiler:3.13.0:compile (default-compile) @ ${artifactId} ---`,
		"[INFO] Nothing to compile - all classes are up to date.",
		"[INFO] ",
		`[INFO] --- dependency:3.11.0:analyze (analyze495) @ ${artifactId} ---`,
		...analysis,
	].join("\n");
}

/** The output of a build of the reactor whose analysis of each module is given. */
function analysed(domain: readonly string[], infrastructure: readonly string[], app: readonly string[]): string {
	return [
		"[INFO] Scanning for projects...",
		"[INFO] ------------------------------------------------------------------------",
		"[INFO] Reactor Build Order:",
		"[INFO] ",
		`[INFO] --- dependency:3.11.0:analyze (analyze495) @ reactor ---`,
		"[INFO] Skipping pom project",
		moduleSection("domain", 2, domain),
		moduleSection("infrastructure", 3, infrastructure),
		moduleSection("app", 4, app),
		"[INFO] ------------------------------------------------------------------------",
		"[INFO] BUILD SUCCESS",
		"",
	].join("\n");
}

const NO_PROBLEM = ["[INFO] No dependency problems found"];

const INFRASTRUCTURE_UNUSED_GUAVA = [
	"[INFO] Used declared dependencies found:",
	"[INFO]    io.demo:domain:jar:1.0.0:compile",
	"[WARNING] Unused declared dependencies found:",
	"[WARNING]    com.google.guava:guava:jar:33.5.0-jre:compile",
	"[INFO] Ignored unused declared dependencies:",
	"[INFO]    com.google.guava:guava:jar:33.5.0-jre:compile",
];

const APP_USES_DOMAIN = [
	"[INFO] Used declared dependencies found:",
	"[INFO]    io.demo:infrastructure:jar:1.0.0:compile",
	"[WARNING] Used undeclared dependencies found:",
	"[WARNING]    io.demo:domain:jar:1.0.0:compile",
	"[WARNING]       class io.demo.domain.User",
	"[INFO] Ignored used undeclared dependencies:",
	"[INFO]    io.demo:domain:jar:1.0.0:compile",
];

/** The dependencies control, reading the output its run wrote on its standard output. */
async function readDependencies(output: string, exitCode = 0) {
	const outputFile = join(root, "maven.out");
	writeFiles(root, { "maven.out": output });
	const control = controlOf({
		control_id: "dependencies",
		parser: "dependency-analyze",
		command: [
			process.execPath,
			"-e",
			`process.stdout.write(require("node:fs").readFileSync(${JSON.stringify(outputFile)}, "utf8")); process.exit(${exitCode})`,
		],
	});
	const runner = new GenericControlRunner(
		new UnconfinedSandbox(),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);
	return (await runner.runControl({ ...invocationBase(), control, workspace_path: workspace, introduced_lines: {} }))
		.evidence;
}

const located = (
	findings: readonly { rule_id: string; path: string | null; region: { start_line: number } | null }[],
) => findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);

const USED_UNDECLARED = "every module declares the dependencies its code uses";
const UNUSED_DECLARED = "every module uses the dependencies it declares";

describe("the output of dependency:analyze is read gap by gap", () => {
	it("la sortie de dependency:analyze donne un constat pour l'usage de io.demo:domain par app, à la ligne de l'import de io.demo.domain.User dans app/src/main/java/io/demo/app/Main.java, et un pour la déclaration inutilisée de Guava, à sa ligne de infrastructure/pom.xml", async () => {
		const evidence = await readDependencies(analysed(NO_PROBLEM, INFRASTRUCTURE_UNUSED_GUAVA, APP_USES_DOMAIN));
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.deepEqual(located(evidence.findings), [
			`${UNUSED_DECLARED} | infrastructure/pom.xml:${lineOf("infrastructure/pom.xml", "<artifactId>guava</artifactId>")}`,
			`${USED_UNDECLARED} | ${MAIN}:${lineOf(MAIN, "import io.demo.domain.User;")}`,
		]);
		const [guava, domain] = evidence.findings;
		assert.match(guava!.message, /infrastructure declares com\.google\.guava:guava without using it/);
		assert.match(domain!.message, /app uses io\.demo:domain without declaring it/);
		assert.match(domain!.message, /io\.demo\.domain\.User/, "the use names the class the analysis found");
		assert.ok(
			evidence.findings.every((f) => f.category === "structure"),
			"a gap between the POMs and the code is a finding about the structure",
		);
	});

	it("une déclaration héritée du POM parent est localisée à sa ligne de ce POM", async () => {
		const evidence = await readDependencies(
			analysed(
				["[WARNING] Unused declared dependencies found:", "[WARNING]    org.slf4j:slf4j-api:jar:2.0.17:compile"],
				NO_PROBLEM,
				NO_PROBLEM,
			),
		);
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		const declared = FILES["pom.xml"]!.split("\n");
		const inherited =
			declared.findIndex(
				(l, i) => l.includes("<artifactId>slf4j-api</artifactId>") && i > lineOf("pom.xml", "</dependencyManagement>"),
			) + 1;
		assert.deepEqual(located(evidence.findings), [`${UNUSED_DECLARED} | pom.xml:${inherited}`]);
		assert.match(evidence.findings[0]!.message, /domain declares org\.slf4j:slf4j-api without using it/);
	});

	it("les listes Ignored ne donnent aucun constat", async () => {
		const ignoredOnly = [
			"[INFO] Used declared dependencies found:",
			"[INFO]    io.demo:infrastructure:jar:1.0.0:compile",
			"[INFO] Ignored used undeclared dependencies:",
			"[INFO]    io.demo:domain:jar:1.0.0:compile",
			"[INFO] Ignored unused declared dependencies:",
			"[INFO]    com.google.guava:guava:jar:33.5.0-jre:compile",
			"[INFO] Ignored non-test scoped test only dependencies:",
			"[INFO]    io.demo:infrastructure:jar:1.0.0:compile",
		];
		const evidence = await readDependencies(analysed(NO_PROBLEM, NO_PROBLEM, ignoredOnly));
		assert.equal(evidence.verdict, "PASS", evidence.limits.notes.join("; "));
		assert.deepEqual(evidence.findings, []);
	});

	it("une sortie absente ou illisible rend INDETERMINATE", async () => {
		const absent = await readDependencies("[INFO] Scanning for projects...\n[INFO] BUILD SUCCESS\n");
		assert.equal(absent.verdict, "INDETERMINATE");
		assert.match(absent.limits.notes.join("; "), /no output of dependency:analyze/);

		const failed = await readDependencies("[ERROR] Failed to execute goal on project app: compilation failure\n", 1);
		assert.equal(failed.verdict, "INDETERMINATE");
		assert.match(failed.limits.notes.join("; "), /exited with 1/);

		const unreadable = await readDependencies(
			analysed(NO_PROBLEM, ["[WARNING] Unused declared dependencies found:", "[WARNING]    guava"], NO_PROBLEM),
		);
		assert.equal(unreadable.verdict, "INDETERMINATE");
		assert.match(unreadable.limits.notes.join("; "), /output of dependency:analyze .* cannot be read/);
		assert.deepEqual(unreadable.findings, []);

		const skipped = await readDependencies(analysed(NO_PROBLEM, NO_PROBLEM, ["[INFO] Skipping plugin execution"]));
		assert.equal(skipped.verdict, "INDETERMINATE", "a module whose analysis was skipped was not analysed");
		assert.match(skipped.limits.notes.join("; "), /app/);
	});
});
