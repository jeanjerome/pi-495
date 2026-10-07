/**
 * V3 — when a conduct of the change stops, the message the owner reads is the status of the change;
 * the phase transitions it went through stay in the journal. The agent is scripted and no model is
 * called.
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { FakeContext, FakePi, HARNESS_ENV, RPC_ACTOR, commandProject } from "../helpers/command-fixture.ts";
import { NO_QUALIFIED_SANDBOX, outputDir, removedAfterEach } from "../helpers/fixtures.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("conduct-end-message-", cleanups);
});

const SPEC = {
	objective: "tidy greet",
	facts: [],
	assumptions: [],
	questions: [],
	answers: [],
	out_of_scope: [],
	risks: [],
	requirements: [
		{
			requirement_id: "R1",
			statement: "greet unchanged",
			mandatory: true,
			criterion: "tests pass",
			category: "functional",
			satisfied_by_reference: true,
		},
	],
	design: { summary: "touch src/greet.js", components: [], interfaces: [], risks: [] },
};

/** An agent that specifies `SPEC` in every role, and implements by rewriting greet without changing it. */
function scriptedAgent(): string {
	const path = join(root, "agent.json");
	writeFileSync(
		path,
		JSON.stringify({
			default: { steps: [{ kind: "complete", output: SPEC }] },
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
							output: { summary: "d", changed_paths: ["src/greet.js"], tests_claimed: false, notes: [] },
						},
					],
				},
			},
		}),
	);
	return path;
}

describe("the message a conduct of the change ends on", () => {
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

	it("un /495 start qu'un agent scripté conduit jusqu'à l'acceptation affiche un dernier message dont la deuxième ligne est ✔ Accepted on attempt 1 of 3 et qui ne contient aucune ligne de la forme <phase> -> <phase>/<status>", async () => {
		process.env.HARNESS495_DATA_DIR = join(root, "data");
		process.env.HARNESS495_SCRIPTED_AGENT = scriptedAgent();
		process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
		process.env.HARNESS495_LANGUAGE = "en";
		if (NO_QUALIFIED_SANDBOX) process.env.HARNESS495_ALLOW_UNCONFINED = "1";
		const pi = new FakePi();
		const session = new ExtensionSession(pi.host());
		registerCommand495(pi.host(), session);
		const ctx = new FakeContext(commandProject("495-conduct-end-message-", cleanups), "rpc", "s-conduct-end");
		session.openedAt(ctx.asCommand());

		await pi.run("start tidy greet without behaviour change", ctx);

		const last = pi.said.at(-1) ?? "";
		assert.equal(last.split("\n")[1], "✔ Accepted on attempt 1 of 3", pi.said.join("\n---\n"));
		assert.doesNotMatch(last, /^\S+ -> \S+\/\S+$/m, last);
	});
});
