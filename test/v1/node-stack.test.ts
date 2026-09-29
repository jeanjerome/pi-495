import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { detectStack } from "../../src/application/target.ts";
import type { CandidateManifest, ManifestEntry } from "../../src/contracts/v1/candidate.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { matchesScope, protectedPathsChanged } from "../../src/domain/gates/g4.ts";
import { tempDir, writeFiles } from "../helpers/fixtures.ts";

const NODE = process.execPath;
const REFS = [{ requirement_id: "R1", revision: 1 }];

let root: string;
beforeEach(() => {
	root = tempDir("495-node-stack-");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function targetWith(scriptsTest: string | null, extra: Record<string, string> = {}): string {
	const project = join(root, "target");
	const pkg = { name: "t", type: "module", ...(scriptsTest === null ? {} : { scripts: { test: scriptsTest } }) };
	writeFiles(project, { "package.json": JSON.stringify(pkg), ...extra });
	return project;
}

function unitOf(project: string): ControlDefinition {
	const unit = detectStack(project, REFS, NODE).controls.find((c) => c.control_id === "unit");
	assert.ok(unit, "the detection declares a unit control");
	return unit;
}

describe("Node stack: the unit control follows scripts.test", () => {
	it("given a package.json whose scripts.test is vitest run, when the stack is detected, then unit runs the vitest of node_modules with the JUnit reporter, reads its report with the JUnit parser and names scripts.test in its title", () => {
		const detection = detectStack(targetWith("vitest run"), REFS, NODE);
		const unit = detection.controls.find((c) => c.control_id === "unit");
		assert.ok(unit, "the detection declares a unit control");
		assert.deepEqual(unit.command.slice(0, 4), [NODE, "node_modules/vitest/vitest.mjs", "run", "--reporter=junit"]);
		assert.ok(unit.report_path, "the control declares where the report is written");
		assert.ok(unit.command.includes(`--outputFile=${unit.report_path}`));
		assert.equal(unit.parser, "junit-xml");
		assert.match(unit.title, /scripts\.test/);
		assert.equal(unit.network, "denied");
		assert.deepEqual(
			unit.writable_paths,
			[unit.report_path.replace(/\/[^/]+$/, ""), "node_modules/.vite-temp"],
			"only the report directory and the directory where Vite compiles its configuration are writable",
		);
		assert.deepEqual(detection.capability_missing, []);
	});
});

describe("Node stack: what the vitest control protects", () => {
	it("given a vitest target, then its unit control protects tests/, package.json and the vitest and vite configuration files", () => {
		const { protected_paths: protectedPaths } = unitOf(targetWith("vitest run"));
		const protects = (path: string) => protectedPaths.some((pattern) => matchesScope(path, pattern));
		for (const path of [
			"test/a.test.ts",
			"tests/a.test.ts",
			"package.json",
			"vitest.config.ts",
			"vitest.config.mjs",
			"vite.config.ts",
			"vite.config.js",
		])
			assert.ok(protects(path), `${path} is protected`);
		assert.ok(!protects("src/agenda.ts"), "production code stays open to the candidate");
	});
});

describe("Node stack: what the vitest control protects among the installed dependencies", () => {
	const entry = (path: string, baseline_state: ManifestEntry["baseline_state"]): ManifestEntry => ({
		path,
		kind: "file",
		content_digest: `sha256:${"a".repeat(64)}`,
		size: 1,
		mode: "000644",
		symlink_target: null,
		baseline_state,
		origin: "agent",
		limits: null,
	});
	const manifestOf = (...entries: ManifestEntry[]): CandidateManifest => ({
		candidate_id: "cnd_1",
		workspace_id: "wsp_1",
		base_reference_id: "ref_1",
		base_digest: `sha256:${"b".repeat(64)}`,
		selected_paths: [],
		exclusions: [],
		entries,
		metadata_policy: "content_and_mode",
		manifest_digest: `sha256:${"c".repeat(64)}`,
		frozen_at: "2026-09-29T12:00:00.000Z",
		limits: { truncated: false, bytes_read: 0, bytes_total: null, exclusions: [], unstable: false, notes: [] },
	});
	it("given a vitest target, then its unit control protects node_modules/ beside the tests, package.json and the configuration files, and a candidate that modifies node_modules/vitest/dist/index.js is refused naming that path", () => {
		const { protected_paths: protectedPaths } = unitOf(targetWith("vitest run"));
		for (const path of ["test/a.test.ts", "tests/a.test.ts", "package.json", "vitest.config.ts", "vite.config.js"])
			assert.ok(
				protectedPaths.some((pattern) => matchesScope(path, pattern)),
				`${path} stays protected`,
			);
		const modified = protectedPathsChanged(
			manifestOf(entry("node_modules/vitest/dist/index.js", "modified"), entry("src/agenda.ts", "modified")),
			protectedPaths,
			[],
		);
		assert.deepEqual(modified.altered, ["node_modules/vitest/dist/index.js"]);
	});
	it("given a vitest target, when a candidate adds node_modules/vitest/node_modules/tinyrainbow/index.js, which shadows a package the vitest control loads, then it is refused naming that path", () => {
		const { protected_paths: protectedPaths } = unitOf(targetWith("vitest run"));
		const added = protectedPathsChanged(
			manifestOf(entry("node_modules/vitest/node_modules/tinyrainbow/index.js", "added")),
			protectedPaths,
			[],
		);
		assert.deepEqual(added.altered, ["node_modules/vitest/node_modules/tinyrainbow/index.js"]);
		assert.deepEqual(added.allowed, []);
	});
	it("given a vitest target, when a candidate adds tests/new.test.ts, then the file is allowed as a new test and not refused", () => {
		const { protected_paths: protectedPaths } = unitOf(targetWith("vitest run"));
		const added = protectedPathsChanged(manifestOf(entry("tests/new.test.ts", "added")), protectedPaths, []);
		assert.deepEqual(added.allowed, ["tests/new.test.ts"]);
		assert.deepEqual(added.altered, []);
	});
	it("given a node:test target and a vitest target, when a candidate adds tests/fixtures/node_modules/x.js, then the file is allowed as a new test file and not refused as an installed dependency", () => {
		for (const scriptsTest of [null, "vitest run"]) {
			const { protected_paths: protectedPaths } = unitOf(targetWith(scriptsTest));
			const added = protectedPathsChanged(
				manifestOf(entry("tests/fixtures/node_modules/x.js", "added")),
				protectedPaths,
				[],
			);
			assert.deepEqual(added.allowed, ["tests/fixtures/node_modules/x.js"], String(scriptsTest));
			assert.deepEqual(added.altered, [], String(scriptsTest));
		}
	});
});

describe("Node stack: a runner 495 cannot read is refused, node:test stays for the rest", () => {
	it("given scripts.test is jest, when the stack is detected, then no unit control is declared and the missing capability names jest", () => {
		const detection = detectStack(targetWith("jest"), REFS, NODE);
		assert.equal(
			detection.controls.some((c) => c.control_id === "unit"),
			false,
		);
		assert.equal(detection.capability_missing.length, 1);
		assert.match(detection.capability_missing[0]!, /scripts\.test runs jest, whose output 495 cannot read/);
	});
	it("given scripts.test is jest and a lint script is declared, when the stack is detected, then no control at all is declared and the missing capability names jest", () => {
		const project = join(root, "target");
		writeFiles(project, {
			"package.json": JSON.stringify({
				name: "t",
				type: "module",
				scripts: { test: "jest", lint: "node scripts/lint.js" },
			}),
		});
		const detection = detectStack(project, REFS, NODE);
		assert.deepEqual(
			detection.controls.map((c) => c.control_id),
			[],
		);
		assert.match(detection.capability_missing.join("; "), /scripts\.test runs jest, whose output 495 cannot read/);
	});
	it("given scripts.test chains commands through a shell, when the stack is detected, then no unit control is declared and the missing capability names the chain", () => {
		const detection = detectStack(targetWith("tsc && vitest run"), REFS, NODE);
		assert.equal(
			detection.controls.some((c) => c.control_id === "unit"),
			false,
		);
		assert.match(detection.capability_missing[0]!, /tsc && vitest run/);
	});
	for (const [label, scriptsTest] of [
		["no scripts.test", null],
		["node --test", "node --test"],
		["node --test with a path", "node --test test/"],
	] as const)
		it(`given ${label}, then unit is the node:test control`, () => {
			const project = targetWith(scriptsTest);
			const detection = detectStack(project, REFS, NODE);
			const unit = unitOf(project);
			assert.deepEqual(unit.command, [NODE, "--test", "--test-reporter=tap"]);
			assert.equal(unit.parser, "node-test");
			assert.deepEqual(detection.capability_missing, []);
		});
	it("given a scripts.test that is not a string, when the stack is detected, then it is read as absent and unit is the node:test control", () => {
		const project = join(root, "target");
		writeFiles(project, { "package.json": JSON.stringify({ name: "t", scripts: { test: 5 } }) });
		const detection = detectStack(project, REFS, NODE);
		assert.equal(unitOf(project).parser, "node-test");
		assert.deepEqual(detection.capability_missing, []);
	});
});

describe("Node stack: the witnesses of a vitest target", () => {
	const vitestFile = (files: Record<string, string>) => {
		const paths = Object.keys(files).filter((path) => path.includes(".test."));
		assert.equal(paths.length, 1, "one test file");
		return { path: paths[0]!, source: files[paths[0]!]! };
	};
	it("given a vitest target with a tests/ directory, then the witnesses are vitest files under tests/, the positive one passing and the negative one failing", () => {
		const project = targetWith("vitest run", { "tests/agenda.test.ts": "export {};\n" });
		const detection = detectStack(project, REFS, NODE);
		const positive = vitestFile(detection.positive_witness);
		const negative = vitestFile(detection.negative_witness);
		assert.match(positive.path, /^tests\//);
		assert.match(positive.source, /from "vitest"/);
		assert.match(positive.source, /toBe\(1\)/);
		assert.match(negative.path, /^tests\//);
		assert.match(negative.source, /from "vitest"/);
		assert.match(negative.source, /toBe\(2\)/);
	});
	it("given a vitest target without a tests/ directory, then the witnesses live under test/", () => {
		const detection = detectStack(targetWith("vitest run"), REFS, NODE);
		assert.match(vitestFile(detection.positive_witness).path, /^test\//);
		assert.match(vitestFile(detection.negative_witness).path, /^test\//);
	});
});
