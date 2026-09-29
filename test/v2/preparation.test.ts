import { strict as assert } from "node:assert";
import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { makeHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import {
	fixtureTs,
	fixtureTsWithoutTests,
	initRepo,
	tempDir,
	writeFiles,
	fixtureMavenMultiModule,
	fixtureMavenHexagonal,
	JACOCO_PLUGIN,
	SHOUT_IMPL,
	SHOUT_TEST,
} from "../helpers/fixtures.ts";
import { HUMAN, KERNEL } from "../helpers/change-fixture.ts";
import { detectStack } from "../../src/application/target.ts";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import { buildContext, preparationMandateObjective, preparationObjective } from "../../src/application/context.ts";
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
	fixtureTsWithoutTests(p);
	initRepo(p);
	return p;
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

	it("the reasons a control is not qualified name what its witnesses answered, not the prepared suite judged beside it", async () => {
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
				},
				// Every witness of the unit control answers FAIL, so its qualification fails beside a
				// prepared suite that does what it must.
				controls: (real) => ({
					runControl: async (invocation, signal) => {
						const run = await real.runControl(invocation, signal);
						if (invocation.protocol.protocol_id !== "qualification" || invocation.control.control_id !== "unit")
							return run;
						return { ...run, evidence: { ...run.evidence, verdict: "FAIL" as const } };
					},
				}),
			}),
		);
		const { change } = await t.harness.start({
			project_path: projectWithoutTests(),
			request_text: "add shout",
			actor: HUMAN,
		});

		const stopped = await t.harness.advance(change.change_id, { max_steps: 40 });

		assert.equal(stopped.stopped_because, "capability_missing", stopped.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.match(state.stop_detail ?? "", /unit: /, "the stop names the control that is not qualified");
		assert.doesNotMatch(state.stop_detail ?? "", /prepared suite/);
		const unqualified = (await t.harness.report(change.change_id)).residual_risks.filter(
			(risk) => risk.code === "control_not_qualified" && risk.statement.startsWith("control unit is not qualified"),
		);
		assert.equal(unqualified.length, 1, "the report says the unit control is not qualified");
		assert.doesNotMatch(unqualified[0]!.statement, /prepared suite/);
		const preparation = await t.harness.artifacts.read<PreparationRecord>(state.adopted.preparation!.ref);
		assert.deepEqual(
			[preparation.on_reference, preparation.discriminant],
			["FAIL", true],
			"the adopted preparation records the suite on the reference",
		);
	});
	it("a preparation that writes a work log outside its roots beside valid tests is adopted on its first try, and the dossier names the ignored path", async () => {
		const p = projectWithoutTests();
		const t = track(
			makeHarness({
				defaultScript: { steps: [{ kind: "complete", output: spec }] },
				scripts: {
					prepare: {
						steps: [
							{ kind: "write", path: "test/shout.test.js", content: SHOUT_TEST },
							{ kind: "write", path: ".verify-scratch/run.log", content: "node --test: 1 failing\n" },
							{ kind: "complete", output: report(["test/shout.test.js", ".verify-scratch/run.log"]) },
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
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(
			state.interventions.filter((i) => i.role === "prepare").length,
			1,
			`the prepared suite is adopted as discriminant on this first try: ${result.steps.join(" | ")}`,
		);
		const records = t.ledger
			.listArtifacts(change.change_id, "preparation")
			.filter((a) => a.ref.artifact_id.startsWith("prep_"));
		const record = JSON.parse(new TextDecoder().decode((await t.objects.get(records[0]!.object))!)) as {
			files: { path: string }[];
			qualified: boolean;
			notes: string[];
		};
		assert.equal(record.qualified, true, "the prepared suite is adopted as discriminant");
		assert.ok(
			record.notes.some((n) => n.includes(".verify-scratch/run.log") && n.includes("not retained")),
			`the dossier names .verify-scratch/run.log as written outside the mandate and not retained: ${record.notes.join(" | ")}`,
		);
		assert.deepEqual(
			record.files.map((f) => f.path),
			["test/shout.test.js"],
			"the judgement on the reference bears only the retained files under the test roots",
		);
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(state.outcome, "accepted");
	});
	it("what a preparation writes outside its roots is never adopted, even when it is the feature: the test is judged on the bare reference and the implementation gets a tree without it", async () => {
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
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: SHOUT_IMPL },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		// The tree the producer receives is read as it starts, before the script overwrites greet.js.
		const handedToImplement: string[] = [];
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "implement")
				handedToImplement.push(readFileSync(join(m.workspace_path, "src", "greet.js"), "utf8"));
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		const record = await t.harness.artifacts.read<PreparationRecord>(
			t.ledger.listArtifacts(change.change_id, "preparation").find((a) => a.ref.artifact_id.startsWith("prep_"))!.ref,
		);
		assert.deepEqual(
			[record.on_reference, record.discriminant, record.qualified],
			["FAIL", true, true],
			`the test is judged on the reference without the implementation, and adopted because it fails there: ${record.notes.join(" | ")}`,
		);
		assert.deepEqual(
			record.files.map((f) => f.path),
			["test/shout.test.js"],
			"the implementation is not in the adopted suite",
		);
		assert.equal(handedToImplement.length, 1, result.steps.join(" | "));
		assert.equal(
			handedToImplement[0]!.includes("shout"),
			false,
			"the implementation is not in the tree the implementation receives",
		);
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(state.outcome, "accepted");
	});
	it("a preparation that retains no test stays refused, and the producer is told the paths written outside the mandate", async () => {
		const p = projectWithoutTests();
		const t = track(
			makeHarness({
				defaultScript: { steps: [{ kind: "complete", output: spec }] },
				scripts: {
					prepare: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: SHOUT_IMPL },
							{ kind: "write", path: ".verify-scratch/run.log", content: "node --test: ok\n" },
							{ kind: "complete", output: report(["src/greet.js", ".verify-scratch/run.log"]) },
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
		const record = await t.harness.artifacts.read<PreparationRecord>(
			t.ledger.listArtifacts(change.change_id, "preparation").find((a) => a.ref.artifact_id.startsWith("prep_"))!.ref,
		);
		assert.ok(record.notes.includes("no test file was produced"), record.notes.join(" | "));
		const preparations = t.agent.started.filter((m) => m.role === "prepare");
		assert.match(preparations[1]?.prompt ?? "", /Feedback from the previous attempt/);
		assert.match(
			preparations[1]?.prompt ?? "",
			/src\/greet\.js/,
			"the feedback names the paths written outside the mandate",
		);
		assert.match(preparations[1]?.prompt ?? "", /\.verify-scratch\/run\.log/);
	});
	it("the preparation objective says only files under its roots are retained and anything written elsewhere is ignored", () => {
		const objective = preparationMandateObjective("maven", ["src/test/", "domain/src/test/"], ["R1"]);
		assert.match(
			objective,
			/only files under src\/test\/, domain\/src\/test\/ are retained/,
			`the producer reads that only files under the test roots are retained: ${objective}`,
		);
		assert.match(objective, /elsewhere[^.]*ignored/, "what it writes elsewhere to check itself is ignored");
		assert.doesNotMatch(
			objective,
			/may be created or modified/,
			"it no longer reads that these roots are the only ones where it may create or modify a file",
		);
	});
	it("the preparation objective asks to update an existing test that asserts the behaviour the requirements change, not only to add tests", () => {
		const objective = preparationObjective(preparationMandateObjective("node", ["test/"], ["R1"]), ["R1", "R2"]);
		assert.match(
			objective,
			/update (an|any) existing test that asserts the behaviour (the|these) requirements change/,
			`the producer reads that an existing test asserting the old behaviour is to be updated, beside the tests that are missing: ${objective}`,
		);
		assert.doesNotMatch(objective, /only add tests/, "it no longer reads that only tests are to be added");
	});
	it("on a Maven reactor with JaCoCo, the producer is asked to run mvn -B -q -o test and told coverage and structure are read, never to run node -e", () => {
		const p = tempDir("495-maven-jacoco-");
		cleanups.push(p);
		fixtureMavenHexagonal(p);
		const pom = readFileSync(join(p, "pom.xml"), "utf8");
		writeFileSync(
			join(p, "pom.xml"),
			pom.replace("</project>", `  <build><plugins>\n${JACOCO_PLUGIN}    </plugins></build>\n</project>`),
		);
		const detected = detectStack(p, [{ requirement_id: "R1", revision: 1 }]);
		assert.deepEqual(
			detected.controls.map((c) => c.control_id),
			["maven-test", "coverage", "structure"],
			"the protocol carries the test run and the two controls that read a report or the code",
		);
		for (const role of ["prepare", "implement"] as const) {
			const built = buildContext({
				role,
				objective: "add the address",
				language: "en",
				adopted: [],
				untrusted: [],
				feedback: null,
				tools: [],
				budget_bytes: 10_000,
				imposed_layers: [],
				controls: detected.controls,
			});
			const instruction = built.manifest.trusted_instructions.find((i) =>
				i.includes("The kernel will judge your work"),
			);
			assert.ok(instruction, `${role} is told what the kernel runs`);
			assert.match(
				instruction,
				/`mvn -B -q -o test` in the workspace root \(maven-test\)/,
				`${role} is asked to run mvn -B -q -o test`,
			);
			assert.match(
				instruction,
				/Run it yourself before you answer/,
				`${role} is asked to run it before answering, not only told what the kernel runs: ${instruction}`,
			);
			assert.doesNotMatch(
				instruction,
				/ -e /,
				`${role} is never asked to run node -e, the empty trigger of a control that reads a report or the code: ${instruction}`,
			);
			assert.match(instruction, /coverage[^;.]*read from the JaCoCo report/, `${role} is told what coverage reads`);
			assert.match(
				instruction,
				/structure[^;.]*read from the Java declarations/,
				`${role} is told what structure reads`,
			);
		}
	});
	it("a role that only reads is told no verification instruction even when the detected controls are handed to it", () => {
		const p = tempDir("495-maven-reader-");
		cleanups.push(p);
		fixtureMavenHexagonal(p);
		const detected = detectStack(p, [{ requirement_id: "R1", revision: 1 }]);
		assert.ok(detected.controls.length > 0, "the reactor yields controls to hand over");
		for (const role of ["specify", "review", "observe"] as const) {
			const built = buildContext({
				role,
				objective: "read the address",
				language: "en",
				adopted: [],
				untrusted: [],
				feedback: null,
				tools: [],
				budget_bytes: 10_000,
				imposed_layers: [],
				controls: detected.controls,
			});
			assert.equal(
				built.manifest.trusted_instructions.some((i) => i.includes("The kernel will judge your work")),
				false,
				`${role}, which only reads, is told no verification instruction: ${built.manifest.trusted_instructions.join(" | ")}`,
			);
		}
	});
	it("the context the harness hands the producer names the frozen protocol's coverage and structure with what they read", async () => {
		const maven = tempDir("495-maven-jacoco-protocol-");
		cleanups.push(maven);
		fixtureMavenHexagonal(maven);
		const pom = readFileSync(join(maven, "pom.xml"), "utf8");
		writeFileSync(
			join(maven, "pom.xml"),
			pom.replace("</project>", `  <build><plugins>\n${JACOCO_PLUGIN}    </plugins></build>\n</project>`),
		);
		const mavenControls = detectStack(maven, [{ requirement_id: "R1", revision: 1 }]).controls;
		// The campaign runs on the Node target whose controls need no JDK; once its protocol is
		// adopted, the Maven controls are frozen in its place, and the campaign is cut as soon as the
		// producer has received its context, before any of them is opposed to a candidate.
		const p = tempDir("495-proj-");
		cleanups.push(p);
		fixtureTs(p);
		initRepo(p);
		const t = track(makeHarness({ scripts: { implement: { steps: [{ kind: "complete", output: report([]) }] } } }));
		const { change } = await t.harness.start({ project_path: p, request_text: "keep greet", actor: HUMAN });
		let frozen = false;
		for (let step = 0; step < 12 && !t.agent.started.some((m) => m.role === "implement"); step++) {
			await t.harness.advance(change.change_id, { max_steps: 1 });
			const loaded = t.ledger.loadChange(change.change_id)!;
			if (frozen || !loaded.state.adopted.protocol) continue;
			const protocol = await t.harness.artifacts.read<Protocol>(loaded.state.adopted.protocol.ref);
			const ref = await t.harness.artifacts.store(
				"protocol",
				change.change_id,
				"prt_maven",
				{ ...protocol, controls: mavenControls },
				KERNEL.actor_id,
			);
			t.ledger.appendChange(
				change.change_id,
				loaded.revision,
				[
					{ type: "artifact.proposed", at: loaded.state.updated_at, actor: KERNEL, kind: "protocol", ref },
					{ type: "artifact.adopted", at: loaded.state.updated_at, actor: KERNEL, kind: "protocol", ref, gate: "G2" },
				],
				{ correlation_id: "maven-protocol" },
			);
			frozen = true;
		}
		const producer = t.agent.started.find((m) => m.role === "implement");
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.ok(
			producer,
			`the producer started on the Maven protocol: ${JSON.stringify({ phase: state.phase, status: state.status, stop: state.stop_detail, roles: t.agent.started.map((m) => m.role) })}`,
		);
		const instruction = producer.context.trusted_instructions.find((i) =>
			i.includes("The kernel will judge your work"),
		);
		assert.ok(instruction, "the producer is told what the kernel runs");
		assert.match(instruction, /`mvn -B -q -o test` in the workspace root \(maven-test\)/);
		assert.match(
			instruction,
			/coverage \(introduced-line coverage, read from the JaCoCo report of mvn test\)/,
			`the frozen coverage control is named with what it reads: ${instruction}`,
		);
		assert.match(
			instruction,
			/structure \(frozen architecture boundaries, read from the Java declarations\)/,
			`the frozen structure control is named with what it reads: ${instruction}`,
		);
	});
	it("on a target without tests, the preparation producer is told the detected control commands before any protocol is frozen, and the specification producer is told none", async () => {
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
				},
			}),
		);
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		// The campaign is cut as soon as the preparation producer has received its context: what it is
		// told then comes from the detection alone, no protocol having been frozen yet.
		for (let step = 0; step < 12 && !t.agent.started.some((m) => m.role === "prepare"); step++)
			await t.harness.advance(change.change_id, { max_steps: 1 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		const preparation = t.agent.started.find((m) => m.role === "prepare");
		assert.ok(
			preparation,
			`the preparation started: ${JSON.stringify({ phase: state.phase, status: state.status, stop: state.stop_detail, roles: t.agent.started.map((m) => m.role) })}`,
		);
		assert.ok(!state.adopted.protocol, "no protocol is frozen when the preparation producer receives its context");
		const unit = detectStack(p, [{ requirement_id: "R1", revision: 1 }]).controls.find((c) => c.control_id === "unit")!;
		const instruction = preparation.context.trusted_instructions.find((i) =>
			i.includes("The kernel will judge your work"),
		);
		assert.ok(
			instruction,
			"the preparation producer is told the detected control commands the kernel will judge it by",
		);
		assert.ok(
			instruction.includes(`\`${unit.command.join(" ")}\` in the workspace root (unit)`),
			`the instruction names the command of the unit control the detection produced: ${instruction}`,
		);
		const specification = t.agent.started.find((m) => m.role === "specify");
		assert.ok(specification, "the specification intervention ran before the preparation");
		assert.equal(
			specification.context.trusted_instructions.some((i) => i.includes("The kernel will judge your work")),
			false,
			"the specification producer, which only reads, is told no verification instruction",
		);
	});
	it("on a Maven reactor with JaCoCo and no test, the preparation producer is asked to run mvn -B -q -o test before it answers and told what coverage and structure read, before any protocol is frozen", async () => {
		const p = tempDir("495-maven-first-preparation-");
		cleanups.push(p);
		fixtureMavenHexagonal(p);
		const pom = readFileSync(join(p, "pom.xml"), "utf8");
		writeFileSync(
			join(p, "pom.xml"),
			pom.replace("</project>", `  <build><plugins>\n${JACOCO_PLUGIN}    </plugins></build>\n</project>`),
		);
		initRepo(p);
		const t = track(
			makeHarness({
				defaultScript: { steps: [{ kind: "complete", output: spec }] },
				scripts: { prepare: { steps: [{ kind: "complete", output: report([]) }] } },
			}),
		);
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		// The campaign is cut as soon as the preparation producer has received its context: no control
		// of the reactor is run, so no JDK is needed, and no protocol has been frozen yet.
		for (let step = 0; step < 12 && !t.agent.started.some((m) => m.role === "prepare"); step++)
			await t.harness.advance(change.change_id, { max_steps: 1 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		const preparation = t.agent.started.find((m) => m.role === "prepare");
		assert.ok(
			preparation,
			`the preparation started: ${JSON.stringify({ phase: state.phase, status: state.status, stop: state.stop_detail, roles: t.agent.started.map((m) => m.role) })}`,
		);
		assert.ok(!state.adopted.protocol, "no protocol is frozen when the preparation producer receives its context");
		const instruction = preparation.context.trusted_instructions.find((i) =>
			i.includes("The kernel will judge your work"),
		);
		assert.ok(instruction, "the first preparation producer is told what the kernel runs");
		assert.match(
			instruction,
			/`mvn -B -q -o test` in the workspace root \(maven-test\)/,
			`the first preparation producer is told the kernel runs mvn -B -q -o test: ${instruction}`,
		);
		assert.match(
			instruction,
			/Run it yourself before you answer/,
			`the first preparation producer is asked to run it before answering: ${instruction}`,
		);
		assert.match(
			instruction,
			/coverage \(introduced-line coverage, read from the JaCoCo report of mvn test\)/,
			`coverage is named with what it reads: ${instruction}`,
		);
		assert.match(
			instruction,
			/structure \(frozen architecture boundaries, read from the Java declarations\)/,
			`structure is named with what it reads: ${instruction}`,
		);
		assert.doesNotMatch(instruction, / -e /, `neither coverage nor structure is lent a command to run: ${instruction}`);
	});
	it("a writing intervention's profile passes JAVA_HOME, LC_ALL and MAVEN_OPTS as the controls do, and a reading one does not", async () => {
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
		const controls = detectStack(p, [{ requirement_id: "R1", revision: 1 }]).controls;
		const passed = ["JAVA_HOME", "LC_ALL", "MAVEN_OPTS"];
		for (const variable of passed)
			assert.ok(controls[0]!.env_allowlist.includes(variable), `the controls of this target receive ${variable}`);
		for (const role of ["prepare", "implement"] as const) {
			const mandate = t.agent.started.find((m) => m.role === role);
			assert.ok(mandate, `${role} ran`);
			for (const variable of passed)
				assert.ok(
					mandate.profile.env_allowlist.includes(variable),
					`the ${role} profile lets ${variable} through as the controls do: ${mandate.profile.env_allowlist.join(", ")}`,
				);
		}
		const reading = t.agent.started.find((m) => m.role === "specify");
		assert.ok(reading, "specify ran");
		assert.deepEqual(
			reading.profile.env_allowlist,
			["PATH", "HOME", "TMPDIR", "LANG"],
			"an intervention that only reads keeps today's profile",
		);
	});
	it("derives explicit test roots from a Maven reactor, leaves a production write out of the retained files and refuses a deletion under a root", async () => {
		const p = tempDir("495-maven-reactor-");
		const workspaces = tempDir("495-maven-workspaces-");
		cleanups.push(p, workspaces);
		fixtureMavenMultiModule(p);
		// A fixture under a test root that is not a test: the reference still has no test file to run.
		writeFiles(p, { "domain/src/test/resources/fixture.sql": "insert into users values (1);\n" });
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
		rmSync(join(handle.path, "domain/src/test/resources/fixture.sql"));
		const manifest = await workspace.snapshotCandidate(handle, reference, DEFAULT_WORKSPACE_POLICY);
		const prepared = preparedFilesFrom(manifest, detection.preparation_paths);
		assert.deepEqual(
			prepared.files.map((f) => f.path),
			["domain/src/test/java/io/h495/AddressTest.java", "infrastructure/src/test/resources/schema.sql"],
		);
		assert.deepEqual(
			prepared.out_of_scope,
			["infrastructure/src/main/java/io/h495/Forbidden.java"],
			"a production write is named and left out of the retained files, not refused",
		);
		assert.deepEqual(
			prepared.refused,
			["domain/src/test/resources/fixture.sql (deleted)"],
			"a deletion under a root is refused: nothing of it can be retained",
		);
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
			modified_existing: [],
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
	it("a preparation that rewrites an existing test is adopted, and its record names the test it modified, while one that only adds a test names none", async () => {
		const exclamation = specReport({
			objective: "greet must end with an exclamation mark",
			requirements: [
				{
					requirement_id: "R1",
					statement: "greet(name) returns the greeting followed by an exclamation mark",
					mandatory: true,
					criterion: "unit test on greet passes",
					category: "functional",
					satisfied_by_reference: false,
				},
			],
			design: { summary: "append ! to the greeting", components: ["greet"], interfaces: ["greet(name)"], risks: [] },
		});
		const GREET_EXCLAIMED_TEST =
			'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { greet } from "../src/greet.js";\n\ntest("greet", () => {\n  assert.equal(greet("x"), "Hello, x!");\n});\n';
		const GREET_EXCLAIMED_IMPL = "export function greet(name) {\n  return `Hello, ${name}!`;\n}\n";
		const preparationRecord = async (
			t: TestHarness,
			changeId: string,
		): Promise<{ qualified: boolean; files: { path: string }[]; modified_existing: string[] }> => {
			const prep = t.ledger.listArtifacts(changeId, "preparation").find((a) => a.ref.artifact_id.startsWith("prep_"))!;
			return JSON.parse(new TextDecoder().decode((await t.objects.get(prep.object))!));
		};

		const rewriting = tempDir("495-rewrite-");
		cleanups.push(rewriting);
		fixtureTs(rewriting);
		initRepo(rewriting);
		const rewriter = track(
			makeHarness({
				defaultScript: { steps: [{ kind: "complete", output: exclamation }] },
				scripts: {
					prepare: {
						steps: [
							{ kind: "write", path: "test/greet.test.js", content: GREET_EXCLAIMED_TEST },
							{ kind: "complete", output: report(["test/greet.test.js"]) },
						],
					},
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: GREET_EXCLAIMED_IMPL },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		const rewritten = await rewriter.harness.start({
			project_path: rewriting,
			request_text: "greet must end with an exclamation mark",
			actor: HUMAN,
		});
		const rewriteRun = await rewriter.harness.advance(rewritten.change.change_id, { max_steps: 40 });
		const rewriteState = rewriter.ledger.loadChange(rewritten.change.change_id)!.state;
		assert.ok(
			rewriteState.adopted.preparation?.ref.artifact_id.startsWith("prep_"),
			`the rewritten suite is adopted as discriminant: ${rewriteRun.steps.join(" | ")}`,
		);
		const rewriteRecord = await preparationRecord(rewriter, rewritten.change.change_id);
		assert.equal(rewriteRecord.qualified, true, "the prepared suite that rewrites test/greet.test.js is adopted");
		assert.deepEqual(
			rewriteRecord.modified_existing,
			["test/greet.test.js"],
			`the record names test/greet.test.js as an existing test the preparation modified: ${JSON.stringify(rewriteRecord)}`,
		);
		assert.equal(rewriteRun.stopped_because, "closed", rewriteRun.steps.join(" | "));
		assert.equal(rewriteState.outcome, "accepted", "the candidate that appends ! passes the rewritten test");

		const adding = tempDir("495-addonly-");
		cleanups.push(adding);
		fixtureTs(adding);
		initRepo(adding);
		const adder = track(
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
		const added = await adder.harness.start({ project_path: adding, request_text: "add shout", actor: HUMAN });
		await adder.harness.advance(added.change.change_id, { max_steps: 40 });
		const addRecord = await preparationRecord(adder, added.change.change_id);
		assert.equal(addRecord.qualified, true, "the new test alone is adopted as discriminant");
		assert.deepEqual(
			addRecord.modified_existing,
			[],
			"a preparation that only adds a test names no existing test modified",
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
