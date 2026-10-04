/**
 * V3 — the text of a kernel refusal, as the owner reads it on screen, names the next actions its
 * structured details carry, as `(next: …)`, the form the detail of a stop already shows; a refusal
 * that carries none keeps its text.
 */
import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { KERNEL_ACTOR } from "../../src/application/actors.ts";
import { HARNESS_ENV, atVerification, commandProject, stalledOnQ1 } from "../helpers/command-fixture.ts";
import { removedAfterEach, outputDir } from "../helpers/fixtures.ts";

let root: string;
let cwd: string;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
	root = outputDir("refusal-next-actions-", cleanups);
	for (const name of HARNESS_ENV) saved[name] = process.env[name];
	delete process.env.HARNESS495_LANGUAGE;
	cwd = commandProject("495-refusal-next-actions-", cleanups);
});
afterEach(() => {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});
/** Registered after the teardown above, so the directories are removed once it has run. */
const cleanups = removedAfterEach();

describe("the text of a kernel refusal names the next actions it carries", () => {
	it("a revocation of an unknown question keeps its text; a revocation refused while an intervention runs names the pause, and its details still carry it", async () => {
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd, "s-refusal-next-actions");
		try {
			const unknown = pi.said.length;
			await pi.run("revoke not-a-question", ctx);
			assert.deepEqual(
				pi.said.slice(unknown).filter((m) => m.startsWith("495 error:")),
				["495 error: UNKNOWN_REFERENCE: question not-a-question does not exist"],
				pi.said.slice(unknown).join(" | "),
			);

			const ledger = session.runtime().ledger;
			ledger.appendChange(
				changeId,
				ledger.loadChange(changeId)!.revision,
				[
					{
						type: "intervention.started",
						at: new Date().toISOString(),
						actor: KERNEL_ACTOR,
						intervention_id: "int_running",
						role: "specify",
						attempt_id: null,
						model: { provider_id: "anthropic", model_id: "claude-x", thinking_level: "off" },
						profile_id: "specify",
					},
				],
				{ correlation_id: "cor_running" },
			);
			const before = pi.said.length;
			await pi.run("revoke q1", ctx);
			const refused = pi.said.findIndex((m, i) => i >= before && m.startsWith("495 error:"));
			assert.equal(
				pi.said[refused],
				"495 error: OPERATION_ACTIVE: intervention int_running is running (next: pause)",
				pi.said.slice(before).join(" | "),
			);
			assert.deepEqual((pi.details[refused] as { error: { next_actions: string[] } }).error.next_actions, ["pause"]);
		} finally {
			await session.close();
		}
	});

	it("`/495 verify` on a change stopped `execution_error` in its verification names the resume and the cancel", async () => {
		const { pi, session, ctx, changeId } = await atVerification(root, cwd, "s-refusal-next-actions-verify");
		try {
			const rt = session.runtime();
			await rt.harness.conducting(changeId, async () =>
				rt.harness.commit(
					rt.ledger.loadChange(changeId)!,
					{
						type: "change.block",
						at: new Date().toISOString(),
						actor: KERNEL_ACTOR,
						reason: "execution_error",
						detail: "execution_error",
					},
					"cor_execution_error",
				),
			);
			const before = pi.said.length;
			await pi.run("verify", ctx);
			assert.deepEqual(
				pi.said.slice(before).filter((m) => m.startsWith("495 error:")),
				["495 error: PRECONDITION_FAILED: change is blocked: execution_error (next: resume, cancel)"],
				pi.said.slice(before).join(" | "),
			);
		} finally {
			await session.close();
		}
	});
});
