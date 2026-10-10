import type { DesignTask } from "../../contracts/v1/protocol.ts";
import { matchesScope } from "./g4.ts";

/**
 * What a plan is examined against: the requirements G1 adopted and the mandatory ones among them,
 * the paths the mandate allows (none means no restriction) and those the frozen protocol protects.
 */
interface PlanScope {
	known: readonly string[];
	mandatory: readonly string[];
	allowed_paths: readonly string[];
	protected_paths: readonly string[];
}

/**
 * G3 — what the kernel can verify of a design's plan without judging its plausibility: each task
 * named once, serving known requirements, waiting only for tasks of the plan and writing only where
 * the mandate allows and the protocol does not protect, no dependency cycle, and each mandatory
 * requirement served by a task. A non-empty summary proves none of it; whether the plan is a good
 * one is left to the reviews the protocol requires, which read the adopted design.
 */
export function planFindings(tasks: readonly DesignTask[], scope: PlanScope): string[] {
	if (tasks.length === 0) return ["the design plans no task", ...unserved(tasks, scope.mandatory)];
	const reasons: string[] = [];
	const ids = new Set<string>();
	for (const t of tasks) {
		if (ids.has(t.task_id)) reasons.push(`task id ${t.task_id} is used twice`);
		ids.add(t.task_id);
	}
	const known = new Set(scope.known);
	for (const t of tasks) reasons.push(...linkFindings(t, known, ids), ...pathFindings(t, scope));
	for (const cycle of dependencyCycles(tasks)) reasons.push(`tasks ${cycle.join(" -> ")} form a dependency cycle`);
	reasons.push(...unserved(tasks, scope.mandatory));
	return reasons;
}

/** Each requirement a task serves that G1 did not adopt, and each task it waits for that the plan does not hold. */
function linkFindings(t: DesignTask, known: ReadonlySet<string>, ids: ReadonlySet<string>): string[] {
	return [
		...t.requirement_ids.filter((r) => !known.has(r)).map((r) => `task ${t.task_id} serves unknown requirement ${r}`),
		...t.depends_on.filter((d) => !ids.has(d)).map((d) => `task ${t.task_id} depends on unknown task ${d}`),
	];
}

/**
 * A task path under a protected one writes what the protocol protects. A task path that only holds a
 * protected one, `src/` around Maven's `src/test/`, says where the task works, not that it rewrites
 * the tests: G4 refuses the candidate that does.
 */
function pathFindings(t: DesignTask, scope: PlanScope): string[] {
	const reasons: string[] = [];
	for (const p of t.paths) {
		for (const pp of scope.protected_paths)
			if (matchesScope(p, pp))
				reasons.push(`task ${t.task_id} writes ${p}, which the frozen protocol protects (${pp})`);
		if (scope.allowed_paths.length > 0 && !scope.allowed_paths.some((a) => matchesScope(p, a)))
			reasons.push(`task ${t.task_id} writes ${p}, outside the paths the mandate allows`);
	}
	return reasons;
}

function unserved(tasks: readonly DesignTask[], mandatory: readonly string[]): string[] {
	const served = new Set(tasks.flatMap((t) => t.requirement_ids));
	return mandatory
		.filter((id) => !served.has(id))
		.map((id) => `mandatory requirement ${id} is not served by any task of the plan`);
}

/** Each cycle of the dependencies between known tasks, once, from the task where it was entered back to it. */
function dependencyCycles(tasks: readonly DesignTask[]): string[][] {
	const dependencies = new Map(tasks.map((t) => [t.task_id, t.depends_on]));
	const done = new Set<string>();
	const cycles: string[][] = [];
	const visit = (id: string, path: string[]): void => {
		const at = path.indexOf(id);
		if (at >= 0) {
			cycles.push([...path.slice(at), id]);
			return;
		}
		if (done.has(id) || !dependencies.has(id)) return;
		for (const d of dependencies.get(id) ?? []) visit(d, [...path, id]);
		done.add(id);
	};
	for (const t of tasks) visit(t.task_id, []);
	return cycles;
}
