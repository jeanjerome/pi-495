import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { detectStack } from "../../src/application/target.ts";
import type { StackAdapter, StackDetection } from "../../src/application/stacks/stack.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { tempDir, writeFiles } from "../helpers/fixtures.ts";

const NODE = process.execPath;
const REFS = [{ requirement_id: "R1", revision: 1 }];

let root: string;
beforeEach(() => {
	root = tempDir("495-target-registry-");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function project(files: Record<string, string>): string {
	const path = join(root, "target");
	writeFiles(path, files);
	return path;
}

function control(stack: string): ControlDefinition {
	return {
		control_id: `${stack}-test`,
		version: "1",
		title: `${stack} test suite`,
		command: [NODE, "-e", ""],
		cwd: ".",
		env_allowlist: [],
		env: {},
		timeout_ms: 1000,
		parser: "exit-code",
		report_path: null,
		structure_rules: [],
		provides: [],
		requires: [],
		scope_argument: null,
		network: "denied",
		writable_paths: [],
		requirement_refs: REFS,
		protected: true,
		protected_paths: [],
	};
}

function adapter(stack: string, signalFile: string, missing: string): StackAdapter {
	const detection: StackDetection = {
		stack,
		facts: { adapter: stack },
		controls: [control(stack)],
		positive_witness: {},
		witness_tests: 0,
		negative_witness: {},
		own_negative_witness: {},
		preparation_paths: [],
		capability_missing: [missing],
	};
	return { stack, signal_files: [signalFile], detect: () => detection };
}

describe("Target registry: the adapter list chooses the stack", () => {
	it("given a project holding Cargo.toml and a list that gains an adapter declaring that file, then the detection is the adapter's", () => {
		const cargo = adapter("cargo", "Cargo.toml", "cargo qualification pending");
		const detection = detectStack(project({ "Cargo.toml": "[package]" }), REFS, NODE, [cargo]);
		assert.equal(detection.stack, "cargo");
		assert.deepEqual(detection.facts, { adapter: "cargo" });
		assert.deepEqual(
			detection.controls.map((c) => c.control_id),
			["cargo-test"],
		);
		assert.deepEqual(detection.capability_missing, ["cargo qualification pending"]);
	});

	it("given two adapters that both recognise a project, then the first of the list wins and the reverse order gives the second", () => {
		const cargo = adapter("cargo", "Cargo.toml", "cargo");
		const go = adapter("go", "go.mod", "go");
		const path = project({ "Cargo.toml": "", "go.mod": "" });
		assert.equal(detectStack(path, REFS, NODE, [cargo, go]).stack, "cargo");
		assert.equal(detectStack(path, REFS, NODE, [go, cargo]).stack, "go");
	});

	it("given a project no adapter recognises, then the stack is unknown and the missing capability names the files the list declares", () => {
		const list = [adapter("cargo", "Cargo.toml", "cargo"), adapter("go", "go.mod", "go")];
		const detection = detectStack(project({ "README.md": "" }), REFS, NODE, list);
		assert.equal(detection.stack, "unknown");
		assert.deepEqual(detection.controls, []);
		assert.equal(detection.capability_missing.length, 1);
		assert.match(detection.capability_missing[0] ?? "", /no qualified target adapter/);
		assert.match(detection.capability_missing[0] ?? "", /Cargo\.toml or go\.mod expected/);
	});

	it("given the default list, then package.json gives node, pom.xml gives maven, both give maven, and neither names pom.xml or package.json as expected", () => {
		const node = detectStack(project({ "package.json": '{"scripts":{"test":"node --test"}}' }), REFS, NODE);
		assert.equal(node.stack, "node");
		assert.ok(node.controls.some((c) => c.control_id === "unit"));
		rmSync(join(root, "target"), { recursive: true });

		const maven = detectStack(project({ "pom.xml": "<project/>" }), REFS, NODE);
		assert.equal(maven.stack, "maven");
		assert.ok(maven.controls.some((c) => c.control_id === "maven-test"));
		rmSync(join(root, "target"), { recursive: true });

		const both = detectStack(
			project({ "pom.xml": "<project/>", "package.json": '{"scripts":{"test":"node --test"}}' }),
			REFS,
			NODE,
		);
		assert.equal(both.stack, "maven");
		assert.ok(!both.controls.some((c) => c.control_id === "unit"), "no Node control is declared for a Maven project");
		rmSync(join(root, "target"), { recursive: true });

		const none = detectStack(project({ "README.md": "" }), REFS, NODE);
		assert.equal(none.stack, "unknown");
		assert.match(none.capability_missing.join(" "), /pom\.xml or package\.json expected/);
	});
});
