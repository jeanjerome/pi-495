/**
 * V3 — `/495 revoke <question>` revokes the owner's resolution of a material question from Pi
 * (DEC-06), on the model of `/495 close`: binding, question and a free session required, human
 * provenance required, a confirmation on a dialog-capable session that says what the revocation
 * undoes, then the change is conducted onward and presents the question asked again.
 */
import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	ASKS_Q1,
	FakeContext,
	HARNESS_ENV,
	RPC_ACTOR,
	commandProject,
	stalledOnQ1,
} from "../helpers/command-fixture.ts";
import type { ExtensionSession } from "../../src/extension/session.ts";
import { removedAfterEach, outputDir } from "../helpers/fixtures.ts";

const SESSION = "s-answer-revocation";
const Q1 = ASKS_Q1.questions[0]!;

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("answer-revocation-", cleanups);
});

/**
 * Standard output, where the session routes every message in print mode, kept instead of written
 * while a command runs. The refusal writes before any I/O is awaited, so nothing else writes in
 * between.
 */
class CapturedStandardOutput {
	private readonly chunks: string[] = [];
	async during(run: () => Promise<void>): Promise<string> {
		const write = process.stdout.write;
		process.stdout.write = ((chunk: string | Uint8Array) => {
			this.chunks.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;
		try {
			await run();
		} finally {
			process.stdout.write = write;
		}
		return this.chunks.join("");
	}
}

/** Whether Q1 still holds its answer, the change still stopped and no revocation inscribed. */
function assertNothingInscribed(session: ExtensionSession, changeId: string): void {
	const ledger = session.runtime().ledger;
	const state = ledger.loadChange(changeId)!.state;
	assert.ok(state.open_questions.find((q) => q.id === Q1.id)?.answer, "Q1 stays answered");
	assert.equal(state.status, "blocked", "the change stays stopped");
	assert.equal(
		ledger.readChangeEvents(changeId).some(({ event }) => event.type === "question.revoked"),
		false,
		"no revocation is inscribed",
	);
}

describe("`/495 revoke <question>` revokes the owner's resolution of a material question (DEC-06)", () => {
	const saved: Record<string, string | undefined> = {};
	let cwd: string;
	beforeEach(() => {
		for (const name of HARNESS_ENV) saved[name] = process.env[name];
		delete process.env.HARNESS495_LANGUAGE;
		cwd = commandProject("495-answer-revocation-", cleanups);
	});
	afterEach(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	it("revokes the answer once confirmed, lifts the stop and presents Q1 again through IH-01, and the revocation itself launches no intervention (6c)", async () => {
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd, SESSION);
		try {
			const ledger = session.runtime().ledger;
			const interventions = ledger.loadChange(changeId)!.state.interventions.length;
			const presented = ctx.selections.length;

			await pi.command!("revoke q1", ctx as unknown as ExtensionCommandContext);

			assert.deepEqual(
				ctx.selections
					.slice(presented)
					.map((s) => [s.question, s.options.filter((o) => !o.startsWith("(")).map((o) => o.split(" — ")[0])]),
				[[Q1.question, ["answer", "close", "abandon"]]],
				`the selection presented next asks Q1 again with its three outcomes: ${pi.said.join(" | ")}`,
			);
			assert.equal(ctx.confirmations, 1, "the revocation is put to the owner before it is inscribed");
			assert.match(ctx.confirmed[0]!, /reposée/, "the confirmation says the question will be asked again");
			assert.match(ctx.confirmed[0]!, /mandat.*exigences/, "the confirmation says what stops being adopted");
			const state = ledger.loadChange(changeId)!.state;
			assert.notEqual(state.status, "blocked", "the stop is lifted");
			assert.ok(
				ledger
					.readChangeEvents(changeId)
					.some(
						({ event }) =>
							event.type === "question.revoked" && event.id === Q1.id && event.actor.actor_id === RPC_ACTOR,
					),
				"the journal inscribes the revocation under the owner",
			);
			assert.equal(state.interventions.length, interventions, "the revocation itself launches no intervention");
		} finally {
			await session.close();
		}
	});

	it("confirms in English, in an English session, what the revocation undoes", async () => {
		process.env.HARNESS495_LANGUAGE = "en";
		const { pi, session, ctx } = await stalledOnQ1(root, cwd, SESSION);
		try {
			await pi.command!("revoke q1", ctx as unknown as ExtensionCommandContext);

			assert.equal(ctx.confirmations, 1);
			assert.match(ctx.confirmed[0]!, /asked again/, "the confirmation says the question will be asked again");
			assert.match(ctx.confirmed[0]!, /mandate, the requirements/, "the confirmation says what stops being adopted");
		} finally {
			await session.close();
		}
	});

	it("is refused in print mode, saying a human origin is required, and inscribes nothing (6g)", async () => {
		const { pi, session, changeId } = await stalledOnQ1(root, cwd, SESSION);
		try {
			const printing = new FakeContext(cwd, "print", SESSION);
			const printed = await new CapturedStandardOutput().during(() =>
				pi.command!("revoke q1", printing as unknown as ExtensionCommandContext),
			);
			assert.match(printed, /human origin|provenance humaine/);
			assertNothingInscribed(session, changeId);
		} finally {
			await session.close();
		}
	});

	it("inscribes nothing and leaves the change stopped when the confirmation is refused (6i)", async () => {
		const { pi, session, changeId } = await stalledOnQ1(root, cwd, SESSION);
		try {
			const refusing = new FakeContext(cwd, "rpc", SESSION, false);
			await pi.command!("revoke q1", refusing as unknown as ExtensionCommandContext);
			assert.equal(refusing.confirmations, 1, "the revocation is put to the owner before anything is inscribed");
			assertNothingInscribed(session, changeId);
		} finally {
			await session.close();
		}
	});

	it("conducts nothing when the revocation is declined or refused, on a change a conduct would advance", async () => {
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd, SESSION);
		try {
			const rt = session.runtime();
			// The stop lifted without a conduct: the change is ready, and a conduct would run its
			// specification again.
			rt.harness.resume(changeId, session.humanOrigin(ctx as unknown as ExtensionCommandContext)!.actor);
			const ready = rt.ledger.loadChange(changeId)!;
			assert.deepEqual([ready.state.phase, ready.state.status], ["clarifying", "ready"]);

			const declining = new FakeContext(cwd, "rpc", SESSION, false);
			await pi.command!("revoke q1", declining as unknown as ExtensionCommandContext);
			assert.equal(declining.confirmations, 1, "the revocation is put to the owner, who declines it");
			assert.equal(rt.ledger.loadChange(changeId)!.revision, ready.revision, "a declined revocation conducts nothing");

			await pi.command!("revoke not-a-question", ctx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => m.includes("495 error: UNKNOWN_REFERENCE")),
				pi.said.join(" | "),
			);
			assert.equal(rt.ledger.loadChange(changeId)!.revision, ready.revision, "a refused revocation conducts nothing");
		} finally {
			await session.close();
		}
	});

	it("displays the code and the reason of a revocation the kernel refuses (6h)", async () => {
		const { pi, session, ctx } = await stalledOnQ1(root, cwd, SESSION);
		try {
			await pi.command!("revoke not-a-question", ctx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => m.includes("495 error: UNKNOWN_REFERENCE")),
				pi.said.join(" | "),
			);
		} finally {
			await session.close();
		}
	});

	it("is refused while another 495 operation holds the session, and inscribes nothing (6h, M6)", async () => {
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd, SESSION);
		try {
			session.busy = true;
			try {
				await pi.command!("revoke q1", ctx as unknown as ExtensionCommandContext);
			} finally {
				session.busy = false;
			}
			assert.ok(
				pi.said.some((m) => m === session.busyRefusal()),
				pi.said.join(" | "),
			);
			assert.equal(ctx.confirmations, 0, "the revocation is never put to the owner while the session is held");
			assertNothingInscribed(session, changeId);
		} finally {
			await session.close();
		}
	});

	it("names revoke in the help and the description of /495, and says its usage when no question is named", async () => {
		const { pi, session, ctx } = await stalledOnQ1(root, cwd, SESSION);
		try {
			assert.match(pi.description, /\brevoke\b/);
			await pi.command!("help", ctx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => m.includes("revoke <question>")),
				pi.said.join(" | "),
			);
			await pi.command!("revoke", ctx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => m === "usage: /495 revoke <question>"),
				pi.said.join(" | "),
			);
		} finally {
			await session.close();
		}
	});
});
