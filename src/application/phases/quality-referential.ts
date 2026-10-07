/**
 * The quality referential of a survey. A requirement about the quality of the code that no control of
 * the target measures, while its adapter proposes a referential that would, is put to the owner rather
 * than named a blind spot at once. Adopted, the analyser is brought into a copy with the network open for
 * that step alone, by the package manager of its technology, and the referential is frozen with the date
 * of the decision; left aside, or when bringing it fails, or when the manager cannot extend the target,
 * the requirement is a blind spot whose reason says so. Nothing is written in the project.
 */
import type { ArtifactRef, SubjectRef } from "../../contracts/v1/common.ts";
import type { ReferenceSnapshot } from "../../contracts/v1/candidate.ts";
import { digestValue } from "../../contracts/digest.ts";
import type {
	AdoptedComplement,
	AdoptedQualityReferential,
	FileEdit,
	InstalledPackage,
	PackageInstall,
	QualityRule,
	RecommendedComplement,
	RequirementsDocument,
} from "../../contracts/v1/protocol.ts";
import { asksAboutQuality, controlsOfNature } from "../../domain/survey.ts";
import { applyRecommendedEdits } from "../complement.ts";
import { bringInstalls, filesOf } from "../installation.ts";
import type { Installer } from "../stacks/registry.ts";
import type { DetectedTechnology } from "../stacks/stack.ts";
import { failedInstalls, recordFailedInstall, recordResolution } from "./install-records.ts";
import type { PhaseContext, Unit } from "./phase.ts";

/** Where the quality referential of a survey stands: put to the owner, or settled with what it adds to the protocol. */
export type QualitySettlement =
	| { kind: "asked"; unit: Unit }
	| {
			kind: "settled";
			unit: Unit;
			/** The files that bring the analyser, written into the copy and into every copy a control runs in. */
			complements: AdoptedComplement[];
			/** The packages the install of the analysers added, as the inspection of its technology names them. */
			packages: InstalledPackage[];
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
 * How the analysers of an offer reach a copy: the packages one manager brings, installed together in the
 * copy, or one package resolved in a copy of its own once the edit that declares it is written there.
 */
interface Bringing {
	installer: Installer;
	installs: PackageInstall[];
	edit?: FileEdit;
}

/**
 * How the recommendations of an offer bring its analysers; null when they take neither form, or when no
 * technology of the list runs their manager, and the offer cannot be adopted.
 */
function bringingOf(
	recommendations: readonly RecommendedComplement[],
	installerOf: (manager: string) => Installer | null,
): Bringing | null {
	const installs = recommendations.flatMap((r) => (r.install ? [r.install] : []));
	const [first] = installs;
	if (first === undefined || installs.length !== recommendations.length) return null;
	const installer = installerOf(first.manager);
	if (installer === null || installs.some((i) => i.manager !== first.manager)) return null;
	if (installer.install.form === "install") return { installer, installs };
	const [only] = recommendations;
	return recommendations.length === 1 && only?.edit !== undefined ? { installer, installs, edit: only.edit } : null;
}

/** What adopting the referential brought into the copy, or why nothing was adopted. */
type Brought =
	| { kind: "brought"; unit: Unit; complements: AdoptedComplement[]; packages: InstalledPackage[] }
	| { kind: "failed"; unit: Unit; reason: string };

/** The word the owner reads for what the manager does with the packages, by the form its technology declares. */
const actingOf = (bringing: Bringing): string =>
	bringing.installer.install.form === "resolve" ? "resolving" : "installing";

/**
 * Brings the analysers into a copy, with the network open for that step alone: packages installed are kept
 * as the files the inspection accepted in `copyPath`; a package resolved in a copy of its own is kept as the
 * edit that declares it, written into `copyPath`. What the manager printed is kept in the dossier when its
 * technology asks for it, and a failure is written there for these requirements.
 */
async function bring(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	requirements: ArtifactRef,
	reference: ReferenceSnapshot,
	copyPath: string,
	bringing: Bringing,
	recommendations: readonly RecommendedComplement[],
): Promise<Brought> {
	const { installs, installer } = bringing;
	ctx.progress(
		`${actingOf(bringing)} ${installs.map((i) => `${i.package}@${i.version}`).join(" ")} in a copy, network open for that step alone`,
	);
	const brought = await bringInstalls(ctx, installer, reference, copyPath, installs, bringing.edit);
	if (brought.kind === "failed") {
		for (const install of installs)
			unit = await recordFailedInstall(ctx, unit, cor, requirements, { install, reason: brought.reason });
		return { kind: "failed", unit, reason: brought.reason };
	}
	if (brought.output !== undefined)
		for (const install of installs) unit = await recordResolution(ctx, unit, cor, install, brought.output);
	if (installer.install.form === "resolve")
		return {
			kind: "brought",
			unit,
			complements: applyRecommendedEdits(copyPath, recommendations, installer.install.edit),
			packages: [],
		};
	const tool = installs.map((i) => i.package).join(", ");
	return {
		kind: "brought",
		unit,
		complements: brought.files.map((f) => ({ ...f, test_type: "quality", tool })),
		packages: brought.packages,
	};
}

/**
 * Settles the quality referential the adapter offers for the requirements about quality that no
 * control measures: asks the owner when nothing answers it yet, brings the analysers into a copy when
 * the owner adopted them, and leaves them in `copyPath` so that the detection that follows reads their
 * controls.
 */
export async function settleQualityReferential(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	requirements: { ref: ArtifactRef; content: RequirementsDocument },
	reference: ReferenceSnapshot,
	copyPath: string,
	detection: DetectedTechnology,
): Promise<QualitySettlement> {
	const offer = detection.quality_referential;
	const unmeasured = requirements.content.requirements
		.filter(
			(r) =>
				asksAboutQuality(r.category) &&
				"blind_spot" in
					controlsOfNature(r.category, detection.controls, detection.lint_control_ids, ctx.verification.readers),
		)
		.map((r) => r.requirement_id);
	const nothing = { kind: "settled" as const, unit, complements: [], packages: [] };
	if (unmeasured.length === 0 || offer === undefined) return nothing;
	if (offer.kind === "not_proposed") return { ...nothing, blind_spot: `blind spot: ${offer.note}` };
	const { recommendations, rules, perimeter } = offer;
	const bringing = bringingOf(recommendations, (manager) => ctx.stacks.installerOf(manager));
	if (bringing === null)
		return {
			...nothing,
			blind_spot: `blind spot: the proposed quality referential cannot be adopted on this target: ${recommendations.map((r) => r.tool).join(", ")} cannot be declared in its build without ambiguity`,
		};
	const { installs } = bringing;
	// A target the manager cannot extend is not asked: the install the owner would adopt could not be run.
	const plan = bringing.installer.install.plan(filesOf(reference), installs);
	if (plan.kind === "refused")
		return {
			...nothing,
			blind_spot: `blind spot: the proposed quality referential cannot be installed on this target: ${plan.reason}`,
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
				referential: { stack: detection.stack, installs },
			}),
		};
	if (answer.option_id === LEAVE)
		return {
			...nothing,
			blind_spot:
				"blind spot: the proposed quality referential was not adopted: the owner left the requirement a blind spot",
		};
	const notAdopted = (reason: string) =>
		`blind spot: the owner adopted the proposed quality referential, but ${actingOf(bringing)} ${installs.map((i) => `${i.package} ${i.version}`).join(", ")} failed, so nothing was adopted: ${reason}`;
	const earlier = (await failedInstalls(ctx, unit, requirements.ref)).find((f) =>
		installs.some((i) => f.install.package === i.package && f.install.version === i.version),
	);
	if (earlier !== undefined) return { ...nothing, blind_spot: notAdopted(earlier.reason) };
	const brought = await bring(ctx, unit, cor, requirements.ref, reference, copyPath, bringing, recommendations);
	if (brought.kind === "failed") return { ...nothing, unit: brought.unit, blind_spot: notAdopted(brought.reason) };
	return {
		kind: "settled",
		unit: brought.unit,
		complements: brought.complements,
		packages: brought.packages,
		referential: { adopted_on: answer.recorded_at.slice(0, 10), decision_id: answer.decision_id, rules, perimeter },
	};
}
