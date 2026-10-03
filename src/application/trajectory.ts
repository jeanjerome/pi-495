/**
 * A trajectory document read into what a program adopts, and the request each increment's change
 * starts from. The document is the owner's: it is checked against its contract, never executed, and
 * an increment's text enters its change as the owner's words.
 */
import { check, violations } from "../contracts/validate.ts";
import { TrajectoryDocument } from "../contracts/v1/trajectory.ts";
import { DomainError } from "../domain/errors.ts";
import type { GlobalRequirement, IncrementSpec, Milestone } from "../domain/program/program.ts";

export interface ReadTrajectory {
	document: TrajectoryDocument;
	increments: IncrementSpec[];
	milestones: Milestone[];
	global_requirements: GlobalRequirement[];
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
		})),
		milestones: document.milestones,
		global_requirements: document.global_requirements.map((r) => ({
			requirement_id: r.requirement_id,
			scope_decision: r.scope_decision ?? null,
		})),
	};
}

const LABELS = {
	fr: { value: "Valeur", closure: "Critère de clôture" },
	en: { value: "Value", closure: "Closure criterion" },
};

/** The request an increment's change starts from: its title, then its value and its closure criterion. */
export function incrementRequest(increment: IncrementSpec, language: "fr" | "en"): string {
	const t = LABELS[language];
	return `${increment.title}\n\n${t.value}: ${increment.value}\n${t.closure}: ${increment.closure_criterion}`;
}
