import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadConfig } from "../../src/extension/config.ts";

/** A provider name no default carries, so finding it in a diagnostic can only mean it was echoed. */
const PRIVATE_PROVIDER = "provider-kept-private-7f3a";

describe("a configuration that neither admits nor refuses a provider (SEC-05)", () => {
	let root: string;
	beforeEach(() => {
		mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
		root = mkdtempSync(join(process.cwd(), "test-output", "model-admitted-"));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const configured = (policy: unknown): string => {
		writeFileSync(join(root, "config.json"), JSON.stringify({ policy }));
		return root;
	};
	const ignoredKey = (diagnostics: string[]): string[] =>
		diagnostics.filter((d) => d.includes("policy.egress") && d.includes("no longer read"));

	it("loads without a file, with no list and nothing said about the model", () => {
		const { config, diagnostics } = loadConfig(root);
		assert.equal("egress" in config.policy, false, "no destination is defaulted for this machine or any other");
		assert.deepEqual(diagnostics, [], "a session opened without configuration has nothing to announce");
	});

	it("loads a file that does not name policy.egress without announcing anything", () => {
		const { config, diagnostics } = loadConfig(configured({ budgets: { max_attempts: 5 } }));
		assert.equal(config.policy.budgets.max_attempts, 5);
		assert.deepEqual(diagnostics, []);
	});

	it("ignores a policy.egress left in the file, applies the rest, and says so without echoing it", () => {
		const { config, diagnostics } = loadConfig(
			configured({
				egress: [{ provider_id: PRIVATE_PROVIDER, location: "off_machine" }],
				budgets: { max_attempts: 5 },
			}),
		);
		assert.equal("egress" in config.policy, false, "a key that is no longer read must not ride along in the policy");
		assert.equal(config.policy.budgets.max_attempts, 5, "the other settings of the file still apply");
		assert.equal(
			ignoredKey(diagnostics).length,
			1,
			`whoever wrote the list must learn it restricts nothing: ${diagnostics.join(" | ")}`,
		);
		assert.match(ignoredKey(diagnostics)[0] ?? "", /model selected in Pi/, "the diagnostic says what is used instead");
		assert.equal(
			diagnostics.some((d) => d.includes(PRIVATE_PROVIDER)),
			false,
			"a diagnostic reaches the display, the structured entries and the model's context; it does not reproduce the key",
		);
	});

	it("ignores a malformed policy.egress the same way, whatever its form", () => {
		const { diagnostics: forAList } = loadConfig(configured({ egress: [{ provider_id: "omlx" }] }));
		for (const value of [[], "omlx", { provider_id: "omlx" }, null, 5]) {
			const { config, diagnostics } = loadConfig(configured({ egress: value }));
			assert.equal("egress" in config.policy, false, `${JSON.stringify(value)} must not reach the policy`);
			assert.deepEqual(
				diagnostics,
				forAList,
				`${JSON.stringify(value)} is announced word for word as a list is, so nothing of it is reproduced`,
			);
		}
	});

	it("says an unreadable file is ignored, without claiming any intervention is refused", () => {
		for (const body of ["{ not json", "[]", '"omlx"', "5", "null"]) {
			writeFileSync(join(root, "config.json"), body);
			const { config, diagnostics } = loadConfig(root);
			assert.equal("egress" in config.policy, false);
			assert.equal(
				diagnostics.length,
				1,
				`there is no list left whose absence would refuse: ${diagnostics.join(" | ")}`,
			);
			assert.ok(diagnostics[0]?.startsWith("config.json ignored"), `${body}: ${diagnostics.join(" | ")}`);
		}
	});

	it("says an unreadable file is ignored without reproducing any of its text", () => {
		const unquoted = "k7f3a9";
		writeFileSync(join(root, "config.json"), `{"policy":{"egress":[{"provider_id":${unquoted}}]}}`);
		const { diagnostics } = loadConfig(root);
		assert.equal(diagnostics.length, 1, diagnostics.join(" | "));
		assert.equal(
			diagnostics.some((d) => d.includes(unquoted)),
			false,
			`a diagnostic is sent to the session's model, so an excerpt of the file would leave with it: ${diagnostics[0]}`,
		);
	});
});
