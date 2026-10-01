import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { collect, fakeWorkerAgent, mandate } from "../helpers/intervention-fixture.ts";

let root: string;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "malformed-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("a malformed worker line is ignored without bringing down the host process", () => {
	it('a worker that writes {"type":"event"} then completes has its events relayed started, tool_started, tool_finished, completed', async () => {
		const events = await collect((await fakeWorkerAgent().startIntervention(mandate("malformed-event", root))).events);
		assert.deepEqual(
			events.map((e) => e.type),
			["started", "tool_started", "tool_finished", "completed"],
		);
	});
	it("a worker that writes null then completes has its events end with completed", async () => {
		const events = await collect((await fakeWorkerAgent().startIntervention(mandate("malformed-null", root))).events);
		assert.equal(events.at(-1)?.type, "completed");
	});
});
