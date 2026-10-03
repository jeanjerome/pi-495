/**
 * A program conducted through the harness: a producer that marks what it writes with the increment it
 * conducts, a change carried to its integration, and the next increment started.
 */
import { strict as assert } from "node:assert";
import type { ProgramState } from "../../src/domain/program/program.ts";
import { HUMAN, tuiOrigin } from "./change-fixture.ts";
import { makeHarness, type TestHarness } from "./harness-fixture.ts";

/** A harness whose policy permits local integration, or not. */
export function programHarness(integration: boolean): TestHarness {
	return makeHarness({ policy: { integration_enabled: integration }, integration });
}

/** Scripts the producer to write `src/greet.js` marked with the increment it is conducting. */
export function produces(t: TestHarness, mark: string): void {
	t.agent.scripts.set("implement", {
		steps: [
			{
				kind: "write",
				path: "src/greet.js",
				content: `export function greet(name) {\n  return \`Hello, \${name}\`; // ${mark}\n}\n`,
			},
			{
				kind: "complete",
				output: { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: true, notes: [] },
			},
		],
	});
}

/** Conducts the change to its acceptance, then answers the integration question with `integrate`. */
export async function integrated(t: TestHarness, changeId: string, mark: string): Promise<string> {
	produces(t, mark);
	return integrate(t, changeId);
}

/** Conducts the change, its producer already scripted, to its acceptance, then integrates it, and returns the receipt. */
export async function integrate(t: TestHarness, changeId: string): Promise<string> {
	const accepted = await t.harness.advance(changeId, { max_steps: 30 });
	const asked = t.harness.pendingDecisions(changeId).find((d) => d.interaction === "IH-11");
	assert.ok(asked, `the change asks to integrate: ${accepted.steps.join(" | ")}`);
	const answered = t.harness.answerDecision(
		changeId,
		{
			decision_id: asked.decision_id,
			option_id: "integrate",
			free_text: null,
			reason: null,
			subject_revision: asked.subject.revision,
			scope: null,
			expires_at: null,
		},
		tuiOrigin(),
	);
	assert.equal(answered.error, null, answered.error?.message);
	const done = await t.harness.advance(changeId, { max_steps: 10 });
	assert.equal(done.view.change?.outcome, "integrated", done.steps.join(" | "));
	const receipt = t.ledger.loadChange(changeId)!.state.integration?.receipt_digest;
	assert.ok(receipt, "the integration is recorded with its receipt");
	return receipt;
}

export function programOf(t: TestHarness, programId: string): ProgramState {
	return t.ledger.loadProgram(programId)!.state;
}

export const statuses = (p: ProgramState) => p.increments.map((i) => [i.increment_id, i.status]);

/** Starts the change of the program's next ready increment, and returns its identifier. */
export async function next(t: TestHarness, programId: string): Promise<string> {
	const { change } = await t.harness.startNext({ program_id: programId, actor: HUMAN });
	return change.change_id;
}
