import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_WORKSPACE_POLICY, GitWorkspace } from "../../src/adapters/workspace/git-workspace.ts";
import type { ControlExecutionPort, ControlInvocation } from "../../src/ports/execution.ts";
import type { Protocol, RequirementsDocument } from "../../src/contracts/v1/protocol.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { removedAfterEach, tempDir } from "../helpers/fixtures.ts";
import { acceptSurvey, makeHarness, specReport, trackedProject, type TestHarness } from "../helpers/harness-fixture.ts";

/** What a survey says of one requirement, as this test reads it from the dossier. */
interface SurveyedRequirement {
	requirement_id: string;
	measures: { control_id: string; verdict: string; evidence_id: string }[];
}

const cleanups = removedAfterEach();

const QUESTION = "où en sont les tests ?";

/** The specification a question on the tests gives: one requirement, the suite of the project. */
const testsReport = specReport({
	objective: QUESTION,
	requirements: [
		{
			requirement_id: "R1",
			statement: "the test suite of the project passes",
			mandatory: true,
			criterion: "the unit test suite passes",
			category: "functional",
			satisfied_by_reference: true,
		},
	],
});

/** The digest of the project's tree as a reference capture reads it. */
async function treeDigest(projectPath: string): Promise<string> {
	const capture = new GitWorkspace(tempDir("495-capture-", cleanups));
	return (await capture.captureReference(projectPath, DEFAULT_WORKSPACE_POLICY)).tree_digest;
}

/** The real control runner, with the pass of `controlId` on the reference rendered INDETERMINATE. */
class IndeterminateOnReference implements ControlExecutionPort {
	private readonly real: ControlExecutionPort;
	private readonly controlId: string;
	constructor(real: ControlExecutionPort, controlId: string) {
		this.real = real;
		this.controlId = controlId;
	}
	async runControl(
		invocation: ControlInvocation,
		signal?: AbortSignal,
	): ReturnType<ControlExecutionPort["runControl"]> {
		const run = await this.real.runControl(invocation, signal);
		if (invocation.subject.kind !== "reference" || invocation.control.control_id !== this.controlId) return run;
		return {
			...run,
			evidence: {
				...run.evidence,
				verdict: "INDETERMINATE",
				limits: { ...run.evidence.limits, notes: [...run.evidence.limits.notes, "the runner crashed"] },
			},
		};
	}
}

/** Starts a survey of the project and conducts it until it stops, the owner accepting the survey it presents. */
async function survey(t: TestHarness, projectPath: string) {
	const { change } = await t.harness.start({
		project_path: projectPath,
		request_text: QUESTION,
		actor: HUMAN,
		deliverable: "state",
	});
	const conducted = await t.harness.advance(change.change_id, { max_steps: 40 });
	const result =
		conducted.stopped_because === "decision_required" ? await acceptSurvey(t, change.change_id) : conducted;
	return { changeId: change.change_id, result, state: t.ledger.loadChange(change.change_id)!.state };
}

describe("a change whose deliverable is the state of the project", () => {
	it("un état des lieux d'un projet dont la suite passe traverse G0, G1, G2 et G5, n'ouvre aucune intervention de production ni de relecture, n'a aucun candidat, porte un survey qui relie chaque exigence à ses contrôles avec verdict et preuve, est clos accepted et laisse le digest du projet inchangé", async () => {
		const p = trackedProject();
		const before = await treeDigest(p);
		const t = makeHarness({ defaultScript: { steps: [{ kind: "complete", output: testsReport }] } });
		const { changeId, result, state } = await survey(t, p);

		assert.deepEqual(
			Object.keys(state.gates).sort(),
			["G0", "G1", "G2", "G5"],
			`G3, G4 and G6 are never evaluated: ${result.steps.join(" | ")}`,
		);
		assert.ok(
			Object.values(state.gates).every((g) => g.verdict === "PASS"),
			Object.values(state.gates)
				.map((g) => `${g.gate}:${g.verdict} ${g.reasons.join("; ")}`)
				.join(" | "),
		);
		assert.deepEqual(
			state.interventions.map((i) => i.role),
			["specify"],
			"no production nor review intervention is opened",
		);
		assert.equal(state.candidate, null, "the change has no candidate");
		assert.equal(state.attempts.length, 0, "no attempt is opened");

		assert.ok(state.adopted.survey, "a survey is adopted");
		const surveyed = await t.harness.artifacts.read<{ requirements: SurveyedRequirement[] }>(state.adopted.survey.ref);
		const requirements = await t.harness.artifacts.latest<RequirementsDocument>(state, "requirements");
		const protocol = await t.harness.artifacts.latest<Protocol>(state, "protocol");
		for (const r of requirements!.content.requirements) {
			const entry = surveyed.requirements.find((s) => s.requirement_id === r.requirement_id);
			assert.ok(entry, `the survey carries ${r.requirement_id}`);
			const obligation = protocol!.content.obligations.find((o) => o.requirement.requirement_id === r.requirement_id);
			assert.deepEqual(
				entry.measures.map((m) => m.control_id).sort(),
				[...obligation!.control_ids].sort(),
				`${r.requirement_id} is measured by the controls the protocol froze for it`,
			);
			for (const m of entry.measures) {
				const evidence = t.ledger.getEvidence(m.evidence_id);
				assert.ok(evidence, `the evidence ${m.evidence_id} of ${m.control_id} is in the dossier`);
				assert.equal(evidence.subject.kind, "reference", `${m.control_id} was measured on the reference`);
				assert.equal(evidence.subject.digest, state.reference.digest);
				assert.equal(evidence.control_id, m.control_id);
				assert.equal(m.verdict, evidence.verdict, `the survey carries the verdict of ${m.control_id}`);
			}
		}

		assert.equal(state.outcome, "accepted");
		assert.equal(state.phase, "closed");
		assert.equal(result.stopped_because, "closed");
		assert.equal(await treeDigest(p), before, "the project's tree has the digest it had before the request");
		assert.equal(t.ledger.loadChange(changeId)!.state.candidate, null);
	});

	it("un état des lieux n'ouvre aucune intervention de relecture, même sous une politique qui en exige une, et est clos accepted", async () => {
		const p = trackedProject();
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: testsReport }] },
			policy: { required_reviews: ["security"] },
		});
		const { changeId, result, state } = await survey(t, p);

		assert.deepEqual(
			state.interventions.map((i) => i.role),
			["specify"],
			`no review intervention is opened: ${result.steps.join(" | ")}`,
		);
		const entered = t.ledger
			.readChangeEvents(changeId)
			.flatMap(({ event }) => (event.type === "phase.entered" ? [event.phase] : []));
		assert.ok(!entered.includes("reviewing"), `the survey never enters the review phase: ${entered.join(" -> ")}`);
		assert.equal(state.outcome, "accepted");
		assert.equal(state.phase, "closed");
	});

	it("la consigne de spécification d'un état des lieux dit que le livrable est l'état du projet et qu'aucun fichier ne sera modifié", async () => {
		const p = trackedProject();
		const t = makeHarness({ defaultScript: { steps: [{ kind: "complete", output: testsReport }] } });
		const objectives: string[] = [];
		const start = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = (mandate) => {
			if (mandate.role === "specify") objectives.push(mandate.objective);
			return start(mandate);
		};
		await survey(t, p);

		assert.ok(objectives.length > 0, "a specification intervention is opened");
		const [objective] = objectives;
		assert.ok(objective!.includes(QUESTION), `the request is carried: ${objective}`);
		assert.match(objective!, /the deliverable of this change is the state of the project/i);
		assert.match(objective!, /measured by the controls on the reference/i);
		assert.match(objective!, /no file of the project will be modified/i);
	});

	it("un état des lieux dont un contrôle rend INDETERMINATE sur la référence s'arrête bloqué en nommant le contrôle, sans survey adopté", async () => {
		const p = trackedProject();
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: testsReport }] },
			controls: (real) => new IndeterminateOnReference(real, "unit"),
		});
		const { result, state } = await survey(t, p);

		assert.equal(result.stopped_because, "blocked", result.steps.join(" | "));
		assert.equal(state.status, "blocked");
		assert.ok(state.stop_detail?.includes("unit"), `the stop names the control: ${state.stop_detail}`);
		assert.notEqual(state.outcome, "accepted");
		assert.equal(state.adopted.survey, undefined, "no survey is adopted");
	});
});
