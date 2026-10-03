/**
 * A trajectory document read into what a program adopts, and the request each increment's change
 * starts from. The document is the owner's: it is checked against its contract, never executed, and
 * an increment's text enters its change as the owner's words.
 */
import { check, violations } from "../contracts/validate.ts";
import { TrajectoryDocument } from "../contracts/v1/trajectory.ts";
import { DomainError } from "../domain/errors.ts";
import {
	sameGap,
	type Baseline,
	type BaselineGap,
	type GapException,
	type GapKey,
	type GlobalRequirement,
	type IncrementSpec,
	type Milestone,
} from "../domain/program/program.ts";

export interface ReadTrajectory {
	document: TrajectoryDocument;
	increments: IncrementSpec[];
	milestones: Milestone[];
	global_requirements: GlobalRequirement[];
	/** The survey the document cites, the gaps it sets aside and the exceptions it grants, or null when it cites none. */
	baseline: {
		change_id: string;
		scope_decisions: (GapKey & { reason: string })[];
		exceptions: (GapKey & GapException)[];
	} | null;
}

/** A gap as the document names it, in proprietary code unless it says otherwise. */
function gapKey(gap: { rule_id: string; module: string | null; authorship?: GapKey["authorship"] }): GapKey {
	return { rule_id: gap.rule_id, module: gap.module, authorship: gap.authorship ?? "proprietary" };
}

/** Where a violation lies, naming the increment rather than its position in the document. */
function located(document: unknown, path: string): string {
	const at = /^\/increments\/(\d+)(?:\/(.*))?$/.exec(path);
	const id = at
		? (document as { increments: { increment_id?: unknown }[] }).increments[Number(at[1])]?.increment_id
		: null;
	if (!at || typeof id !== "string") return path || "/";
	return `increment ${id}${at[2] ? ` ${at[2]}` : ""}`;
}

/** The document as the program adopts it, or a refusal that names what each increment lacks. */
export function readTrajectory(document: unknown): ReadTrajectory {
	if (!check(TrajectoryDocument, document))
		throw new DomainError(
			"PRECONDITION_FAILED",
			`trajectory document refused: ${violations(TrajectoryDocument, document)
				.listed.map((v) => `${located(document, v.path)} ${v.message}`)
				.join("; ")}`,
		);
	return {
		document,
		increments: document.increments.map((i) => ({
			increment_id: i.increment_id,
			title: i.title,
			kind: i.kind ?? "functional",
			value: i.value,
			depends_on: i.depends_on,
			required_capabilities: [],
			requirement_ids: i.requirement_ids,
			closure_criterion: i.closure_criterion,
			gaps: (i.gaps ?? []).map(gapKey),
		})),
		milestones: document.milestones,
		global_requirements: document.global_requirements.map((r) => ({
			requirement_id: r.requirement_id,
			scope_decision: r.scope_decision ?? null,
		})),
		baseline: document.baseline
			? {
					change_id: document.baseline.change_id,
					scope_decisions: (document.baseline.scope_decisions ?? []).map((d) => ({ ...gapKey(d), reason: d.reason })),
					// A missing owner or due date reaches the kernel blank, which refuses it naming the gap.
					exceptions: (document.baseline.exceptions ?? []).map((e) => ({
						...gapKey(e),
						owner: e.owner ?? "",
						due: e.due ?? "",
						reason: e.reason,
					})),
				}
			: null,
	};
}

const LABELS = {
	fr: {
		value: "Valeur",
		closure: "Critère de clôture",
		gaps: "Écarts à supprimer :",
		gap: (g: BaselineGap) =>
			`- ${g.rule_id} dans ${g.module ?? "aucun module mesuré"}, ${g.authorship === "generated" ? "code généré" : "code propriétaire"} : ${g.violations} violation${g.violations === 1 ? "" : "s"} à l'état des lieux (seuil : ${g.threshold})`,
	},
	en: {
		value: "Value",
		closure: "Closure criterion",
		gaps: "Gaps to remove:",
		gap: (g: BaselineGap) =>
			`- ${g.rule_id} in ${g.module ?? "no measured module"}, ${g.authorship} code: ${g.violations} violation${g.violations === 1 ? "" : "s"} at the survey (threshold: ${g.threshold})`,
	},
};

/**
 * The request an increment's change starts from: its title, then its value and its closure criterion,
 * then each gap of the baseline it removes, with its rule, its module, its count at the survey and the
 * threshold of its rule: the measurable objective of the increment.
 */
export function incrementRequest(increment: IncrementSpec, language: "fr" | "en", baseline: Baseline | null): string {
	const t = LABELS[language];
	const gaps = (baseline?.gaps ?? []).filter((b) => increment.gaps.some((g) => sameGap(b, g)));
	const objective = gaps.length > 0 ? `\n\n${t.gaps}\n${gaps.map(t.gap).join("\n")}` : "";
	return `${increment.title}\n\n${t.value}: ${increment.value}\n${t.closure}: ${increment.closure_criterion}${objective}`;
}
