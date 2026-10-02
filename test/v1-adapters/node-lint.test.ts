import { strict as assert } from "node:assert";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { detectStack } from "../../src/application/target.ts";
import { tempDir, writeFiles, removedAfterEach } from "../helpers/fixtures.ts";

const NODE = process.execPath;
const REFS = [{ requirement_id: "R1", revision: 1 }];

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-node-lint-", cleanups);
});

function targetWithLint(lint: unknown): string {
	const project = join(root, "target");
	writeFiles(project, {
		"package.json": JSON.stringify({ name: "t", type: "module", scripts: { test: "node --test", lint } }),
	});
	return project;
}

describe("Node stack: the lint control follows scripts.lint", () => {
	it("given scripts.lint is eslint . && prettier --check ., when the stack is detected, then no lint control is declared, the unit control is kept, and the missing capabilities name scripts.lint chains commands through a shell", () => {
		const detection = detectStack(targetWithLint("eslint . && prettier --check ."), REFS, NODE);
		assert.equal(
			detection.controls.find((c) => c.control_id === "lint"),
			undefined,
			"the detection declares no lint control",
		);
		assert.ok(
			detection.controls.some((c) => c.control_id === "unit"),
			"the detection declares the unit control",
		);
		assert.ok(
			detection.capability_missing.includes(
				"scripts.lint chains commands through a shell (eslint . && prettier --check .), which 495 cannot run",
			),
			`the missing capabilities name scripts.lint: ${detection.capability_missing.join(" | ")}`,
		);
	});

	it("given scripts.lint is node scripts/lint.js, when the stack is detected, then a lint control runs the Node binary on scripts/lint.js and no missing capability names scripts.lint", () => {
		const detection = detectStack(targetWithLint("node scripts/lint.js"), REFS, NODE);
		const lint = detection.controls.find((c) => c.control_id === "lint");
		assert.ok(lint, "the detection declares a lint control");
		assert.deepEqual(lint.command, [NODE, "scripts/lint.js"]);
		assert.ok(
			!detection.capability_missing.some((line) => line.includes("scripts.lint")),
			`no missing capability names scripts.lint: ${detection.capability_missing.join(" | ")}`,
		);
	});

	it("given scripts.lint is the number 42, when the stack is detected, then the unit control is declared and no lint control", () => {
		const ids = detectStack(targetWithLint(42), REFS, NODE).controls.map((c) => c.control_id);
		assert.ok(ids.includes("unit"), "the detection declares the unit control");
		assert.ok(!ids.includes("lint"), "the detection declares no lint control");
	});
});
