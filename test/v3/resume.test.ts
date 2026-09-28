/**
 * V3 — `/495 resume` ends a pause or lifts a stop a resume may lift, then conducts the change. What it
 * inscribes acts on the steps a conduct would run: while another 495 operation holds the session, a
 * resume would end a pause, or close a verification, under steps still running, whose next commit then
 * blocks the change it resumed.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { KERNEL_ACTOR } from "../../src/application/actors.ts";
import { registerCommand495 } from "../../src/extension/command.ts";
import { selectedModel } from "../../src/extension/conduct.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import {
	ASKS_Q1,
	FakeContext,
	FakePi,
	HARNESS_ENV,
	RPC_ACTOR,
	commandProject,
	stalledOnQ1,
} from "../helpers/command-fixture.ts";

let root: string;
let cwd: string;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "resume-"));
	for (const name of HARNESS_ENV) saved[name] = process.env[name];
	delete process.env.HARNESS495_LANGUAGE;
	cwd = commandProject("495-resume-");
});
afterEach(() => {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
	rmSync(cwd, { recursive: true, force: true });
	rmSync(root, { recursive: true, force: true });
});

/** Takes a change with no question to its frozen candidate, in its verification with no control run yet. */
async function atVerification(
	dataDir: string,
	cwd: string,
	sessionId: string,
): Promise<{ pi: FakePi; session: ExtensionSession; ctx: FakeContext; changeId: string }> {
	const agentScript = join(dataDir, "agent.json");
	writeFileSync(
		agentScript,
		JSON.stringify({
			default: { steps: [{ kind: "complete", output: { ...ASKS_Q1, questions: [] } }] },
			roles: {
				implement: {
					steps: [
						{
							kind: "write",
							path: "src/greet.js",
							content: "export function greet(name) {\n  return `Hello, ${name}`; // tidy\n}\n",
						},
						{
							kind: "complete",
							output: { summary: "tidy", changed_paths: ["src/greet.js"], tests_claimed: false, notes: [] },
						},
					],
				},
			},
		}),
	);
	process.env.HARNESS495_DATA_DIR = join(dataDir, "data");
	process.env.HARNESS495_SCRIPTED_AGENT = agentScript;
	process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
	if (process.platform !== "darwin") process.env.HARNESS495_ALLOW_UNCONFINED = "1";
	const pi = new FakePi();
	const session = new ExtensionSession(pi as unknown as ExtensionAPI);
	registerCommand495(pi as unknown as ExtensionAPI, session);
	const ctx = new FakeContext(cwd, "rpc", sessionId);
	session.openedAt(ctx as unknown as ExtensionContext);
	const rt = session.runtime();
	const owner = session.humanOrigin(ctx as unknown as ExtensionContext)!.actor;
	const { program, change } = await rt.harness.start({ project_path: cwd, request_text: "x", actor: owner });
	const changeId = change.change_id;
	session.bind(ctx as unknown as ExtensionContext, { program_id: program.program_id, change_id: changeId });
	const readModel = () => selectedModel(ctx as unknown as ExtensionCommandContext);
	for (let step = 0; rt.ledger.loadChange(changeId)!.state.phase !== "verifying"; step++) {
		assert.ok(step < 20, `the change never reaches its verification: ${rt.ledger.loadChange(changeId)!.state.phase}`);
		await rt.harness.advance(changeId, { max_steps: 1, readModel });
	}
	return { pi, session, ctx, changeId };
}

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
	const owner = session.humanOrigin(ctx as unknown as ExtensionContext)!.actor;
	const verifying = rt.harness.commit(
		rt.ledger.loadChange(changeId)!,
		{
			type: "verification.start",
			at: new Date().toISOString(),
			actor: KERNEL_ACTOR,
			operation_id: "op_earlier_build",
			idempotency_key: "verify:earlier-build",
		},
		"cor_earlier_build",
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
				await pi.command!("resume", ctx as unknown as ExtensionCommandContext);
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
				await pi.command!("verify", ctx as unknown as ExtensionCommandContext);
				heldAfterVerify = session.busy;
				await pi.command!("resume", ctx as unknown as ExtensionCommandContext);
				revisionAfterResume = ledger.loadChange(changeId)!.revision;
			};

			await pi.command!("close q1", ctx as unknown as ExtensionCommandContext);

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
			await pi.command!("resume", ctx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => m.startsWith("495 error: PRECONDITION_FAILED: change is paused")),
				pi.said.join(" | "),
			);

			// Pausing again closes the verification the earlier build left open, then the resume verifies
			// the change again.
			await pi.command!("pause", ctx as unknown as ExtensionCommandContext);
			await pi.command!("resume", ctx as unknown as ExtensionCommandContext);

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
				rt.harness.commit(
					rt.ledger.loadChange(changeId)!,
					{ type: "change.block", at: new Date().toISOString(), actor: KERNEL_ACTOR, reason, detail: reason },
					`cor_${reason}`,
				);
				const before = pi.said.length;
				await pi.command!("verify", ctx as unknown as ExtensionCommandContext);
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
