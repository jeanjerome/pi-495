import { strict as assert } from "node:assert";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { makeHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { fixtureTs, initRepo, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import type { HumanOrigin } from "../../src/contracts/v1/decision.ts";

const cleanups: string[] = [];
afterEach(() => { for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true }); });

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
const origin = (): HumanOrigin => ({ actor: HUMAN, host: "tui", session_id: "s1", asserted_at: "2026-09-16T12:00:00.000Z" });

const WRONG = "export function greet(name) {\n  return `Hello, ${name}!`;\n}\n";
const RIGHT = "export function greet(name) {\n  return `Hello, ${name}`;\n}\n";
const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: true, notes: [] });

describe("full change cycle with real ledger, workspace, runner and scripted agent (REC-01, REC-02, REC-04, SA-015)", () => {
	it("accepts a conforming change end to end and keeps the project untouched", async () => {
		const p = project();
		const t = track(makeHarness({ scripts: { implement: { steps: [{ kind: "write", path: "src/greet.js", content: "export function greet(name) {\n  return `Hello, ${name}`; // conforming\n}\n" }, { kind: "complete", output: report(["src/greet.js"]) }] } } }));
		const { change } = await t.harness.start({ project_path: p, request_text: "Keep greet behaviour, tidy the implementation", actor: HUMAN });
		assert.equal(change.phase, "clarifying");
		const result = await t.harness.advance(change.change_id);
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		const view = result.view.change!;
		assert.equal(view.outcome, "accepted");
		assert.deepEqual(view.gates.map((g) => `${g.gate}:${g.verdict}`), ["G0:PASS", "G1:PASS", "G2:PASS", "G3:PASS", "G4:PASS", "G5:PASS"]);
		assert.equal(view.evidence.length, 2);
		assert.ok(view.evidence.every((e) => e.verdict === "PASS" && e.valid));
		assert.equal(readFileSync(join(p, "src", "greet.js"), "utf8").includes("conforming"), false, "the project is never written by the producer");
		assert.equal((await t.ledger.verifyIntegrity((d) => t.objects.verify(d))).ok, true);
		const evidence = t.ledger.listEvidence(change.change_id);
		const candidateEvidence = evidence.filter((e) => e.subject.kind === "candidate");
		const qualificationEvidence = evidence.filter((e) => e.subject.kind === "fixture");
		assert.equal(candidateEvidence.length, 2);
		assert.equal(qualificationEvidence.length, 6, "three qualification witnesses are retained for each control");
		assert.ok(candidateEvidence.every((e) => e.subject.digest === view.candidate!.manifest_digest));
		const protocol = await t.harness.latestArtifact<{ qualifications: Record<string, { evidence_ids?: Record<string, string> }> }>(t.ledger.loadChange(change.change_id)!.state, "protocol");
		assert.ok(Object.values(protocol!.content.qualifications).every((q) => Object.keys(q.evidence_ids ?? {}).length === 3));
		assert.ok(t.ledger.listArtifacts(change.change_id, "context").length >= 2, "context manifests are recorded per intervention (CTX-01)");
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
				t.agent.scripts.set("implement", { steps: [{ kind: "write", path: "src/greet.js", content: attempt === 1 ? WRONG : RIGHT }, { kind: "complete", output: report(["src/greet.js"]) }] });
				if (attempt === 2) assert.ok(m.prompt.includes("Feedback from the previous attempt"), "feedback injected in the second attempt");
			}
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "greet must keep returning Hello, <name>", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		const view = result.view.change!;
		assert.equal(view.outcome, "accepted");
		assert.equal(view.attempts.used, 2);
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.feedback.length, 1);
		assert.ok(state.feedback[0]!.bytes <= 64 * 1024);
		assert.equal(state.attempts[0]?.result, "superseded");
		assert.ok(state.evidence.some((e) => e.verdict === "FAIL" && !e.valid) || state.evidence.some((e) => e.verdict === "FAIL"), "first attempt evidence historised");
		const g5s = t.ledger.readChangeEvents(change.change_id).filter((e) => e.event.type === "gate.decided" && e.event.decision.gate === "G5");
		assert.equal(g5s.length, 2);
	});

	it("allows new tests while keeping frozen test content protected", async () => {
		const p = project();
		writeFiles(p, { "src/main/resources/schema.sql": "CREATE TABLE ITEM (id INT);\n", "src/test/resources/schema.sql": "CREATE TABLE ITEM (id INT);\n" });
		const addedTest = 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("additional coverage", () => assert.equal(2 + 2, 4));\n';
		const updatedSchema = "CREATE TABLE ITEM (id INT, label VARCHAR(255));\n";
		const changedPaths = ["src/greet.js", "test/additional.test.js", "src/main/resources/schema.sql", "src/test/resources/schema.sql"];
		const t = track(makeHarness({ scripts: { implement: { steps: [{ kind: "write", path: "src/greet.js", content: RIGHT }, { kind: "write", path: "test/additional.test.js", content: addedTest }, { kind: "write", path: "src/main/resources/schema.sql", content: updatedSchema }, { kind: "write", path: "src/test/resources/schema.sql", content: updatedSchema }, { kind: "complete", output: report(changedPaths) }] } } }));
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
			if (m.role === "implement") { n++; t.agent.scripts.set("implement", { steps: [{ kind: "write", path: "src/greet.js", content: `${WRONG}// attempt ${n}\n` }, { kind: "write", path: "test/greet.test.js", content: `// test removed by the producer ${n}\n` }, { kind: "complete", output: report(["src/greet.js", "test/greet.test.js"]) }] }); }
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "x", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.stop_reason, "decision_pending");
		assert.equal(state.pending_decisions[0]?.interaction, "IH-07");
		assert.equal(state.budgets.attempts_used, 3);
		const g4 = t.ledger.readChangeEvents(change.change_id).filter((e) => e.event.type === "gate.decided" && e.event.decision.gate === "G4").map((e) => (e.event as { decision: { verdict: string; reasons: string[] } }).decision);
		assert.equal(g4.length, 3);
		assert.ok(g4.every((g) => g.verdict === "FAIL" && g.reasons.some((r) => r.includes("protected"))));
		assert.equal(state.protocol?.ref.revision, 1, "protocol unchanged");
		assert.equal(t.requested.at(-1)?.interaction, "IH-07");
		const answer = t.harness.answerDecision(change.change_id, { decision_id: state.pending_decisions[0]!.decision_id, option_id: "stop", free_text: null, reason: null, subject_revision: state.pending_decisions[0]!.subject.revision, scope: null, expires_at: null }, origin());
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
				t.agent.scripts.set("specify", { steps: [{ kind: "complete", output: specReport(calls === 1 ? { questions: [{ id: "q-format", question: "Faut-il un point d'exclamation final ?", material: true }] } : {}) }] });
				if (calls === 2) assert.ok(m.objective.includes("Answered questions"), "answer is given back to the specifier");
			}
			if (m.role === "implement") t.agent.scripts.set("implement", { steps: [{ kind: "write", path: "src/greet.js", content: RIGHT }, { kind: "complete", output: report(["src/greet.js"]) }] });
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "greet", actor: HUMAN });
		const first = await t.harness.advance(change.change_id);
		assert.equal(first.stopped_because, "decision_required");
		const req = t.requested[0]!;
		assert.equal(req.interaction, "IH-01");
		assert.ok(req.options.some((o) => o.id === "abandon"), "explicit refusal is always possible");
		const forged = t.harness.answerDecision(change.change_id, { decision_id: req.decision_id, option_id: "answer", free_text: "oui", reason: null, subject_revision: req.subject.revision, scope: null, expires_at: null }, { ...origin(), actor: { ...HUMAN, actor_type: "agent", origin: "model_output", authentication_level: "none" } });
		assert.equal(forged.error?.code, "INVALID_PROVENANCE");
		const ok = t.harness.answerDecision(change.change_id, { decision_id: req.decision_id, option_id: "answer", free_text: "non, sans point d'exclamation", reason: null, subject_revision: req.subject.revision, scope: null, expires_at: null }, origin());
		assert.equal(ok.error, null);
		assert.equal(ok.view.change?.status, "ready");
		const second = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(second.stopped_because, "closed", second.steps.join(" | "));
		assert.equal(second.view.change?.outcome, "accepted");
	});

	it("an unqualified sandbox blocks before any producing intervention (capability_missing, ADR-013)", async () => {
		const p = project();
		const t = track(makeHarness({ scripts: { implement: { steps: [{ kind: "complete", output: report([]) }] } } }));
		t.harness.deps.sandbox.qualification = { ...t.harness.deps.sandbox.qualification, qualified: false, reasons: ["backend not qualified"] };
		const { change } = await t.harness.start({ project_path: p, request_text: "x", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "capability_missing", result.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.phase, "implementing");
		assert.equal(state.interventions.filter((i) => i.role === "implement").length, 0);
	});

	it("resume after an interrupted intervention treats it as failed and continues from the same phase (PF-17, DEC-05)", async () => {
		const p = project();
		const t = track(makeHarness({ scripts: { implement: { steps: [{ kind: "write", path: "src/greet.js", content: RIGHT }, { kind: "complete", output: report(["src/greet.js"]) }] } } }));
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

	it("explicit /verify re-runs the frozen controls on the frozen candidate without any model; human acceptance then closes (SA-013, IH-10)", async () => {
		const p = project();
		const t = track(makeHarness({ policy: { g5_human_acceptance: true }, scripts: { implement: { steps: [{ kind: "write", path: "src/greet.js", content: RIGHT }, { kind: "complete", output: report(["src/greet.js"]) }] } } }));
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
		const answer = t.harness.answerDecision(change.change_id, { decision_id: req.decision_id, option_id: "accept", free_text: null, reason: "reviewed", subject_revision: req.subject.revision, scope: null, expires_at: null }, origin());
		assert.equal(answer.error, null, answer.error?.message);
		const after = await t.harness.advance(change.change_id, { max_steps: 5 });
		assert.equal(after.view.change?.gates.find((g) => g.gate === "G5")?.verdict, "PASS");
		assert.equal(after.view.change?.outcome, "accepted");
		assert.equal(existsSync(join(p, "src", "greet.js")), true);
	});
});
