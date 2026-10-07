/**
 * The witnesses of PMD are judged on the whole report: a project that already carries more than the
 * 1000 findings a report gives does not push a witness's own violation out of what the qualification
 * reads, whether that violation stands for the defect or contradicts the positive witness.
 */
import { strict as assert } from "node:assert";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import type { Qualification } from "../../src/contracts/v1/protocol.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-pmd-witness-past-bound-", cleanups);
});

const PROJECT_FILE = "src/main/java/io/h495/Grader.java";
const POSITIVE_FILE = "src/main/java/witness495/Witness495Clean.java";
const NEGATIVE_FILE = "src/main/java/witness495/Witness495Complex.java";
const WITNESS = "package witness495;\n\nclass Witness495 {\n\tint grade(int a) { return a; }\n}\n";

/** A violation of CyclomaticComplexity at `line` of `path`, as PMD names it under `base`. */
function violation(base: string, path: string, line: number): string {
	return `<file name="${base}/${path}">
<violation beginline="${line}" endline="${line}" rule="CyclomaticComplexity" ruleset="Design" priority="3">
The method 'grade(int, int, int)' has a cyclomatic complexity of 11.
</violation>
</file>
`;
}

/** PMD's report of a copy of the project under `base`: the project's 1000 violations, then `witness`'s, if any. */
function reportPast1000(base: string, witness: string | null): string {
	const project = Array.from({ length: 1000 }, (_, i) => violation(base, PROJECT_FILE, i + 1)).join("");
	return `<?xml version="1.0" encoding="UTF-8"?>
<pmd xmlns="http://pmd.sourceforge.net/report/2.0.0" version="7.17.0" timestamp="2026-10-03T01:23:21.508">
${project}${witness === null ? "" : violation(base, witness, 4)}</pmd>
`;
}

/** Qualifies `pmd` on two copies of the project, each witness's report naming the violation of `positive` or `negative` past 1000. */
async function qualifiedPast1000(positive: string | null, negative: string | null): Promise<Qualification> {
	const copy = (name: string, files: Record<string, string>, witness: string | null): string => {
		writeFiles(join(root, name), { "pom.xml": "<project/>\n", [PROJECT_FILE]: "class Grader {}\n", ...files });
		const path = realpathSync(join(root, name));
		writeFiles(path, { "target/pmd.xml": reportPast1000(path, witness) });
		return path;
	};
	const positiveFiles = { [POSITIVE_FILE]: WITNESS };
	const negativeFiles = { [NEGATIVE_FILE]: WITNESS };
	const runner = new GenericControlRunner(
		new UnconfinedSandbox(),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);
	return qualifyControl(
		runner,
		controlOf({ control_id: "pmd", parser: "pmd-xml", report_path: "**/target" }),
		{
			positive_path: copy("positive", positiveFiles, positive),
			negative_path: copy("negative", negativeFiles, negative),
			positive_files: positiveFiles,
			negative_files: negativeFiles,
		},
		invocationBase(),
	);
}

describe("the witnesses of PMD are judged on the whole report", () => {
	it("pmd est qualifié quand la violation du témoin négatif vient après 1000 violations du projet, sans note disant que le contrôle ne détecte pas le défaut, et ne l'est pas, avec la note positive witness gave FAIL, quand c'est une violation du témoin positif qui vient après elles", async () => {
		const detected = await qualifiedPast1000(null, NEGATIVE_FILE);
		assert.deepEqual(
			[detected.positive, detected.negative, detected.qualified],
			["PASS", "FAIL", true],
			`the negative witness's violation past the project's 1000 is seen: ${detected.notes.join("; ")}`,
		);
		assert.ok(
			!detected.notes.some((n) => n.includes("does not detect the defect it claims to cover")),
			detected.notes.join("; "),
		);

		const contradicted = await qualifiedPast1000(POSITIVE_FILE, NEGATIVE_FILE);
		assert.deepEqual(
			[contradicted.positive, contradicted.qualified],
			["FAIL", false],
			`the positive witness's violation past the project's 1000 refuses the qualification: ${contradicted.notes.join("; ")}`,
		);
		assert.ok(
			contradicted.notes.some((n) => n.startsWith("positive witness gave FAIL")),
			contradicted.notes.join("; "),
		);
	});
});
