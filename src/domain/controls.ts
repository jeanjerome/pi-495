/**
 * Order of the controls, read from what each of them declares it writes and reads (VER-05, QLT-04).
 * A sensor that produces no measurement of its own — introduced-line coverage read from the report
 * `mvn test` leaves behind — is only meaningful once the control that writes that report has run
 * where it is asked the question. Carrying the dependency in the control definitions puts that
 * order in the frozen protocol: the qualification runs the producers in each witness workspace and
 * the verification runs the controls in the same order, neither of them reading it off the order in
 * which an adapter happened to push into an array.
 */
import type { ControlDefinition } from "../contracts/v1/protocol.ts";

export interface ControlOrder {
	/** Every control, producers before consumers; the declared order between controls nothing separates. */
	ordered: ControlDefinition[];
	/** Controls waiting on each other, named instead of being run in an arbitrary order. */
	cycles: string[];
}

/**
 * Topological order, stable on the order the controls arrive in. A declared report moves a control;
 * two controls that declare nothing about each other keep the order the adapter proposes, which is
 * what carries their cost — mutation spends thirty minutes where a structural sensor spends two,
 * and an alphabetical tie-break would pay the first before knowing the second. The frozen protocol
 * carries both the declarations and the controls in that order, so it is derived again from the
 * protocol alone. A report no control of the list writes is treated as already there: a prerequisite
 * produced outside the protocol blocks nobody, and only a control waiting on another one of the
 * list can form a cycle.
 */
export function orderControls(controls: readonly ControlDefinition[]): ControlOrder {
	const written = new Set(controls.flatMap((c) => c.provides));
	const pending = [...controls];
	const available = new Set<string>();
	const ordered: ControlDefinition[] = [];
	for (;;) {
		const next = pending.findIndex((c) => c.requires.every((key) => !written.has(key) || available.has(key)));
		if (next < 0) break;
		const [control] = pending.splice(next, 1);
		ordered.push(control!);
		for (const key of control!.provides) available.add(key);
	}
	return { ordered: [...ordered, ...pending], cycles: pending.map((c) => c.control_id) };
}

/**
 * Controls that must run in a workspace before this one can be asked anything, transitively and in
 * the order they run in. What it reads and what nobody writes is not a prerequisite: it is either
 * already in the tree or absent, and the sensor says so itself.
 */
export function prerequisitesOf(control: ControlDefinition, controls: readonly ControlDefinition[]): ControlDefinition[] {
	const needed = new Set<string>();
	const producers = new Set<string>();
	const queue = [...control.requires];
	while (queue.length > 0) {
		const key = queue.shift()!;
		if (needed.has(key)) continue;
		needed.add(key);
		for (const c of controls) {
			if (c.control_id === control.control_id || !c.provides.includes(key) || producers.has(c.control_id)) continue;
			producers.add(c.control_id);
			queue.push(...c.requires);
		}
	}
	return orderControls(controls).ordered.filter((c) => producers.has(c.control_id));
}
