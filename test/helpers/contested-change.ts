/**
 * A change whose preparation froze a case that contradicts its requirement: R1 asks that shout(name) return
 * greet(name) upper-cased, and the frozen case expects "HELLO X!". The producer implements R1 and contests
 * the case; the examiner, the preparation that follows and the producer's later attempts are scripted per
 * role and per round.
 */
import type { AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import type { PolicyOverride, TestHarness } from "./harness-fixture.ts";
import { makeHarness, specReport, trackedProject } from "./harness-fixture.ts";
import { HUMAN } from "./change-fixture.ts";
import { SHOUT_IMPL, fixtureTsWithoutTests } from "./fixtures.ts";

export const CONTESTED_CASE = "R1 shout upper-cases the greeting";
export const CONTESTATION_OBSERVATION =
	'the case expects shout("x") to be "HELLO X!" where R1 says it returns greet("x") upper-cased, "HELLO, X"';

const spec = specReport({
	objective: "add shout(name)",
	requirements: [
		{
			requirement_id: "R1",
			statement: "shout(name) returns greet(name) upper-cased",
			mandatory: true,
			criterion: 'shout("x") returns "HELLO, X"',
			category: "functional",
			satisfied_by_reference: false,
		},
	],
});

const shoutTest = (expected: string) =>
	`import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport * as greeting from "../src/greet.js";\n\ntest("${CONTESTED_CASE}", () => {\n  assert.equal(typeof greeting.shout, "function");\n  assert.equal(greeting.shout("x"), "${expected}");\n});\n`;
/** The case the first preparation freezes, which asserts what R1 does not say. */
export const WRONG_TEST = shoutTest("HELLO X!");
/** The case a preparation written again freezes, which asserts what R1 says. */
export const RIGHT_TEST = shoutTest("HELLO, X");

/** A second frozen case of R1, contested beside the first. */
export const OTHER_CASE = "R1 shout upper-cases any name";
/** The first case as `WRONG_TEST` freezes it, and the second case expecting `other` for shout("y"). */
export const twoCases = (other: string) =>
	`${WRONG_TEST}\ntest("${OTHER_CASE}", () => {\n  assert.equal(typeof greeting.shout, "function");\n  assert.equal(greeting.shout("y"), "${other}");\n});\n`;

export function preparing(content: string): AgentScript {
	return {
		steps: [
			{ kind: "write", path: "test/shout.test.js", content },
			{
				kind: "complete",
				output: { summary: "R1 case", changed_paths: ["test/shout.test.js"], tests_claimed: false, notes: [] },
			},
		],
	};
}

/** The producer implements R1, contesting the frozen case or not; `content` makes a candidate of its own. */
export function implementing(contests: boolean, content = SHOUT_IMPL): AgentScript {
	return contesting(contests ? [CONTESTED_CASE] : [], content);
}

/** The producer implements R1 and contests each of `cases`; `content` makes a candidate of its own. */
export function contesting(cases: readonly string[], content = SHOUT_IMPL): AgentScript {
	return {
		steps: [
			{ kind: "write", path: "src/greet.js", content },
			{
				kind: "complete",
				output: {
					summary: "shout added",
					changed_paths: ["src/greet.js"],
					tests_claimed: true,
					notes: [],
					contestations: cases.map((c) => ({
						requirement_id: "R1",
						case: c,
						observation: c === CONTESTED_CASE ? CONTESTATION_OBSERVATION : `the case "${c}" contradicts R1`,
					})),
				},
			},
		],
	};
}

export function examining(finding: string, reasons: string): AgentScript {
	return { steps: [{ kind: "complete", output: { finding, reasons } }] };
}

/** What each role is handed at its n-th intervention, the last one again once they run out. */
export type Rounds = Partial<Record<"prepare" | "implement" | "review", AgentScript[]>>;

/** Starts the contested change and conducts it until it stops; `t.agent.started` keeps every mandate. */
export async function conductContestedChange(rounds: Rounds, policy: PolicyOverride = {}) {
	const t: TestHarness = makeHarness({ defaultScript: { steps: [{ kind: "complete", output: spec }] }, policy });
	const seen = new Map<string, number>();
	const original = t.agent.startIntervention.bind(t.agent);
	t.agent.startIntervention = async (m) => {
		const scripts = rounds[m.role as keyof Rounds];
		const n = seen.get(m.role) ?? 0;
		seen.set(m.role, n + 1);
		if (scripts) t.agent.scripts.set(m.role, scripts[Math.min(n, scripts.length - 1)]!);
		return original(m);
	};
	const { change } = await t.harness.start({
		project_path: trackedProject(fixtureTsWithoutTests),
		request_text: "add shout",
		actor: HUMAN,
	});
	const result = await t.harness.advance(change.change_id, { max_steps: 80 });
	return { t, result, changeId: change.change_id };
}
