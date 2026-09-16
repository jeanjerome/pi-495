import { strict as assert } from "node:assert";
import { rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { makeHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { initRepo, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";

const cleanups: string[] = [];
afterEach(() => { for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true }); });
function track(t: TestHarness): TestHarness { cleanups.push(t.root); return t; }

/** F-TS without any test: greet exists, shout does not. */
function projectWithoutTests(): string {
	const p = tempDir("495-notests-");
	cleanups.push(p);
	writeFiles(p, {
		"package.json": JSON.stringify({ name: "f-notests", version: "1.0.0", type: "module", scripts: { test: "node --test" } }),
		"src/greet.js": "export function greet(name) {\n  return `Hello, ${name}`;\n}\n",
		"README.md": "# no tests yet\n",
	});
	initRepo(p);
	return p;
}

const SHOUT_TEST = 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { greet, shout } from "../src/greet.js";\n\ntest("shout upper-cases the greeting", () => {\n  assert.equal(shout("x"), "HELLO, X");\n});\ntest("greet unchanged", () => {\n  assert.equal(greet("x"), "Hello, x");\n});\n';
const SHOUT_IMPL = "export function greet(name) {\n  return `Hello, ${name}`;\n}\nexport function shout(name) {\n  return greet(name).toUpperCase();\n}\n";
const spec = specReport({ objective: "add shout(name) returning the greeting in upper case", requirements: [{ requirement_id: "R1", statement: "shout(name) returns greet(name) upper-cased", mandatory: true, criterion: "unit test on shout passes", category: "functional" }, { requirement_id: "R2", statement: "greet unchanged", mandatory: true, criterion: "unit test on greet passes", category: "functional" }], design: { summary: "add shout next to greet", components: ["greet"], interfaces: ["shout(name)"], risks: [] } });
const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: false, notes: [] });

describe("preparation of missing tests (SA-008, SA-009, SA-010, PRE-01..03, REC-28, REC-29)", () => {
	it("opens preparing, adopts a discriminant prepared suite, protects it, then accepts the implementation", async () => {
		const p = projectWithoutTests();
		const t = track(makeHarness({ defaultScript: { steps: [{ kind: "complete", output: spec }] }, scripts: { prepare: { steps: [{ kind: "write", path: "test/shout.test.js", content: SHOUT_TEST }, { kind: "complete", output: report(["test/shout.test.js"]) }] }, implement: { steps: [{ kind: "write", path: "src/greet.js", content: SHOUT_IMPL }, { kind: "complete", output: report(["src/greet.js"]) }] } } }));
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.ok(result.steps.some((s) => s.startsWith("verification_design -> preparing")), "preparation phase visited");
		assert.ok(result.steps.some((s) => s.startsWith("preparing -> verification_design")));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.outcome, "accepted");
		assert.ok(state.adopted.preparation, "prepared suite adopted by the kernel, not by the producer");
		assert.ok(state.protocol?.protected_paths.includes("test/shout.test.js"), "prepared tests are protected");
		assert.equal(state.interventions.filter((i) => i.role === "prepare").length, 1);
		assert.equal(state.budgets.attempts_used, 1, "preparation does not consume an implementation attempt");
		const prep = t.ledger.listArtifacts(change.change_id, "preparation").find((a) => a.ref.artifact_id.startsWith("prep_"))!;
		const record = JSON.parse(new TextDecoder().decode((await t.objects.get(prep.object))!)) as { on_reference: string; discriminant: boolean; qualified: boolean };
		assert.deepEqual([record.on_reference, record.discriminant, record.qualified], ["FAIL", true, true], "the prepared suite fails on the reference: it detects the absent feature (SA-010)");
		assert.equal(state.gates.G4?.verdict, "PASS", "prepared files in the candidate are not counted as protected alterations");
		const manifestArt = t.ledger.listArtifacts(change.change_id, "candidate").find((a) => a.ref.artifact_id === state.candidate!.candidate_id)!;
		const manifest = JSON.parse(new TextDecoder().decode((await t.objects.get(manifestArt.object))!)) as { entries: { path: string; baseline_state: string }[] };
		assert.equal(manifest.entries.find((e) => e.path === "test/shout.test.js")?.baseline_state, "added");
		assert.equal(existsSync(join(p, "test")), false, "project untouched");
		assert.equal(readFileSync(join(p, "src", "greet.js"), "utf8").includes("shout"), false);
	});
	it("a producer that implements the feature inside the preparation, or writes outside test/, is refused and the change stays honest", async () => {
		const p = projectWithoutTests();
		const t = track(makeHarness({ defaultScript: { steps: [{ kind: "complete", output: spec }] }, scripts: { prepare: { steps: [{ kind: "write", path: "src/greet.js", content: SHOUT_IMPL }, { kind: "write", path: "test/shout.test.js", content: SHOUT_TEST }, { kind: "complete", output: report(["src/greet.js", "test/shout.test.js"]) }] } } }));
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.ok(state.adopted.preparation?.ref.artifact_id.startsWith("prp_"), "only the preparation mandate is adopted, never the producer's proposal");
		assert.equal(result.stopped_because, "capability_missing", result.steps.join(" | "));
		assert.equal(state.interventions.filter((i) => i.role === "prepare").length, 2, "two bounded preparation tries, then stop");
		assert.equal(state.stop_reason, "capability_missing");
	});
	it("a prepared suite that already passes on the reference is not adopted as discriminant", async () => {
		const p = projectWithoutTests();
		const t = track(makeHarness({ defaultScript: { steps: [{ kind: "complete", output: spec }] }, scripts: { prepare: { steps: [{ kind: "write", path: "test/greet.test.js", content: 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { greet } from "../src/greet.js";\ntest("greet", () => { assert.equal(greet("x"), "Hello, x"); });\n' }, { kind: "complete", output: report(["test/greet.test.js"]) }] } } }));
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.ok(state.adopted.preparation?.ref.artifact_id.startsWith("prp_"));
		const records = t.ledger.listArtifacts(change.change_id, "preparation").filter((a) => a.ref.artifact_id.startsWith("prep_"));
		const record = JSON.parse(new TextDecoder().decode((await t.objects.get(records[0]!.object))!)) as { on_reference: string; qualified: boolean; notes: string[] };
		assert.equal(record.on_reference, "PASS");
		assert.equal(record.qualified, false);
		assert.ok(record.notes.some((n) => n.includes("does not detect")));
	});
});
