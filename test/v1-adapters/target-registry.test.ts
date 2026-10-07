import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { detectStack } from "../../src/application/target.ts";
import type { StackAdapter, StackDetection } from "../../src/application/stacks/stack.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { tempDir, writeFiles, removedAfterEach } from "../helpers/fixtures.ts";
import { controlOf } from "../helpers/execution-fixture.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const NODE = process.execPath;
const REFS = [{ requirement_id: "R1", revision: 1 }];

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-target-registry-", cleanups);
});

function project(files: Record<string, string>): string {
	const path = join(root, "target");
	writeFiles(path, files);
	return path;
}

function control(stack: string): ControlDefinition {
	return controlOf({
		control_id: `${stack}-test`,
		title: `${stack} test suite`,
		env_allowlist: [],
		timeout_ms: 1000,
		requirement_refs: REFS,
	});
}

function adapter(stack: string, signalFile: string, missing: string): StackAdapter {
	const detection: StackDetection = {
		stack,
		facts: { adapter: stack },
		controls: [control(stack)],
		lint_control_ids: [],
		positive_witness: {},
		witness_tests: 0,
		negative_witness: {},
		own_negative_witness: {},
		preparation_paths: [],
		capability_missing: [missing],
		recommendations: [],
	};
	return { stack, signal_files: [signalFile], readers: [], detect: () => detection };
}

describe("Target registry: the adapter list chooses the stack", () => {
	it("given a project holding Cargo.toml and a list that gains an adapter declaring that file, then the detection is the adapter's", () => {
		const cargo = adapter("cargo", "Cargo.toml", "cargo qualification pending");
		const detection = detectStack([cargo], project({ "Cargo.toml": "[package]" }), REFS, NODE);
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
		assert.equal(detectStack([cargo, go], path, REFS, NODE).stack, "cargo");
		assert.equal(detectStack([go, cargo], path, REFS, NODE).stack, "go");
	});

	it("given a project no adapter recognises, then the stack is unknown and the missing capability names the files the list declares", () => {
		const list = [adapter("cargo", "Cargo.toml", "cargo"), adapter("go", "go.mod", "go")];
		const detection = detectStack(list, project({ "README.md": "" }), REFS, NODE);
		assert.equal(detection.stack, "unknown");
		assert.deepEqual(detection.controls, []);
		assert.equal(detection.capability_missing.length, 1);
		assert.match(detection.capability_missing[0] ?? "", /no qualified target adapter/);
		assert.match(detection.capability_missing[0] ?? "", /Cargo\.toml or go\.mod expected/);
	});

	it("given the list of 495, then package.json gives node, pom.xml gives maven, both give maven, and neither names pom.xml or package.json as expected", () => {
		const node = detectStack(
			STACKS_OF_495,
			project({ "package.json": '{"scripts":{"test":"node --test"}}' }),
			REFS,
			NODE,
		);
		assert.equal(node.stack, "node");
		assert.ok(node.controls.some((c) => c.control_id === "unit"));
		rmSync(join(root, "target"), { recursive: true });

		const maven = detectStack(STACKS_OF_495, project({ "pom.xml": "<project/>" }), REFS, NODE);
		assert.equal(maven.stack, "maven");
		assert.ok(maven.controls.some((c) => c.control_id === "maven-test"));
		rmSync(join(root, "target"), { recursive: true });

		const both = detectStack(
			STACKS_OF_495,
			project({ "pom.xml": "<project/>", "package.json": '{"scripts":{"test":"node --test"}}' }),
			REFS,
			NODE,
		);
		assert.equal(both.stack, "maven");
		assert.ok(!both.controls.some((c) => c.control_id === "unit"), "no Node control is declared for a Maven project");
		rmSync(join(root, "target"), { recursive: true });

		const none = detectStack(STACKS_OF_495, project({ "README.md": "" }), REFS, NODE);
		assert.equal(none.stack, "unknown");
		assert.match(none.capability_missing.join(" "), /pom\.xml or package\.json expected/);
	});
});
