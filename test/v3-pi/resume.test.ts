/**
 * V3 — `/495 resume` ends a pause or lifts a stop a resume may lift, then conducts the change. What it
 * inscribes acts on the steps a conduct would run: while another 495 operation holds the session, a
 * resume would end a pause, or close a verification, under steps still running, whose next commit then
 * blocks the change it resumed.
 */
import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { KERNEL_ACTOR } from "../../src/application/actors.ts";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import {
	FakeContext,
	FakePi,
	HARNESS_ENV,
	atPhase,
	atVerification,
	commandProject,
	stalledOnQ1,
} from "../helpers/command-fixture.ts";
import { removedAfterEach, outputDir } from "../helpers/fixtures.ts";
import { storedRows, writtenBeforeTheRename } from "../helpers/journal-before-rename.ts";

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
	it("a change whose journal and projection carry the old phase identifiers, paused in specifying after a revision back to verification_design, is said paused in the Specification step by `/495 status`, then conducted to its acceptance, and keeps the bytes of its journal", async () => {
		const first = await atPhase(root, cwd, "s-resume-before-rename", "design");
		const { changeId } = first;
		const before = first.session.runtime();
		for (const kind of ["protocol", "requirements"] as const) {
			const loaded = before.ledger.loadChange(changeId)!;
			const latest = (await before.harness.artifacts.latest(loaded.state, kind))!;
			await before.harness.conducting(changeId, async () =>
				before.harness.commit(
					loaded,
					{
						type: "artifact.revise",
						at: new Date().toISOString(),
						actor: KERNEL_ACTOR,
						kind,
						ref: latest.ref,
						reason: "revised",
					},
					`cor_revise_${kind}`,
				),
			);
		}
		await first.pi.run("pause", first.ctx);
		const dataDir = before.dataDir;
		await first.session.close();
		const rows = writtenBeforeTheRename(dataDir, changeId);
		assert.ok(
			rows.some((r) => r.payload.includes('"phase":"specifying"')),
			"the journal carries the old identifiers",
		);

		const pi = new FakePi();
		const session = new ExtensionSession(pi.host());
		registerCommand495(pi.host(), session);
		const ctx = new FakeContext(cwd, "rpc", "s-resume-after-rename");
		session.openedAt(ctx.asCommand());
		try {
			const rt = session.runtime();
			await pi.run("status", ctx);
			const view = (pi.details.at(-1) as { view: { change: { phase: string; status: string } } }).view.change;
			assert.deepEqual([view.phase, view.status], ["specification", "paused"]);
			const status = pi.said.at(-1)!.split("\n");
			assert.ok(status.includes("… Spécification · rédaction des exigences"), status.join("\n"));
			await pi.run("resume", ctx);
			const state = rt.ledger.loadChange(changeId)!.state;
			assert.deepEqual([state.phase, state.outcome], ["closed", "accepted"], pi.said.join(" | "));
			const integrity = await rt.ledger.verifyIntegrity((d) => rt.objects.verify(d));
			assert.deepEqual(integrity.problems, []);
			assert.deepEqual(
				storedRows(dataDir, changeId).slice(0, rows.length),
				rows,
				"the events written before keep their bytes",
			);
		} finally {
			await session.close();
		}
	});

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
