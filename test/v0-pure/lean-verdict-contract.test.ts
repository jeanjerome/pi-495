import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { VERDICTS, type Verdict } from "../../src/contracts/v1/common.ts";
import { type CombinationMode, mandatoryOutcome, observeG5, requirementOutcome } from "../helpers/g5-combination.ts";

const REPOSITORY = join(import.meta.dirname, "..", "..");
const SPECIFICATION = join(REPOSITORY, "specs", "formal", "verdicts");
const TABLE = join(SPECIFICATION, "correspondance.json");
const G5 = join(REPOSITORY, "src", "domain", "gates", "g5.ts");
/** The rules of the combination the Lean specification is approved to state, and nothing else. */
const APPROVED_RULES = ["all_pass", "any_pass", "vide", "NOT_APPLICABLE"];

interface CorrespondenceTable {
	typescript: { file: string; function: string; observed_through: string };
	lean: { definitions: string; statements: string; combine: string };
	rules: {
		rule: string;
		typescript: string;
		statements: string[];
		cases: { mode: CombinationMode; verdicts: Verdict[]; combined: Verdict }[];
	}[];
}

/** The constructors of a Lean inductive type, in their declared order. */
function constructors(lean: string, type: string): string[] {
	const body = new RegExp(`^inductive ${type} where\\n((?:\\s+\\|\\s*\\w+\\n)+)`, "m").exec(lean)?.[1] ?? "";
	return [...body.matchAll(/\|\s*(\w+)/g)].map((m) => m[1] ?? "");
}

/** The names of the propositions a Lean file states as `def <Name> : Prop`. */
function statements(lean: string): string[] {
	return [...lean.matchAll(/^def (\w+) : Prop :=/gm)].map((m) => m[1] ?? "");
}

describe("the Lean specification of the verdict combination of G5", () => {
	it("its all/any, empty-list and NOT_APPLICABLE definitions match the approved correspondence table", () => {
		assert.ok(existsSync(TABLE), `no Lean specification of the verdict combination of G5: ${TABLE} is missing`);
		const table = JSON.parse(readFileSync(TABLE, "utf8")) as CorrespondenceTable;
		assert.deepEqual(
			table.rules.map((r) => r.rule),
			APPROVED_RULES,
			"the table states exactly the approved rules",
		);

		const definitions = readFileSync(join(SPECIFICATION, table.lean.definitions), "utf8");
		assert.deepEqual(constructors(definitions, "Verdict"), [...VERDICTS], "the Lean verdicts are those of the kernel");
		assert.deepEqual(constructors(definitions, "Mode"), ["all", "any"]);
		assert.match(definitions, /^def combine \(mode : Mode\) \(verdicts : List Verdict\) : Verdict :=/m);

		const stated = statements(readFileSync(join(SPECIFICATION, table.lean.statements), "utf8"));
		assert.deepEqual(
			[...stated].sort(),
			table.rules.flatMap((r) => r.statements).sort(),
			"every statement is approved by one rule of the table, and every approved statement is stated",
		);

		assert.equal(table.typescript.file, "src/domain/gates/g5.ts");
		assert.match(readFileSync(G5, "utf8"), new RegExp(`^function ${table.typescript.function}\\(`, "m"));
		for (const rule of table.rules) {
			assert.ok(rule.cases.length > 0, `rule ${rule.rule} has cases`);
			for (const c of rule.cases) {
				const observed = requirementOutcome(observeG5([{ mandatory: true, mode: c.mode, verdicts: c.verdicts }]), 0);
				assert.equal(
					observed,
					mandatoryOutcome(c.combined),
					`${rule.rule}: ${c.mode} [${c.verdicts.join(", ")}] combines to ${c.combined}, G5 says ${observed}`,
				);
			}
		}
	});
});
