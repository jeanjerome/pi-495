/**
 * V3 — a `/495` operation refused outside its phase says in its text which phases allow it, and
 * carries no next action: no subcommand leads to the expected phase, so none is offered.
 */
import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { HARNESS_ENV, atVerification, commandProject, stalledOnQ1 } from "../helpers/command-fixture.ts";
import { removedAfterEach, outputDir } from "../helpers/fixtures.ts";

let root: string;
let cwd: string;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
	root = outputDir("phase-refusal-", cleanups);
	for (const name of HARNESS_ENV) saved[name] = process.env[name];
	delete process.env.HARNESS495_LANGUAGE;
	cwd = commandProject("495-phase-refusal-", cleanups);
});
afterEach(() => {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});
/** Registered after the teardown above, so the directories are removed once it has run. */
const cleanups = removedAfterEach();

describe("a refusal outside its phase names the phases that allow the operation, and no next action", () => {
	it("`/495 close q1` on a change in `verifying` says it is allowed in scoping, with no next action", async () => {
		const { pi, session, ctx } = await atVerification(root, cwd, "s-phase-refusal-close");
		try {
			const before = pi.said.length;
			await pi.run("close q1", ctx);
			const refused = pi.said.findIndex((m, i) => i >= before && m.startsWith("495 error:"));
			assert.equal(
				pi.said[refused],
				"495 error: INVALID_TRANSITION: operation question.close is not allowed in phase verifying; it is allowed in scoping",
				pi.said.slice(before).join(" | "),
			);
			assert.deepEqual((pi.details[refused] as { error: { next_actions: string[] } }).error.next_actions, []);
		} finally {
			await session.close();
		}
	});

	it("`/495 verify` on a change stopped on q1 in `scoping` names every phase that allows it, with no next action", async () => {
		const { pi, session, ctx } = await stalledOnQ1(root, cwd, "s-phase-refusal-verify");
		try {
			const before = pi.said.length;
			await pi.run("verify", ctx);
			const refused = pi.said.findIndex((m, i) => i >= before && m.startsWith("495 error:"));
			assert.equal(
				pi.said[refused],
				"495 error: INVALID_TRANSITION: operation verification.rerun is not allowed in phase scoping; it is allowed in deciding, reviewing, verifying",
				pi.said.slice(before).join(" | "),
			);
			assert.deepEqual((pi.details[refused] as { error: { next_actions: string[] } }).error.next_actions, []);
		} finally {
			await session.close();
		}
	});
});
