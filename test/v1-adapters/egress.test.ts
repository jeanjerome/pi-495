import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildContext } from "../../src/application/context.ts";
import type { InterventionEvent } from "../../src/ports/execution.ts";
import { collect, fakeWorkerAgent, mandate } from "../helpers/intervention-fixture.ts";

describe("what the worker process receives from the controller's own environment (SEC-05, D-11)", () => {
	it("hands it a closed set of variables, carrying no secret of the controller", async () => {
		const leaked = "HARNESS495_TEST_SENTINEL";
		process.env[leaked] = "sk-controller-secret-do-not-leak";
		try {
			const handle = await fakeWorkerAgent(2000).startIntervention(mandate("echo-env", process.cwd()));
			const events = await collect(handle.events);
			const completed = events.find(
				(e): e is Extract<InterventionEvent, { type: "completed" }> => e.type === "completed",
			);
			assert.ok(completed, `the worker never completed: ${JSON.stringify(events)}`);
			const env = (completed.output as { env?: Record<string, string> }).env;
			assert.ok(env, "the fake worker did not report an environment to inspect");
			assert.equal(env[leaked], undefined, "a secret set in the controller's environment reached the worker");
			// The whole key set, not just the sentinel: the failure this guards against is any controller
			// variable riding along, not one named in advance. macOS injects __CF_USER_TEXT_ENCODING into
			// every child below the spawn call — the harness does not carry it, and naming it here says so
			// rather than letting a loose assertion hide whatever else might arrive.
			const injectedByPlatform = ["__CF_USER_TEXT_ENCODING"];
			assert.deepEqual(
				Object.keys(env)
					.filter((k) => !injectedByPlatform.includes(k))
					.sort(),
				// PATH and HOME are set unconditionally by the supervisor; only TMPDIR is conditional.
				["HOME", "PATH", ...(process.env.TMPDIR === undefined ? [] : ["TMPDIR"])].sort(),
				"the worker environment is built from a closed list, never from the controller's own",
			);
		} finally {
			delete process.env[leaked];
		}
	});
});

describe("what the context builder can put in a prompt (SEC-05, CTX-05)", () => {
	it("composes only from what it was handed, carrying no value of the controller's environment", () => {
		const planted = {
			HARNESS495_TEST_TOKEN: "sk-planted-controller-token-0001",
			HARNESS495_TEST_PATHLIKE: "/planted/controller/path/0002",
		};
		Object.assign(process.env, planted);
		try {
			const { system_prompt, prompt, record } = buildContext({
				role: "implement",
				objective: "tidy the greeter",
				language: "fr",
				adopted: [{ kind: "mandate", artifact_id: "art_1", revision: 1, digest: "sha256:x", text: "ADOPTED-MARKER" }],
				untrusted: [{ source: "repo", text: "UNTRUSTED-MARKER" }],
				feedback: "FEEDBACK-MARKER",
				tools: ["read"],
				budget_bytes: 100_000,
				imposed_layers: [],
			});
			const composed = `${system_prompt}\n${prompt}\n${record}`;
			// Not a tautology: the markers prove the text really is composed from the input, so the
			// absence of the planted values below says something about what was left out.
			for (const marker of ["ADOPTED-MARKER", "UNTRUSTED-MARKER", "FEEDBACK-MARKER"])
				assert.ok(composed.includes(marker), `the composed context dropped ${marker}, so this test proves nothing`);
			for (const [name, value] of Object.entries(planted))
				assert.equal(composed.includes(value), false, `the composed context carries the value of ${name}`);
		} finally {
			for (const name of Object.keys(planted)) delete process.env[name];
		}
	});
});
