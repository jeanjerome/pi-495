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
	type Migration,
	type MigrationGap,
	type Milestone,
	type Transition,
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
	/** The survey a migration starts from, the violated rules it sets aside and those it tolerates, or null when it cites none. */
	migration: {
		change_id: string;
		scope_decisions: { rule_id: string; reason: string }[];
		exceptions: ({ rule_id: string } & GapException)[];
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

/** The four texts of a transition, as a refusal names the one a step lacks. */
const TRANSITION_TEXTS = [
	["contract", "transition contract"],
	["coexistence", "coexistence boundary"],
	["compatibility", "compatibility strategy"],
	["rollback", "rollback"],
] as const;

type DocumentIncrement = TrajectoryDocument["increments"][number];

/** What a step of a migration lacks of the four texts of its transition. */
function lackedTexts(transition: DocumentIncrement["transition"]): string[] {
	return TRANSITION_TEXTS.filter(([text]) => !transition?.[text]?.trim()).map(([, said]) => `no ${said}`);
}

/** Each step of a migration with its transition and the rules it removes, refused naming each step that lacks a text. */
function migrationSteps(
	increments: readonly DocumentIncrement[],
): Map<string, { transition: Transition; removes: string[] }> {
	const lacking = increments.flatMap((i) => {
		const lacks = lackedTexts(i.transition);
		return lacks.length > 0 ? [`increment ${i.increment_id} has ${lacks.join(", ")}`] : [];
	});
	if (lacking.length > 0)
		throw new DomainError("PRECONDITION_FAILED", `trajectory document refused: ${lacking.join("; ")}`);
	return new Map(
		increments.map((i) => {
			// Every text is there: a step that lacks one was refused above.
			const { contract = "", coexistence = "", compatibility = "", rollback = "" } = i.transition ?? {};
			return [
				i.increment_id,
				{ transition: { contract, coexistence, compatibility, rollback }, removes: i.removes ?? [] },
			];
		}),
	);
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
	const steps = document.migration ? migrationSteps(document.increments) : null;
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
			...(steps?.get(i.increment_id) ?? (i.removes ? { removes: i.removes } : {})),
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
		migration: document.migration
			? {
					change_id: document.migration.change_id,
					scope_decisions: document.migration.scope_decisions ?? [],
					// A missing owner or due date reaches the kernel blank, which refuses it naming the rule.
					exceptions: (document.migration.exceptions ?? []).map((e) => ({
						rule_id: e.rule_id,
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
		target: "Cible",
		transition: {
			contract: "Contrat de transition",
			coexistence: "Frontière de coexistence",
			compatibility: "Stratégie de compatibilité",
			rollback: "Retour arrière",
		} satisfies Record<keyof Transition, string>,
		rules: "Règles enfreintes à supprimer :",
		rule: (g: MigrationGap) =>
			`- ${g.rule_id} : ${g.violations} violation${g.violations === 1 ? "" : "s"} à l'état des lieux`,
	},
	en: {
		value: "Value",
		closure: "Closure criterion",
		gaps: "Gaps to remove:",
		gap: (g: BaselineGap) =>
			`- ${g.rule_id} in ${g.module ?? "no measured module"}, ${g.authorship} code: ${g.violations} violation${g.violations === 1 ? "" : "s"} at the survey (threshold: ${g.threshold})`,
		target: "Target",
		transition: {
			contract: "Transition contract",
			coexistence: "Coexistence boundary",
			compatibility: "Compatibility strategy",
			rollback: "Rollback",
		} satisfies Record<keyof Transition, string>,
		rules: "Violated rules to remove:",
		rule: (g: MigrationGap) =>
			`- ${g.rule_id}: ${g.violations} violation${g.violations === 1 ? "" : "s"} at the survey`,
	},
};

/**
 * The request an increment's change starts from: its title, then its value and its closure criterion,
 * then each gap of the baseline it removes, with its rule, its module, its count at the survey and the
 * threshold of its rule: the measurable objective of the increment. A step of a migration carries, after
 * its closure criterion, the target the owner chose and the four texts of its transition, in the owner's
 * words, and after its gaps each violated rule of the map it removes with its count at the survey.
 */
export function incrementRequest(
	increment: IncrementSpec,
	language: "fr" | "en",
	baseline: Baseline | null,
	migration: Migration | null = null,
): string {
	const t = LABELS[language];
	const gaps = (baseline?.gaps ?? []).filter((b) => increment.gaps.some((g) => sameGap(b, g)));
	const objective = gaps.length > 0 ? `\n\n${t.gaps}\n${gaps.map(t.gap).join("\n")}` : "";
	const step = increment.transition;
	const transition =
		migration && step
			? `\n\n${t.target}: ${migration.target.alternative_id} (${migration.target.nature}) — ${migration.target.description}\n${TRANSITION_TEXTS.map(([text]) => `${t.transition[text]}: ${step[text]}`).join("\n")}`
			: "";
	const rules = (migration?.gaps ?? []).filter((g) => increment.removes?.includes(g.rule_id));
	const removal = rules.length > 0 ? `\n\n${t.rules}\n${rules.map(t.rule).join("\n")}` : "";
	return `${increment.title}\n\n${t.value}: ${increment.value}\n${t.closure}: ${increment.closure_criterion}${transition}${objective}${removal}`;
}
