/**
 * The reports of PMD and of its duplication detector, read by the runner: one finding per violation
 * with its rule, its file and its line, one finding per duplication naming each place the block sits.
 * A report that is absent or cannot be read concludes nothing.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import {
	RULESET_PLACEHOLDER,
	type ControlDefinition,
	type ParserId,
	type Qualification,
	type QualityRule,
} from "../../src/contracts/v1/protocol.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";

let root: string;
let workspace: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-pmd-reports-", cleanups);
	workspace = join(root, "ws");
	writeFiles(workspace, { "pom.xml": "<project/>\n" });
	// PMD names each file by its absolute, resolved path.
	workspace = realpathSync(workspace);
});

const COMPLEX = "src/main/java/io/h495/Complex.java";

function pmdReport(violations: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<pmd xmlns="http://pmd.sourceforge.net/report/2.0.0" version="7.17.0" timestamp="2026-10-03T01:23:21.508">
${violations}</pmd>
`;
}

function violationsOf(base: string): string {
	return `<file name="${base}/${COMPLEX}">
<violation beginline="6" endline="6" begincolumn="18" endcolumn="23" rule="UnusedPrivateMethod" ruleset="Best Practices" package="io.h495" class="Complex" method="never" externalInfoUrl="https://docs.pmd-code.org/pmd-doc-7.17.0/pmd_rules_java_bestpractices.html#unusedprivatemethod" priority="3">
Avoid unused private methods such as 'never()'.
</violation>
<violation beginline="8" endline="8" begincolumn="16" endcolumn="21" rule="CyclomaticComplexity" ruleset="Design" package="io.h495" class="Complex" method="grade" externalInfoUrl="https://docs.pmd-code.org/pmd-doc-7.17.0/pmd_rules_java_design.html#cyclomaticcomplexity" priority="3">
The method 'grade(int, int, int)' has a cyclomatic complexity of 11.
</violation>
</file>
`;
}

function cpdReport(base: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<pmd-cpd xmlns="https://pmd-code.org/schema/cpd-report" pmdVersion="7.17.0" timestamp="2026-10-03T01:23:30.775034+02:00" version="1.0.0">
   <file path="${base}/src/main/java/io/h495/DupA.java" totalNumberOfTokens="110"/>
   <file path="${base}/src/main/java/io/h495/DupB.java" totalNumberOfTokens="110"/>
   <duplication lines="18" tokens="106">
      <file begintoken="122" column="25" endcolumn="2" endline="20" endtoken="227" line="3" path="${base}/src/main/java/io/h495/DupA.java"/>
      <file begintoken="233" column="25" endcolumn="2" endline="20" endtoken="338" line="3" path="${base}/src/main/java/io/h495/DupB.java"/>
      <codefragment><![CDATA[public final class DupA {
]]></codefragment>
   </duplication>
</pmd-cpd>
`;
}

/** A control that runs nothing and reads the report the workspace holds, as `parser` reads it. */
function reader(controlId: string, parser: ParserId): ControlDefinition {
	return controlOf({ control_id: controlId, parser, report_path: "**/target" });
}

async function run(control: ControlDefinition) {
	const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
	return (await runner.runControl({ ...invocationBase(), control, workspace_path: workspace })).evidence;
}

describe("the reports of PMD and CPD are read", () => {
	it("un rapport PMD donne un constat par violation avec sa règle, son fichier et sa ligne", async () => {
		writeFiles(workspace, {
			"target/pmd.xml": pmdReport(violationsOf(workspace)),
			"target/cpd.xml": cpdReport(workspace),
		});
		const evidence = await run(reader("pmd", "pmd-xml"));
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.deepEqual(
			evidence.findings.map((f) => [f.rule_id, f.path, f.region?.start_line]),
			[
				["UnusedPrivateMethod", COMPLEX, 6],
				["CyclomaticComplexity", COMPLEX, 8],
			],
			"one finding per violation, the duplications of the CPD report beside it left out",
		);
		assert.match(evidence.findings[1]!.message, /cyclomatic complexity of 11/);
		assert.ok(
			evidence.findings.every((f) => !f.message.includes(workspace)),
			"the file is named relative to the workspace",
		);

		writeFiles(workspace, { "target/pmd.xml": pmdReport("") });
		const clean = await run(reader("pmd", "pmd-xml"));
		assert.equal(clean.verdict, "PASS", "a report without violation passes");
		assert.deepEqual(clean.findings, []);
	});

	it("un rapport CPD donne un constat par duplication qui nomme ses emplacements", async () => {
		writeFiles(workspace, {
			"target/pmd.xml": pmdReport(violationsOf(workspace)),
			"target/cpd.xml": cpdReport(workspace),
		});
		const evidence = await run(reader("cpd", "cpd-xml"));
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.equal(evidence.findings.length, 1, "one finding per duplication, the PMD violations beside it left out");
		const [duplication] = evidence.findings;
		assert.equal(duplication?.rule_id, "CPD");
		assert.equal(duplication?.path, "src/main/java/io/h495/DupA.java");
		assert.equal(duplication?.region?.start_line, 3);
		assert.ok(duplication?.message.includes("src/main/java/io/h495/DupB.java:3"), "the second place is named");
		assert.match(duplication?.message ?? "", /\b106 tokens\b/);
	});

	it("un rapport absent ou illisible rend INDETERMINATE", async () => {
		for (const [controlId, parser] of [
			["pmd", "pmd-xml"],
			["cpd", "cpd-xml"],
		] as const) {
			const absent = await run(reader(controlId, parser));
			assert.equal(absent.verdict, "INDETERMINATE", `${parser}: absent`);
			assert.match(absent.limits.notes.join("; "), /no .*report/i, `${parser}: the note says the report is absent`);

			writeFiles(workspace, { [`target/${controlId}.xml`]: "<pmd><file" });
			const unreadable = await run(reader(controlId, parser));
			assert.equal(unreadable.verdict, "INDETERMINATE", `${parser}: unreadable`);
			assert.match(
				unreadable.limits.notes.join("; "),
				/cannot be read|not readable/i,
				`${parser}: the note says the report cannot be read`,
			);
		}
	});
});

describe("the bounds of a PMD report", () => {
	const violations = (count: number): string => {
		const violation = (line: number) =>
			`<violation beginline="${line}" endline="${line}" rule="UnusedLocalVariable" ruleset="Best Practices" priority="3">\nAvoid unused local variables.\n</violation>\n`;
		const many = Array.from({ length: count }, (_, i) => violation(i + 1)).join("");
		return pmdReport(`<file name="${workspace}/${COMPLEX}">\n${many}</file>\n`);
	};

	it("un rapport de plus de 1000 violations en donne les 1000 premières et une note les compte", async () => {
		writeFiles(workspace, { "target/pmd.xml": violations(1001) });
		const evidence = await run(reader("pmd", "pmd-xml"));
		assert.equal(evidence.verdict, "FAIL");
		assert.equal(evidence.findings.length, 1000);
		assert.match(evidence.limits.notes.join("; "), /1001 findings reduced to the first 1000/);
	});

	it("un rapport de 1000 violations les donne toutes, sans note", async () => {
		writeFiles(workspace, { "target/pmd.xml": violations(1000) });
		const evidence = await run(reader("pmd", "pmd-xml"));
		assert.equal(evidence.verdict, "FAIL");
		assert.equal(evidence.findings.length, 1000);
		assert.deepEqual(evidence.limits.notes, []);
	});

	it("un fichier que PMD n'a pas pu analyser rend INDETERMINATE et la note le nomme", async () => {
		writeFiles(workspace, {
			"target/pmd.xml": pmdReport(
				`<error filename="${workspace}/${COMPLEX}" msg="ParseException: unexpected token"/>\n`,
			),
		});
		const evidence = await run(reader("pmd", "pmd-xml"));
		assert.equal(evidence.verdict, "INDETERMINATE");
		assert.match(evidence.limits.notes.join("; "), /PMD could not analyse .*Complex\.java: ParseException/);
	});
});

const RULES: QualityRule[] = [
	{
		rule_id: "CyclomaticComplexity",
		nature: "complexity",
		control_id: "pmd",
		reference: "category/java/design.xml/CyclomaticComplexity",
		threshold: "a method whose cyclomatic complexity is 10 or more",
		properties: { methodReportLevel: "10" },
		tool: "PMD 7.17.0",
		source: "docs.pmd-code.org/pmd-doc-7.17.0/pmd_rules_java_design.html#cyclomaticcomplexity",
		established_on: "2026-10-03",
	},
	{
		rule_id: "UnusedPrivateMethod",
		nature: "dead_code",
		control_id: "pmd",
		reference: "category/java/bestpractices.xml/UnusedPrivateMethod",
		threshold: "any occurrence",
		properties: {},
		tool: "PMD 7.17.0",
		source: "docs.pmd-code.org/pmd-doc-7.17.0/pmd_rules_java_bestpractices.html#unusedprivatemethod",
		established_on: "2026-10-03",
	},
	{
		rule_id: "CPD",
		nature: "duplication",
		control_id: "cpd",
		reference: null,
		threshold: "a duplicated block of at least 100 tokens",
		properties: { minimumTokens: "100" },
		tool: "PMD 7.17.0",
		source: "maven.apache.org/plugins/maven-pmd-plugin/cpd-mojo.html#minimumTokens",
		established_on: "2026-10-03",
	},
];

describe("the rule set a PMD control applies", () => {
	it("le jeu de règles est écrit hors de l'espace de travail à partir des règles gelées du contrôle, chaque seuil en propriété, et retiré après l'exécution", async () => {
		// The control copies the rule set it is given into the workspace, with the path it was given.
		const copy =
			"const fs = require('fs'); fs.writeFileSync('seen.txt', process.argv[1] + '\\n' + fs.readFileSync(process.argv[1], 'utf8'));";
		const evidence = await run(
			controlOf({ command: [process.execPath, "-e", copy, RULESET_PLACEHOLDER], quality_rules: RULES }),
		);
		assert.equal(evidence.verdict, "PASS", evidence.limits.notes.join("; "));
		const [path, ...lines] = readFileSync(join(workspace, "seen.txt"), "utf8").split("\n");
		const ruleset = lines.join("\n");
		assert.ok(path && !path.startsWith(workspace), `the rule set is outside the workspace: ${path}`);
		assert.equal(existsSync(path), false, "the rule set is removed after the run");
		assert.match(
			ruleset,
			/<rule ref="category\/java\/design\.xml\/CyclomaticComplexity">\s*<properties>\s*<property name="methodReportLevel" value="10"\/>/,
		);
		assert.match(ruleset, /<rule ref="category\/java\/bestpractices\.xml\/UnusedPrivateMethod"\/>/);
		assert.ok(!ruleset.includes("CPD") && !ruleset.includes("minimumTokens"), "a rule with no reference is not in it");
		assert.ok(!ruleset.includes("xmlns"), "the rule set names no namespace address");
	});
});

const PROJECT_FILE = "src/main/java/io/h495/Grader.java";
const POSITIVE_FILE = "src/main/java/witness495/Witness495Clean.java";
const NEGATIVE_FILE = "src/main/java/witness495/Witness495Complex.java";

/** A violation of CyclomaticComplexity at line 3 of each file of `paths`, as PMD names them under `base`. */
function violationsIn(base: string, paths: readonly string[]): string {
	return paths
		.map(
			(path) => `<file name="${base}/${path}">
<violation beginline="3" endline="3" rule="CyclomaticComplexity" ruleset="Design" priority="3">
The method 'grade(int, int, int)' has a cyclomatic complexity of 11.
</violation>
</file>
`,
		)
		.join("");
}

/**
 * Qualifies a PMD control whose positive witness workspace reports violations in `positive` and whose
 * negative witness workspace reports them in `negative`, each witness having written its own file.
 */
async function qualifiedOn(positive: readonly string[], negative: readonly string[]): Promise<Qualification> {
	const workspaceOf = (name: string, violated: readonly string[], files: Record<string, string>): string => {
		writeFiles(join(root, name), { "pom.xml": "<project/>\n", ...files });
		const path = realpathSync(join(root, name));
		writeFiles(path, { "target/pmd.xml": pmdReport(violationsIn(path, violated)) });
		return path;
	};
	const positiveFiles = { [POSITIVE_FILE]: "class Witness495Clean {}\n" };
	const negativeFiles = { [NEGATIVE_FILE]: "class Witness495Complex {}\n" };
	const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
	return qualifyControl(
		runner,
		reader("pmd", "pmd-xml"),
		{
			positive_path: workspaceOf("positive", positive, positiveFiles),
			negative_path: workspaceOf("negative", negative, negativeFiles),
			positive_files: positiveFiles,
			negative_files: negativeFiles,
		},
		invocationBase(),
	);
}

describe("a PMD control is qualified by the findings in its witnesses' own files", () => {
	it("pmd est qualifié quand son témoin négatif a un constat dans son propre fichier, bien que le projet viole déjà une règle, et ne l'est pas quand il n'en trouve que dans le projet ou dans le fichier du témoin positif", async () => {
		const sound = await qualifiedOn([PROJECT_FILE], [PROJECT_FILE, NEGATIVE_FILE]);
		assert.deepEqual(
			[sound.positive, sound.negative, sound.qualified],
			["PASS", "FAIL", true],
			`a violation of the project neither disqualifies the sensor: ${sound.notes.join("; ")}`,
		);

		const blind = await qualifiedOn([PROJECT_FILE], [PROJECT_FILE]);
		assert.deepEqual(
			[blind.positive, blind.negative, blind.qualified],
			["PASS", "PASS", false],
			"a sensor that finds nothing in the negative witness's file is not qualified by the project's violation",
		);
		assert.ok(
			blind.notes.some((n) => n.includes("does not detect")),
			blind.notes.join("; "),
		);

		const flagsPositive = await qualifiedOn([PROJECT_FILE, POSITIVE_FILE], [PROJECT_FILE, NEGATIVE_FILE]);
		assert.deepEqual(
			[flagsPositive.positive, flagsPositive.negative, flagsPositive.qualified],
			["FAIL", "FAIL", false],
			"a sensor that finds a violation in the positive witness's own file is not qualified",
		);
	});
});
