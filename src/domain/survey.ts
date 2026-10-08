/**
 * The survey of a project: what the frozen controls measured on the reference, tied to the
 * requirements of a change whose deliverable is the state of the project rather than a candidate.
 *
 * Nothing here runs a control. The survey is built from the evidence the reference pass recorded,
 * and its gate reads that evidence back from the ledger: a survey that names an evidence the change
 * does not hold, or one taken on another tree, protocol or environment, concludes nothing.
 */
import type { Verdict } from "../contracts/v1/common.ts";
import type { ControlDefinition, Protocol } from "../contracts/v1/protocol.ts";
import type { ChangeState, EvidenceEntry, FrozenProtocol, NextAction } from "./change/state.ts";

/** One control's pass on the reference, as the survey presents it. */
export interface SurveyMeasure {
	control_id: string;
	verdict: Verdict;
	evidence_id: string;
}

/** Who wrote the code a violation of the adopted quality referential sits in: a hand, or a generator that says so. */
export type CodeAuthorship = "proprietary" | "generated";

/** What a control found on the reference: the tool's words, and the file they point at when they name one. */
export interface SurveyFinding {
	message: string;
	path: string | null;
	/** The rule the tool names; absent from a survey taken before findings carried it. */
	rule_id?: string;
	/** Present on a finding of a control of the adopted quality referential, absent on any other. */
	authorship?: CodeAuthorship;
}

/** Where a finding sits: its own file, and every other `path:line` its message names, as a duplication names each of its places. */
export function placesOf(finding: Pick<SurveyFinding, "message" | "path">): string[] {
	const named = [...finding.message.matchAll(/(?:^|[\s,])([^\s,:]+):\d+/g)].map((m) => m[1]!);
	return [...new Set([...(finding.path === null ? [] : [finding.path]), ...named])];
}

/**
 * The authorship of a finding of the referential: generated when every place it names is in a file a
 * generator declares it wrote, proprietary otherwise. It ranges the finding and removes nothing from it.
 */
function authorshipOf(
	finding: Pick<SurveyFinding, "message" | "path">,
	generated: ReadonlySet<string>,
): CodeAuthorship {
	const places = placesOf(finding);
	return places.length > 0 && places.every((place) => generated.has(place)) ? "generated" : "proprietary";
}

export interface Survey {
	change_id: string;
	reference_digest: string;
	protocol_revision: number;
	/**
	 * Every frozen control's pass on the reference, with what it found there. A control that measures
	 * nothing of the reference is a blind spot, with its reason, and is presented without a verdict.
	 */
	controls: {
		control_id: string;
		evidence_id: string;
		verdict: Verdict | null;
		findings: SurveyFinding[];
		blind_spot: string | null;
	}[];
	/**
	 * Each requirement with the passes of the controls the protocol froze for it, or the reason no
	 * control measures it: a blind spot is never read as the absence of a defect.
	 */
	requirements: { requirement_id: string; measures: SurveyMeasure[]; blind_spot: string | null }[];
}

/** What a requirement or a control is about, as a survey matches one to the other. */
type Nature = "behaviour" | "style" | "coverage" | "mutation" | "structure";

/**
 * What a report reader declares of what it measures: its nature, none for a reading that says nothing
 * of what its command checks, as an exit code; and whether it judges only the lines a subject
 * introduces instead of the state of the whole tree. A control whose reader is not among those given
 * measures no nature.
 */
export interface ReaderTraits {
	id: string;
	nature: Nature | null;
	differential: boolean;
}

/** The reader a control names by its `parser` among `readers`, or none when no loaded technology brings it. */
export function readerOf<R extends ReaderTraits>(readers: readonly R[], parser: string): R | undefined {
	return readers.find((r) => r.id === parser);
}

/** The words a requirement's category is read on, tried in this order. */
const CATEGORY_NATURES: readonly (readonly [RegExp, Nature])[] = [
	[/function|behaviou?r/i, "behaviour"],
	[/quality|maintainab|lint|style/i, "style"],
	[/coverage/i, "coverage"],
	[/mutation/i, "mutation"],
	[/architect|structur/i, "structure"],
];

function natureOf(category: string): Nature | undefined {
	return CATEGORY_NATURES.find(([words]) => words.test(category))?.[1];
}

/** Whether a requirement asks about the structure of the code: the nature an architecture map answers. */
export function asksAboutStructure(category: string): boolean {
	return natureOf(category) === "structure";
}

/** Whether a requirement asks about the quality of the code: the nature a quality referential measures. */
export function asksAboutQuality(category: string): boolean {
	return natureOf(category) === "style";
}

/**
 * The controls of a requirement's nature, or the reason none measures it. The lint controls the
 * target declares measure style; every other control measures what its reading reads.
 */
export function controlsOfNature(
	category: string,
	controls: readonly Pick<ControlDefinition, "control_id" | "parser">[],
	lintControlIds: readonly string[],
	readers: readonly ReaderTraits[],
): { control_ids: string[] } | { blind_spot: string } {
	const nature = natureOf(category);
	if (!nature) return { blind_spot: `blind spot: category "${category}" names no nature a control measures` };
	const measuring = controls.filter(
		(c) => (lintControlIds.includes(c.control_id) ? "style" : readerOf(readers, c.parser)?.nature) === nature,
	);
	if (measuring.length === 0)
		return { blind_spot: `blind spot: no control of the target measures its nature (${nature})` };
	return { control_ids: measuring.map((c) => c.control_id) };
}

/**
 * Why a control measures nothing of the reference, or null when it does. A control whose qualification
 * failed does not answer as its witnesses require, so its verdict says nothing; a differential control
 * reads the lines a subject introduces, and the reference introduces none; a test control measures
 * nothing when the capability diagnosis found no case of the project's own executed there.
 */
function unmeasured(
	control: Pick<ControlDefinition, "control_id" | "parser">,
	protocol: Pick<Protocol, "capability_diagnosis" | "qualifications">,
	readers: readonly ReaderTraits[],
): string | null {
	const qualification = protocol.qualifications[control.control_id];
	if (qualification && !qualification.qualified)
		return `blind spot: the control is not qualified: ${qualification.notes.join("; ") || "its witnesses did not answer as required"}`;
	const diagnosis = protocol.capability_diagnosis;
	const reader = readerOf(readers, control.parser);
	if (reader?.differential)
		return "blind spot: it measures only the lines a change introduces, and the reference introduces none";
	if (reader?.nature === "behaviour" && diagnosis.executed === 0)
		return `blind spot: the reference executes no test of its own (capability level ${diagnosis.level}, ${diagnosis.discovered ?? 0} case(s) of its own discovered)`;
	return null;
}

/** The survey the reference pass gives: each control's evidence, and each requirement's controls. */
export function surveyOf(input: {
	change_id: string;
	reference_digest: string;
	protocol_revision: number;
	protocol: Pick<Protocol, "obligations" | "capability_diagnosis" | "qualifications" | "quality_referential"> & {
		controls: readonly Pick<ControlDefinition, "control_id" | "parser">[];
	};
	passes: readonly (SurveyMeasure & { findings: readonly SurveyFinding[] })[];
	/** The files of the reference a generator declares it wrote; none when absent. */
	generated_files?: readonly string[];
	/** The report readers the controls name, which say what each control measures. */
	readers: readonly ReaderTraits[];
}): Survey {
	const generated = new Set(input.generated_files ?? []);
	const referentialControls = new Set(input.protocol.quality_referential?.rules.map((r) => r.control_id) ?? []);
	const controls = input.passes.map((p) => {
		const control = input.protocol.controls.find((c) => c.control_id === p.control_id);
		const blindSpot = control ? unmeasured(control, input.protocol, input.readers) : null;
		return {
			control_id: p.control_id,
			evidence_id: p.evidence_id,
			verdict: blindSpot === null ? p.verdict : null,
			findings: p.findings.map((f) => ({
				message: f.message,
				path: f.path,
				...(f.rule_id === undefined ? {} : { rule_id: f.rule_id }),
				...(referentialControls.has(p.control_id) ? { authorship: authorshipOf(f, generated) } : {}),
			})),
			blind_spot: blindSpot,
		};
	});
	return {
		change_id: input.change_id,
		reference_digest: input.reference_digest,
		protocol_revision: input.protocol_revision,
		controls,
		requirements: input.protocol.obligations.map((o) => {
			const own = controls.filter((c) => o.control_ids.includes(c.control_id));
			const measures = own.flatMap((c) =>
				c.verdict === null ? [] : [{ control_id: c.control_id, verdict: c.verdict, evidence_id: c.evidence_id }],
			);
			const unmeasuredBy = own.flatMap((c) => (c.blind_spot === null ? [] : [`${c.control_id}: ${c.blind_spot}`]));
			return {
				requirement_id: o.requirement.requirement_id,
				measures,
				blind_spot:
					o.not_applicable_reason ??
					(measures.length === 0 && unmeasuredBy.length > 0 ? unmeasuredBy.join("; ") : null),
			};
		}),
	};
}

/**
 * What the owner reads of a survey before accepting or refusing it: one fact per requirement, giving
 * the verdict of each control that measures it, with the files its findings name, or why none does.
 */
export function surveyFacts(survey: Pick<Survey, "controls" | "requirements">): string[] {
	return survey.requirements.map((r) => {
		const measured = r.measures.map((m) => {
			const files = [
				...new Set(
					(survey.controls.find((c) => c.control_id === m.control_id)?.findings ?? []).flatMap((f) =>
						f.path === null ? [] : [f.path],
					),
				),
			];
			return `${m.control_id} ${m.verdict}${files.length > 0 ? ` (${files.join(", ")})` : ""}`;
		});
		return `${r.requirement_id}: ${[...measured, ...(r.blind_spot === null ? [] : [r.blind_spot])].join("; ")}`;
	});
}

export interface SurveyGateResult {
	verdict: "PASS" | "FAIL" | "INDETERMINATE";
	reasons: string[];
	retained: string[];
	missing: string[];
	/** The controls whose pass on the reference concluded nothing. */
	indeterminate_controls: string[];
	next_action: NextAction;
}

/** Why an evidence does not answer for its control in the survey, or null when it does. */
function unretained(
	state: Pick<ChangeState, "reference" | "environment_digest">,
	protocol: Pick<FrozenProtocol, "ref" | "environment_digest">,
	measure: Survey["controls"][number],
	evidence: EvidenceEntry,
): string | null {
	if (!evidence.valid) return evidence.invalid_reason ?? "invalidated";
	if (evidence.control_id !== measure.control_id) return `evidence of another control (${evidence.control_id})`;
	if (evidence.subject_digest !== state.reference.digest) return "taken on another tree than the reference";
	if (evidence.protocol_revision !== protocol.ref.revision) return "taken under another protocol revision";
	if (
		evidence.environment_digest !== protocol.environment_digest ||
		(state.environment_digest !== null && evidence.environment_digest !== state.environment_digest)
	)
		return "taken in another environment";
	if (measure.verdict !== null && evidence.verdict !== measure.verdict)
		return `the survey carries ${measure.verdict} where the evidence says ${evidence.verdict}`;
	return null;
}

/**
 * G5 of a survey: every frozen control has a valid evidence on the reference, at the frozen protocol
 * and environment, whose verdict the survey carries as observed. What a control found is a fact of
 * the survey, not a refusal; a control that concluded nothing leaves the survey without an answer.
 */
export function evaluateSurvey(
	state: Pick<ChangeState, "evidence" | "reference" | "environment_digest">,
	protocol: Pick<FrozenProtocol, "control_ids" | "ref" | "environment_digest">,
	survey: Pick<Survey, "controls">,
): SurveyGateResult {
	const reasons: string[] = [];
	const retained: string[] = [];
	const missing: string[] = [];
	const indeterminate: string[] = [];
	for (const controlId of protocol.control_ids) {
		const measure = survey.controls.find((m) => m.control_id === controlId);
		const evidence = measure ? state.evidence.find((e) => e.evidence_id === measure.evidence_id) : undefined;
		if (!measure || !evidence) {
			missing.push(controlId);
			reasons.push(`control ${controlId} has no evidence on the reference`);
			continue;
		}
		const why = unretained(state, protocol, measure, evidence);
		if (why) {
			reasons.push(`control ${controlId}: evidence ${evidence.evidence_id} ${why}`);
			continue;
		}
		retained.push(evidence.evidence_id);
		// A blind spot is presented without a verdict: what it gave on the reference answers nothing.
		if (measure.blind_spot === null && (evidence.verdict === "INDETERMINATE" || evidence.verdict === "NOT_RUN")) {
			indeterminate.push(controlId);
			reasons.push(`control ${controlId} gave ${evidence.verdict} on the reference: the survey cannot conclude on it`);
		}
	}
	if (reasons.length === 0)
		return { verdict: "PASS", reasons, retained, missing, indeterminate_controls: [], next_action: "close_accepted" };
	return {
		verdict: indeterminate.length === reasons.length ? "INDETERMINATE" : "FAIL",
		reasons,
		retained,
		missing,
		indeterminate_controls: indeterminate,
		next_action: "resolve_incident",
	};
}
