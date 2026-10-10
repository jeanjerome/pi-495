/**
 * Examining a contested frozen case: once G5 refused a candidate, what the producer contested of the
 * frozen tests is filed by the kernel and examined by an intervention distinct from the producer, which
 * reads and writes nothing it could change. The examiner says what it found; the kernel takes the step
 * that follows. An examination that never concludes is bounded by the retry budget, and the change then
 * stops naming the contestation it could not settle. A case found wrong has the preparation written again,
 * qualified and frozen anew; a case that holds the requirement as adopted puts the requirement to the owner,
 * who alone says whether the need changes; a contestation found unfounded leaves the code to correct. A case
 * the owner kept is never rewritten on the examiner's word, whatever protocol froze it since: its examiner is
 * told the owner's answer, a finding that the case is wrong goes back to the owner before the preparation is
 * revised for any other case, and a preparation written again is not told to rewrite it.
 */
import { Value } from "typebox/value";
import { digestValue } from "../../contracts/digest.ts";
import type { SubjectRef } from "../../contracts/v1/common.ts";
import type { RequirementsDocument } from "../../contracts/v1/protocol.ts";
import { OUTPUT_SCHEMAS, type ProducerReport } from "../../contracts/v1/reports.ts";
import {
	currentAttempt,
	ranUnderProtocol,
	type ChangeState,
	type ContestationEntry,
	type ContestationFacts,
	type HumanDecisionEntry,
} from "../../domain/change/state.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { contestationObjective } from "../context.ts";
import type { PhaseContext, Unit } from "./phase.ts";
import { reviseRequirements } from "./requirements-revision.ts";

/** What the producer contested, kept beside the candidate its intervention left. */
interface ProducerContestations {
	intervention_id: string;
	contestations: NonNullable<ProducerReport["contestations"]>;
}

/** The name under which the contestations a producer intervention reported are kept. */
function producerContestationsId(interventionId: string): string {
	return `contested_${interventionId}`;
}

/** Keeps what the producer contested of the frozen tests, to be filed once G5 has judged its candidate. */
export async function keepProducerContestations(
	ctx: PhaseContext,
	changeId: string,
	interventionId: string,
	report: ProducerReport | null,
): Promise<void> {
	if (!report?.contestations?.length) return;
	await ctx.artifacts.store(
		"candidate",
		changeId,
		producerContestationsId(interventionId),
		{ intervention_id: interventionId, contestations: report.contestations },
		interventionId,
	);
}

/** What the examination of the contestations on the frozen candidate came to. */
type ContestationOutcome =
	| { kind: "examined"; unit: Unit; concluded: ContestationEntry[] }
	| { kind: "stopped"; unit: Unit };

/**
 * The contestations filed on the frozen candidate under the frozen protocol. A revised preparation can yield the
 * same candidate again: what was found under the protocol it replaced no longer steers the change.
 */
function onCandidate(state: ChangeState): ContestationEntry[] {
	const digest = state.candidate?.manifest_digest;
	const frozen = state.protocol?.ref;
	return (state.contestations ?? []).filter(
		(c) =>
			c.candidate_digest === digest &&
			c.protocol.protocol_id === frozen?.protocol_id &&
			c.protocol.revision === frozen.revision,
	);
}

/** The run of the frozen control judging the requirement in which the contested case failed on the candidate. */
function reproductionOf(
	state: ChangeState,
	requirementId: string,
	caseName: string,
): ContestationFacts["reproduction"] {
	const obligation = state.protocol?.obligations.find((o) => o.requirement.requirement_id === requirementId);
	const run = state.evidence.findLast(
		(e) =>
			e.valid &&
			e.verdict === "FAIL" &&
			e.subject_digest === state.candidate?.manifest_digest &&
			state.protocol !== null &&
			ranUnderProtocol(e, state.protocol.ref) &&
			(obligation?.control_ids.includes(e.control_id) ?? false) &&
			!(e.passed_cases ?? []).includes(caseName),
	);
	return { control_id: run?.control_id ?? "", evidence_id: run?.evidence_id ?? "" };
}

/**
 * Files what the producer of the attempt contested, once per candidate. The kernel refuses a
 * contestation that names a wrong identity or no failing run; it is reported and examined no further.
 */
async function fileReported(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const state = unit.state;
	const attempt = currentAttempt(state);
	const producer = state.interventions.findLast((i) => i.role === "implement" && i.attempt_id === attempt?.attempt_id);
	if (!producer || !state.protocol || !state.candidate || onCandidate(state).length > 0) return unit;
	const reported = await ctx.artifacts
		.read<ProducerContestations>({ artifact_id: producerContestationsId(producer.intervention_id), revision: 1 })
		// A producer that contested nothing left nothing to read.
		.catch(() => null);
	for (const item of reported?.contestations ?? []) {
		const facts: ContestationFacts = {
			contestation_id: ctx.id("ctt"),
			intervention_id: producer.intervention_id,
			requirement_id: item.requirement_id,
			case_name: item.case,
			protocol: { protocol_id: state.protocol.ref.protocol_id, revision: state.protocol.ref.revision },
			candidate_digest: state.candidate.manifest_digest,
			observation: item.observation,
			reproduction: reproductionOf(state, item.requirement_id, item.case),
		};
		try {
			unit = ctx.commit(
				unit,
				{ type: "contestation.file", at: ctx.now(), actor: KERNEL_ACTOR, contestation: facts },
				cor,
			);
		} catch (error) {
			// A contestation the kernel cannot examine changes nothing; the producer's other ones still can be.
			if (!(error instanceof DomainError)) throw error;
			ctx.progress(error.message);
		}
	}
	return unit;
}

/** Runs the examination of one contestation until the examiner concludes or the retry budget stops the change. */
async function examine(ctx: PhaseContext, unit: Unit, cor: string, c: ContestationEntry): Promise<Unit> {
	const requirements = await ctx.artifacts.latest<RequirementsDocument>(unit.state, "requirements");
	const statement =
		requirements?.content.requirements.find((r) => r.requirement_id === c.requirement_id)?.statement ?? null;
	const objective = contestationObjective(c, statement, (await keptBy(ctx, unit, c)) !== null);
	const workspacePath = ctx.workspace.workspacePath(unit.state.candidate!.workspace_id);
	for (;;) {
		const r = await ctx.runIntervention(unit, cor, "review", objective, workspacePath, {
			adopted: ["mandate", "requirements", "protocol"],
			output_schema: "contestation-finding",
		});
		unit = r.unit;
		if (unit.state.status === "blocked") return unit;
		if (r.result === "completed" && r.output_valid && Value.Check(OUTPUT_SCHEMAS["contestation-finding"], r.output)) {
			const report = r.output;
			return ctx.commit(
				unit,
				{
					type: "contestation.conclude",
					at: ctx.now(),
					actor: KERNEL_ACTOR,
					contestation_id: c.contestation_id,
					finding: report.finding,
					examiner_id: r.intervention_id,
					reasons: report.reasons,
				},
				cor,
			);
		}
		unit = ctx.commit(
			unit,
			{
				type: "operation.fail",
				at: ctx.now(),
				actor: KERNEL_ACTOR,
				operation_key: `examination of contestation ${c.contestation_id}`,
			},
			cor,
		);
		if (unit.state.status === "blocked") return unit;
	}
}

/** Files what the producer contested of the frozen tests and examines what is still open on the frozen candidate. */
export async function examineContestations(ctx: PhaseContext, unit: Unit, cor: string): Promise<ContestationOutcome> {
	unit = await fileReported(ctx, unit, cor);
	for (const c of onCandidate(unit.state).filter((x) => x.finding === null)) {
		unit = await examine(ctx, unit, cor, c);
		if (unit.state.status === "blocked") return { kind: "stopped", unit };
	}
	return { kind: "examined", unit, concluded: onCandidate(unit.state) };
}

/** What the producer is told of a contestation the examination rejected: the case stands, the code is to change. */
function unfoundedNote(c: ContestationEntry): string {
	return `contestation ${c.contestation_id} of "${c.case_name}" found unfounded: ${c.reasons}; the frozen protocol stands and the code must be corrected`;
}

/** What the producer is told once the owner kept the requirement the contested case asserts. */
function keptNote(c: ContestationEntry): string {
	return `the owner kept ${c.requirement_id} as adopted: the frozen case "${c.case_name}" stands and the code must be corrected`;
}

/**
 * What a preparation written again is told of a case the examination found wrong, while that case is still frozen.
 * A case the owner kept is not among them: the owner kept it against that finding.
 */
export async function foundWrongNotes(ctx: PhaseContext, unit: Unit): Promise<string[]> {
	const notes: string[] = [];
	for (const c of unit.state.contestations ?? []) {
		if (c.finding !== "test_correction" || c.protocol.protocol_id !== unit.state.protocol?.ref.protocol_id) continue;
		if ((await keptBy(ctx, unit, c)) !== null) continue;
		notes.push(
			`The frozen case "${c.case_name}" of ${c.requirement_id} was examined and found wrong: ${c.reasons}. Write it again so that it asserts what ${c.requirement_id} says.`,
		);
	}
	return notes;
}

/** The case found wrong revises the preparation that froze it: G2 and what follows are passed again. */
async function revisePreparation(ctx: PhaseContext, unit: Unit, cor: string, c: ContestationEntry): Promise<Unit> {
	const ref = await ctx.artifacts.store(
		"preparation",
		unit.state.change_id,
		ctx.id("prv"),
		{ kind: "preparation-revision", contestation_id: c.contestation_id, case_name: c.case_name, reasons: c.reasons },
		KERNEL_ACTOR.actor_id,
	);
	return ctx.commit(
		unit,
		{
			type: "artifact.revise",
			at: ctx.now(),
			actor: KERNEL_ACTOR,
			kind: "preparation",
			ref,
			reason: `contestation ${c.contestation_id} found the frozen case "${c.case_name}" wrong`,
		},
		cor,
	);
}

/** What the owner's answer on a contested requirement holds for: this contestation, on these requirements. */
async function needSubject(ctx: PhaseContext, unit: Unit, c: ContestationEntry): Promise<SubjectRef> {
	const requirements = await ctx.artifacts.latest<RequirementsDocument>(unit.state, "requirements");
	if (!requirements) throw new DomainError("EVIDENCE_MISSING", "requirements missing");
	return {
		kind: "artifact",
		id: requirements.ref.artifact_id,
		revision: requirements.ref.revision,
		digest: digestValue({ requirements: requirements.ref.content_digest, contestation: c.contestation_id }),
	};
}

/** The owner's valid answer on a contestation, through IH-04. */
async function ownerAnswer(ctx: PhaseContext, unit: Unit, c: ContestationEntry) {
	const subject = await needSubject(ctx, unit, c);
	return (
		unit.state.human_decisions.find(
			(d) => d.valid && d.interaction === "IH-04" && d.subject.digest === subject.digest,
		) ?? null
	);
}

/**
 * The owner's valid "keep" on an earlier contestation of the same case of the same requirement. It holds whatever
 * protocol froze the case since: a preparation revised for another case freezes a protocol of its own.
 */
async function keptBy(ctx: PhaseContext, unit: Unit, c: ContestationEntry) {
	const earlier = (unit.state.contestations ?? []).filter(
		(x) =>
			x.contestation_id !== c.contestation_id && x.requirement_id === c.requirement_id && x.case_name === c.case_name,
	);
	for (const x of earlier) {
		const answer = await ownerAnswer(ctx, unit, x);
		if (answer?.option_id === "keep") return answer;
	}
	return null;
}

/**
 * Asks the owner in IH-04 whether the need changes on a contested case: what the producer objects, the owner's
 * earlier "keep" when the examination now finds the kept case wrong, and what the examination found.
 */
async function askOwner(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	c: ContestationEntry,
	keep: HumanDecisionEntry | undefined,
): Promise<Unit> {
	return ctx.requestDecision(unit, cor, {
		interaction: "IH-04",
		subject: await needSubject(ctx, unit, c),
		facts: [
			`the producer contests the frozen case "${c.case_name}" of ${c.requirement_id}: ${c.observation}`,
			...(keep ? [`the owner answered "keep" on this case (${keep.human_decision_id})`] : []),
			`the examination found: ${c.reasons}`,
		],
		recommendation: null,
		arg: c.requirement_id,
		language: ctx.language(unit.state),
		contested: { requirement_id: c.requirement_id, case_name: c.case_name, ...(keep ? { kept: true } : {}) },
	});
}

/** What the kernel did with the findings: a step taken, or the code to correct and what the producer is told. */
type FindingsOutcome = { kind: "settled"; unit: Unit } | { kind: "correct"; unit: Unit; notes: string[] };

/**
 * Takes the step each finding calls for. A model's finding never answers for the owner: a requirement the
 * examination puts in question, or a case the owner kept that the examination finds wrong, waits for the
 * owner's IH-04, and only the owner's "revise" rewrites it. A kept case found wrong is put to the owner before
 * the preparation that freezes it is revised for another case.
 */
export async function settleFindings(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	concluded: readonly ContestationEntry[],
): Promise<FindingsOutcome> {
	const kept = new Map<string, HumanDecisionEntry>();
	for (const c of concluded.filter((x) => x.finding === "test_correction")) {
		const answer = await keptBy(ctx, unit, c);
		if (answer) kept.set(c.contestation_id, answer);
	}
	const wrong = concluded.find((c) => c.finding === "test_correction" && !kept.has(c.contestation_id));
	const notes = concluded.filter((c) => c.finding === "unfounded").map(unfoundedNote);
	const toOwner = concluded.filter((x) => x.finding === "requirement_change" || kept.has(x.contestation_id));
	for (const c of wrong ? toOwner.filter((x) => kept.has(x.contestation_id)) : toOwner) {
		const answer = await ownerAnswer(ctx, unit, c);
		if (!answer) return { kind: "settled", unit: await askOwner(ctx, unit, cor, c, kept.get(c.contestation_id)) };
		if (answer.option_id === "revise") {
			const reference = await ctx.artifacts.reference(unit.state);
			return {
				kind: "settled",
				unit: await reviseRequirements(ctx, unit, cor, reference, [c.requirement_id], answer.free_text),
			};
		}
		notes.push(keptNote(c));
	}
	if (wrong) return { kind: "settled", unit: await revisePreparation(ctx, unit, cor, wrong) };
	return { kind: "correct", unit, notes };
}
