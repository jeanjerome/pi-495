/**
 * V3 — two Pi sessions opened on the same data directory are two producers: each runtime conducts a
 * change under its own session, so the second is refused while the first holds the change (§12.1).
 */
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ExtensionSession } from "../../src/extension/session.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { FakeContext, FakePi } from "../helpers/command-fixture.ts";
import { removedAfterEach, outputDir } from "../helpers/fixtures.ts";

let root: string;
let saved: string | undefined;
beforeEach(() => {
	root = outputDir("two-sessions-", cleanups);
	saved = process.env.HARNESS495_DATA_DIR;
	process.env.HARNESS495_DATA_DIR = join(root, "data");
});
afterEach(() => {
	if (saved === undefined) delete process.env.HARNESS495_DATA_DIR;
	else process.env.HARNESS495_DATA_DIR = saved;
});
/** Registered after the teardown above, so the directories are removed once it has run. */
const cleanups = removedAfterEach();

function started(sessionId: string): ExtensionSession {
	const session = new ExtensionSession(new FakePi().host());
	session.openedAt(new FakeContext(root, "rpc", sessionId).asCommand());
	return session;
}

describe("two Pi sessions on the same data directory", () => {
	it("refuse the second session with OPERATION_ACTIVE while the first conducts the change", async () => {
		const first = started("pi-session-1");
		const second = started("pi-session-2");
		try {
			await first.runtime().harness.conducting("chg_shared", async () => {
				await assert.rejects(
					second.runtime().harness.conducting("chg_shared", async () => undefined),
					(error: unknown) => error instanceof DomainError && error.code === "OPERATION_ACTIVE",
					"the second session's runtime holds the change under a session of its own",
				);
			});
		} finally {
			await first.close();
			await second.close();
		}
	});
});
