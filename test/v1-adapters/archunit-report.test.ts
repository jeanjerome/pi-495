/**
 * The report Surefire writes for the architecture rules 495 runs with ArchUnit, read by the runner: one
 * finding per violation, with the rule of the map it breaks, the source file relative to the copy found
 * from the class, and the line; a source no part covers is given at its file. The whole tree is judged,
 * not only the lines a change introduces, and a report that is absent or cannot be read concludes nothing.
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

const USER = "domain/src/main/java/io/demo/domain/user/User.java";
const REPOSITORY = "infrastructure/src/main/java/io/demo/infra/JdbcUserRepository.java";
const OLD_USER = "domain/src/main/java/io/demo/domain/legacy/OldUser.java";
const REPORT = "infrastructure/target/surefire-reports/TEST-Architecture495Test.xml";

beforeEach(() => {
	root = tempDir("495-archunit-report-", cleanups);
	workspace = join(root, "ws");
	writeFiles(workspace, {
		"pom.xml": "<project/>\n",
		[USER]: "package io.demo.domain.user;\n",
		[REPOSITORY]: "package io.demo.infra;\n",
		[OLD_USER]: "package io.demo.domain.legacy;\n",
		// A test class of the same name is not the main source a violation names.
		"domain/src/test/java/io/demo/domain/user/User.java": "package io.demo.domain.user;\n",
	});
});

const escaped = (text: string) =>
	text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&apos;");

/** A failing test case of the rules, as Surefire writes the AssertionError ArchUnit 1.5.1 throws. */
function failed(field: string, rule: string, violations: readonly string[]): string {
	const message = `Architecture Violation [Priority: MEDIUM] - Rule '${rule}' was violated (${violations.length} times):\n${violations.join("\n")}`;
	return `  <testcase name="${field}" classname="Architecture495Test" time="0.262">
    <failure message="${escaped(message).replaceAll("\n", "&#10;")}" type="java.lang.AssertionError"><![CDATA[java.lang.AssertionError:
${message}
	at com.tngtech.archunit.lang.ArchRule$Assertions.assertNoViolation(ArchRule.java:94)
	at com.tngtech.archunit.lang.ArchRule$Assertions.check(ArchRule.java:86)
]]></failure>
  </testcase>
`;
}

function report(cases: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report-3.0.xsd" version="3.0" name="Architecture495Test" time="0.28" tests="3" errors="0" skipped="0" failures="2">
  <properties>
  </properties>
${cases}  <testcase name="cycles1" classname="Architecture495Test" time="0.007"/>
</testsuite>
`;
}

/** The architecture control, reading the report its run left; the build fails as Maven does when a rule fails. */
async function readArchitecture(exitCode = 1, introducedLines: Record<string, number[]> | null = null) {
	const control = controlOf({
		control_id: "architecture",
		parser: "archunit-xml",
		report_path: "**/target/surefire-reports",
		command: [process.execPath, "-e", `process.exit(${exitCode})`],
	});
	const runner = new GenericControlRunner(
		new UnconfinedSandbox(),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);
	return (
		await runner.runControl({
			...invocationBase(),
			control,
			workspace_path: workspace,
			introduced_lines: introducedLines,
		})
	).evidence;
}

const located = (
	findings: readonly { rule_id: string; path: string | null; region: { start_line: number } | null }[],
) => findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);

describe("the report of the architecture rules is read violation by violation", () => {
	it("un rapport d'ArchUnit donne un constat par violation, avec la règle de la carte, le fichier relatif à la copie retrouvé depuis la classe et la ligne", async () => {
		writeFiles(workspace, {
			[REPORT]: report(
				failed("part1", "part domain keeps the rings of its onion", [
					"Method <io.demo.domain.user.User.service()> calls constructor <io.demo.domain.service.UserService.<init>()> in (User.java:6)",
					"Method <io.demo.domain.user.User.service()> calls method <io.demo.domain.service.UserService.find()> in (User.java:6)",
				]) +
					failed("relation1", "part infrastructure may not depend on part web", [
						"Field <io.demo.infra.JdbcUserRepository$Cache.page> has type <io.demo.web.Page> in (JdbcUserRepository.java:12)",
					]),
			),
		});
		// Nothing is introduced: the structure of the whole tree is measured all the same.
		const evidence = await readArchitecture(1, {});
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.deepEqual(located(evidence.findings), [
			`part domain keeps the rings of its onion | ${USER}:6`,
			`part domain keeps the rings of its onion | ${USER}:6`,
			`part infrastructure may not depend on part web | ${REPOSITORY}:12`,
		]);
		assert.ok(
			evidence.findings[1]!.message.includes("calls method <io.demo.domain.service.UserService.find()>"),
			`each finding says the violation: ${evidence.findings[1]!.message}`,
		);
		assert.ok(
			evidence.findings.every((f) => f.category === "structure"),
			"a violation of the map is a finding about the structure",
		);
	});

	it("une source sans partie est rapportée à son fichier", async () => {
		writeFiles(workspace, {
			[REPORT]: report(
				failed("covered", "every main source belongs to a part", [
					"Class <io.demo.domain.legacy.OldUser> does not reside in any package ['io.demo.domain.user', 'io.demo.domain.service'] in (OldUser.java:0)",
				]),
			),
		});
		const evidence = await readArchitecture();
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.deepEqual(located(evidence.findings), [`every main source belongs to a part | ${OLD_USER}:-`]);
	});

	it("un rapport absent ou illisible rend INDETERMINATE", async () => {
		const absent = await readArchitecture(0);
		assert.equal(absent.verdict, "INDETERMINATE");
		assert.match(absent.limits.notes.join("; "), /no report of the architecture rules/);

		writeFiles(workspace, { [REPORT]: '<?xml version="1.0"?>\n<testsuite name="Architecture495Test"><testcase' });
		const unreadable = await readArchitecture();
		assert.equal(unreadable.verdict, "INDETERMINATE");
		assert.match(unreadable.limits.notes.join("; "), /report of the architecture rules .* cannot be read/);
		assert.deepEqual(unreadable.findings, []);
	});
});
