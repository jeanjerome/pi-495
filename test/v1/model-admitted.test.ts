import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";
import { DomainError } from "../../src/domain/errors.ts";
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
		writeFileSync(join(root, "config.json"), JSON.stringify({ language: "en" }));
		assert.deepEqual(loadConfig(root).diagnostics, [], "a file with no policy section has nothing to announce either");
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

	/** Refused as a configuration error, naming neither the marker the file carries nor where it lies. */
	const refusedWithoutEcho = (marker: string, label: string): void => {
		assert.throws(
			() => loadConfig(root),
			(error: unknown) => {
				assert.ok(error instanceof DomainError, `${label}: ${String(error)}`);
				assert.equal(error.code, "CONFIGURATION_ERROR");
				assert.match(error.message, /no change runs/, "a human decision the file may keep is not handed to the kernel");
				assert.equal(
					error.message.includes(marker),
					false,
					`the refusal is sent to the session's model, so an excerpt of the file would leave with it: ${error.message}`,
				);
				assert.equal(error.message.includes(root), false, `the path reaches the model's context: ${error.message}`);
				return true;
			},
			label,
		);
	};

	it("refuses an unreadable file instead of running under the defaults, without reproducing any of its text", () => {
		const marker = "k7f3a9";
		const bodies = [
			`{ not json ${marker}`,
			`{"policy":{"adoption":{"design":"human"},"egress":[{"provider_id":${marker}}]}}`,
			`["${marker}"]`,
			`"${marker}"`,
			"5",
			"null",
			`{"policy":"${marker}"}`,
			`{"policy":{"adoption":["${marker}"]}}`,
			`{"policy":{"budgets":"${marker}"}}`,
			'{"policy":{"budgets":null}}',
			`{"isolation":["${marker}"]}`,
			`{"human_origin":"${marker}"}`,
		];
		for (const body of bodies) {
			writeFileSync(join(root, "config.json"), body);
			refusedWithoutEcho(marker, body);
		}
	});

	it("refuses a file it cannot open, a dangling link included, without naming where it lies", () => {
		const path = join(root, "config.json");
		writeFileSync(path, "{}");
		chmodSync(path, 0o000);
		refusedWithoutEcho(root, "unreadable permissions");
		rmSync(path, { force: true });
		symlinkSync(join(root, "moved-away", "config.json"), path);
		refusedWithoutEcho(root, "a link whose target is gone is a file that cannot be opened, not an absent one");
	});

	it("refuses a file in a directory it cannot search, without naming where it lies", {
		skip: process.getuid?.() === 0,
	}, () => {
		writeFileSync(join(root, "config.json"), "{}");
		chmodSync(root, 0o600);
		try {
			refusedWithoutEcho(root, "whether the file is there cannot even be asked");
		} finally {
			chmodSync(root, 0o700);
		}
	});

	it("refuses a named pipe instead of waiting for something to write to it", () => {
		execFileSync("mkfifo", [join(root, "config.json")]);
		// Opening a pipe blocks until a writer comes, which would hold the session's start for good;
		// the read runs in a child so that a regression fails here instead of stalling the suite.
		const loader = pathToFileURL(join(process.cwd(), "src", "extension", "config.ts")).href;
		const read = spawnSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				`import { loadConfig } from ${JSON.stringify(loader)};
				try { loadConfig(${JSON.stringify(root)}); console.log("loaded"); }
				catch (error) { console.log(\`\${error.code}: \${error.message}\`); }`,
			],
			{ encoding: "utf8", timeout: 10_000 },
		);
		assert.equal(read.signal, null, "the read returned instead of waiting");
		assert.match(read.stdout, /^CONFIGURATION_ERROR: config\.json cannot be read: /, read.stderr);
		assert.equal(read.stdout.includes(root), false, `the path reaches the model's context: ${read.stdout}`);
	});
});
