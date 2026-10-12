import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { projectControlsOf, withOwnerPaths } from "../../src/application/project-controls.ts";
import { baseControl, type DetectedTechnology } from "../../src/application/stacks/stack.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";

const declared = (control_id: string, writable_paths: string[]) => ({
	control_id,
	title: control_id,
	command: ["node", "-e", ""],
	timeout_ms: 60_000,
	writable_paths,
	protected_paths: [],
});

const detected = (control_id: string, writable_paths: string[]): ControlDefinition => ({
	...baseControl([]),
	control_id,
	title: control_id,
	command: ["node", "--test"],
	timeout_ms: 60_000,
	parser: "exit-code",
	report_path: null,
	provides: [],
	writable_paths,
	protected_paths: [],
});

const detectionOf = (controls: ControlDefinition[]): DetectedTechnology => ({
	stack: "node",
	facts: {},
	controls,
	lint_control_ids: [],
	positive_witness: {},
	witness_tests: 0,
	negative_witness: {},
	own_negative_witness: {},
	preparation_paths: [],
	capability_missing: [],
	recommendations: [],
});

describe("the directories the owner gives a declared control", () => {
	it("a directory the control already declares and the owner gives again is written once, after the declared ones", () => {
		const [lintOwn] = projectControlsOf({
			...DEFAULT_POLICY,
			project_controls: [declared("lint-own", [".lint-cache/"])],
			writable_paths: { "lint-own": [".lint-cache/", "out/"] },
		});
		assert.deepEqual(lintOwn?.writable_paths, [".lint-cache/", "out/"]);
	});

	it("a declared or detected control the owner names nothing for keeps exactly its own writable paths", () => {
		const policy = {
			...DEFAULT_POLICY,
			project_controls: [declared("lint-own", [".lint-cache/"]), declared("types", [])],
			writable_paths: { unit: ["test-output/"], e2e: ["e2e-output/"] },
		};
		const detection = withOwnerPaths(
			detectionOf([detected("unit", ["coverage/"]), detected("coverage", ["reports/"]), detected("lint", [])]),
			policy,
		);
		assert.deepEqual(
			[...projectControlsOf(policy), ...detection.controls].map((c) => [c.control_id, c.writable_paths]),
			[
				["lint-own", [".lint-cache/"]],
				["types", []],
				["unit", ["coverage/", "test-output/"]],
				["coverage", ["reports/"]],
				["lint", []],
			],
		);
	});
});

describe("a control the owner declares unconfined", () => {
	it("only the declared control carries the exception: a detected control under the same identifier stays confined", () => {
		const policy = { ...DEFAULT_POLICY, project_controls: [{ ...declared("unit", []), unconfined: true }] };
		const detection = withOwnerPaths(detectionOf([detected("unit", []), detected("lint", [])]), policy);
		assert.deepEqual(
			[...projectControlsOf(policy), ...detection.controls].map((c) => [c.control_id, c.unconfined ?? null]),
			[
				["unit", true],
				["unit", null],
				["lint", null],
			],
		);
	});
});
