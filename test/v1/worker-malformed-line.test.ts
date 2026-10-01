import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { collect, fakeWorkerAgent, mandate } from "../helpers/intervention-fixture.ts";
import { removedAfterEach, outputDir } from "../helpers/fixtures.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("malformed-", cleanups);
});

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
