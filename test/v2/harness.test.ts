import { strict as assert } from "node:assert";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { makeHarness, reopenHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import type { ContextManifest } from "../../src/ports/execution.ts";
import { imposedLayersFor } from "../../src/domain/imposed-layers.ts";
import { fixtureTs, initRepo, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { HumanOrigin } from "../../src/contracts/v1/decision.ts";
import type { Mandate, RequirementsDocument } from "../../src/contracts/v1/protocol.ts";

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

function project(): string {
	const p = tempDir("495-proj-");
	cleanups.push(p);
	fixtureTs(p);
	initRepo(p);
	return p;
}
function track(t: TestHarness): TestHarness {
	cleanups.push(t.root);
	return t;
}
const origin = (): HumanOrigin => ({
	actor: HUMAN,
	host: "tui",
	session_id: "s1",
	asserted_at: "2026-09-16T12:00:00.000Z",
});

const WRONG = "export function greet(name) {\n  return `Hello, ${name}!`;\n}\n";
const RIGHT = "export function greet(name) {\n  return `Hello, ${name}`;\n}\n";
const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: true, notes: [] });

describe("full change cycle with real ledger, workspace, runner and scripted agent (REC-01, REC-02, REC-04, SA-015)", () => {
	it("accepts a conforming change end to end and keeps the project untouched", async () => {
		const p = project();
		const t = track(
			makeHarness({
				scripts: {
					implement: {
						steps: [
							{
								kind: "write",
								path: "src/greet.js",
								content: "export function greet(name) {\n  return `Hello, ${name}`; // conforming\n}\n",
							},
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		assert.equal(change.phase, "clarifying");
		const result = await t.harness.advance(change.change_id);
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		const view = result.view.change!;
		assert.equal(view.outcome, "accepted");
		// The requirement is that greet keeps behaving as it does: the suite already on the target
		// fails if it stops, so nothing has to be prepared first.
		assert.equal(
			result.steps.some((s) => s.includes("preparing")),
			false,
			result.steps.join(" | "),
		);
		assert.deepEqual(
			view.gates.map((g) => `${g.gate}:${g.verdict}`),
			["G0:PASS", "G1:PASS", "G2:PASS", "G3:PASS", "G4:PASS", "G5:PASS"],
		);
		assert.equal(view.evidence.length, 2);
		assert.ok(view.evidence.every((e) => e.verdict === "PASS" && e.valid));
		assert.equal(
			readFileSync(join(p, "src", "greet.js"), "utf8").includes("conforming"),
			false,
			"the project is never written by the producer",
		);
		assert.equal((await t.ledger.verifyIntegrity((d) => t.objects.verify(d))).ok, true);
		const evidence = t.ledger.listEvidence(change.change_id);
		const candidateEvidence = evidence.filter((e) => e.subject.kind === "candidate");
		const qualificationEvidence = evidence.filter((e) => e.subject.kind === "fixture");
		const referenceEvidence = evidence.filter((e) => e.subject.kind === "reference");
		assert.equal(candidateEvidence.length, 2);
		assert.equal(qualificationEvidence.length, 6, "three qualification witnesses are retained for each control");
		assert.equal(referenceEvidence.length, 2, "each control is also run on the reference (VER-08)");
		const baseDigest = t.ledger.loadChange(change.change_id)!.state.candidate!.base_digest;
		assert.ok(referenceEvidence.every((e) => e.subject.digest === baseDigest && e.facts.run === "reference"));
		assert.ok(
			candidateEvidence.every((e) => e.baseline?.reference_verdict === "PASS" && e.baseline.new_findings === 0),
		);
		assert.ok(candidateEvidence.every((e) => e.subject.digest === view.candidate!.manifest_digest));
		const protocol = await t.harness.artifacts.latest<{
			qualifications: Record<string, { evidence_ids?: Record<string, string> }>;
		}>(t.ledger.loadChange(change.change_id)!.state, "protocol");
		assert.ok(
			Object.values(protocol!.content.qualifications).every((q) => Object.keys(q.evidence_ids ?? {}).length === 3),
		);
		assert.ok(
			t.ledger.listArtifacts(change.change_id, "context").length >= 2,
			"context manifests are recorded per intervention (CTX-01)",
		);
	});

	it("a producer claiming success without passing tests is refused at G5, then corrected on a second attempt with bounded feedback (REC-02, SA-015, DEC-02)", async () => {
		const p = project();
		let attempt = 0;
		const t = track(makeHarness());
		t.agent.scripts.set("implement", { steps: [] });
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "implement") {
				attempt++;
				t.agent.scripts.set("implement", {
					steps: [
						{ kind: "write", path: "src/greet.js", content: attempt === 1 ? WRONG : RIGHT },
						{ kind: "complete", output: report(["src/greet.js"]) },
					],
				});
				if (attempt === 2)
					assert.ok(m.prompt.includes("Feedback from the previous attempt"), "feedback injected in the second attempt");
			}
			return original(m);
		};
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "greet must keep returning Hello, <name>",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		const view = result.view.change!;
		assert.equal(view.outcome, "accepted");
		assert.equal(view.attempts.used, 2);
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.feedback.length, 1);
		assert.ok(state.feedback[0]!.bytes <= 64 * 1024);
		assert.equal(state.attempts[0]?.result, "superseded");
		assert.ok(
			state.evidence.some((e) => e.verdict === "FAIL" && !e.valid) || state.evidence.some((e) => e.verdict === "FAIL"),
			"first attempt evidence historised",
		);
		const g5s = t.ledger
			.readChangeEvents(change.change_id)
			.filter((e) => e.event.type === "gate.decided" && e.event.decision.gate === "G5");
		assert.equal(g5s.length, 2);
		// A reference does not change while the change is under way: its pass is established once per
		// control and read back at the second attempt (VER-08).
		const referencePasses = t.ledger.listEvidence(change.change_id).filter((e) => e.facts.run === "reference");
		assert.equal(referencePasses.length, 2, "one reference pass per control, for two attempts");
		const candidatePasses = t.ledger.listEvidence(change.change_id).filter((e) => e.facts.run === "candidate");
		assert.equal(candidatePasses.length, 4, "two controls, two attempts");
		assert.deepEqual(
			candidatePasses.map((e) => e.baseline?.reused),
			[false, false, true, true],
			"the second attempt reads the reference passes back instead of running them again",
		);
	});

	it("a control that answers differently on two passes of the same candidate keeps INDETERMINATE and is not run again (VER-08, REC-25)", async () => {
		const p = project();
		let candidatePasses = 0;
		const t = track(
			makeHarness({
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: RIGHT },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
				// The unit control fails once on the first candidate and answers what the tree really is
				// afterwards: the two passes of the same candidate disagree without any cause in it.
				controls: (real) => ({
					runControl: async (invocation, signal) => {
						const run = await real.runControl(invocation, signal);
						if (
							invocation.subject.kind !== "candidate" ||
							invocation.control.control_id !== "unit" ||
							candidatePasses++ > 0
						)
							return run;
						const finding = {
							...(run.evidence.findings[0] ?? {
								rule_id: "unit:failure",
								category: "assertion" as const,
								severity: "blocker" as const,
								message: "greet returns",
								path: null,
								region: null,
								symbol: null,
								requirement_refs: invocation.requirement_refs,
								baseline_state: "unknown" as const,
								fingerprint: digestValue("flaky"),
								tool: "unit",
								tool_version: "1",
								confidence: 1,
								raw_evidence_ref: null,
							}),
						};
						return { ...run, evidence: { ...run.evidence, verdict: "FAIL" as const, findings: [finding] } };
					},
				}),
			}),
		);
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "greet must keep returning Hello, <name>",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		const evidence = t.ledger.listEvidence(change.change_id);
		const unstable = evidence.find((e) => e.limits.unstable);
		assert.ok(unstable, `an unstable control is recorded: ${result.steps.join(" | ")}`);
		assert.equal(unstable.verdict, "INDETERMINATE", "the green pass is not the one adopted");
		assert.equal(unstable.baseline?.raw_verdict, "FAIL");
		assert.equal(unstable.baseline?.reference_verdict, "PASS");
		assert.equal(unstable.baseline?.unstable, true);
		assert.equal(unstable.baseline?.blocking_findings, 0);
		assert.equal(
			evidence.filter((e) => e.facts.run === "confirmation").length,
			1,
			"the frozen rule pays for one confirmation, never more",
		);
		// Never relaunched until green: the technical retry is refused and the change is corrected instead.
		const retries = t.ledger
			.readChangeEvents(change.change_id)
			.filter((e) => JSON.stringify(e.event).includes("technical retry"));
		assert.deepEqual(retries, [], "an unstable control is not run again");
		assert.deepEqual(
			t.ledger.loadChange(change.change_id)!.state.budgets.retries,
			{},
			"no technical retry was spent on it",
		);
	});

	it("allows new tests while keeping frozen test content protected", async () => {
		const p = project();
		writeFiles(p, {
			"src/main/resources/schema.sql": "CREATE TABLE ITEM (id INT);\n",
			"src/test/resources/schema.sql": "CREATE TABLE ITEM (id INT);\n",
		});
		const addedTest =
			'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("additional coverage", () => assert.equal(2 + 2, 4));\n';
		const updatedSchema = "CREATE TABLE ITEM (id INT, label VARCHAR(255));\n";
		const changedPaths = [
			"src/greet.js",
			"test/additional.test.js",
			"src/main/resources/schema.sql",
			"src/test/resources/schema.sql",
		];
		const t = track(
			makeHarness({
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: RIGHT },
							{ kind: "write", path: "test/additional.test.js", content: addedTest },
							{ kind: "write", path: "src/main/resources/schema.sql", content: updatedSchema },
							{ kind: "write", path: "src/test/resources/schema.sql", content: updatedSchema },
							{ kind: "complete", output: report(changedPaths) },
						],
					},
				},
			}),
		);
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (mandate) => {
			if (mandate.role === "implement") {
				assert.ok(mandate.prompt.includes("# Adopted protocol"));
				assert.ok(mandate.prompt.includes('"protected_paths"'));
			}
			return original(mandate);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "keep greet covered", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(result.view.change?.gates.find((gate) => gate.gate === "G4")?.verdict, "PASS");
	});

	it("a producer that edits a protected test fails G4; three failures exhaust the attempts and ask IH-07 (REC-04, SA-011, SA-016)", async () => {
		const p = project();
		const t = track(makeHarness());
		let n = 0;
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "implement") {
				n++;
				t.agent.scripts.set("implement", {
					steps: [
						{ kind: "write", path: "src/greet.js", content: `${WRONG}// attempt ${n}\n` },
						{ kind: "write", path: "test/greet.test.js", content: `// test removed by the producer ${n}\n` },
						{ kind: "complete", output: report(["src/greet.js", "test/greet.test.js"]) },
					],
				});
			}
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "x", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.stop_reason, "decision_pending");
		assert.equal(state.pending_decisions[0]?.interaction, "IH-07");
		assert.equal(state.budgets.attempts_used, 3);
		const g4 = t.ledger
			.readChangeEvents(change.change_id)
			.filter((e) => e.event.type === "gate.decided" && e.event.decision.gate === "G4")
			.map((e) => (e.event as { decision: { verdict: string; reasons: string[] } }).decision);
		assert.equal(g4.length, 3);
		assert.ok(g4.every((g) => g.verdict === "FAIL" && g.reasons.some((r) => r.includes("protected"))));
		assert.equal(state.protocol?.ref.revision, 1, "protocol unchanged");
		assert.equal(t.requested.at(-1)?.interaction, "IH-07");
		const answer = t.harness.answerDecision(
			change.change_id,
			{
				decision_id: state.pending_decisions[0]!.decision_id,
				option_id: "stop",
				free_text: null,
				reason: null,
				subject_revision: state.pending_decisions[0]!.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		assert.equal(answer.error, null);
		assert.equal(answer.view.change?.status, "blocked");
	});

	it("a material question suspends the change with IH-01 and resumes after a human answer; a model output cannot answer (SA-004, SA-005, SA-030)", async () => {
		const p = project();
		let calls = 0;
		const t = track(makeHarness());
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "specify") {
				calls++;
				t.agent.scripts.set("specify", {
					steps: [
						{
							kind: "complete",
							output: specReport(
								calls === 1
									? {
											questions: [
												{ id: "q-format", question: "Faut-il un point d'exclamation final ?", material: true },
											],
										}
									: { answers: [{ question_id: "q-format", observable: true, requirement_ids: ["R1"] }] },
							),
						},
					],
				});
				if (calls === 2) assert.ok(m.objective.includes("Answered questions"), "answer is given back to the specifier");
			}
			if (m.role === "implement")
				t.agent.scripts.set("implement", {
					steps: [
						{ kind: "write", path: "src/greet.js", content: RIGHT },
						{ kind: "complete", output: report(["src/greet.js"]) },
					],
				});
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "greet", actor: HUMAN });
		const first = await t.harness.advance(change.change_id);
		assert.equal(first.stopped_because, "decision_required");
		const req = t.requested[0]!;
		assert.equal(req.interaction, "IH-01");
		assert.ok(
			req.options.some((o) => o.id === "abandon"),
			"explicit refusal is always possible",
		);
		const forged = t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "answer",
				free_text: "oui",
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			{ ...origin(), actor: { ...HUMAN, actor_type: "agent", origin: "model_output", authentication_level: "none" } },
		);
		assert.equal(forged.error?.code, "INVALID_PROVENANCE");
		const ok = t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "answer",
				free_text: "non, sans point d'exclamation",
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		assert.equal(ok.error, null);
		assert.equal(ok.view.change?.status, "ready");
		const second = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(second.stopped_because, "closed", second.steps.join(" | "));
		assert.equal(second.view.change?.outcome, "accepted");
	});

	// A recorded answer that contradicts the report it answers is the case the Flash-Next campaign
	// carried to acceptance: the mandate held "422" while the requirement adopted eight milliseconds
	// later still said "400", and the frozen suite then demanded the status the owner had replaced.
	const QUESTION = { id: "q-refus", question: "Quel statut pour un refus de longueur : 400 ou 422 ?", material: true };
	const ANSWER = "422 avec le message 'Name cannot be longer than 50 characters'";
	const beforeTheAnswer = () =>
		specReport({
			objective: "refuser un nom trop long en transmettant le refus jusqu'à la frontière HTTP (400 + message)",
			questions: [QUESTION],
			answers: [],
			requirements: [
				{
					requirement_id: "R1",
					statement: "un refus de longueur est exposé au client par un 400 portant un message non vide",
					mandatory: true,
					criterion: "le scénario d'acceptation vérifie le statut 400",
					category: "interface",
					satisfied_by_reference: true,
				},
			],
		});
	const afterTheAnswer = () =>
		specReport({
			objective: "refuser un nom trop long en transmettant le refus jusqu'à la frontière HTTP (422 + message)",
			questions: [QUESTION],
			answers: [{ question_id: QUESTION.id, observable: true, requirement_ids: ["R1"] }],
			requirements: [
				{
					requirement_id: "R1",
					statement: "un refus de longueur est exposé au client par un 422 portant le message convenu",
					mandatory: true,
					criterion: "le scénario d'acceptation vérifie le statut 422 et le message",
					category: "interface",
					satisfied_by_reference: true,
				},
			],
		});

	it("an answer to a material question reopens the specification, and the requirements adopted at G1 carry it rather than the report written before it (SA-004, RM-010)", async () => {
		const p = project();
		let calls = 0;
		const t = track(makeHarness());
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "specify") {
				calls++;
				t.agent.scripts.set("specify", {
					steps: [{ kind: "complete", output: calls === 1 ? beforeTheAnswer() : afterTheAnswer() }],
				});
				if (calls === 2)
					assert.ok(
						m.objective.includes(ANSWER),
						"the recorded answer is in the request the second report is written from",
					);
			}
			if (m.role === "implement")
				t.agent.scripts.set("implement", {
					steps: [
						{ kind: "write", path: "src/greet.js", content: RIGHT },
						{ kind: "complete", output: report(["src/greet.js"]) },
					],
				});
			return original(m);
		};
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "refuser un nom de plus de 50 caractères",
			actor: HUMAN,
		});
		const first = await t.harness.advance(change.change_id);
		assert.equal(first.stopped_because, "decision_required");
		const req = t.requested[0]!;
		assert.equal(req.interaction, "IH-01");
		const answered = t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "answer",
				free_text: ANSWER,
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		assert.equal(answered.error, null);
		const second = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(second.stopped_because, "closed", second.steps.join(" | "));
		assert.equal(calls, 2, "the specification is written again once the answer is recorded");

		const state = t.ledger.loadChange(change.change_id)!.state;
		const adopted = (await t.harness.artifacts.latest<RequirementsDocument>(state, "requirements"))!;
		assert.equal(
			state.adopted.requirements?.ref.content_digest,
			adopted.ref.content_digest,
			"the document read back is the one G1 adopted",
		);
		assert.ok(
			adopted.content.requirements[0]!.statement.includes("422"),
			`the adopted requirement still carries the status the answer replaced: ${adopted.content.requirements[0]!.statement}`,
		);
		assert.deepEqual(adopted.content.answers, [
			{
				question_id: QUESTION.id,
				question: QUESTION.question,
				answer: ANSWER,
				observable: true,
				requirement_ids: ["R1"],
			},
		]);
		const mandate = (await t.harness.artifacts.latest<Mandate>(state, "mandate"))!;
		assert.ok(
			mandate.content.objective.includes("422"),
			`the mandate objective contradicts the answer it carries: ${mandate.content.objective}`,
		);
		assert.equal(mandate.content.open_questions.find((q) => q.id === QUESTION.id)?.answer, ANSWER);
	});

	it("a specification that keeps ignoring a recorded answer stops the change at G1, naming the question (RM-011)", async () => {
		const p = project();
		let calls = 0;
		const t = track(makeHarness());
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "specify") {
				calls++;
				t.agent.scripts.set("specify", { steps: [{ kind: "complete", output: beforeTheAnswer() }] });
			}
			return original(m);
		};
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "refuser un nom de plus de 50 caractères",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id);
		const req = t.requested[0]!;
		t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "answer",
				free_text: ANSWER,
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "blocked", result.steps.join(" | "));
		assert.equal(
			calls,
			2,
			"a reopening that gives the same report back is not reopened again: that is the gate's business, not another intervention's",
		);
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.gates.G1?.verdict, "FAIL");
		assert.ok(
			state.gates.G1!.reasons.some((r) => r.includes(QUESTION.id)),
			state.gates.G1!.reasons.join(" | "),
		);
		assert.ok(state.stop_detail?.includes("observable contract that no requirement carries"), state.stop_detail ?? "");
		assert.equal(state.adopted.requirements, undefined, "nothing is adopted at G1");
	});

	// Measured on the java-flashnext-L campaign: a real specification asks new material questions at
	// each round, so a reopening budget counted in advance stops a specification that was converging.
	// What bounds it is progress — a report that accounts for an answer the one before it did not.
	it("reopens the specification again when a round of answers opens new material questions, and stops when a report gives the same ground back (RM-010)", async () => {
		const p = project();
		const QA = { id: "q-status", question: "400 ou 422 ?", material: true };
		const QB = { id: "q-scope", question: "création seule, ou aussi mise à jour ?", material: true };
		const round = (over: Parameters<typeof specReport>[0]) =>
			specReport({
				requirements: [
					{
						requirement_id: "R1",
						statement: "le refus est exposé au client",
						mandatory: true,
						criterion: "le scénario d'acceptation le vérifie",
						category: "interface",
						satisfied_by_reference: true,
					},
					{
						requirement_id: "R2",
						statement: "les lectures ne changent pas",
						mandatory: false,
						criterion: "les scénarios existants gardent leur statut",
						category: "regression",
						satisfied_by_reference: true,
					},
				],
				...over,
			});
		const reports = [
			round({ questions: [QA], answers: [] }),
			round({ questions: [QA, QB], answers: [{ question_id: QA.id, observable: true, requirement_ids: ["R1"] }] }),
			round({
				questions: [QA, QB],
				answers: [
					{ question_id: QA.id, observable: true, requirement_ids: ["R1", "R2"] },
					{ question_id: QB.id, observable: false, requirement_ids: [] },
				],
			}),
		];
		let calls = 0;
		const t = track(makeHarness());
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "specify") {
				calls++;
				t.agent.scripts.set("specify", {
					steps: [{ kind: "complete", output: reports[Math.min(calls - 1, reports.length - 1)]! }],
				});
			}
			if (m.role === "implement")
				t.agent.scripts.set("implement", {
					steps: [
						{ kind: "write", path: "src/greet.js", content: RIGHT },
						{ kind: "complete", output: report(["src/greet.js"]) },
					],
				});
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "x", actor: HUMAN });
		const answerPending = () => {
			const req = t.requested.at(-1)!;
			assert.equal(req.interaction, "IH-01");
			const done = t.harness.answerDecision(
				change.change_id,
				{
					decision_id: req.decision_id,
					option_id: "answer",
					free_text: `réponse à ${req.question}`,
					reason: null,
					subject_revision: req.subject.revision,
					scope: null,
					expires_at: null,
				},
				origin(),
			);
			assert.equal(done.error, null);
		};
		assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
		answerPending();
		assert.equal(
			(await t.harness.advance(change.change_id)).stopped_because,
			"decision_required",
			"the reopened report opens a question of its own",
		);
		answerPending();
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(last.stopped_because, "closed", last.steps.join(" | "));
		assert.equal(calls, 3, "a second reopening is allowed because the first took an answer into account");

		const state = t.ledger.loadChange(change.change_id)!.state;
		const adopted = (await t.harness.artifacts.latest<RequirementsDocument>(state, "requirements"))!;
		assert.deepEqual(
			adopted.content.answers.map((a) => [a.question_id, a.observable, a.requirement_ids]),
			[
				[QA.id, true, ["R1", "R2"]],
				[QB.id, false, []],
			],
		);
	});

	// Observed on java-flashnext-L: the specification bound a decision to `r-threshold-trimmed` while
	// declaring `r-threshold-trimbed`. The answer reads as carried and is carried by nothing.
	it("refuses at G1 an answer bound to a requirement the document does not carry, and accepts a non-mandatory one named beside a mandatory one (RM-011)", async () => {
		const p = project();
		const Q = { id: "q-seuil", question: "chaîne brute ou trimée ?", material: true };
		const requirements = [
			{
				requirement_id: "R1",
				statement: "le seuil est mesuré sur la chaîne trimée",
				mandatory: true,
				criterion: "les deux bornes sont vérifiées",
				category: "functional",
				satisfied_by_reference: true,
			},
			{
				requirement_id: "R2",
				statement: "la valeur stockée reste brute",
				mandatory: false,
				criterion: "le nom est relu tel quel",
				category: "functional",
				satisfied_by_reference: true,
			},
		];
		let calls = 0;
		const t = track(makeHarness());
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "specify") {
				calls++;
				const bound = calls >= 3 ? ["R1", "R2"] : ["R1-trimee", "R2"];
				t.agent.scripts.set("specify", {
					steps: [
						{
							kind: "complete",
							output: specReport({
								questions: [Q],
								answers: calls === 1 ? [] : [{ question_id: Q.id, observable: true, requirement_ids: bound }],
								requirements,
							}),
						},
					],
				});
			}
			if (m.role === "implement")
				t.agent.scripts.set("implement", {
					steps: [
						{ kind: "write", path: "src/greet.js", content: RIGHT },
						{ kind: "complete", output: report(["src/greet.js"]) },
					],
				});
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "x", actor: HUMAN });
		await t.harness.advance(change.change_id);
		const req = t.requested[0]!;
		t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "answer",
				free_text: "sur la chaîne trimée",
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		const blocked = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(blocked.stopped_because, "blocked", blocked.steps.join(" | "));
		const reasons = t.ledger.loadChange(change.change_id)!.state.gates.G1!.reasons;
		assert.ok(
			reasons.some((r) => r.includes("R1-trimee") && r.includes("does not carry")),
			reasons.join(" | "),
		);
		assert.ok(
			reasons.some((r) => r.includes("no mandatory requirement carries")),
			reasons.join(" | "),
		);
		assert.equal(
			reasons.some((r) => r.includes("R2")),
			false,
			"naming a non-mandatory requirement is not itself a reason",
		);
	});

	// Every reopening made the report redeclare each answer already taken, so it grew at each round
	// until the fifth was refused on its structured output (chantiers/F). The kernel recorded those
	// answers and read those declarations: it carries them, and asks the next report for what is new.
	const CARRIED = [
		{
			requirement_id: "R1",
			statement: "le refus est exposé au client",
			mandatory: true,
			criterion: "le scénario d'acceptation le vérifie",
			category: "interface",
			satisfied_by_reference: true,
		},
		{
			requirement_id: "R2",
			statement: "la mise à jour suit la même règle",
			mandatory: true,
			criterion: "le scénario de mise à jour le vérifie",
			category: "interface",
			satisfied_by_reference: true,
		},
	];
	const QA = { id: "q-status", question: "400 ou 422 ?", material: true };
	const QB = { id: "q-scope", question: "création seule, ou aussi mise à jour ?", material: true };

	/** Plays one specification report per round and keeps the objective each one was written from. */
	function rounds(
		t: TestHarness,
		reports: ReturnType<typeof specReport>[],
	): { objectives: string[]; calls: () => number } {
		const objectives: string[] = [];
		let calls = 0;
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "specify") {
				calls++;
				objectives.push(m.objective);
				t.agent.scripts.set("specify", {
					steps: [{ kind: "complete", output: reports[Math.min(calls - 1, reports.length - 1)]! }],
				});
			}
			if (m.role === "implement")
				t.agent.scripts.set("implement", {
					steps: [
						{ kind: "write", path: "src/greet.js", content: RIGHT },
						{ kind: "complete", output: report(["src/greet.js"]) },
					],
				});
			return original(m);
		};
		return { objectives, calls: () => calls };
	}

	it("carries an answer declaration from one report to the next, and asks the reopened report only for the answer it has not declared (RM-010)", async () => {
		const p = project();
		const t = track(makeHarness());
		const { objectives, calls } = rounds(t, [
			specReport({ questions: [QA], answers: [], requirements: CARRIED }),
			specReport({
				questions: [QA, QB],
				answers: [{ question_id: QA.id, observable: true, requirement_ids: ["R1"] }],
				requirements: CARRIED,
			}),
			// Silent about QA, and still carrying R1: the kernel holds the declaration it already read.
			specReport({
				questions: [QA, QB],
				answers: [{ question_id: QB.id, observable: true, requirement_ids: ["R2"] }],
				requirements: CARRIED,
			}),
		]);
		const { change } = await t.harness.start({ project_path: p, request_text: "x", actor: HUMAN });
		const answerPending = () => {
			const req = t.requested.at(-1)!;
			assert.equal(req.interaction, "IH-01");
			assert.equal(
				t.harness.answerDecision(
					change.change_id,
					{
						decision_id: req.decision_id,
						option_id: "answer",
						free_text: `réponse à ${req.question}`,
						reason: null,
						subject_revision: req.subject.revision,
						scope: null,
						expires_at: null,
					},
					origin(),
				).error,
				null,
			);
		};
		assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
		answerPending();
		assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
		answerPending();
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(last.stopped_because, "closed", last.steps.join(" | "));
		assert.equal(calls(), 3, "a report silent about an answer an earlier one bound is not reopened for it");

		const third = objectives[2]!;
		assert.ok(
			third.includes(`${QA.id}: ${QA.question} -> réponse à ${QA.question} [already declared, carried by R1]`),
			third,
		);
		assert.ok(
			third.includes(`${QB.id}: ${QB.question} -> réponse à ${QB.question} [to declare in \`answers\`]`),
			third,
		);
		const state = t.ledger.loadChange(change.change_id)!.state;
		const adopted = (await t.harness.artifacts.latest<RequirementsDocument>(state, "requirements"))!;
		assert.deepEqual(
			adopted.content.answers.map((a) => [a.question_id, a.requirement_ids]),
			[
				[QA.id, ["R1"]],
				[QB.id, ["R2"]],
			],
			"the carried declaration binds the answer in the document G1 adopts",
		);
	});

	it("stops carrying a declaration as soon as the report drops the requirement that held it, and G1 refuses the answer nothing binds (RM-011)", async () => {
		const p = project();
		const t = track(makeHarness());
		const { calls } = rounds(t, [
			specReport({ questions: [QA], answers: [], requirements: CARRIED }),
			specReport({
				questions: [QA, QB],
				answers: [{ question_id: QA.id, observable: true, requirement_ids: ["R1"] }],
				requirements: CARRIED,
			}),
			// R1 is gone, so the declaration that named it binds nothing: what the kernel carries is a
			// binding, not a receipt, and the answer counts as undeclared again.
			specReport({
				questions: [QA, QB],
				answers: [{ question_id: QB.id, observable: true, requirement_ids: ["R2"] }],
				requirements: [CARRIED[1]!],
			}),
		]);
		const { change } = await t.harness.start({ project_path: p, request_text: "x", actor: HUMAN });
		const answerPending = () => {
			const req = t.requested.at(-1)!;
			assert.equal(
				t.harness.answerDecision(
					change.change_id,
					{
						decision_id: req.decision_id,
						option_id: "answer",
						free_text: `réponse à ${req.question}`,
						reason: null,
						subject_revision: req.subject.revision,
						scope: null,
						expires_at: null,
					},
					origin(),
				).error,
				null,
			);
		};
		assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
		answerPending();
		assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
		answerPending();
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
		assert.equal(calls(), 3);
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.gates.G1?.verdict, "FAIL");
		assert.ok(
			state.gates.G1!.reasons.some((r) => r.includes(QA.id) && r.includes("no requirement carries")),
			state.gates.G1!.reasons.join(" | "),
		);
		assert.equal(state.adopted.requirements, undefined, "nothing is adopted at G1");
	});

	// The first campaign lost five changes this way: the kernel declared the error retryable and named
	// `retry_specification`, `resume` only lifted `execution_error`, and nothing could take the action.
	it("lifts a block the kernel declared retryable, and the change redoes the step that threw (DEC-05)", async () => {
		const p = project();
		let calls = 0;
		const t = track(makeHarness());
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "specify") {
				calls++;
				// A model that finished normally on a report its own fenced block leaves unclosed.
				t.agent.scripts.set(
					"specify",
					calls === 1
						? {
								steps: [
									{
										kind: "complete",
										output: { objective: "refuser un nom trop long", design: { summary: "" } },
										output_valid: false,
									},
								],
							}
						: { steps: [{ kind: "complete", output: specReport() }] },
				);
			}
			if (m.role === "implement")
				t.agent.scripts.set("implement", {
					steps: [
						{ kind: "write", path: "src/greet.js", content: RIGHT },
						{ kind: "complete", output: report(["src/greet.js"]) },
					],
				});
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "greet", actor: HUMAN });
		const blocked = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(blocked.stopped_because, "blocked", blocked.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.stop_reason, "configuration_error");
		assert.equal(state.stop_retryable, true);
		assert.ok(state.stop_detail?.includes("retry_specification"), state.stop_detail ?? "");
		assert.ok(blocked.view.change?.next_action.includes("resume"), blocked.view.change?.next_action ?? "");

		const resumed = t.harness.resume(change.change_id, HUMAN);
		assert.equal(resumed.change?.status, "ready", resumed.change?.next_action ?? "");
		const second = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(second.stopped_because, "closed", second.steps.join(" | "));
		assert.equal(second.view.change?.outcome, "accepted");
		assert.equal(calls, 2, "the refused specification is written again, on the same change");
	});

	// A dossier read back must say what produced a report. The manifest names the assembled text by
	// digest; without the bytes behind that digest it holds the instructions and the objective and
	// nothing of what was actually sent, and the workspace an intervention ran in is deleted after it.
	it("keeps the exact text every intervention was handed addressable in the store (CTX-01)", async () => {
		const p = project();
		const t = track(
			makeHarness({
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: RIGHT },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await t.harness.start({ project_path: p, request_text: "greet", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		const contexts = t.ledger.listArtifacts(change.change_id, "context");
		assert.ok(contexts.length > 0, "every intervention proposes its context");
		for (const stored of contexts) {
			const manifest = JSON.parse(
				new TextDecoder().decode((await t.objects.get(stored.ref.content_digest))!),
			) as ContextManifest;
			assert.ok(manifest.prompt_digest, `${manifest.role} names no prompt`);
			const recorded = await t.objects.get(manifest.prompt_digest!);
			assert.ok(recorded, `the text handed to ${manifest.role} is not in the store`);
			const { system_prompt, prompt } = JSON.parse(new TextDecoder().decode(recorded)) as {
				system_prompt: string;
				prompt: string;
			};
			assert.ok(
				system_prompt.includes(manifest.trusted_instructions[0]!),
				"the record carries the instructions as sent",
			);
			assert.ok(prompt.includes(manifest.objective), "the record carries the objective as sent");
			// Nothing fills this today; whatever ever does must reach the store with the prompt.
			for (const e of manifest.untrusted_excerpts) {
				assert.equal(
					await t.objects.has(e.digest),
					true,
					`the excerpt ${e.source} read by ${manifest.role} is named and absent`,
				);
			}
		}
	});

	// D-48: on the OAuth subscription path the provider writes its own system block above what 495
	// composes. The dossier must say so — a manifest silent on it would be a manifest that lies about
	// having composed the whole of what the model saw (CTX-02).
	it("names the layer the retained provider imposes, and never emits it itself (CTX-02, D-48)", async () => {
		const p = project();
		const t = track(
			makeHarness({
				model: { provider_id: "anthropic", model_id: "claude-x", thinking_level: "off" },
				policy: { egress: [{ provider_id: "anthropic", location: "off_machine" }] },
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: RIGHT },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await t.harness.start({ project_path: p, request_text: "greet", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		const contexts = t.ledger.listArtifacts(change.change_id, "context");
		assert.ok(contexts.length > 0);
		const expected = imposedLayersFor("anthropic");
		assert.equal(expected.length, 1, "the fixture provider must be one the domain declares a layer for");
		for (const stored of contexts) {
			const manifest = JSON.parse(
				new TextDecoder().decode((await t.objects.get(stored.ref.content_digest))!),
			) as ContextManifest;
			assert.deepEqual(manifest.imposed_layers, expected, `${manifest.role} does not carry the imposed layer`);
			const recorded = await t.objects.get(manifest.prompt_digest!);
			const { system_prompt, prompt } = JSON.parse(new TextDecoder().decode(recorded!)) as {
				system_prompt: string;
				prompt: string;
			};
			assert.ok(!system_prompt.includes(expected[0]!.text), "495 must not emit what it does not compose");
			assert.ok(!prompt.includes(expected[0]!.text));
		}
	});

	it("a target that requires the human adoption of its requirements is asked, and the adoption is bound to the exact text (IH-02)", async () => {
		const p = project();
		const t = track(
			makeHarness({
				policy: { adoption: { requirements: "human" } },
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: RIGHT },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await t.harness.start({ project_path: p, request_text: "greet", actor: HUMAN });
		const first = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(first.stopped_because, "decision_required", first.steps.join(" | "));
		const req = t.requested.at(-1)!;
		assert.equal(req.interaction, "IH-02");
		assert.equal(req.subject.kind, "artifact");
		assert.equal(req.required_authority, "change_owner");
		assert.ok(req.options.some((o) => o.id === "adopt") && req.options.some((o) => o.id === "refuse"));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.gates.G1?.verdict, "INDETERMINATE");
		assert.equal(
			req.subject.digest,
			state.proposals.requirements!.at(-1)!.content_digest,
			"the decision is presented on the text it adopts",
		);
		const ok = t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "adopt",
				free_text: null,
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		assert.equal(ok.error, null);
		const second = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(second.stopped_because, "closed", second.steps.join(" | "));
		assert.equal(second.view.change?.outcome, "accepted");
	});

	it("a mandate whose human adoption is refused stops the change with the reason, and nothing is adopted at G0 (IH-02)", async () => {
		const p = project();
		const t = track(makeHarness({ policy: { adoption: { mandate: "human" } } }));
		const { change } = await t.harness.start({ project_path: p, request_text: "greet", actor: HUMAN });
		const first = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(first.stopped_because, "decision_required", first.steps.join(" | "));
		const req = t.requested.at(-1)!;
		assert.equal(req.interaction, "IH-02");
		assert.equal(req.allow_free_text, true);
		const refused = t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "refuse",
				free_text: "l'objectif ne dit pas ce que le demandeur a décidé",
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		assert.equal(refused.error, null);
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.status, "blocked");
		assert.equal(state.stop_reason, "policy_denied");
		assert.ok(state.stop_detail?.includes("l'objectif ne dit pas"), state.stop_detail ?? "");
		assert.equal(state.adopted.mandate, undefined);
	});

	it("an unqualified sandbox blocks before any producing intervention (capability_missing, ADR-013)", async () => {
		const p = project();
		const t = track(makeHarness({ scripts: { implement: { steps: [{ kind: "complete", output: report([]) }] } } }));
		t.harness.deps.sandbox.qualification = {
			...t.harness.deps.sandbox.qualification,
			qualified: false,
			reasons: ["backend not qualified"],
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "x", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "capability_missing", result.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.phase, "implementing");
		assert.equal(state.interventions.filter((i) => i.role === "implement").length, 0);
	});

	it("resume after an interrupted intervention treats it as failed and continues from the same phase (PF-17, DEC-05)", async () => {
		const p = project();
		const t = track(
			makeHarness({
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: RIGHT },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await t.harness.start({ project_path: p, request_text: "x", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 4 });
		let state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.phase, "implementing");
		t.harness.pause(change.change_id, HUMAN);
		state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.status, "paused");
		const paused = await t.harness.advance(change.change_id);
		assert.equal(paused.stopped_because, "paused");
		t.harness.resume(change.change_id, HUMAN);
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(result.view.change?.outcome, "accepted");
		assert.equal((await t.ledger.verifyIntegrity()).ok, true);
	});

	// Which files an intervention must read is not the harness's to guess: it holds the request and
	// nothing else, while the model holds the tree and the tools to search it. Measured on a real
	// tree, a selection scoring the request's words against the paths matched nothing on a French
	// request over an English tree and fell back to the shallowest paths in alphabetical order —
	// lint and benchmark scripts, build manifests, and not one file of the module the request named,
	// for about a third of the median prompt.
	it("puts no project file in a prompt: an intervention reads the tree with its own tools", async () => {
		const p = project();
		writeFiles(p, { "modules/core/src/main/java/io/demo/user/UserRepository.java": "class UserRepository {}\n" });
		const t = track(
			makeHarness({
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: RIGHT },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Ajouter une adresse postale au dépôt des utilisateurs",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.ok(t.agent.started.length > 0, "at least one intervention ran");
		for (const mandate of t.agent.started) {
			assert.deepEqual(
				mandate.context.untrusted_excerpts,
				[],
				`${mandate.role} was handed project files it never asked for`,
			);
			assert.ok(
				!mandate.prompt.includes("Untrusted project content"),
				`${mandate.role} carries a project excerpt block`,
			);
			assert.ok(
				mandate.tools.some((x) => x === "read" || x === "grep" || x === "find" || x === "ls"),
				`${mandate.role} cannot read the tree itself`,
			);
		}
	});

	it("a step that fails after writing still records the block, so the change cannot silently restart", async () => {
		const p = project();
		// G1 refuses a specification with no requirement. The step has already appended two events by
		// then, so the block must be written against the revision those events produced, not against
		// the one the step started from — otherwise it loses the race and is dropped in silence.
		const t = track(
			makeHarness({ defaultScript: { steps: [{ kind: "complete", output: specReport({ requirements: [] }) }] } }),
		);
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Something with nothing to verify",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 10 });
		assert.equal(result.stopped_because, "blocked", result.steps.join(" | "));
		const persisted = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(persisted.status, "blocked", "the block reached the ledger, not only the returned view");
		assert.ok(persisted.stop_reason, "a blocked change always says why");
		assert.ok(!result.steps.some((x) => x.includes("could not be blocked")), result.steps.join(" | "));
		// A second command must not find the change ready and redo the work that just failed.
		const again = await t.harness.advance(change.change_id, { max_steps: 10 });
		assert.equal(again.stopped_because, "blocked");
		assert.deepEqual(again.steps, [], "a blocked change does nothing until a human unblocks it");
	});

	it("a producer stopped by the duration budget resumes on its own workspace instead of starting over", async () => {
		const p = project();
		// Two interrupted sessions, each leaving a piece behind, then a finished one: nothing may be
		// rebuilt from the reference in between, or the first two pieces would be gone.
		const t = track(
			makeHarness({
				policy: { budgets: { max_continuations: 3 } },
				scripts: {
					implement: {
						steps: [{ kind: "write", path: "src/half.js", content: "// first session\n" }, { kind: "truncate" }],
					},
				},
			}),
		);
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		t.agent.scripts.set("implement", {
			steps: [{ kind: "write", path: "src/half.js", content: "// first session\n" }, { kind: "truncate" }],
		});
		await t.harness.advance(change.change_id, { max_steps: 6 });
		const interventions = t.ledger
			.loadChange(change.change_id)!
			.state.interventions.filter((i) => i.role === "implement");
		assert.ok(interventions.length >= 2, `the producer must be resumed, got ${interventions.length} intervention(s)`);
		assert.equal(interventions[0]!.result, "truncated", "a session cut by the budget is never recorded as completed");
		assert.equal(
			interventions[0]!.attempt_id,
			interventions[1]!.attempt_id,
			"a continuation stays inside the same attempt",
		);
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.attempts.length, 1, "a continuation consumes no attempt budget");
		const workspaces = t.ledger
			.listArtifacts(change.change_id, "candidate")
			.filter((a) => a.ref.artifact_id.startsWith("ws_"));
		assert.equal(workspaces.length, 1, "the producer keeps one workspace across its continuations");
		assert.ok(
			t.progress.some((m) => m.includes("resumes on workspace")),
			t.progress.join(" | "),
		);
	});

	it("a candidate that cannot build is corrected, never re-verified: an identical re-run proves nothing", async () => {
		const p = project();
		// The producer leaves a source the runner cannot load. Re-running a frozen tree through a
		// frozen protocol is a pure function, so the failure must reach the producer as feedback and
		// leave the technical retry budget untouched.
		const t = track(
			makeHarness({
				scripts: {
					implement: {
						steps: [
							{
								kind: "write",
								path: "src/greet.js",
								content: "export function greet(name) { return `Hello, ${name}`;\n",
							},
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.deepEqual(state.budgets.retries, {}, "no technical retry is spent on a deterministic observation");
		assert.notEqual(
			state.stop_reason,
			"execution_error",
			`the retry budget must not be what stops the change: ${result.steps.join(" | ")}`,
		);
		assert.equal(state.stop_reason, "stagnation", "the producer repeated itself; that is the honest reason to stop");
		const verdicts = state.evidence.map((e) => e.verdict);
		assert.ok(
			!verdicts.includes("INDETERMINATE"),
			`a broken tree is a verdict on the candidate, got ${verdicts.join(",")}`,
		);
		assert.ok(state.attempts.length >= 2, "the producer was given the failure back and tried again");
	});

	it("explicit /verify re-runs the frozen controls on the frozen candidate without any model; human acceptance then closes (SA-013, IH-10)", async () => {
		const p = project();
		const t = track(
			makeHarness({
				policy: { g5_human_acceptance: true },
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: RIGHT },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await t.harness.start({ project_path: p, request_text: "x", actor: HUMAN });
		const first = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(first.stopped_because, "decision_required");
		assert.equal(t.requested.at(-1)?.interaction, "IH-10");
		const before = t.agent.started.length;
		const result = await t.harness.verify(change.change_id);
		assert.equal(t.agent.started.length, before, "no intervention started by verify");
		assert.equal(result.view.change?.evidence.length, 4);
		assert.equal(result.view.change?.phase, "deciding");
		const req = t.requested.at(-1)!;
		const answer = t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "accept",
				free_text: null,
				reason: "reviewed",
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		assert.equal(answer.error, null, answer.error?.message);
		const after = await t.harness.advance(change.change_id, { max_steps: 5 });
		assert.equal(after.view.change?.gates.find((g) => g.gate === "G5")?.verdict, "PASS");
		assert.equal(after.view.change?.outcome, "accepted");
		assert.equal(existsSync(join(p, "src", "greet.js")), true);
	});
});

describe("what a change introduces, recomputed from the store (QLT-04)", () => {
	it("hands every control the lines the candidate wrote, an empty set on the reference, and keeps both texts in the dossier", async () => {
		const p = project();
		const seen: { run: string; control: string; introduced: Record<string, number[]> | null | undefined }[] = [];
		const t = track(
			makeHarness({
				scripts: {
					implement: {
						steps: [
							{
								kind: "write",
								path: "src/greet.js",
								content: "export function greet(name) {\n  return `Hello, ${name}`; // conforming\n}\n",
							},
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
				controls: (real) => ({
					runControl: async (invocation, signal) => {
						seen.push({
							run: invocation.subject.kind,
							control: invocation.control.control_id,
							introduced: invocation.introduced_lines,
						});
						return real.runControl(invocation, signal);
					},
				}),
			}),
		);
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		// Only the second line was rewritten; the two the candidate kept are not its to answer for.
		const onCandidate = seen.filter((s) => s.run === "candidate");
		assert.ok(onCandidate.length > 0);
		for (const run of onCandidate) assert.deepEqual(run.introduced, { "src/greet.js": [2] }, `control ${run.control}`);
		for (const run of seen.filter((s) => s.run === "reference"))
			assert.deepEqual(run.introduced, {}, "the reference introduces nothing");
		// Both sides of the changed file are in the store, so the diff can be redone from the dossier.
		const candidateId = result.view.change!.candidate!.candidate_id;
		const state = t.ledger.loadChange(change.change_id)!.state;
		const sides = await Promise.all(
			[`files_${candidateId}`, `base_files_${candidateId}`].map(
				async (id) =>
					await t.harness.artifacts.read<Record<string, { digest: string }>>({ artifact_id: id, revision: 1 }),
			),
		);
		assert.deepEqual(
			sides.map((side) => Object.keys(side)),
			[["src/greet.js"], ["src/greet.js"]],
		);
		assert.notEqual(sides[0]!["src/greet.js"]!.digest, sides[1]!["src/greet.js"]!.digest);
		const referenceBytes = await t.objects.get(sides[1]!["src/greet.js"]!.digest);
		assert.equal(new TextDecoder().decode(referenceBytes!), readFileSync(join(p, "src", "greet.js"), "utf8"));
		assert.ok(
			t.ledger
				.listArtifacts(state.change_id, "candidate")
				.some((a) => a.ref.artifact_id === `base_files_${candidateId}`),
		);
	});
});

describe("obligations and budgets across a session change (CTX-04, REC-06)", () => {
	/** The context manifests recorded so far, in the order the interventions were run. */
	async function manifests(t: TestHarness, changeId: string): Promise<ContextManifest[]> {
		const refs = t.ledger.listArtifacts(changeId, "context");
		return Promise.all(refs.map(async (a) => t.harness.artifacts.read<ContextManifest>(a.ref)));
	}
	function normative(state: {
		adopted: Record<string, { ref: { artifact_id: string; revision: number; content_digest: string } } | undefined>;
	}): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (const kind of ["mandate", "requirements", "protocol", "design"]) {
			const a = state.adopted[kind];
			out[kind] = a ? { artifact_id: a.ref.artifact_id, revision: a.ref.revision, digest: a.ref.content_digest } : null;
		}
		return out;
	}

	it("a session opened on the same ledger restores the same normative revisions, the same remaining budgets and the bounded feedback, with no model memory", async () => {
		const p = project();
		// The first session spends an attempt on a candidate the controls refuse and opens the
		// correction; the second session is a different process with a different agent.
		const first = track(
			makeHarness({
				policy: { budgets: { max_attempts: 3 } },
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: WRONG },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await first.harness.start({
			project_path: p,
			request_text: "greet must keep returning Hello, <name>",
			actor: HUMAN,
		});
		// The session ends one step after the refusal: the correction is open and nothing has produced it.
		let cut = await first.harness.advance(change.change_id, { max_steps: 1 });
		for (
			let i = 0;
			i < 40 &&
			cut.stopped_because === "max_steps" &&
			first.ledger.loadChange(change.change_id)!.state.feedback.length === 0;
			i++
		) {
			cut = await first.harness.advance(change.change_id, { max_steps: 1 });
		}
		const before = first.ledger.loadChange(change.change_id)!.state;
		assert.equal(before.phase, "implementing", "the first session stopped with a correction open");
		assert.equal(before.attempts[0]?.result, "superseded", "the refused attempt is historised");
		assert.equal(before.budgets.attempts_used, 2, "the refused attempt is spent and a correction is open");
		assert.equal(before.feedback.length, 1, "the feedback owed to the next attempt is in the ledger");
		const normativeBefore = normative(before);
		const budgetsBefore = structuredClone(before.budgets);
		const manifestsBefore = await manifests(first, change.change_id);

		// Session shutdown, then a new session on the same data: new ledger handle, new identities,
		// a new scripted agent that was never told what the first one did.
		const second = reopenHarness(first, {
			policy: { budgets: { max_attempts: 3 } },
			scripts: {
				implement: {
					steps: [
						{ kind: "write", path: "src/greet.js", content: RIGHT },
						{ kind: "complete", output: report(["src/greet.js"]) },
					],
				},
			},
		});
		const restored = second.ledger.loadChange(change.change_id)!.state;
		assert.deepEqual(
			normative(restored),
			normativeBefore,
			"the adopted mandate, requirements, protocol and design are the same revisions",
		);
		assert.deepEqual(restored.budgets, budgetsBefore, "the budgets are read back, not restarted");
		assert.deepEqual(restored.feedback, before.feedback);
		assert.equal(
			second.harness.status(change.change_id).change?.attempts.used,
			2,
			"the second session inherits the attempts already spent, it does not start over",
		);
		const protocolAfter = await second.harness.artifacts.latest<{ controls: { control_id: string }[] }>(
			restored,
			"protocol",
		);
		assert.deepEqual(
			protocolAfter!.content.controls.map((c) => c.control_id).sort(),
			["lint", "unit"],
			"the frozen controls are read back from the store",
		);

		const finished = await second.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(
			finished.stopped_because,
			"closed",
			`${finished.steps.join(" | ")} :: ${JSON.stringify(finished.view.change?.stop_detail)}`,
		);
		assert.equal(finished.view.change?.outcome, "accepted");
		assert.equal(
			finished.view.change?.attempts.used,
			2,
			"the correction opened before the cut is the one produced, on the same budget",
		);

		// Every intervention of the second session rebuilds its manifest from the ledger: the same
		// adopted revisions, the full instructions, and the obligations of the protocol frozen before
		// the session ended — none of which a model summary carried across.
		const produced = (await manifests(second, change.change_id)).slice(manifestsBefore.length);
		assert.ok(produced.length > 0, "the second session ran at least one intervention");
		for (const manifest of produced) {
			assert.equal(
				manifest.trusted_instructions[0],
				manifestsBefore[0]!.trusted_instructions[0],
				"the invariant instructions are restated in full",
			);
			for (const ref of manifest.adopted_refs) {
				assert.deepEqual(
					{ artifact_id: ref.artifact_id, revision: ref.revision, digest: ref.digest },
					normativeBefore[ref.kind],
				);
			}
		}
		const implement = produced.find((m) => m.role === "implement");
		assert.ok(implement, "the correction was produced in the second session");
		assert.ok(
			implement.trusted_instructions.some((i) => i.includes("The kernel will judge your work by running")),
			"the frozen controls are restated to the producer",
		);
		second.ledger.close();
	});
});

describe("the report an engineer reads, on a conducted change (IMP-05)", () => {
	it("separates what the controls measured, what was concluded from it and what stays unestablished, from the ledger alone", async () => {
		const p = project();
		const t = track(
			makeHarness({
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: RIGHT },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
			}),
		);
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(result.view.change?.outcome, "accepted");

		const engineering = await t.harness.report(change.change_id);
		// Measured: every control run the ledger holds, on the candidate, on the reference and on the
		// qualification witnesses, each with the subject it was pointed at.
		assert.deepEqual(
			engineering.observations.map((o) => o.evidence_id).sort(),
			t.ledger
				.listEvidence(change.change_id)
				.map((e) => e.evidence_id)
				.sort(),
		);
		assert.deepEqual([...new Set(engineering.observations.map((o) => o.subject_kind))].sort(), [
			"candidate",
			"fixture",
			"reference",
		]);
		// Concluded: the gates, by the kernel. Nothing here was written by a model.
		assert.deepEqual(
			engineering.judgments.map((j) => j.id),
			["G0", "G1", "G2", "G3", "G4", "G5"],
		);
		assert.ok(engineering.judgments.every((j) => j.authority === "kernel"));
		// Unestablished: an accepted change still says what its green controls do not prove.
		assert.ok(
			engineering.residual_risks.some((risk) => risk.code === "controls_are_not_a_proof"),
			JSON.stringify(engineering.residual_risks),
		);
		// The whole thing is a projection of the ledger: a second session builds the same report, and
		// no intervention is run to produce it.
		const before = t.progress.length;
		const again = await t.harness.report(change.change_id);
		assert.deepEqual(again, engineering);
		assert.equal(t.progress.length, before, "reading the report runs nothing");
	});
});
