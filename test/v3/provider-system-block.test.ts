/**
 * V3 — the control that relates a story's declaration to a real dependency (D-48, e23s02 task 4).
 * No model is called: this reads files, the pinned package first and synthetic fixtures next, so
 * the pass and refuse paths are exercised deterministically without waiting on a provider to change
 * its own package between two runs.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { imposedLayersFor } from "../../src/domain/imposed-layers.ts";

const SCRIPT = join(process.cwd(), "scripts", "check-provider-system-block.ts");
const DECLARED = imposedLayersFor("anthropic")[0]!.text;

function run(packageDir: string): { code: number | null; stdout: string; stderr: string } {
	const r = spawnSync(process.execPath, [SCRIPT, packageDir], { encoding: "utf8", timeout: 20_000 });
	return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/**
 * The shape the installed Pi package builds its request in: a ternary — under any name, `condition`
 * defaults to the real one's `isOAuthToken2` — the provider's block first, 495's own system text
 * pushed second, and the token-prefix check the declared condition names.
 */
function shaped(text: string, condition = "isOAuthToken2"): string {
	return `function ${condition}(k){return k.includes("sk-ant-oat")}var x=1;${condition}?(params.system=[{type:"text",text:"${text}",...cacheControl?{cache_control:cacheControl}:{}}],initialSystemText&&params.system.push({type:"text",text:sanitizeSurrogates(initialSystemText)})):initialSystemText&&(params.system=[{type:"text",text:sanitizeSurrogates(initialSystemText)}]);`;
}

function fixture(root: string, files: Record<string, string>): void {
	for (const [path, content] of Object.entries(files)) {
		const full = join(root, "dist", path);
		mkdirSync(join(full, ".."), { recursive: true });
		writeFileSync(full, content);
	}
}

let root: string;
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "495-provider-block-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("provider system block control (CTX-02, D-48)", () => {
	it("passes on the Pi package this repository actually depends on", () => {
		const real = join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent");
		const result = run(real);
		assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
	});

	it("passes when the fixture package carries the declared text, under the declared condition and position", () => {
		fixture(root, { "bundle/chunks/a.js": shaped(DECLARED) });
		const result = run(root);
		assert.equal(result.code, 0, result.stderr);
	});

	it("refuses when the detected text differs from the declaration, and names both (6d)", () => {
		fixture(root, { "bundle/chunks/a.js": shaped("You are a different assistant entirely.") });
		const result = run(root);
		assert.notEqual(result.code, 0);
		assert.match(result.stderr, /different assistant/);
		assert.match(result.stderr, new RegExp(DECLARED.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	});

	it("refuses when no detectable block is found (6e)", () => {
		fixture(root, { "bundle/chunks/a.js": "var x = 1;\nfunction f() { return x; }\n" });
		const result = run(root);
		assert.notEqual(result.code, 0);
		assert.match(result.stderr, /no detectable block/i);
	});

	it("refuses on more than one detectable block, rather than trusting the first (§14)", () => {
		fixture(root, {
			"bundle/chunks/a.js": shaped(DECLARED),
			"bundle/chunks/b.js": shaped(DECLARED),
		});
		const result = run(root);
		assert.notEqual(result.code, 0);
		// Anchored on the count phrase, not a bare digit: an unanchored /2|two/i also matches a
		// filesystem path that happens to contain a "2" (review round 1, reviewer B, reproduced —
		// it passed on a message reporting 3 blocks because the fixture's own path held a "2").
		assert.match(result.stderr, /\b2 detectable blocks\b/);
	});

	it("passes when the ternary's condition is renamed by a cosmetic rebuild (review round 1)", () => {
		fixture(root, { "bundle/chunks/a.js": shaped(DECLARED, "Ke") });
		const result = run(root);
		assert.equal(result.code, 0, result.stderr);
	});

	it("refuses when the declared condition's token prefix cannot be found, even with text and shape intact", () => {
		fixture(root, {
			"bundle/chunks/a.js": `var x=1;isOAuthToken2?(params.system=[{type:"text",text:"${DECLARED}"}],initialSystemText&&params.system.push({type:"text",text:sanitizeSurrogates(initialSystemText)})):0;`,
		});
		const result = run(root);
		assert.notEqual(result.code, 0);
		assert.match(result.stderr, /sk-ant-oat/);
		assert.match(result.stderr, /condition.*could not be confirmed/);
	});

	it("refuses when the package directory itself does not exist", () => {
		const result = run(join(root, "not-there"));
		assert.notEqual(result.code, 0);
	});
});
