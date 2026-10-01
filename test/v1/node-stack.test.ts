import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import { detectStack } from "../../src/application/target.ts";
import { digestBytes } from "../../src/contracts/digest.ts";
import type { CandidateManifest, ManifestEntry } from "../../src/contracts/v1/candidate.ts";
import { SCOPE_PLACEHOLDER, type ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { matchesScope, protectedPathsChanged } from "../../src/domain/gates/g4.ts";
import { tempDir, writeFiles } from "../helpers/fixtures.ts";

const NODE = process.execPath;
const REFS = [{ requirement_id: "R1", revision: 1 }];

let root: string;
beforeEach(() => {
	root = tempDir("495-node-stack-");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const NOT_ASKED_FOR_COVERAGE =
	/coverage of the introduced lines is not measured on this target: scripts\.test does not ask node:test for coverage/;

function targetWith(scriptsTest: string | null, extra: Record<string, string> = {}): string {
	const project = join(root, "target");
	const pkg = { name: "t", type: "module", ...(scriptsTest === null ? {} : { scripts: { test: scriptsTest } }) };
	writeFiles(project, { "package.json": JSON.stringify(pkg), ...extra });
	return project;
}

/** What a target lacks besides the mutation of its introduced lines, which every target without Stryker lacks. */
function withoutMutation(missing: readonly string[]): string[] {
	return missing.filter((line) => !/mutation/.test(line));
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
		assert.match(detection.capability_missing.join(" "), /@vitest\/coverage-v8/);
	});
});

describe("Node stack: the unit control of a mocha target", () => {
	it("given a package.json whose scripts.test is mocha, when the stack is detected, then unit runs the mocha of node_modules with the xunit reporter, reads its report with the JUnit parser, declares only target writable and names scripts.test in its title", () => {
		const detection = detectStack(targetWith("mocha"), REFS, NODE);
		const unit = detection.controls.find((c) => c.control_id === "unit");
		assert.ok(unit, "the detection declares a unit control");
		assert.deepEqual(unit.command.slice(0, 3), [NODE, "node_modules/mocha/bin/mocha.js", "--reporter=xunit"]);
		assert.ok(unit.report_path, "the control declares where the report is written");
		assert.match(unit.report_path, /^target\//);
		assert.ok(unit.command.includes(`--reporter-option=output=${unit.report_path}`));
		assert.equal(unit.parser, "junit-xml");
		assert.match(unit.title, /scripts\.test/);
		assert.equal(unit.network, "denied");
		assert.deepEqual(unit.writable_paths, ["target"]);
		assert.match(detection.capability_missing.join(" "), /495 does not read the coverage of mocha/);
	});
});

describe("Node stack: the unit control of a jest target", () => {
	it("given a package.json whose scripts.test is jest, when the stack is detected, then unit runs the jest of node_modules writing its JSON report to 495-jest-report.json, reads it with the jest-json parser, declares only that file writable and names scripts.test in its title", () => {
		const detection = detectStack(targetWith("jest"), REFS, NODE);
		const unit = detection.controls.find((c) => c.control_id === "unit");
		assert.ok(unit, "the detection declares a unit control");
		assert.deepEqual(unit.command.slice(0, 3), [NODE, "node_modules/jest/bin/jest.js", "--json"]);
		assert.ok(unit.command.includes("--outputFile=495-jest-report.json"));
		assert.equal(unit.report_path, "495-jest-report.json");
		assert.equal(unit.parser, "jest-json");
		assert.match(unit.title, /scripts\.test/);
		assert.equal(unit.network, "denied");
		assert.deepEqual(unit.writable_paths, ["495-jest-report.json"]);
		assert.match(detection.capability_missing.join(" "), /495 does not read the coverage of jest/);
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

describe("Node stack: what the mocha and jest controls protect", () => {
	it("given a mocha target and a jest target, then their unit control protects the test directories, package.json and node_modules/, and adds .mocharc.* for mocha and jest.config.* for jest", () => {
		const protectedBy = (runner: "mocha" | "jest") => {
			const { protected_paths: patterns } = unitOf(targetWith(runner));
			return (path: string) => patterns.some((pattern) => matchesScope(path, pattern));
		};
		const mocha = protectedBy("mocha");
		const jest = protectedBy("jest");
		for (const protects of [mocha, jest])
			for (const path of ["test/a.test.js", "tests/a.test.js", "package.json", "node_modules/x/index.js"]) {
				assert.ok(protects(path), `${path} is protected`);
			}
		for (const path of [".mocharc.json", ".mocharc.yml", ".mocharc.cjs", ".mocharc.js"])
			assert.ok(mocha(path), `${path} is protected for mocha`);
		for (const path of ["jest.config.js", "jest.config.ts", "jest.config.json", "jest.config.mjs"])
			assert.ok(jest(path), `${path} is protected for jest`);
		assert.ok(!mocha("jest.config.js") && !jest(".mocharc.json"), "each keeps to its own configuration");
		assert.ok(!mocha("src/agenda.js") && !jest("src/agenda.js"), "production code stays open to the candidate");
	});
});

describe("Node stack: what the unit controls protect among the installed dependencies", () => {
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
	it("given a target that installed Stryker, then a candidate that modifies stryker.config.mjs or adds stryker.conf.json is refused naming each file, and one that modifies src/agenda.ts is not", () => {
		const stryker = { "node_modules/@stryker-mutator/core/package.json": '{"name":"@stryker-mutator/core"}' };
		const mutation = detectStack(targetWith("node --test", stryker), REFS, NODE).controls.find(
			(c) => c.control_id === "mutation",
		);
		assert.ok(mutation, "the detection declares a mutation control");
		const changed = protectedPathsChanged(
			manifestOf(
				entry("stryker.config.mjs", "modified"),
				entry("stryker.conf.json", "added"),
				entry("src/agenda.ts", "modified"),
			),
			mutation.protected_paths,
			[],
		);
		assert.deepEqual(changed.altered, ["stryker.config.mjs", "stryker.conf.json"]);
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
	const complement = {
		path: "package.json",
		digest: digestBytes('{"scripts":{"test":"node --test --experimental-test-coverage"}}'),
		test_type: "coverage",
		tool: "node --experimental-test-coverage",
	} as const;
	const packageJson = (baseline_state: ManifestEntry["baseline_state"], content_digest: `sha256:${string}`) => ({
		...entry("package.json", baseline_state),
		content_digest,
	});
	it("given an adopted complement on package.json, then a candidate keeping that file as the complement wrote it is allowed, and one modifying another line is refused naming package.json", () => {
		const { protected_paths: protectedPaths } = unitOf(targetWith("node --test"));
		const kept = protectedPathsChanged(
			manifestOf(packageJson("modified", complement.digest)),
			protectedPaths,
			[],
			() => false,
			[complement],
		);
		assert.deepEqual(kept.altered, []);
		assert.deepEqual(kept.allowed, ["package.json"]);
		const edited = protectedPathsChanged(
			manifestOf(packageJson("modified", digestBytes('{"scripts":{"test":"node --test","lint":"x"}}'))),
			protectedPaths,
			[],
			() => false,
			[complement],
		);
		assert.deepEqual(edited.altered, ["package.json"]);
		assert.deepEqual(edited.allowed, []);
		const unadopted = protectedPathsChanged(manifestOf(packageJson("modified", complement.digest)), protectedPaths, []);
		assert.deepEqual(unadopted.altered, ["package.json"], "without the adoption the same file is refused");
	});
	it("given an adopted complement on package.json, then a candidate whose package.json is unchanged from the reference is refused naming package.json, and one keeping the file as the complement wrote it is still allowed", () => {
		const { protected_paths: protectedPaths } = unitOf(targetWith("node --test"));
		const restored = protectedPathsChanged(
			manifestOf(packageJson("unchanged", digestBytes('{"scripts":{"test":"node --test"}}'))),
			protectedPaths,
			[],
			() => false,
			[complement],
		);
		assert.deepEqual(restored.altered, ["package.json"]);
		assert.deepEqual(restored.allowed, []);
		const kept = protectedPathsChanged(
			manifestOf(packageJson("modified", complement.digest)),
			protectedPaths,
			[],
			() => false,
			[complement],
		);
		assert.deepEqual(kept.altered, []);
		assert.deepEqual(kept.allowed, ["package.json"]);
	});
	it("given a complement carrying package.json and two files under node_modules/, then a candidate keeping them as written is allowed and one modifying one of them is refused naming that file", () => {
		const { protected_paths: protectedPaths } = unitOf(targetWith("vitest run"));
		const installed = [
			"node_modules/@vitest/coverage-v8/index.js",
			"node_modules/@vitest/coverage-v8/package.json",
		].map((path) => ({
			path,
			digest: digestBytes(`the bytes of ${path}`),
			test_type: "coverage",
			tool: "coverage-v8",
		}));
		const complements = [complement, ...installed];
		const asWritten = complements.map((c) => ({ ...entry(c.path, "added"), content_digest: c.digest }));
		const kept = protectedPathsChanged(manifestOf(...asWritten), protectedPaths, [], () => false, complements);
		assert.deepEqual(kept.altered, []);
		assert.deepEqual(
			kept.allowed,
			complements.map((c) => c.path),
		);
		const modified = asWritten.map((e) =>
			e.path === installed[1]!.path ? { ...e, content_digest: digestBytes("shadowing bytes") } : e,
		);
		const refused = protectedPathsChanged(manifestOf(...modified), protectedPaths, [], () => false, complements);
		assert.deepEqual(refused.altered, [installed[1]!.path]);
	});
	it("given a complement that wrote a file absent from the reference, then a candidate that no longer holds that file is refused naming it, and one that keeps it as written passes", () => {
		const { protected_paths: protectedPaths } = unitOf(targetWith("vitest run"));
		const written = {
			path: "node_modules/@vitest/coverage-v8/package.json",
			digest: digestBytes('{"name":"@vitest/coverage-v8"}'),
			test_type: "coverage",
			tool: "@vitest/coverage-v8",
		};
		const kept = protectedPathsChanged(
			manifestOf(
				{ ...entry(written.path, "added"), content_digest: written.digest },
				entry("src/agenda.ts", "modified"),
			),
			protectedPaths,
			[],
			() => false,
			[written],
		);
		assert.deepEqual(kept.altered, []);
		assert.deepEqual(kept.allowed, [written.path]);
		const removed = protectedPathsChanged(
			manifestOf(entry("src/agenda.ts", "modified")),
			protectedPaths,
			[],
			() => false,
			[written],
		);
		assert.deepEqual(removed.altered, [written.path]);
	});
	it("given a node --test target and no adopted complement, then a candidate adding node_modules/x/index.js and src/greet.js is refused naming node_modules/x/index.js and not src/greet.js, and one keeping a node_modules/x/index.js written by an adopted complement is allowed", () => {
		const { protected_paths: protectedPaths } = unitOf(targetWith("node --test"));
		const added = protectedPathsChanged(
			manifestOf(entry("node_modules/x/index.js", "added"), entry("src/greet.js", "added")),
			protectedPaths,
			[],
		);
		assert.deepEqual(added.altered, ["node_modules/x/index.js"]);
		const installed = {
			path: "node_modules/x/index.js",
			digest: digestBytes("the bytes of node_modules/x/index.js"),
			test_type: "coverage",
			tool: "x",
		};
		const kept = protectedPathsChanged(
			manifestOf({ ...entry(installed.path, "added"), content_digest: installed.digest }),
			protectedPaths,
			[],
			() => false,
			[installed],
		);
		assert.deepEqual(kept.altered, []);
		assert.deepEqual(kept.allowed, [installed.path]);
	});
});

describe("Node stack: a runner 495 cannot read is refused, node:test stays for the rest", () => {
	it("given scripts.test is ava, when the stack is detected, then no unit control is declared and the missing capability names ava", () => {
		const detection = detectStack(targetWith("ava"), REFS, NODE);
		assert.equal(
			detection.controls.some((c) => c.control_id === "unit"),
			false,
		);
		assert.equal(detection.capability_missing.length, 1);
		assert.match(detection.capability_missing[0]!, /scripts\.test runs ava, whose output 495 cannot read/);
	});
	it("given scripts.test is ava and a lint script is declared, when the stack is detected, then no control at all is declared and the missing capability names ava", () => {
		const project = join(root, "target");
		writeFiles(project, {
			"package.json": JSON.stringify({
				name: "t",
				type: "module",
				scripts: { test: "ava", lint: "node scripts/lint.js" },
			}),
		});
		const detection = detectStack(project, REFS, NODE);
		assert.deepEqual(
			detection.controls.map((c) => c.control_id),
			[],
		);
		assert.match(detection.capability_missing.join("; "), /scripts\.test runs ava, whose output 495 cannot read/);
	});
	for (const scriptsTest of ["jest --ci", "mocha --exit", "vitest --watch"])
		it(`given scripts.test is ${scriptsTest}, then no unit control is declared and the missing capability says the runner is read only without arguments`, () => {
			const runner = scriptsTest.split(" ")[0]!;
			const detection = detectStack(targetWith(scriptsTest), REFS, NODE);
			assert.equal(
				detection.controls.some((c) => c.control_id === "unit"),
				false,
			);
			assert.equal(detection.capability_missing.length, 1);
			assert.match(detection.capability_missing[0]!, new RegExp(`scripts\\.test runs ${scriptsTest}`));
			assert.match(detection.capability_missing[0]!, new RegExp(`${runner} only when it runs without an argument`));
		});
	it("given scripts.test is ava, then no unit control is declared and the missing capability says node --test, vitest, mocha and jest are read", () => {
		const detection = detectStack(targetWith("ava"), REFS, NODE);
		assert.equal(
			detection.controls.some((c) => c.control_id === "unit"),
			false,
		);
		assert.match(
			detection.capability_missing[0]!,
			/scripts\.test runs ava, whose output 495 cannot read: only node --test, vitest, mocha and jest are read/,
		);
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
			assert.match(detection.capability_missing.join(" "), NOT_ASKED_FOR_COVERAGE);
		});
	it("given a scripts.test that is not a string, when the stack is detected, then it is read as absent and unit is the node:test control", () => {
		const project = join(root, "target");
		writeFiles(project, { "package.json": JSON.stringify({ name: "t", scripts: { test: 5 } }) });
		const detection = detectStack(project, REFS, NODE);
		assert.equal(unitOf(project).parser, "node-test");
		assert.match(detection.capability_missing.join(" "), NOT_ASKED_FOR_COVERAGE);
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

describe("Node stack: the witnesses of a mocha target and of a jest target", () => {
	type Globals = Record<string, unknown>;
	/** What the runner lends a test file without an import: mocha has no assertion, jest has `expect`. */
	const globalsOf = (runner: "mocha" | "jest", registered: (() => void)[]): Globals => {
		const register = (_name: string, body: () => void) => registered.push(body);
		const expect = (received: unknown) => ({
			toBe: (expected: unknown) => {
				if (!Object.is(received, expected)) throw new Error(`${String(received)} is not ${String(expected)}`);
			},
		});
		return runner === "mocha"
			? { describe: register, it: register }
			: { describe: register, it: register, test: register, expect };
	};
	/** Runs a witness with only the globals of its runner: an import or another global fails here. */
	const bodiesOf = (runner: "mocha" | "jest", source: string): (() => void)[] => {
		const registered: (() => void)[] = [];
		runInNewContext(source, globalsOf(runner, registered));
		return registered;
	};
	const only = (files: Record<string, string>) => {
		const paths = Object.keys(files).filter((path) => /^tests?\//.test(path));
		assert.equal(paths.length, 1, "one witness file");
		return { path: paths[0]!, source: files[paths[0]!]! };
	};
	for (const runner of ["mocha", "jest"] as const)
		it(`given a ${runner} target with a tests/ directory, then the witnesses are JavaScript files under tests/ using only the globals of the runner, the positive one passing and the negative one failing, and under test/ when there is no tests/`, () => {
			const withDirectory = detectStack(targetWith(runner, { "tests/agenda.test.js": "\n" }), REFS, NODE);
			const positive = only(withDirectory.positive_witness);
			const negative = only(withDirectory.negative_witness);
			for (const witness of [positive, negative]) assert.match(witness.path, /^tests\/[^/]+\.js$/);
			const [passing] = bodiesOf(runner, positive.source);
			assert.ok(passing, "the positive witness registers a test");
			assert.doesNotThrow(passing);
			const [failing] = bodiesOf(runner, negative.source);
			assert.ok(failing, "the negative witness registers a test");
			assert.throws(failing);
			rmSync(join(root, "target", "tests"), { recursive: true });
			const without = detectStack(targetWith(runner), REFS, NODE);
			assert.match(only(without.positive_witness).path, /^test\/[^/]+\.js$/);
			assert.match(only(without.negative_witness).path, /^test\/[^/]+\.js$/);
		});
});

describe("Node stack: node:test asked for coverage", () => {
	const asked = "node --test --experimental-test-coverage";
	it("given scripts.test is node --test --experimental-test-coverage, then unit writes the lcov report to 495-lcov.info declaring only that file writable, coverage reads it with the lcov parser and no capability is missing for coverage", () => {
		const detection = detectStack(targetWith(asked), REFS, NODE);
		const unit = detection.controls.find((c) => c.control_id === "unit");
		assert.ok(unit, "the detection declares a unit control");
		assert.deepEqual(unit.command, [
			NODE,
			"--test",
			"--experimental-test-coverage",
			"--test-reporter=tap",
			"--test-reporter-destination=stdout",
			"--test-reporter=lcov",
			"--test-reporter-destination=495-lcov.info",
		]);
		assert.equal(unit.parser, "node-test");
		assert.deepEqual(unit.writable_paths, ["495-lcov.info"]);
		assert.equal(unit.network, "denied");
		const coverage = detection.controls.find((c) => c.control_id === "coverage");
		assert.ok(coverage, "the detection declares a coverage control");
		assert.deepEqual(
			[coverage.parser, coverage.report_path, coverage.writable_paths, coverage.network],
			["lcov", "495-lcov.info", [], "denied"],
		);
		assert.ok(
			unit.provides.some((report) => coverage.requires.includes(report)),
			"coverage requires a report that unit provides",
		);
		const protects = (path: string) => coverage.protected_paths.some((pattern) => matchesScope(path, pattern));
		assert.ok(protects("test/a.test.js") && protects("package.json"), "the tests and package.json are protected");
		assert.deepEqual(withoutMutation(detection.capability_missing), []);
	});
	it("given no scripts.test or node --test, then no coverage control is declared and the missing capability says scripts.test does not ask node:test for coverage", () => {
		for (const scriptsTest of [null, "node --test"]) {
			const detection = detectStack(targetWith(scriptsTest), REFS, NODE);
			assert.equal(
				detection.controls.some((c) => c.control_id === "coverage"),
				false,
				String(scriptsTest),
			);
			assert.deepEqual(unitOf(targetWith(scriptsTest)).command, [NODE, "--test", "--test-reporter=tap"]);
			assert.equal(withoutMutation(detection.capability_missing).length, 1, String(scriptsTest));
			assert.match(withoutMutation(detection.capability_missing)[0]!, NOT_ASKED_FOR_COVERAGE);
		}
	});
});

describe("Node stack: vitest with a coverage provider", () => {
	const withProvider = (provider: string) =>
		targetWith("vitest run", { [`node_modules/@vitest/${provider}/package.json`]: '{"name":"provider"}' });
	it("given a vitest target whose node_modules carries a coverage provider, then unit adds that provider with the lcov reporter under target/coverage and coverage reads target/coverage/lcov.info", () => {
		for (const provider of ["v8", "istanbul"]) {
			rmSync(join(root, "target"), { recursive: true, force: true });
			const project = withProvider(`coverage-${provider}`);
			const detection = detectStack(project, REFS, NODE);
			const unit = unitOf(project);
			for (const argument of [
				"--coverage.enabled",
				`--coverage.provider=${provider}`,
				"--coverage.reporter=lcov",
				"--coverage.reportsDirectory=target/coverage",
			])
				assert.ok(unit.command.includes(argument), `${provider}: unit passes ${argument}`);
			assert.equal(unit.parser, "junit-xml", provider);
			assert.deepEqual(unit.writable_paths, ["target", "node_modules/.vite-temp"], provider);
			const coverage = detection.controls.find((c) => c.control_id === "coverage");
			assert.ok(coverage, `${provider}: the detection declares a coverage control`);
			assert.deepEqual([coverage.parser, coverage.report_path], ["lcov", "target/coverage/lcov.info"], provider);
			assert.ok(
				unit.provides.some((report) => coverage.requires.includes(report)),
				`${provider}: coverage requires a report that unit provides`,
			);
			const protects = (path: string) => coverage.protected_paths.some((pattern) => matchesScope(path, pattern));
			for (const path of ["test/a.test.ts", "package.json", "vitest.config.ts", "node_modules/vitest/dist/index.js"])
				assert.ok(protects(path), `${provider}: ${path} is protected by coverage`);
			assert.deepEqual(withoutMutation(detection.capability_missing), [], provider);
		}
	});
	it("given a vitest target without a provider, then no coverage control is declared and the missing capability names @vitest/coverage-v8", () => {
		const detection = detectStack(targetWith("vitest run"), REFS, NODE);
		assert.equal(
			detection.controls.some((c) => c.control_id === "coverage"),
			false,
		);
		assert.ok(!unitOf(targetWith("vitest run")).command.some((argument) => argument.startsWith("--coverage")));
		assert.equal(withoutMutation(detection.capability_missing).length, 1);
		assert.match(withoutMutation(detection.capability_missing)[0]!, /@vitest\/coverage-v8/);
	});
	it("given jest or mocha, then no coverage control is declared and the missing capability says 495 does not read its coverage", () => {
		for (const runner of ["jest", "mocha"]) {
			const detection = detectStack(targetWith(runner), REFS, NODE);
			assert.equal(
				detection.controls.some((c) => c.control_id === "coverage"),
				false,
				runner,
			);
			assert.equal(withoutMutation(detection.capability_missing).length, 1, runner);
			assert.match(
				withoutMutation(detection.capability_missing)[0]!,
				new RegExp(`495 does not read the coverage of ${runner}`),
			);
		}
	});
});

describe("Node stack: the witnesses of a coverage sensor", () => {
	const covering = (runner: "node-test" | "vitest") =>
		runner === "node-test"
			? targetWith("node --test --experimental-test-coverage")
			: targetWith("vitest run", { "node_modules/@vitest/coverage-v8/package.json": '{"name":"provider"}' });
	const exportsOf = (source: string) => [...source.matchAll(/export function (\w+)/g)].map((m) => m[1]!);
	const modulesOf = (files: Record<string, string>) =>
		Object.keys(files).filter((path) => path.startsWith("src/") && path.endsWith(".mjs"));
	const testImporting = (files: Record<string, string>, module: string) => {
		const found = Object.entries(files).find(
			([path, source]) => /\.test\./.test(path) && source.includes(`../${module}`),
		);
		assert.ok(found, `a test imports ${module}`);
		return found[1];
	};
	it("given node:test and vitest targets that ask for coverage, then the positive witness adds a .mjs module called in full and its test, and the coverage control has its own negative witness whose module is loaded with a function never called", () => {
		for (const runner of ["node-test", "vitest"] as const) {
			rmSync(join(root, "target"), { recursive: true, force: true });
			const detection = detectStack(covering(runner), REFS, NODE);
			const [covered, ...others] = modulesOf(detection.positive_witness);
			assert.ok(covered && others.length === 0, `${runner}: the positive witness adds one .mjs module`);
			assert.match(covered, /^src\/witness495\/[^/]+\.mjs$/, runner);
			const functions = exportsOf(detection.positive_witness[covered]!);
			assert.ok(functions.length >= 2, `${runner}: the module declares functions`);
			const calling = testImporting(detection.positive_witness, covered);
			for (const name of functions) assert.match(calling, new RegExp(`\\b${name}\\(`), `${runner}: ${name} is called`);
			assert.equal(detection.witness_tests, 2, runner);

			assert.deepEqual(Object.keys(detection.own_negative_witness), ["coverage"], runner);
			const own = detection.own_negative_witness.coverage!;
			const [uncovered, ...rest] = modulesOf(own);
			assert.ok(uncovered && rest.length === 0, `${runner}: the own negative witness adds one .mjs module`);
			assert.match(uncovered, /^src\/witness495\/[^/]+\.mjs$/, runner);
			assert.notEqual(uncovered, covered, runner);
			const loading = testImporting(own, uncovered);
			const declared = exportsOf(own[uncovered]!);
			assert.ok(declared.length >= 2, `${runner}: the module declares functions`);
			assert.ok(
				declared.some((name) => !new RegExp(`\\b${name}\\(`).test(loading)),
				`${runner}: a function of the module is never called`,
			);
			assert.ok(
				declared.some((name) => new RegExp(`\\b${name}\\(`).test(loading)),
				`${runner}: the module is loaded and used`,
			);
			assert.match(loading, runner === "vitest" ? /from "vitest"/ : /from "node:test"/, runner);
		}
	});
	it("given targets that do not ask for coverage, then their witnesses add no code file and no control has a negative witness of its own", () => {
		for (const scriptsTest of [null, "vitest run", "jest", "mocha"]) {
			rmSync(join(root, "target"), { recursive: true, force: true });
			const detection = detectStack(targetWith(scriptsTest), REFS, NODE);
			assert.deepEqual(modulesOf(detection.positive_witness), [], String(scriptsTest));
			assert.deepEqual(detection.own_negative_witness, {}, String(scriptsTest));
			assert.equal(detection.witness_tests, 1, String(scriptsTest));
		}
	});
});

describe("Node stack: the mutation control of a target that installed Stryker", () => {
	const STRYKER = { "node_modules/@stryker-mutator/core/package.json": '{"name":"@stryker-mutator/core"}' };
	const mutationOf = (project: string) =>
		detectStack(project, REFS, NODE).controls.find((c) => c.control_id === "mutation");
	it("given a target whose node_modules carries @stryker-mutator/core, then the mutation control runs it with the json reporter and one process, asks for the loopback network only, writes reports/mutation and .stryker-tmp only and protects the Stryker configuration files, and given no Stryker, then no mutation control is declared and the recommendation names the tool, its version, its date and its source", () => {
		const detection = detectStack(targetWith("node --test", STRYKER), REFS, NODE);
		const mutation = detection.controls.find((c) => c.control_id === "mutation");
		assert.ok(mutation, "the detection declares a mutation control");
		assert.deepEqual(mutation.command, [
			NODE,
			"node_modules/@stryker-mutator/core/bin/stryker.js",
			"run",
			"--reporters",
			"json",
			"--concurrency",
			"1",
		]);
		assert.equal(mutation.parser, "stryker-json");
		assert.equal(mutation.report_path, "reports/mutation/mutation.json");
		assert.equal(mutation.scope_argument, `--mutate=${SCOPE_PLACEHOLDER}`);
		assert.equal(mutation.network, "loopback");
		assert.deepEqual(
			detection.controls.filter((c) => c !== mutation).map((c) => c.network),
			detection.controls.filter((c) => c !== mutation).map(() => "denied"),
			"the other controls keep the network closed",
		);
		assert.deepEqual(mutation.writable_paths, ["reports/mutation", ".stryker-tmp"]);
		assert.ok(mutation.timeout_ms > unitOf(targetWith("node --test", STRYKER)).timeout_ms, "a budget of its own");
		for (const protectedPath of ["stryker.conf.*", "stryker.config.*", "package.json", "test/"])
			assert.ok(mutation.protected_paths.includes(protectedPath), protectedPath);
		assert.doesNotMatch(detection.capability_missing.join(" "), /mutation/);
		assert.deepEqual(
			detection.recommendations.filter((r) => r.test_type === "mutation"),
			[],
		);

		rmSync(join(root, "target"), { recursive: true, force: true });
		const without = detectStack(targetWith("node --test"), REFS, NODE);
		assert.equal(
			without.controls.find((c) => c.control_id === "mutation"),
			undefined,
		);
		assert.match(without.capability_missing.join(" "), /mutation of the introduced lines is not measured/);
		const [recommendation, ...others] = without.recommendations.filter((r) => r.test_type === "mutation");
		assert.ok(recommendation && others.length === 0, "one mutation recommendation");
		assert.equal(recommendation.tool, "@stryker-mutator/core");
		assert.match(recommendation.version, /^\d+\.\d+\.\d+$/);
		assert.match(recommendation.established_on, /^\d{4}-\d{2}-\d{2}$/);
		assert.match(recommendation.source, /stryker-mutator\.io/);
		assert.match(recommendation.change, /@stryker-mutator\/core/);
		assert.equal(recommendation.install, undefined, "495 installs nothing for the owner here");

		rmSync(join(root, "target"), { recursive: true, force: true });
		assert.equal(mutationOf(targetWith("jest", STRYKER)), undefined, "no qualification witness is written for jest");
	});
	it("given a vitest target that installed Stryker, then the mutation control also lets Vite compile the configuration under node_modules/.vite-temp, which the sandbox copy of Stryker reaches through its node_modules link", () => {
		const mutation = mutationOf(targetWith("vitest run", STRYKER));
		assert.ok(mutation, "the detection declares a mutation control");
		assert.deepEqual(mutation.writable_paths, ["reports/mutation", ".stryker-tmp", "node_modules/.vite-temp"]);
	});
});

describe("Node stack: the witnesses of a mutation sensor", () => {
	const STRYKER = { "node_modules/@stryker-mutator/core/package.json": '{"name":"@stryker-mutator/core"}' };
	const installed = (runner: "node-test" | "vitest") =>
		targetWith(runner === "node-test" ? "node --test" : "vitest run", STRYKER);
	const exportsOf = (source: string) => [...source.matchAll(/export function (\w+)/g)].map((m) => m[1]!);
	const modulesOf = (files: Record<string, string>) =>
		Object.keys(files).filter((path) => path.startsWith("src/") && path.endsWith(".mjs"));
	const testImporting = (files: Record<string, string>, module: string) => {
		const found = Object.entries(files).find(
			([path, source]) => /\.test\./.test(path) && source.includes(`../${module}`),
		);
		assert.ok(found, `a test imports ${module}`);
		return found[1];
	};
	it("given a target that installed Stryker, then the positive witness adds a module whose test asserts every result and the mutation control has its own negative witness whose test calls the function without asserting", () => {
		for (const runner of ["node-test", "vitest"] as const) {
			rmSync(join(root, "target"), { recursive: true, force: true });
			const detection = detectStack(installed(runner), REFS, NODE);
			const [asserted, ...others] = modulesOf(detection.positive_witness);
			assert.ok(asserted && others.length === 0, `${runner}: the positive witness adds one .mjs module`);
			const functions = exportsOf(detection.positive_witness[asserted]!);
			assert.ok(functions.length >= 2, `${runner}: the module declares functions`);
			const asserting = testImporting(detection.positive_witness, asserted);
			for (const name of functions)
				assert.match(asserting, new RegExp(`(assert\\.equal|expect)\\(${name}\\(`), `${runner}: ${name} is asserted`);
			assert.equal(detection.witness_tests, 2, runner);

			assert.deepEqual(Object.keys(detection.own_negative_witness), ["mutation"], runner);
			const own = detection.own_negative_witness.mutation!;
			const [unasserted, ...rest] = modulesOf(own);
			assert.ok(unasserted && rest.length === 0, `${runner}: the own negative witness adds one .mjs module`);
			assert.notEqual(unasserted, asserted, runner);
			const calling = testImporting(own, unasserted);
			for (const name of exportsOf(own[unasserted]!))
				assert.match(calling, new RegExp(`\\b${name}\\(`), `${runner}: ${name} is called`);
			assert.doesNotMatch(calling, /\bassert\.|\bexpect\(/, `${runner}: nothing is asserted`);
			assert.match(calling, runner === "vitest" ? /from "vitest"/ : /from "node:test"/, runner);
		}
	});
	it("given a vitest target that installed Stryker and a coverage provider, then the test of every witness module is a .ts file, as the unit witnesses are, so that a vitest include of tests/**/*.test.ts discovers each of them, and a node:test target keeps .mjs tests", () => {
		const testPaths = (project: string) => {
			const detection = detectStack(project, REFS, NODE);
			return [
				...Object.keys(detection.positive_witness),
				...Object.values(detection.own_negative_witness).flatMap((files) => Object.keys(files)),
			].filter((path) => /495-(covered|uncovered|unasserted)-witness\.test\./.test(path));
		};
		const vitest = testPaths(
			targetWith("vitest run", { ...STRYKER, "node_modules/@vitest/coverage-v8/package.json": '{"name":"provider"}' }),
		);
		assert.equal(vitest.length, 3, "the test of the covered module and the tests of the two own negative witnesses");
		for (const path of vitest) assert.match(path, /\.test\.ts$/, path);
		rmSync(join(root, "target"), { recursive: true, force: true });
		const nodeTest = testPaths(targetWith("node --test --experimental-test-coverage", STRYKER));
		assert.equal(nodeTest.length, 3);
		for (const path of nodeTest) assert.match(path, /\.test\.mjs$/, path);
	});
	it("given a node:test target that installed Stryker and asks for coverage, then the positive witness is shared and each control has its own negative witness", () => {
		const detection = detectStack(targetWith("node --test --experimental-test-coverage", STRYKER), REFS, NODE);
		assert.equal(modulesOf(detection.positive_witness).length, 1);
		assert.deepEqual(Object.keys(detection.own_negative_witness).sort(), ["coverage", "mutation"]);
		assert.equal(detection.witness_tests, 2);
	});
});
