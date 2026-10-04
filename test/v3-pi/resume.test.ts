/**
 * V3 — `/495 resume` ends a pause or lifts a stop a resume may lift, then conducts the change. What it
 * inscribes acts on the steps a conduct would run: while another 495 operation holds the session, a
 * resume would end a pause, or close a verification, under steps still running, whose next commit then
 * blocks the change it resumed.
 */
import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { KERNEL_ACTOR } from "../../src/application/actors.ts";
import type { ExtensionSession } from "../../src/extension/session.ts";
import {
	type FakeContext,
	type FakePi,
	HARNESS_ENV,
	atVerification,
	commandProject,
	stalledOnQ1,
} from "../helpers/command-fixture.ts";
import { removedAfterEach, outputDir } from "../helpers/fixtures.ts";

let root: string;
let cwd: string;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
	root = outputDir("resume-", cleanups);
	for (const name of HARNESS_ENV) saved[name] = process.env[name];
	delete process.env.HARNESS495_LANGUAGE;
	cwd = commandProject("495-resume-", cleanups);
});
afterEach(() => {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});
/** Registered after the teardown above, so the directories are removed once it has run. */
const cleanups = removedAfterEach();

/**
 * Takes a change to its verification, opens it, then writes the pause as a build before the pause
 * closed the verification it suspends wrote it: the change paused, and its verification left open.
 */
async function pausedDuringVerificationByAnEarlierBuild(
	dataDir: string,
	cwd: string,
): Promise<{ pi: FakePi; session: ExtensionSession; ctx: FakeContext; changeId: string }> {
	const { pi, session, ctx, changeId } = await atVerification(dataDir, cwd, "s-resume-earlier-build");
	const rt = session.runtime();
	const owner = session.humanOrigin(ctx.asCommand())!.actor;
	const verifying = await rt.harness.conducting(changeId, async () =>
		rt.harness.commit(
			rt.ledger.loadChange(changeId)!,
			{
				type: "verification.start",
				at: new Date().toISOString(),
				actor: KERNEL_ACTOR,
				operation_id: "op_earlier_build",
				idempotency_key: "verify:earlier-build",
			},
			"cor_earlier_build",
		),
	);
	const at = new Date().toISOString();
	rt.ledger.appendChange(
		changeId,
		verifying.revision,
		[
			{ type: "resume_point.saved", at, actor: owner, phase: "verifying", status: "running" },
			{ type: "status.changed", at, actor: owner, status: "paused", stop_reason: null, detail: null },
		],
		{ correlation_id: "cor_earlier_build" },
	);
	return { pi, session, ctx, changeId };
}

describe("`/495 resume` ends a pause or lifts a stop, then conducts the change", () => {
	it("is refused while another 495 operation holds the session, and inscribes nothing", async () => {
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd, "s-resume");
		try {
			const ledger = session.runtime().ledger;
			const before = ledger.loadChange(changeId)!.revision;
			session.busy = true;
			try {
				await pi.run("resume", ctx);
			} finally {
				session.busy = false;
			}
			assert.ok(
				pi.said.some((m) => m === session.busyRefusal()),
				pi.said.join(" | "),
			);
			const after = ledger.loadChange(changeId)!;
			assert.equal(after.revision, before, "the resume inscribes nothing while the session is held");
			assert.deepEqual(
				[after.state.status, after.state.stop_reason],
				["blocked", "stagnation"],
				"the change keeps the stop a resume would have lifted",
			);
		} finally {
			await session.close();
		}
	});

	it("stays refused after a /495 verify refused while another operation holds the session, which keeps its hold", async () => {
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd, "s-resume-verify");
		try {
			const ledger = session.runtime().ledger;
			const before = ledger.loadChange(changeId)!.revision;
			let heldAfterVerify: boolean | undefined;
			let revisionAfterResume: number | undefined;
			// `/495 close` holds the session while its confirmation is put to the owner.
			ctx.onConfirm = async () => {
				await pi.run("verify", ctx);
				heldAfterVerify = session.busy;
				await pi.run("resume", ctx);
				revisionAfterResume = ledger.loadChange(changeId)!.revision;
			};

			await pi.run("close q1", ctx);

			assert.equal(heldAfterVerify, true, "the close still holds the session once /495 verify returns");
			assert.equal(revisionAfterResume, before, "the resume inscribes nothing while the close holds the session");
			assert.equal(
				pi.said.filter((m) => m === session.busyRefusal()).length,
				2,
				`both /495 verify and /495 resume are refused: ${pi.said.join(" | ")}`,
			);
		} finally {
			await session.close();
		}
	});

	it("releases the session once the kernel refuses it, so the resume asked next is not refused as busy", async () => {
		const { pi, session, ctx, changeId } = await pausedDuringVerificationByAnEarlierBuild(root, cwd);
		try {
			const paused = session.runtime().ledger.loadChange(changeId)!.state;
			assert.deepEqual(
				[paused.phase, paused.status, paused.operation?.operation_id],
				["verifying", "paused", "op_earlier_build"],
			);
			await pi.run("resume", ctx);
			assert.ok(
				pi.said.some((m) => m.startsWith("495 error: PRECONDITION_FAILED: change is paused")),
				pi.said.join(" | "),
			);

			// Pausing again closes the verification the earlier build left open, then the resume verifies
			// the change again.
			await pi.run("pause", ctx);
			await pi.run("resume", ctx);

			assert.ok(
				!pi.said.some((m) => m === session.busyRefusal()),
				`no command is refused as busy after the refusal: ${pi.said.join(" | ")}`,
			);
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			assert.deepEqual([state.phase, state.outcome], ["closed", "accepted"], "the change verifies again");
		} finally {
			await session.close();
		}
	});
});

describe("a refusal on a blocked change names only the ways out `/495` offers", () => {
	it("`/495 verify` on a change blocked in its verification names the resume and the cancel, or the cancel alone", async () => {
		const { pi, session, ctx, changeId } = await atVerification(root, cwd, "s-verify-blocked");
		try {
			const rt = session.runtime();
			/** Blocks the change as the losing conduct of another session would, then asks `/495 verify`. */
			const refusalOf = async (reason: "execution_error" | "configuration_error"): Promise<unknown> => {
				await rt.harness.conducting(changeId, async () =>
					rt.harness.commit(
						rt.ledger.loadChange(changeId)!,
						{ type: "change.block", at: new Date().toISOString(), actor: KERNEL_ACTOR, reason, detail: reason },
						`cor_${reason}`,
					),
				);
				const before = pi.said.length;
				await pi.run("verify", ctx);
				const refused = pi.said.findIndex((m, i) => i >= before && m.startsWith("495 error: PRECONDITION_FAILED"));
				assert.ok(refused >= 0, pi.said.slice(before).join(" | "));
				return (pi.details[refused] as { error: { next_actions: string[] } }).error.next_actions;
			};

			assert.deepEqual(await refusalOf("execution_error"), ["resume", "cancel"], "a stop a resume lifts");
			assert.deepEqual(await refusalOf("configuration_error"), ["cancel"], "a stop no resume lifts");
		} finally {
			await session.close();
		}
	});
});
