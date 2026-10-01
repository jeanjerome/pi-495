/**
 * V3 — `/495 close <question>` closes a material question from Pi, from the stop of a stalled
 * specification (BES-02), on the model of `/495 cancel`: binding required, human provenance
 * required, confirmation on a dialog-capable session, then the change is conducted onward as after
 * `/495 resume`. The conversational tool offers no closure at all: none of its seven operations
 * decides, adopts or closes.
 */
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerCommand495 } from "../../src/extension/command.ts";
import { registerTool495 } from "../../src/extension/tool.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import {
	FakeContext,
	FakePi,
	HARNESS_ENV,
	RPC_ACTOR,
	commandProject,
	stalledOnQ1,
} from "../helpers/command-fixture.ts";
import { removedAfterEach, outputDir } from "../helpers/fixtures.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("question-closure-", cleanups);
});

function project(): string {
	return commandProject("495-question-closure-", cleanups);
}

describe("`/495 close <question>` closes a material question from the stop of a stalled specification (BES-02)", () => {
	const saved: Record<string, string | undefined> = {};
	beforeEach(() => {
		for (const name of HARNESS_ENV) saved[name] = process.env[name];
	});
	afterEach(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	it("is refused for a session with no binding", async () => {
		const cwd = project();
		process.env.HARNESS495_DATA_DIR = join(root, "data-unbound");
		const pi = new FakePi();
		const session = new ExtensionSession(pi as unknown as ExtensionAPI);
		registerCommand495(pi as unknown as ExtensionAPI, session);
		const ctx = new FakeContext(cwd, "rpc", "s-unbound");
		session.openedAt(ctx as unknown as ExtensionContext);
		try {
			await pi.command!("close q1", ctx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => m === "no binding"),
				pi.said.join(" | "),
			);
		} finally {
			await session.close();
		}
	});

	it("is refused without naming a question, saying its usage, once bound", async () => {
		const cwd = project();
		const { pi, session, ctx } = await stalledOnQ1(root, cwd);
		try {
			await pi.command!("close", ctx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => m.includes("usage: /495 close")),
				pi.said.join(" | "),
			);
		} finally {
			await session.close();
		}
	});

	it("is refused while the session is already busy, and inscribes nothing (BES-02)", async () => {
		const cwd = project();
		delete process.env.HARNESS495_LANGUAGE;
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd);
		try {
			session.busy = true;
			try {
				await pi.command!("close q1", ctx as unknown as ExtensionCommandContext);
			} finally {
				session.busy = false;
			}
			assert.equal(ctx.confirmations, 0, "the confirmation is never put to the owner while busy");
			assert.ok(
				pi.said.some((m) => m.includes("opération est déjà en cours")),
				pi.said.join(" | "),
			);
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			assert.equal(state.open_questions.find((q) => q.id === "q1")?.closed_at, null, "nothing is inscribed");
			assert.equal(state.status, "blocked", "the change stays stopped");
		} finally {
			await session.close();
		}
	});

	it("refuses a busy session in the session's own language, English included, not always in French (BES-02)", async () => {
		const cwd = project();
		process.env.HARNESS495_LANGUAGE = "en";
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd);
		try {
			assert.equal(session.lang(), "en");
			session.busy = true;
			try {
				await pi.command!("close q1", ctx as unknown as ExtensionCommandContext);
			} finally {
				session.busy = false;
			}
			assert.ok(
				pi.said.some((m) => m.includes("operation is already running")),
				pi.said.join(" | "),
			);
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			assert.equal(state.open_questions.find((q) => q.id === "q1")?.closed_at, null, "nothing is inscribed");
		} finally {
			await session.close();
		}
	});

	it("holds the session from the confirmation through the conduct of the closure, as one operation (BES-02)", async () => {
		const cwd = project();
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd);
		try {
			let busyDuringConfirm: boolean | undefined;
			ctx.onConfirm = () => {
				busyDuringConfirm = session.busy;
			};
			// A command started from any microtask between the closure's write and its conduct finds the
			// session as each sample does.
			const busyAfterWrite: boolean[] = [];
			const harness = session.runtime().harness;
			const closeQuestion = harness.closeQuestion.bind(harness);
			harness.closeQuestion = (...args) => {
				const closed = closeQuestion(...args);
				const sample = (depth: number): void => {
					busyAfterWrite.push(session.busy);
					if (depth < 10) queueMicrotask(() => sample(depth + 1));
				};
				queueMicrotask(() => sample(1));
				return closed;
			};
			// However late the conduct starts, the kernel's advance it runs finds the session held.
			const busyInAdvance: boolean[] = [];
			const advance = harness.advance.bind(harness);
			harness.advance = (...args) => {
				busyInAdvance.push(session.busy);
				return advance(...args);
			};

			await pi.command!("close q1", ctx as unknown as ExtensionCommandContext);

			assert.equal(busyDuringConfirm, true, "busy is held while the confirmation is put to the owner");
			assert.deepEqual(
				busyAfterWrite,
				Array(10).fill(true),
				"no microtask between the closure's write and its conduct finds the session free",
			);
			assert.deepEqual(busyInAdvance, [true], "the conduct of the closure runs within the hold");
			assert.ok(!pi.said.some((m) => m === session.busyRefusal()), "the conduct of the closure is not refused as busy");
			assert.equal(session.busy, false, "the session is released once the conduct ends");
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			assert.ok(state.open_questions.find((q) => q.id === "q1")?.closed_at, "the closure still inscribes");
		} finally {
			await session.close();
		}
	});

	it("is refused in a mode without a screen, saying a human origin is required, and inscribes nothing (6i)", async () => {
		const cwd = project();
		const { pi, session, changeId } = await stalledOnQ1(root, cwd);
		try {
			const jsonCtx = new FakeContext(cwd, "json", "s-question-closure");
			await pi.command!("close q1", jsonCtx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => /human origin|provenance humaine/.test(m)),
				pi.said.join(" | "),
			);
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			assert.equal(state.open_questions.find((q) => q.id === "q1")?.closed_at, null, "nothing is inscribed");
			assert.equal(state.status, "blocked", "the change stays stopped");
		} finally {
			await session.close();
		}
	});

	it("inscribes nothing and leaves the change stopped when the confirmation is refused (6k)", async () => {
		const cwd = project();
		const { pi, session, changeId } = await stalledOnQ1(root, cwd);
		try {
			const refusing = new FakeContext(cwd, "rpc", "s-question-closure", false);
			await pi.command!("close q1", refusing as unknown as ExtensionCommandContext);
			assert.equal(refusing.confirmations, 1, "the closure is put to the owner before anything is inscribed");
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			assert.equal(state.open_questions.find((q) => q.id === "q1")?.closed_at, null, "nothing is inscribed");
			assert.equal(state.status, "blocked", "the change stays stopped");
		} finally {
			await session.close();
		}
	});

	it("displays the code and the reason of a closure the kernel refuses (6j)", async () => {
		const cwd = project();
		const { pi, session, ctx } = await stalledOnQ1(root, cwd);
		try {
			await pi.command!("close not-a-question", ctx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => m.includes("495 error:") && m.includes("UNKNOWN_REFERENCE")),
				pi.said.join(" | "),
			);
		} finally {
			await session.close();
		}
	});

	it("closes the question under the human actor, confirmed, and conducts the change onward as after a resume", async () => {
		const cwd = project();
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd);
		try {
			await pi.command!("close q1", ctx as unknown as ExtensionCommandContext);
			assert.ok(!pi.said.some((m) => m.startsWith("495 error:")), pi.said.join(" | "));
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			const q1 = state.open_questions.find((q) => q.id === "q1")!;
			assert.ok(q1.closed_at, "the question is closed");
			assert.equal(q1.closed_by?.actor_id, RPC_ACTOR);
			assert.notEqual(state.stop_reason, "stagnation", "the stagnation stop the closure answers is lifted");
			// Lifting the stop is not conducting: the domain event alone leaves phase and gates untouched.
			// What only `conduct` reaches is asserted here, so removing its call after the closure (as after
			// a resume) leaves the change ready but stuck in clarifying, unnoticed by the assertions above.
			assert.equal(state.gates.G0?.verdict, "PASS", "G0 is evaluated once the closure settles the report");
			assert.ok(state.adopted.mandate, "the mandate the settled report proposes is carried to adoption");
			assert.notEqual(state.phase, "clarifying", "the change moves past clarifying, as after a resume");
		} finally {
			await session.close();
		}
	});
});

describe("the conversational tool offers no closure (BES-02, M3)", () => {
	it("is pinned to its seven operations: none decides, adopts or closes", () => {
		let captured: { parameters: { properties: { operation: { enum: string[] } } } } | undefined;
		const pi = {
			registerTool: (def: unknown) => {
				captured = def as typeof captured;
			},
		};
		registerTool495(pi as unknown as ExtensionAPI, {} as unknown as ExtensionSession);
		assert.ok(captured, "the tool is registered");
		const ops = captured!.parameters.properties.operation.enum;
		assert.deepEqual(
			[...ops].sort(),
			["export", "list_pending_decisions", "report", "review_summary", "start", "status", "verify"].sort(),
		);
		for (const forbidden of ["decide", "adopt", "close", "cancel", "resume", "pause", "revoke"])
			assert.equal(ops.includes(forbidden), false, `${forbidden} must not be an operation of harness495`);
	});
});
