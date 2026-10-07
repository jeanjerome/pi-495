import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import type { DetectedTechnology } from "../../src/application/stacks/stack.ts";
import type { Offer, StackPlugin } from "../../src/application/stacks/plugin.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type { ReportReader } from "../../src/ports/execution.ts";
import { tempDir, writeFiles, removedAfterEach } from "../helpers/fixtures.ts";
import { controlOf } from "../helpers/execution-fixture.ts";
import { registryOf, STACKS_OF_495 } from "../helpers/technologies.ts";

const NODE = process.execPath;
const REFS = [{ requirement_id: "R1", revision: 1 }];

/** A reader that is never asked to read: only its traits are looked at. */
const READER: ReportReader = {
	id: "unused",
	version: "1.0.0",
	nature: null,
	differential: false,
	located: false,
	read: () => Promise.reject(new Error("not read")),
};

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

/** A technology recognised by `signalFile` that offers its tests alone. */
function signalledTechnology(stack: string, signalFile: string): StackPlugin<true> {
	return {
		id: stack,
		signal_files: [signalFile],
		recognise: (view) => (view.exists(signalFile) ? true : null),
		facts: () => ({ technology: stack }),
		readers: [],
		capabilities: {
			tests: {
				offer: () => ({ kind: "available", controls: [control(stack)] }),
				positiveWitness: () => ({}),
				negativeWitness: () => ({}),
				preparationPaths: () => [],
			},
		},
	};
}

describe("the registry of technologies: their list chooses the stack", () => {
	it("given a project holding Cargo.toml and a list that gains a technology declaring that file, then the detection is that technology's", () => {
		const cargo = signalledTechnology("cargo", "Cargo.toml");
		const detection = registryOf([cargo]).recognise(project({ "Cargo.toml": "[package]" }), REFS, NODE);
		assert.equal(detection.stack, "cargo");
		assert.deepEqual(detection.facts, { technology: "cargo" });
		assert.deepEqual(
			detection.controls.map((c) => c.control_id),
			["cargo-test"],
		);
	});

	it("given two technologies that both recognise a project, then the first of the list wins and the reverse order gives the second", () => {
		const cargo = signalledTechnology("cargo", "Cargo.toml");
		const go = signalledTechnology("go", "go.mod");
		const path = project({ "Cargo.toml": "", "go.mod": "" });
		assert.equal(registryOf([cargo, go]).recognise(path, REFS, NODE).stack, "cargo");
		assert.equal(registryOf([go, cargo]).recognise(path, REFS, NODE).stack, "go");
	});

	it("given a project no technology recognises, then the stack is unknown and the missing capability names the files the list declares", () => {
		const list = [signalledTechnology("cargo", "Cargo.toml"), signalledTechnology("go", "go.mod")];
		const detection = registryOf(list).recognise(project({ "README.md": "" }), REFS, NODE);
		assert.equal(detection.stack, "unknown");
		assert.deepEqual(detection.controls, []);
		assert.equal(detection.capability_missing.length, 1);
		assert.match(detection.capability_missing[0] ?? "", /no qualified target adapter/);
		assert.match(detection.capability_missing[0] ?? "", /Cargo\.toml or go\.mod expected/);
	});

	it("given the list of 495, then package.json gives node, pom.xml gives maven, both give maven, and neither names pom.xml or package.json as expected", () => {
		const node = STACKS_OF_495.recognise(project({ "package.json": '{"scripts":{"test":"node --test"}}' }), REFS, NODE);
		assert.equal(node.stack, "node");
		assert.ok(node.controls.some((c) => c.control_id === "unit"));
		rmSync(join(root, "target"), { recursive: true });

		const maven = STACKS_OF_495.recognise(project({ "pom.xml": "<project/>" }), REFS, NODE);
		assert.equal(maven.stack, "maven");
		assert.ok(maven.controls.some((c) => c.control_id === "maven-test"));
		rmSync(join(root, "target"), { recursive: true });

		const both = STACKS_OF_495.recognise(
			project({ "pom.xml": "<project/>", "package.json": '{"scripts":{"test":"node --test"}}' }),
			REFS,
			NODE,
		);
		assert.equal(both.stack, "maven");
		assert.ok(!both.controls.some((c) => c.control_id === "unit"), "no Node control is declared for a Maven project");
		rmSync(join(root, "target"), { recursive: true });

		const none = STACKS_OF_495.recognise(project({ "README.md": "" }), REFS, NODE);
		assert.equal(none.stack, "unknown");
		assert.match(none.capability_missing.join(" "), /pom\.xml or package\.json expected/);
	});
});

/** A technology recognised by `Cargo.toml` that declares the capabilities it is given, and the tests always. */
function plugin(
	capabilities: Partial<StackPlugin<true>["capabilities"]>,
	tests: Offer = available("cargo-test"),
): StackPlugin<true> {
	return {
		id: "cargo",
		signal_files: ["Cargo.toml"],
		recognise: (view) => (view.exists("Cargo.toml") ? true : null),
		readers: [],
		capabilities: {
			tests: {
				offer: () => tests,
				positiveWitness: () => ({ "tests/pass.rs": "pass" }),
				negativeWitness: () => ({ "tests/fail.rs": "fail" }),
				measuredCodeWitness: () => ({ "src/measured.rs": "measured", "tests/pass.rs": "pass twice" }),
				preparationPaths: () => ["tests/"],
			},
			...capabilities,
		},
	};
}

function available(
	controlId: string,
	parser = "exit-code",
	own?: Record<string, string>,
): Extract<Offer, { kind: "available" }> {
	return {
		kind: "available",
		controls: [controlOf({ control_id: controlId, parser })],
		...(own ? { own_negative_witness: { [controlId]: own } } : {}),
	};
}

function detect(technology: StackPlugin<true>): DetectedTechnology {
	return registryOf([technology]).recognise(project({ "Cargo.toml": "[package]" }), REFS, NODE);
}

describe("the common layer assembles what a technology offers, capability by capability", () => {
	it("given a technology that declares its tests alone, then each other capability is a blind spot in the common words, with the reason that it does not offer it", () => {
		const detection = detect(plugin({}));
		assert.equal(detection.stack, "cargo");
		assert.deepEqual(
			detection.controls.map((c) => c.control_id),
			["cargo-test"],
		);
		assert.deepEqual(detection.capability_missing, [
			"the coverage of the introduced lines is not measured on this target: the cargo technology does not offer it",
			"no dependency direction between modules is checked on this target: the cargo technology does not offer it",
			"the mutation of the introduced lines is not measured on this target: the cargo technology does not offer it",
			"the quality of the code is not measured on this target: the cargo technology does not offer it",
		]);
		assert.deepEqual(detection.positive_witness, { "tests/pass.rs": "pass" });
		assert.equal(detection.witness_tests, 1);
		assert.deepEqual(detection.preparation_paths, ["tests/"]);
	});

	it("given a refused suite, then no control is declared and the refusal is the only blind spot", () => {
		const coverage = { offer: () => available("coverage", "lcov") };
		const detection = detect(plugin({ coverage }, { kind: "refused", reason: "the runner is not read" }));
		assert.deepEqual(detection.controls, []);
		assert.deepEqual(detection.capability_missing, ["the runner is not read"]);
	});

	it("given a missing coverage with its recommendation, then the blind spot is the phrase of the capability followed by its reason, and the recommendation is offered", () => {
		const recommendation = {
			test_type: "coverage",
			tool: "cargo-llvm-cov",
			version: "0.6.0",
			established_on: "2026-09-30",
			source: "github.com/taiki-e/cargo-llvm-cov",
			change: "install cargo-llvm-cov",
		};
		const coverage = { offer: (): Offer => ({ kind: "missing", reason: "no cargo-llvm-cov", recommendation }) };
		const detection = detect(plugin({ coverage }));
		assert.equal(
			detection.capability_missing[0],
			"the coverage of the introduced lines is not measured on this target: no cargo-llvm-cov",
		);
		assert.deepEqual(detection.recommendations, [recommendation]);
	});

	it("given a coverage read by a differential reader, then the module a test calls and asserts on joins the positive witness with one more case, and its own negative witness is kept", () => {
		const coverage = { offer: () => available("coverage", "lcov", { "src/uncovered.rs": "u" }) };
		const detection = detect(plugin({ coverage }));
		assert.deepEqual(detection.positive_witness, { "tests/pass.rs": "pass twice", "src/measured.rs": "measured" });
		assert.equal(detection.witness_tests, 2);
		assert.deepEqual(detection.own_negative_witness, { coverage: { "src/uncovered.rs": "u" } });
	});

	it("given a structure read by a differential reader alone, then the positive witness is the tests' own", () => {
		const structure = { offer: () => available("structure", "lcov") };
		const detection = detect(plugin({ structure }));
		assert.deepEqual(detection.positive_witness, { "tests/pass.rs": "pass" });
		assert.equal(detection.witness_tests, 1);
	});

	it("given quality controls read by a style reader and by a reader of no nature, then both judge style, and a test control read without nature does not", () => {
		const quality = {
			offer: (): Offer => ({
				kind: "available",
				controls: [controlOf({ control_id: "lint" }), controlOf({ control_id: "analyser", parser: "style-report" })],
			}),
		};
		const technology = {
			...plugin({ quality }),
			readers: [{ ...READER, id: "style-report", nature: "style" as const }],
		};
		const detection = detect(technology);
		assert.deepEqual(detection.lint_control_ids, ["lint", "analyser"]);
		assert.ok(!detection.capability_missing.some((spot) => spot.startsWith("the quality of the code")));
	});

	it("given a structure available short of the dependency direction, then it is declared and the blind spot says what it is short of", () => {
		const structure = { offer: (): Offer => ({ ...available("structure"), short_of: "one module only" }) };
		const detection = detect(plugin({ structure }));
		assert.ok(detection.controls.some((c) => c.control_id === "structure"));
		assert.ok(
			detection.capability_missing.includes(
				"no dependency direction between modules is checked on this target: one module only",
			),
		);
	});
});
