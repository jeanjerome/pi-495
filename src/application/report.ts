/**
 * Engineering report (IMP-05): the three natures of what a change produced, kept apart because
 * they do not have the same authority. A mechanical observation is what an executed control
 * measured on an identified subject. A judgment is what someone or something concluded from it —
 * the kernel at a gate, a model in a review, a human in a decision. A residual risk is what
 * nothing here establishes: a control that passed observed what it knows how to observe, and that
 * is not the absence of a defect.
 *
 * The report is derived from the ledger alone, so it reads without a model and without Pi.
 */
import type { ArtifactRef, Outcome, Verdict } from "../contracts/v1/common.ts";
import type { Evidence } from "../contracts/v1/evidence.ts";
import {
	type ArchitectureRecommendation,
	type Protocol,
	type QualityPerimeter,
	type QualityRule,
	READING_CONCERNS,
	type RequirementsDocument,
	type UnseenByVerification,
} from "../contracts/v1/protocol.ts";
import {
	answerToRecommendation,
	constraintsOf,
	type RecommendationProposal,
	type ReviewCheck,
} from "../domain/architecture-recommendation.ts";
import type { ChangeState, EvidenceEntry, HumanDecisionEntry } from "../domain/change/state.ts";
import type { ImplementationRecord } from "../domain/implementation-record.ts";
import type { CodeAuthorship, Survey } from "../domain/survey.ts";

/** Measured: a control ran on a subject and answered. No interpretation is carried here. */
export interface MechanicalObservation {
	evidence_id: string;
	control_id: string;
	control_version: string;
	/** `candidate`, `reference` or `fixture` — what the control was pointed at. */
	subject_kind: string;
	subject_digest: string;
	verdict: Verdict;
	blocking_findings: number;
	/** The control answered, but its answer is no longer usable for this change. */
	valid: boolean;
}

/** Concluded: by whom, with what authority, and whether the outcome depended on it. */
export interface Judgment {
	kind: "gate" | "review" | "human_decision";
	id: string;
	by: string;
	authority: "kernel" | "model" | "human";
	statement: string;
	/** A judgment the outcome rests on, as opposed to one recorded for the reader. */
	binding: boolean;
}

/** Not established: named so a green report is not read as a proof. */
export interface ResidualRisk {
	code: string;
	statement: string;
}

/**
 * Asked: an adopted requirement, and what the controls covering it answered on the candidate. A
 * requirement whose obligation is a human decision lists no control: a control that cited it and
 * passed observed something else, and its verdict would read as a measure of the requirement.
 */
export interface RequirementLine {
	requirement_id: string;
	statement: string;
	mandatory: boolean;
	decided_by_owner: boolean;
	controls: { control_id: string; verdict: EvidenceEntry["verdict"] }[];
}

/**
 * The state of the project a survey gives: each requirement with what its controls answered on the
 * reference or why none measures it, what the controls found there, and the controls that measure
 * nothing of it.
 */
export interface SurveySection {
	requirements: {
		requirement_id: string;
		statement: string;
		controls: { control_id: string; verdict: Verdict }[];
		blind_spot: string | null;
	}[];
	findings: { control_id: string; message: string; path: string | null }[];
	blind_spots: { control_id: string; reason: string }[];
	/**
	 * The quality referential the owner adopted, each rule with its oracle, its threshold, its source and
	 * the date of the adoption, what its oracle found under the rule it names, each in proprietary or
	 * generated code, and how many violations of the proprietary code each module carries; then what the
	 * referential does not measure, with the reason. Null when none was adopted.
	 */
	referential: {
		adopted_on: string;
		rules: (Pick<QualityRule, "rule_id" | "nature" | "control_id" | "threshold" | "tool" | "source"> & {
			findings: { message: string; path: string | null; authorship: CodeAuthorship }[];
			/** A null module holds the violations no measured source root contains. */
			proprietary_by_module: { module: string | null; violations: number }[];
		})[];
		unmeasured: QualityPerimeter["unmeasured"];
	} | null;
	/**
	 * The architecture map the owner adopted and the date of the adoption: each part with its perimeter, its
	 * style, the role of each of its packages and the parts it may depend on, then the packages of the main
	 * sources no part covers. Null when none was adopted.
	 */
	architecture: {
		adopted_on: string;
		parts: {
			name: string;
			perimeter: string[];
			style: string;
			roles: { package: string; role: string }[];
			may_depend_on: string[];
		}[];
		unassigned_packages: string[];
		/** What the verification of the map does not see, each point with its reason, in each language. */
		unseen: UnseenByVerification[];
		/**
		 * The reading of the model that goes with the map, each statement with the places that support it, then the
		 * statements set aside with the hint that designates no line of the reference: never a finding. Null when the
		 * model gave none.
		 */
		reading: {
			statements: Record<ReadingConcern, { statement: string; hints: string[] }[]>;
			set_aside: { concern: ReadingConcern; statement: string; hint: string }[];
		} | null;
	} | null;
	/**
	 * The architecture recommendation a model proposed once the adopted map was measured: what the owner chose and
	 * when, each alternative with each constraint it cites and what that constraint says, the alternative the model
	 * recommended and its pattern review; or none given, with what the form of its argument misses. Null when none
	 * was proposed.
	 */
	recommendation:
		| { given: false; missing: string[] }
		| {
				given: true;
				choice:
					| { kind: "chosen"; alternative_id: string; on: string }
					| { kind: "suspended"; on: string }
					| { kind: "pending" };
				alternatives: (Omit<RecommendedOption, "constraints"> & { constraints: { id: string; says: string }[] })[];
				recommended: ArchitectureRecommendation["recommended"];
				review: ReviewCheck;
		  }
		| null;
}

type RecommendedOption = ArchitectureRecommendation["alternatives"][number];

type ReadingConcern = (typeof READING_CONCERNS)[number];

export interface EngineeringReport {
	schema_version: 1;
	change_id: string;
	/** The request as its program names it; empty when the report was built without it. */
	title: string;
	outcome: Outcome;
	candidate: { candidate_id: string; manifest_digest: string } | null;
	requirements: RequirementLine[];
	/** The survey of a change that delivers the state of the project, adopted or last proposed. */
	survey: SurveySection | null;
	observations: MechanicalObservation[];
	judgments: Judgment[];
	/**
	 * Declared: what the producer said of each task of the adopted plan, its local checks and its
	 * self-review, on the current candidate. Neither measured nor concluded, so kept out of both.
	 */
	implementation: ImplementationRecord | null;
	residual_risks: ResidualRisk[];
}

/**
 * The module whose measured source root holds `path`, the deepest when roots nest; null when none does.
 * The root `.` is the tree itself, which holds every path.
 */
function moduleOf(path: string | null, measured: QualityPerimeter["measured"]): string | null {
	if (path === null) return null;
	const roots = measured
		.filter((m) => m.root === "." || path.startsWith(m.root))
		.sort((a, b) => b.root.length - a.root.length);
	return roots[0]?.module ?? null;
}

/** How many of `findings` each module holds, by module name, the unlocated ones last. */
export function countByModule(
	findings: readonly { path: string | null }[],
	measured: QualityPerimeter["measured"],
): { module: string | null; violations: number }[] {
	const counts = new Map<string | null, number>();
	for (const f of findings) {
		const module = moduleOf(f.path, measured);
		counts.set(module, (counts.get(module) ?? 0) + 1);
	}
	return [...counts]
		.map(([module, violations]) => ({ module, violations }))
		.sort((a, b) => (a.module === null ? 1 : b.module === null ? -1 : a.module.localeCompare(b.module)));
}

/**
 * Each rule of the adopted referential, with what its oracle found under the rule it names, in
 * proprietary or generated code, and the count of the proprietary violations by module. A finding of a
 * survey taken before findings were ranged counts as proprietary: nothing set it apart.
 */
export function referentialSection(survey: Survey, protocol: Protocol | null): SurveySection["referential"] {
	const adopted = protocol?.quality_referential;
	if (!adopted) return null;
	const measured = adopted.perimeter?.measured ?? [];
	return {
		adopted_on: adopted.adopted_on,
		rules: adopted.rules.map((rule) => {
			const findings = (survey.controls.find((c) => c.control_id === rule.control_id)?.findings ?? [])
				.filter((f) => f.rule_id === rule.rule_id)
				.map((f) => ({ message: f.message, path: f.path, authorship: f.authorship ?? ("proprietary" as const) }));
			return {
				rule_id: rule.rule_id,
				nature: rule.nature,
				control_id: rule.control_id,
				threshold: rule.threshold,
				tool: rule.tool,
				source: rule.source,
				findings,
				proprietary_by_module: countByModule(
					findings.filter((f) => f.authorship === "proprietary"),
					measured,
				),
			};
		}),
		unmeasured: adopted.perimeter?.unmeasured ?? [],
	};
}

function surveySection(
	survey: Survey,
	requirements: RequirementsDocument | null,
	protocol: Protocol | null,
	recommendation: SurveySection["recommendation"],
): SurveySection {
	return {
		requirements: survey.requirements.map((r) => ({
			requirement_id: r.requirement_id,
			statement: requirements?.requirements.find((q) => q.requirement_id === r.requirement_id)?.statement ?? "",
			controls: r.measures.map((m) => ({ control_id: m.control_id, verdict: m.verdict })),
			blind_spot: r.blind_spot,
		})),
		findings: survey.controls.flatMap((c) =>
			c.findings.map((f) => ({ control_id: c.control_id, message: f.message, path: f.path })),
		),
		blind_spots: survey.controls.flatMap((c) =>
			c.blind_spot === null ? [] : [{ control_id: c.control_id, reason: c.blind_spot }],
		),
		referential: referentialSection(survey, protocol),
		architecture: architectureSection(protocol),
		recommendation,
	};
}

/**
 * The architecture recommendation of the survey, as its section presents it: the owner's last answer to the choice
 * asked on it, which a request for another analysis leaves pending, and each constraint an alternative cites with
 * what the requirements say of it.
 */
function recommendationSection(
	proposal: { ref: ArtifactRef; content: RecommendationProposal } | null,
	decisions: readonly HumanDecisionEntry[],
	requirements: RequirementsDocument | null,
): SurveySection["recommendation"] {
	if (proposal === null) return null;
	const { check, recommendation, review } = proposal.content;
	if (!check.holds) return { given: false, missing: check.missing };
	const answer = answerToRecommendation(decisions, proposal.ref.content_digest);
	const on = answer?.recorded_at.slice(0, 10) ?? "";
	const chosen = recommendation.alternatives.find((a) => a.alternative_id === answer?.option_id);
	const says = requirements === null ? new Map<string, string>() : constraintsOf(requirements);
	return {
		given: true,
		choice: chosen
			? { kind: "chosen", alternative_id: chosen.alternative_id, on }
			: answer?.option_id === "suspend"
				? { kind: "suspended", on }
				: { kind: "pending" },
		alternatives: recommendation.alternatives.map((a) => ({
			...a,
			constraints: a.constraints.map((id) => ({ id, says: says.get(id) ?? "" })),
		})),
		recommended: recommendation.recommended,
		review,
	};
}

/** The architecture map the protocol froze, as the survey section presents it. */
function architectureSection(protocol: Protocol | null): SurveySection["architecture"] {
	const adopted = protocol?.architecture_map;
	if (!adopted) return null;
	const { parts, relations } = adopted.map;
	return {
		adopted_on: adopted.adopted_on,
		parts: parts.map((part) => ({
			name: part.name,
			perimeter: part.perimeter,
			style: part.style,
			roles: part.roles.map((r) => ({ package: r.package, role: r.role })),
			may_depend_on: relations.filter((r) => r.from === part.name).map((r) => r.to),
		})),
		unassigned_packages: adopted.unassigned_packages,
		unseen: adopted.unseen ?? [],
		reading: adopted.reading
			? {
					statements: Object.fromEntries(
						READING_CONCERNS.map((concern) => [
							concern,
							adopted.reading!.kept[concern].map((r) => ({
								statement: r.statement,
								hints: r.hints.map((h) => `${h.path}:${h.line}`),
							})),
						]),
					) as Record<ReadingConcern, { statement: string; hints: string[] }[]>,
					set_aside: adopted.reading.set_aside,
				}
			: null,
	};
}

function reviewStatement(conclusion: string, blocking: number, valid: boolean): string {
	const base = `review concluded ${conclusion}${blocking > 0 ? ` with ${blocking} blocking finding(s)` : ""}`;
	return valid ? base : `${base} (invalidated)`;
}

export function engineeringReport(
	state: ChangeState,
	evidence: readonly Evidence[],
	protocol: Protocol | null,
	requirements: RequirementsDocument | null = null,
	survey: Survey | null = null,
	title = "",
	recommendation: { ref: ArtifactRef; content: RecommendationProposal } | null = null,
	implementation: ImplementationRecord | null = null,
): EngineeringReport {
	const entryOf = new Map(state.evidence.map((e) => [e.evidence_id, e]));
	const currentDigest = state.candidate?.manifest_digest;
	const onCandidateEntries = state.evidence.filter((e) => e.valid && e.subject_digest === currentDigest);
	const decidedByOwner = new Set(
		(protocol?.obligations ?? []).filter((o) => o.human_interaction).map((o) => o.requirement.requirement_id),
	);
	const asked: RequirementLine[] = (requirements?.requirements ?? []).map((q) => {
		const owner = decidedByOwner.has(q.requirement_id);
		return {
			requirement_id: q.requirement_id,
			statement: q.statement,
			mandatory: q.mandatory,
			decided_by_owner: owner,
			controls: owner
				? []
				: onCandidateEntries
						.filter((e) => e.requirement_ids.includes(q.requirement_id))
						.map((e) => ({ control_id: e.control_id, verdict: e.verdict })),
		};
	});
	const observations: MechanicalObservation[] = evidence.map((e) => ({
		evidence_id: e.evidence_id,
		control_id: e.control_id,
		control_version: e.control_version,
		subject_kind: e.subject.kind,
		subject_digest: e.subject.digest,
		verdict: e.verdict,
		blocking_findings: e.baseline?.blocking_findings ?? e.findings.filter((f) => f.severity === "blocker").length,
		valid: entryOf.get(e.evidence_id)?.valid ?? true,
	}));

	const judgments: Judgment[] = [];
	for (const gate of Object.values(state.gates)) {
		judgments.push({
			kind: "gate",
			id: gate.gate,
			by: "495 kernel",
			authority: "kernel",
			statement: `${gate.gate} ${gate.verdict}${gate.reasons.length ? `: ${gate.reasons.join("; ")}` : ""}`,
			binding: true,
		});
	}
	for (const review of state.reviews) {
		// A review is produced by a model reading the candidate. Required or not, it is an opinion on
		// a text, never a measurement; only its blocking findings bear on the outcome.
		judgments.push({
			kind: "review",
			id: review.review_id,
			by: review.reviewer_role,
			authority: "model",
			statement: reviewStatement(review.conclusion, review.blocking_findings, review.valid),
			binding: review.valid && review.blocking_findings > 0,
		});
	}
	for (const decision of state.human_decisions) {
		judgments.push({
			kind: "human_decision",
			id: decision.human_decision_id,
			by: decision.actor_id,
			authority: "human",
			statement: `${decision.interaction} ${decision.option_id ?? "answered"} on ${decision.subject.kind} ${decision.subject.id}${decision.valid ? "" : " (revoked)"}`,
			binding: decision.valid,
		});
	}

	const risks: ResidualRisk[] = [];
	const add = (code: string, statement: string) => {
		if (!risks.some((r) => r.code === code && r.statement === statement)) risks.push({ code, statement });
	};

	const onCurrentCandidate = evidence.filter(
		(e) => e.subject.kind === "candidate" && e.subject.digest === currentDigest,
	);
	if (onCurrentCandidate.length > 0) {
		add(
			"controls_are_not_a_proof",
			`${onCurrentCandidate.length} control run(s) observed the candidate under the frozen protocol; they establish what those controls detect, not the absence of defects.`,
		);
	}
	if (state.reviews.some((r) => r.valid && r.conclusion === "approve")) {
		add(
			"review_is_not_a_demonstration",
			"a review concluded approve: it is a model reading the candidate, and it demonstrates nothing by itself.",
		);
	}
	for (const obligation of protocol?.obligations ?? []) {
		// A requirement assigned to a human decision is carried by no control on purpose; it is listed
		// below as decided by a human, not as one nobody assigned.
		if (obligation.control_ids.length === 0 && !obligation.not_applicable_reason && !obligation.human_interaction) {
			add(
				"requirement_without_control",
				`requirement ${obligation.requirement.requirement_id} is carried by no control.`,
			);
		}
		if (obligation.not_applicable_reason) {
			add(
				"requirement_declared_not_applicable",
				`requirement ${obligation.requirement.requirement_id} was set aside: ${obligation.not_applicable_reason}.`,
			);
		}
		if (obligation.human_interaction) {
			add(
				"requirement_decided_by_a_human",
				`requirement ${obligation.requirement.requirement_id} is settled by ${obligation.human_interaction}, not by a measurement.`,
			);
		}
	}
	const adopted = protocol?.complements ?? [];
	for (const r of protocol?.capability_diagnosis.recommendations ?? []) {
		if (adopted.some((c) => c.test_type === r.test_type && c.tool === r.tool)) continue;
		add(
			"recommended_complement_not_adopted",
			`a ${r.test_type} complement is recommended and not adopted, so the ${r.test_type} of the introduced lines is not measured: ${r.tool} ${r.version}; ${r.change}.`,
		);
	}
	const installed = protocol?.installed_packages ?? [];
	if (installed.length > 0)
		add(
			"installed_packages",
			`495 installed ${installed.length} package(s) into the target, whose code the controls will load: ${installed.map((p) => `${p.name}@${p.version} (${p.integrity})`).join(", ")}.`,
		);
	for (const [controlId, qualification] of Object.entries(protocol?.qualifications ?? {})) {
		if (!qualification.qualified)
			add(
				"control_not_qualified",
				`control ${controlId} is not qualified: ${qualification.notes.join("; ") || "witnesses did not answer as required"}.`,
			);
	}
	// Only a run on the candidate the report judges says something of it. A qualification witness judges
	// the control, a run on the reference measures the tree before the change, and a run on the candidate
	// of an earlier attempt measures a candidate set aside: none is a doubt about this one, and each stays
	// an observation. A control left unqualified is a risk above.
	for (const e of onCurrentCandidate) {
		if (e.verdict === "INDETERMINATE")
			add(
				"indeterminate_control",
				`control ${e.control_id} answered INDETERMINATE on ${e.subject.kind} ${e.subject.id}; nothing is concluded from it.`,
			);
		if (e.limits.unstable)
			add("unstable_control", `control ${e.control_id} answered differently on two passes of the same subject.`);
		if (e.limits.truncated)
			add(
				"truncated_output",
				`the output of control ${e.control_id} was truncated at ${e.limits.bytes_read} bytes; what it did not say was not read.`,
			);
		for (const exclusion of e.limits.exclusions)
			add("excluded_from_measure", `control ${e.control_id} excluded ${exclusion} from what it measured.`);
		for (const note of e.limits.notes) add("control_limit", `control ${e.control_id}: ${note}`);
		if ((e.baseline?.preexisting_findings ?? 0) > 0)
			add(
				"preexisting_findings_tolerated",
				`control ${e.control_id} reports ${e.baseline!.preexisting_findings} finding(s) the reference already carried; the tolerance let them stand.`,
			);
	}
	for (const entry of state.evidence) {
		if (!entry.valid)
			add(
				"invalidated_evidence",
				`evidence ${entry.evidence_id} (${entry.control_id}) no longer applies: ${entry.invalid_reason ?? "invalidated"}.`,
			);
	}
	if (state.stop_reason)
		add(
			"stopped_before_the_end",
			`the change stopped on ${state.stop_reason}${state.stop_detail ? `: ${state.stop_detail}` : ""}.`,
		);

	return {
		schema_version: 1,
		change_id: state.change_id,
		title,
		outcome: state.outcome,
		candidate: state.candidate
			? { candidate_id: state.candidate.candidate_id, manifest_digest: state.candidate.manifest_digest }
			: null,
		requirements: asked,
		survey: survey
			? surveySection(
					survey,
					requirements,
					protocol,
					recommendationSection(recommendation, state.human_decisions, requirements),
				)
			: null,
		observations,
		judgments,
		implementation: implementation?.candidate_digest === currentDigest ? implementation : null,
		residual_risks: risks,
	};
}
