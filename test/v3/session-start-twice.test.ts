/**
 * V3 — one 495 session per Pi session, however many times Pi says it started (UX-02). Pi's RPC mode
 * emits `session_start` twice on the same extension for `new_session`, `switch_session`, `fork` and
 * `clone`: the runtime is created once, and a start that failed stays failed.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ExtensionSession } from "../../src/extension/session.ts";

/** The part of Pi's extension context session start reads, for a client with no screen. */
class FakeStartContext {
	readonly mode = "rpc";
	readonly hasUI = false;
	readonly model = undefined;
	readonly thinkingLevel = "off";
	readonly modelRegistry = null;
	readonly sessionManager = { getSessionId: (): string => "session-twice" };
	readonly cwd: string;
	constructor(cwd: string) {
		this.cwd = cwd;
	}
}

let root: string;
let saved: string | undefined;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "start-twice-"));
	saved = process.env.HARNESS495_DATA_DIR;
	process.env.HARNESS495_DATA_DIR = join(root, "data");
});
afterEach(() => {
	if (saved === undefined) delete process.env.HARNESS495_DATA_DIR;
	else process.env.HARNESS495_DATA_DIR = saved;
	rmSync(root, { recursive: true, force: true });
});

function started(session: ExtensionSession): void {
	session.openedAt(new FakeStartContext(root) as unknown as ExtensionContext);
}

describe("a session started twice by Pi", () => {
	it("keeps the runtime of its first start, and closes it on shutdown", async () => {
		const session = new ExtensionSession({} as ExtensionAPI);
		started(session);
		const first = session.runtime();
		started(session);
		assert.equal(session.runtime(), first, "the second start creates no second runtime");
		await session.close();
		assert.throws(() => first.ledger.getSessionBinding("session-twice"), "the ledger it opened is closed");
	});

	it("keeps refusing after a failed start, even when the file is repaired before the second", () => {
		mkdirSync(process.env.HARNESS495_DATA_DIR!, { recursive: true });
		const configPath = join(process.env.HARNESS495_DATA_DIR!, "config.json");
		writeFileSync(configPath, "{ not json");
		const session = new ExtensionSession({} as ExtensionAPI);
		started(session);
		writeFileSync(configPath, "{}");
		started(session);
		assert.throws(() => session.runtime(), /config\.json cannot be read/);
	});
});
