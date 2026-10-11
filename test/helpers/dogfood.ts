/**
 * A target shaped as pi-495 is — sources split by layer under `src/`, and the very script that refuses an import
 * against the layering of this repository — driven through the kernel by a scripted agent under the sandbox of the
 * platform: the preparation writes the test of shout, the producer writes shout and whatever else the case adds,
 * the reviewer approves.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangeState } from "../../src/domain/change/state.ts";
import type { ControlExecutionPort, ControlInvocation } from "../../src/ports/execution.ts";
import { RECIPE_SCRIPT } from "./acceptance-recipe.ts";
import { HUMAN } from "./change-fixture.ts";
import { fixtureTsWithoutTests, SHOUT_IMPL, SHOUT_TEST, writeFiles } from "./fixtures.ts";
import {
	type HarnessOptions,
	makeHarness,
	specReport,
	trackedProject,
	type PolicyOverride,
	type TestHarness,
} from "./harness-fixture.ts";

const REPOSITORY = join(import.meta.dirname, "..", "..");

/** The layer check of this repository, as `npm run lint:layers` runs it. */
const LAYERS_SCRIPT = readFileSync(join(REPOSITORY, "scripts", "check-layers.ts"), "utf8");

/** A domain module that imports an adapter: what the layer check of pi-495 refuses. */
export const DOMAIN_IMPORTING_AN_ADAPTER =
	'import { STORE } from "../adapters/store.ts";\nexport const RULE = STORE;\n';

const spec = specReport({
	objective: "add shout(name) returning the greeting in upper case",
	requirements: [
		{
			requirement_id: "R1",
			statement: "shout(name) returns greet(name) upper-cased",
			mandatory: true,
			criterion: "unit test on shout passes",
			category: "functional",
			satisfied_by_reference: false,
		},
		{
			requirement_id: "R2",
			statement: "greet unchanged",
			mandatory: true,
			criterion: "unit test on greet passes",
			category: "functional",
			satisfied_by_reference: true,
		},
	],
	design: { summary: "add shout next to greet", components: ["greet"], interfaces: ["shout(name)"], risks: [] },
});
/**
 * The real control runner, with the delay of the suite the technology detects cut to `timeout_ms`: what lets a bench
 * show in seconds a suite that runs past the ten minutes the control grants it.
 */
export class ShortensTheSuiteDelay implements ControlExecutionPort {
	private readonly real: ControlExecutionPort;
	private readonly timeout_ms: number;
	get readers(): ControlExecutionPort["readers"] {
		return this.real.readers;
	}
	constructor(real: ControlExecutionPort, timeout_ms: number) {
		this.real = real;
		this.timeout_ms = timeout_ms;
	}
	runControl(invocation: ControlInvocation, signal?: AbortSignal): ReturnType<ControlExecutionPort["runControl"]> {
		const control =
			invocation.control.control_id === "unit"
				? { ...invocation.control, timeout_ms: this.timeout_ms }
				: invocation.control;
		return this.real.runControl({ ...invocation, control }, signal);
	}
}

const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: false, notes: [] });

/**
 * Runs a change that adds shout to the pi-495-shaped target, the producer writing `extra` beside it, under `policy`,
 * each control run under the sandbox of the platform. The preparation writes `preparedTest`, the test of shout whose
 * cases name the requirement each one observes unless the case gives another. `reference` adds files to the target
 * before the change, and `controls` wraps the runner of its controls.
 */
export async function runOnPi495Shape(
	extra: Record<string, string>,
	policy: PolicyOverride,
	options: {
		integration?: boolean;
		preparedTest?: string;
		reference?: Record<string, string>;
		controls?: HarnessOptions["controls"];
	} = {},
): Promise<{ t: TestHarness; change_id: string; state: ChangeState; steps: string[] }> {
	const p = trackedProject((root) => {
		fixtureTsWithoutTests(root);
		writeFiles(root, {
			"scripts/check-layers.ts": LAYERS_SCRIPT,
			"recipe.js": RECIPE_SCRIPT,
			"src/domain/rule.ts": "export const RULE = 1;\n",
			"src/adapters/store.ts": "export const STORE = 1;\n",
			...options.reference,
		});
	});
	const t = makeHarness({
		sandbox: "platform",
		...(options.integration ? { integration: true } : {}),
		...(options.controls ? { controls: options.controls } : {}),
		policy: {
			required_reviews: ["promises"],
			review_missions: { promises: "tie each promise to the code that keeps it and the assertion that holds it" },
			...policy,
		},
		defaultScript: { steps: [{ kind: "complete", output: spec }] },
		scripts: {
			prepare: {
				steps: [
					{ kind: "write", path: "test/shout.test.js", content: options.preparedTest ?? SHOUT_TEST },
					{ kind: "complete", output: report(["test/shout.test.js"]) },
				],
			},
			implement: {
				steps: [
					{ kind: "write", path: "src/greet.js", content: SHOUT_IMPL },
					...Object.entries(extra).map(([path, content]) => ({ kind: "write" as const, path, content })),
					{ kind: "complete", output: report(["src/greet.js", ...Object.keys(extra)]) },
				],
			},
			review: { steps: [{ kind: "complete", output: { conclusion: "approve", findings: [], limits: [] } }] },
		},
	});
	const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
	const result = await t.harness.advance(change.change_id, { max_steps: 40 });
	return { t, change_id: change.change_id, state: t.ledger.loadChange(change.change_id)!.state, steps: result.steps };
}
