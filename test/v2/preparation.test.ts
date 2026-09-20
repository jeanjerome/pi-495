import { strict as assert } from "node:assert";
import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { makeHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { fixtureTs, initRepo, tempDir, writeFiles, fixtureMavenMultiModule } from "../helpers/fixtures.ts";
import { HUMAN, KERNEL } from "../helpers/change-fixture.ts";
import { detectStack } from "../../src/application/target.ts";
import {
	diagnoseControlCapability,
	preparedFilesFrom,
	referenceTestFiles,
	samePreparationPaths,
	type PreparationRecord,
} from "../../src/application/preparation.ts";
import { GitWorkspace, DEFAULT_WORKSPACE_POLICY } from "../../src/adapters/workspace/git-workspace.ts";

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});
function track(t: TestHarness): TestHarness {
	cleanups.push(t.root);
	return t;
}

/** F-TS without any test: greet exists, shout does not. */
function projectWithoutTests(): string {
	const p = tempDir("495-notests-");
	cleanups.push(p);
	writeFiles(p, {
		"package.json": JSON.stringify({
			name: "f-notests",
			version: "1.0.0",
			type: "module",
			scripts: { test: "node --test" },
		}),
		"src/greet.js": "export function greet(name) {\n  return `Hello, ${name}`;\n}\n",
		"README.md": "# no tests yet\n",
	});
	initRepo(p);
	return p;
}

const SHOUT_TEST =
	'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { greet, shout } from "../src/greet.js";\n\ntest("shout upper-cases the greeting", () => {\n  assert.equal(shout("x"), "HELLO, X");\n});\ntest("greet unchanged", () => {\n  assert.equal(greet("x"), "Hello, x");\n});\n';
const SHOUT_IMPL =
	"export function greet(name) {\n  return `Hello, ${name}`;\n}\nexport function shout(name) {\n  return greet(name).toUpperCase();\n}\n";
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

describe("preparation of missing tests (SA-008, SA-009, SA-010, PRE-01..03, REC-28, REC-29)", () => {
	it("opens preparing, adopts a discriminant prepared suite, protects it, then accepts the implementation", async () => {
		const p = projectWithoutTests();
		const t = track(
			makeHarness({
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
				},
			}),
		);
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.ok(
			result.steps.some((s) => s.startsWith("verification_design -> preparing")),
			"preparation phase visited",
		);
		assert.ok(result.steps.some((s) => s.startsWith("preparing -> verification_design")));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.outcome, "accepted");
		assert.ok(state.adopted.preparation, "prepared suite adopted by the kernel, not by the producer");
		assert.ok(state.protocol?.protected_paths.includes("test/shout.test.js"), "prepared tests are protected");
		assert.equal(state.interventions.filter((i) => i.role === "prepare").length, 1);
		assert.equal(state.budgets.attempts_used, 1, "preparation does not consume an implementation attempt");
		const prep = t.ledger
			.listArtifacts(change.change_id, "preparation")
			.find((a) => a.ref.artifact_id.startsWith("prep_"))!;
		const record = JSON.parse(new TextDecoder().decode((await t.objects.get(prep.object))!)) as {
			on_reference: string;
			discriminant: boolean;
			qualified: boolean;
		};
		assert.deepEqual(
			[record.on_reference, record.discriminant, record.qualified],
			["FAIL", true, true],
			"the prepared suite fails on the reference: it detects the absent feature (SA-010)",
		);
		assert.equal(
			state.gates.G4?.verdict,
			"PASS",
			"prepared files in the candidate are not counted as protected alterations",
		);
		const manifestArt = t.ledger
			.listArtifacts(change.change_id, "candidate")
			.find((a) => a.ref.artifact_id === state.candidate!.candidate_id)!;
		const manifest = JSON.parse(new TextDecoder().decode((await t.objects.get(manifestArt.object))!)) as {
			entries: { path: string; baseline_state: string }[];
		};
		assert.equal(manifest.entries.find((e) => e.path === "test/shout.test.js")?.baseline_state, "added");
		assert.equal(existsSync(join(p, "test")), false, "project untouched");
		assert.equal(readFileSync(join(p, "src", "greet.js"), "utf8").includes("shout"), false);
	});
	it("a producer that implements the feature inside the preparation, or writes outside test/, is refused and the change stays honest", async () => {
		const p = projectWithoutTests();
		const t = track(
			makeHarness({
				defaultScript: { steps: [{ kind: "complete", output: spec }] },
				scripts: {
					prepare: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: SHOUT_IMPL },
							{ kind: "write", path: "test/shout.test.js", content: SHOUT_TEST },
							{ kind: "complete", output: report(["src/greet.js", "test/shout.test.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.ok(
			state.adopted.preparation?.ref.artifact_id.startsWith("prp_"),
			"only the preparation mandate is adopted, never the producer's proposal",
		);
		assert.equal(result.stopped_because, "capability_missing", result.steps.join(" | "));
		assert.equal(
			state.interventions.filter((i) => i.role === "prepare").length,
			2,
			"two bounded preparation tries, then stop",
		);
		assert.equal(state.stop_reason, "capability_missing");
		const preparations = t.agent.started.filter((m) => m.role === "prepare");
		assert.match(preparations[1]?.prompt ?? "", /Feedback from the previous attempt/);
		assert.match(preparations[1]?.prompt ?? "", /outside the preparation mandate refused: src\/greet\.js/);
	});
	it("derives explicit test roots from a Maven reactor and refuses production writes", async () => {
		const p = tempDir("495-maven-reactor-");
		const workspaces = tempDir("495-maven-workspaces-");
		cleanups.push(p, workspaces);
		fixtureMavenMultiModule(p);
		initRepo(p);
		const detection = detectStack(p, [{ requirement_id: "R1", revision: 1 }]);
		assert.equal(detection.stack, "maven");
		assert.deepEqual(detection.preparation_paths, ["src/test/", "domain/src/test/", "infrastructure/src/test/"]);
		assert.equal(
			samePreparationPaths(["src/test/"], detection.preparation_paths),
			false,
			"a persisted single-module mandate is stale",
		);
		assert.equal(
			samePreparationPaths([...detection.preparation_paths].reverse(), detection.preparation_paths),
			true,
			"path order is not semantic",
		);
		assert.deepEqual(detection.controls[0]?.writable_paths, ["target", "domain/target", "infrastructure/target"]);
		assert.ok(detection.controls[0]?.protected_paths.includes("domain/pom.xml"));
		assert.ok(detection.controls[0]?.protected_paths.includes("infrastructure/src/test/"));
		assert.deepEqual(detection.facts.ignored_modules, ["../outside"]);
		assert.ok(Object.keys(detection.positive_witness)[0]?.startsWith("domain/src/test/"));

		const workspace = new GitWorkspace(workspaces);
		const reference = await workspace.captureReference(p, DEFAULT_WORKSPACE_POLICY);
		assert.deepEqual(referenceTestFiles(reference, detection.preparation_paths), []);
		const handle = await workspace.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
		writeFiles(handle.path, {
			"domain/src/test/java/io/h495/AddressTest.java": "package io.h495; public final class AddressTest {}\n",
			"infrastructure/src/test/resources/schema.sql": "alter table users add address varchar(255);\n",
			"infrastructure/src/main/java/io/h495/Forbidden.java": "package io.h495; public final class Forbidden {}\n",
		});
		writeFileSync(join(handle.path, ".DS_Store"), "host metadata");
		const manifest = await workspace.snapshotCandidate(handle, reference, DEFAULT_WORKSPACE_POLICY);
		const prepared = preparedFilesFrom(manifest, detection.preparation_paths);
		assert.deepEqual(
			prepared.files.map((f) => f.path),
			["domain/src/test/java/io/h495/AddressTest.java", "infrastructure/src/test/resources/schema.sql"],
		);
		assert.deepEqual(prepared.out_of_scope, ["infrastructure/src/main/java/io/h495/Forbidden.java"]);
	});
	it("closes a persisted single-module mandate before resuming on a Maven reactor", async () => {
		const p = tempDir("495-maven-stale-mandate-");
		cleanups.push(p);
		fixtureMavenMultiModule(p);
		initRepo(p);
		const t = track(makeHarness({ defaultScript: { steps: [{ kind: "complete", output: spec }] } }));
		const { change } = await t.harness.start({ project_path: p, request_text: "add address", actor: HUMAN });
		const reached = await t.harness.advance(change.change_id, { max_steps: 3 });
		assert.equal(reached.view.change?.phase, "preparing", reached.steps.join(" | "));
		const stale = {
			kind: "preparation-mandate",
			objective: "write Maven tests under src/test/",
			allowed_paths: ["src/test/"],
			requirement_ids: ["R1", "R2"],
			stack: "maven",
		};
		const staleRef = await t.harness.artifacts.store(
			"preparation",
			change.change_id,
			"prp_stale",
			stale,
			KERNEL.actor_id,
		);
		const loaded = t.ledger.loadChange(change.change_id)!;
		t.ledger.appendChange(
			change.change_id,
			loaded.revision,
			[
				{ type: "artifact.proposed", at: loaded.state.updated_at, actor: KERNEL, kind: "preparation", ref: staleRef },
				{
					type: "artifact.adopted",
					at: loaded.state.updated_at,
					actor: KERNEL,
					kind: "preparation",
					ref: staleRef,
					gate: null,
				},
			],
			{ correlation_id: "stale-mandate" },
		);
		const resumed = await t.harness.advance(change.change_id, { max_steps: 1 });
		assert.equal(resumed.view.change?.phase, "verification_design", resumed.steps.join(" | "));
		assert.equal(
			t.agent.started.some((m) => m.role === "prepare"),
			false,
			"an obsolete mandate consumes no model intervention",
		);
		const migration = t.ledger
			.listArtifacts(change.change_id, "preparation")
			.find((a) => a.ref.artifact_id.startsWith("prc_"));
		assert.ok(migration, "the stale scope is recorded before it is closed");
		const record = JSON.parse(new TextDecoder().decode((await t.objects.get(migration.object))!)) as {
			notes: string[];
		};
		assert.match(record.notes[0] ?? "", /scope is stale/);
	});
	it("distinguishes a test file, a discovered case, an executed case and a control that detects the targeted defect (PRE-01)", () => {
		const addition = { requirement_id: "R1", mandatory: true, satisfied_by_reference: false };
		const preservation = { requirement_id: "R2", mandatory: true, satisfied_by_reference: true };
		const base = { stack: "node", test_files: ["test/greet.test.js"], prepared: null };
		// A suite the target's own command never reaches is a file, nothing more: PRE-01 asks for that
		// insufficiency to be reported rather than counted as coverage.
		const ignored = diagnoseControlCapability({
			...base,
			requirements: [preservation],
			suite: { reported: 1, skipped: 0, witnesses: 1 },
		});
		assert.equal(ignored.level, "file_present");
		assert.deepEqual([ignored.discovered, ignored.executed], [0, 0]);
		assert.deepEqual(ignored.undiscriminated_requirements, ["R2"]);
		assert.ok(
			ignored.notes.some((n) => n.includes("reports no case of its own")),
			ignored.notes.join(" | "),
		);
		// A skipped case is discovered and never executed: it asserts nothing (RM-017).
		const skipped = diagnoseControlCapability({
			...base,
			requirements: [preservation],
			suite: { reported: 3, skipped: 2, witnesses: 1 },
		});
		assert.equal(skipped.level, "discoverable");
		assert.deepEqual([skipped.discovered, skipped.executed], [2, 0]);
		assert.deepEqual(skipped.undiscriminated_requirements, ["R2"]);
		// An executed suite proves what the reference already does, which is exactly what a refactoring
		// requirement needs and never what a new behaviour needs.
		const executed = diagnoseControlCapability({
			...base,
			requirements: [preservation, addition],
			suite: { reported: 2, skipped: 0, witnesses: 1 },
		});
		assert.equal(executed.level, "executed");
		assert.deepEqual(executed.undiscriminated_requirements, ["R1"]);
		assert.ok(
			executed.notes.some((n) => n.includes("no control that passes on the reference can detect its absence")),
			executed.notes.join(" | "),
		);
		// Before any run, what no control could ever decide is already known; the rest waits.
		const unobserved = diagnoseControlCapability({ ...base, requirements: [preservation, addition], suite: null });
		assert.deepEqual([unobserved.discovered, unobserved.executed], [null, null]);
		assert.deepEqual(unobserved.undiscriminated_requirements, ["R1"]);
		assert.deepEqual(unobserved.unobserved_requirements, ["R2"]);
		// A suite that fails on the reference detects the absent behaviour: the last level of the scale.
		const prepared: PreparationRecord = {
			preparation_id: "prep_1",
			objective: "o",
			allowed_paths: ["test/"],
			files: [{ path: "test/shout.test.js", digest: "sha256:x", size_bytes: 1 }],
			on_reference: "FAIL",
			discriminant: true,
			loadable: true,
			qualified: true,
			notes: [],
		};
		const discriminating = diagnoseControlCapability({
			...base,
			requirements: [preservation, addition],
			suite: { reported: 2, skipped: 0, witnesses: 1 },
			prepared,
		});
		assert.equal(discriminating.level, "discriminating");
		assert.deepEqual(discriminating.undiscriminated_requirements, []);
		// An optional requirement is not a reason to open a preparation.
		const optional = diagnoseControlCapability({
			...base,
			requirements: [{ ...addition, mandatory: false }],
			suite: null,
		});
		assert.deepEqual(optional.undiscriminated_requirements, []);
	});
	it("opens a preparation on a target that already has tests when the request adds behaviour", async () => {
		const p = tempDir("495-withtests-");
		cleanups.push(p);
		fixtureTs(p);
		initRepo(p);
		const t = track(
			makeHarness({
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
				},
			}),
		);
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.ok(
			result.steps.some((s) => s.startsWith("verification_design -> preparing")),
			`a green suite proves nothing about shout: ${result.steps.join(" | ")}`,
		);
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.outcome, "accepted");
		assert.ok(state.protocol?.protected_paths.includes("test/shout.test.js"));
		const mandateArt = t.ledger
			.listArtifacts(change.change_id, "preparation")
			.find((a) => a.ref.artifact_id.startsWith("prp_"))!;
		const opened = JSON.parse(new TextDecoder().decode((await t.objects.get(mandateArt.object))!)) as {
			diagnosis: { level: string; test_files: number; undiscriminated_requirements: string[] };
		};
		assert.deepEqual(
			[opened.diagnosis.level, opened.diagnosis.test_files, opened.diagnosis.undiscriminated_requirements],
			["file_present", 1, ["R1"]],
			"the existing test file is seen, and seen as insufficient",
		);
		const protocolArt = await t.harness.artifacts.latest<{ capability_diagnosis: { level: string } }>(
			t.ledger.loadChange(change.change_id)!.state,
			"protocol",
		);
		assert.equal(
			protocolArt?.content.capability_diagnosis.level,
			"discriminating",
			"the frozen protocol carries the diagnosis that let it freeze",
		);
	});
	it("a prepared suite that already passes on the reference is not adopted as discriminant", async () => {
		const p = projectWithoutTests();
		const t = track(
			makeHarness({
				defaultScript: { steps: [{ kind: "complete", output: spec }] },
				scripts: {
					prepare: {
						steps: [
							{
								kind: "write",
								path: "test/greet.test.js",
								content:
									'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { greet } from "../src/greet.js";\ntest("greet", () => { assert.equal(greet("x"), "Hello, x"); });\n',
							},
							{ kind: "complete", output: report(["test/greet.test.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.ok(state.adopted.preparation?.ref.artifact_id.startsWith("prp_"));
		const records = t.ledger
			.listArtifacts(change.change_id, "preparation")
			.filter((a) => a.ref.artifact_id.startsWith("prep_"));
		const record = JSON.parse(new TextDecoder().decode((await t.objects.get(records[0]!.object))!)) as {
			on_reference: string;
			qualified: boolean;
			notes: string[];
		};
		assert.equal(record.on_reference, "PASS");
		assert.equal(record.qualified, false);
		assert.ok(record.notes.some((n) => n.includes("does not detect")));
	});
});
