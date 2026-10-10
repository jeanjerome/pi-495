/**
 * A target with an acceptance recipe, driven through the kernel by a scripted agent: the preparation writes the test
 * of shout, the producer writes shout, the reviewer approves.
 */
import { strict as assert } from "node:assert";
import type { AcceptanceRecipeDeclaration } from "../../src/contracts/v1/config.ts";
import type { ChangeState } from "../../src/domain/change/state.ts";
import { HUMAN } from "./change-fixture.ts";
import { fixtureTsWithoutTests, SHOUT_IMPL, SHOUT_TEST, writeFiles } from "./fixtures.ts";
import { makeHarness, specReport, trackedProject, type PolicyOverride, type TestHarness } from "./harness-fixture.ts";

/**
 * The acceptance recipe of the target: it drives `shout` through the module the package exposes, then a private copy
 * of that module deprived of `shout`, and writes what it observed of each. `--other` names another candidate than the
 * one it was given; `--summary` writes a summary without any observation.
 */
const RECIPE_SCRIPT = `import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [given, mode] = process.argv.slice(2);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const greeting = await import(join(process.cwd(), "src/greet.js"));
const observed = typeof greeting.shout === "function" ? greeting.shout("Ada") : "shout is missing";
const copy = mkdtempSync(join(tmpdir(), "recipe-negative-"));
writeFileSync(join(copy, "greet.mjs"), "export function greet(name) {\\n  return \\"Hello, \\" + name;\\n}\\n");
const deprived = await import(join(copy, "greet.mjs"));
const refused = typeof deprived.shout !== "function";
const report = {
	candidate: mode === "--other" ? "sha256:${"1".repeat(64)}" : given,
	built_version: pkg.name + "@" + pkg.version,
	entry: "node recipe.js",
	simulations: [],
	summary: "shout greets in upper case",
	observations: mode === "--summary" ? [] : [
		{ observation_id: "O1", requirement_id: "R1", observed, outcome: observed === "HELLO, ADA" ? "passed" : "failed" },
	],
	negative_control: { requirement_id: "R1", observed: refused ? "shout is missing" : "shout answered", outcome: refused ? "refused" : "accepted" },
};
writeFileSync("recipe-report.json", JSON.stringify(report));
`;

function recipe(command: string[]): AcceptanceRecipeDeclaration {
	return {
		journey: "shout a name through the module the package exposes",
		preconditions: ["the candidate is frozen"],
		entry: "node recipe.js",
		observations: [{ observation_id: "O1", requirement_id: "R1", expected: "shout('Ada') reads HELLO, ADA" }],
		negative_control: {
			requirement_id: "R1",
			deprived_of: "a private copy of greet.js without shout",
			expected: "shout is missing from the copy",
		},
		negative_not_applicable: null,
		simulations: [],
		not_exercised: ["a command line"],
		external_data: [],
		command,
		report_path: "recipe-report.json",
		timeout_ms: 60_000,
	};
}

const spec = specReport({
	objective: "add shout(name) returning the greeting in upper case",
	requirements: [
		{
			requirement_id: "R1",
			statement: "shout(name) returns greet(name) upper-cased",
			mandatory: true,
			criterion: "unit test on shout passes",
			category: "functional",
			satisfied_by_reference: false,
		},
		{
			requirement_id: "R2",
			statement: "greet unchanged",
			mandatory: true,
			criterion: "unit test on greet passes",
			category: "functional",
			satisfied_by_reference: true,
		},
	],
	design: { summary: "add shout next to greet", components: ["greet"], interfaces: ["shout(name)"], risks: [] },
});
const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: false, notes: [] });

/** Runs a change that adds shout to a target carrying the acceptance recipe, its command given `extra` arguments. */
export async function runWithRecipe(
	extra: string[],
	policy: PolicyOverride = {},
): Promise<{ t: TestHarness; state: ChangeState; steps: string[] }> {
	const p = trackedProject((root) => {
		fixtureTsWithoutTests(root);
		writeFiles(root, { "recipe.js": RECIPE_SCRIPT });
	});
	const t = makeHarness({
		policy: {
			required_reviews: ["promises"],
			review_missions: { promises: "tie each promise to the code that keeps it and the assertion that holds it" },
			acceptance_recipe: recipe(["node", "recipe.js", "{candidate}", ...extra]),
			...policy,
		},
		defaultScript: { steps: [{ kind: "complete", output: spec }] },
		scripts: {
			prepare: {
				steps: [
					{ kind: "write", path: "test/shout.test.js", content: SHOUT_TEST },
					{ kind: "complete", output: report(["test/shout.test.js"]) },
				],
			},
			implement: {
				steps: [
					{ kind: "write", path: "src/greet.js", content: SHOUT_IMPL },
					{ kind: "complete", output: report(["src/greet.js"]) },
				],
			},
			review: { steps: [{ kind: "complete", output: { conclusion: "approve", findings: [], limits: [] } }] },
		},
	});
	const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
	const result = await t.harness.advance(change.change_id, { max_steps: 40 });
	const state = t.ledger.loadChange(change.change_id)!.state;
	assert.ok(state.candidate, result.steps.join(" | "));
	return { t, state, steps: result.steps };
}
