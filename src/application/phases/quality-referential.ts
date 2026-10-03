/**
 * The quality referential of a survey. A requirement about the quality of the code that no control of
 * the target measures, while its adapter proposes a referential that would, is put to the owner rather
 * than named a blind spot at once. Adopted, the analyser is declared in a copy and resolved with the
 * network open for that step alone, and the referential is frozen with the date of the decision; left
 * aside, or when the resolution fails, the requirement is a blind spot whose reason says so. Nothing is
 * written in the project.
 */
import type { ArtifactRef, SubjectRef } from "../../contracts/v1/common.ts";
import type { ReferenceSnapshot } from "../../contracts/v1/candidate.ts";
import { digestValue } from "../../contracts/digest.ts";
import type {
	AdoptedComplement,
	AdoptedQualityReferential,
	QualityRule,
	RequirementsDocument,
} from "../../contracts/v1/protocol.ts";
import { asksAboutQuality, controlsOfNature } from "../../domain/survey.ts";
import { applyRecommendedEdits } from "../complement.ts";
import { resolveInCopy } from "../installation.ts";
import type { StackDetection } from "../stacks/stack.ts";
import { failedInstalls, recordFailedInstall, recordResolution } from "./install-records.ts";
import type { PhaseContext, Unit } from "./phase.ts";

/** Where the quality referential of a survey stands: put to the owner, or settled with what it adds to the protocol. */
export type QualitySettlement =
	| { kind: "asked"; unit: Unit }
	| {
			kind: "settled";
			unit: Unit;
			/** The edit that declares the analyser, written into the copy and into every copy a control runs in. */
			complements: AdoptedComplement[];
			referential?: AdoptedQualityReferential;
			/** Why a requirement about quality that no control measures is a blind spot, when more can be said than that. */
			blind_spot?: string;
	  };

const ADOPT = "adopt_referential";
const LEAVE = "leave_blind_spot";

/**
 * What an answer to the referential question holds for: these requirements, as they stand at this
 * revision, and these rules. Another revision of the requirements, or another referential, asks again.
 */
function referentialSubject(
	requirements: ArtifactRef,
	unmeasured: readonly string[],
	rules: readonly QualityRule[],
): SubjectRef {
	return {
		kind: "artifact",
		id: requirements.artifact_id,
		revision: requirements.revision,
		digest: digestValue({ requirements: requirements.content_digest, unmeasured: [...unmeasured].sort(), rules }),
	};
}

function ruleFact(rule: QualityRule): string {
	return `quality rule: ${rule.nature} ${rule.rule_id}, threshold ${rule.threshold}, checked by control ${rule.control_id} with ${rule.tool}, documented at ${rule.source} (established ${rule.established_on})`;
}

/**
 * Settles the quality referential the adapter offers for the requirements about quality that no
 * control measures: asks the owner when nothing answers it yet, resolves the analyser in a copy when
 * the owner adopted it, and writes the declaration into `copyPath` so that the detection that follows
 * reads its controls.
 */
export async function settleQualityReferential(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	requirements: { ref: ArtifactRef; content: RequirementsDocument },
	reference: ReferenceSnapshot,
	copyPath: string,
	detection: StackDetection,
): Promise<QualitySettlement> {
	const offer = detection.quality_referential;
	const unmeasured = requirements.content.requirements
		.filter(
			(r) =>
				asksAboutQuality(r.category) &&
				"blind_spot" in controlsOfNature(r.category, detection.controls, detection.lint_control_ids),
		)
		.map((r) => r.requirement_id);
	if (unmeasured.length === 0 || offer === undefined) return { kind: "settled", unit, complements: [] };
	if (offer.kind === "not_proposed")
		return { kind: "settled", unit, complements: [], blind_spot: `blind spot: ${offer.note}` };
	const { recommendation, rules, perimeter } = offer;
	const { install, edit } = recommendation;
	if (install === undefined || edit === undefined)
		return {
			kind: "settled",
			unit,
			complements: [],
			blind_spot: `blind spot: the proposed quality referential cannot be adopted on this target: ${recommendation.tool} cannot be declared in its build without ambiguity`,
		};
	const subject = referentialSubject(requirements.ref, unmeasured, rules);
	const answer = unit.state.human_decisions.findLast(
		(d) =>
			d.valid &&
			d.interaction === "IH-04" &&
			d.subject.digest === subject.digest &&
			(d.option_id === ADOPT || d.option_id === LEAVE),
	);
	if (answer === undefined)
		return {
			kind: "asked",
			unit: await ctx.requestDecision(unit, cor, {
				interaction: "IH-04",
				subject,
				facts: rules.map(ruleFact),
				recommendation: null,
				arg: unmeasured.join(", "),
				language: ctx.language(unit.state),
				referential: { stack: detection.stack, install },
			}),
		};
	if (answer.option_id === LEAVE)
		return {
			kind: "settled",
			unit,
			complements: [],
			blind_spot:
				"blind spot: the proposed quality referential was not adopted: the owner left the requirement a blind spot",
		};
	const notAdopted = (reason: string) =>
		`blind spot: the owner adopted the proposed quality referential, but resolving ${install.package} ${install.version} failed, so nothing was adopted: ${reason}`;
	const earlier = (await failedInstalls(ctx, unit, requirements.ref)).find(
		(f) => f.install.package === install.package && f.install.version === install.version,
	);
	if (earlier !== undefined) return { kind: "settled", unit, complements: [], blind_spot: notAdopted(earlier.reason) };
	ctx.progress(`resolving ${install.package}@${install.version} in a copy, network open for that step alone`);
	const resolved = await resolveInCopy(
		{
			workspace: ctx.workspace,
			workspacePolicy: ctx.workspacePolicy,
			install: ctx.install,
			localRepository: ctx.localRepository,
		},
		reference,
		install,
		edit,
	);
	if (resolved.kind === "failed") {
		unit = await recordFailedInstall(ctx, unit, cor, requirements.ref, { install, reason: resolved.reason });
		return { kind: "settled", unit, complements: [], blind_spot: notAdopted(resolved.reason) };
	}
	unit = await recordResolution(ctx, unit, cor, install, resolved.output);
	return {
		kind: "settled",
		unit,
		complements: applyRecommendedEdits(copyPath, [recommendation]),
		referential: { adopted_on: answer.recorded_at.slice(0, 10), decision_id: answer.decision_id, rules, perimeter },
	};
}
