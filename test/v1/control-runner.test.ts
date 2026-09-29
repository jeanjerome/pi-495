import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox, SeatbeltSandbox } from "../../src/adapters/sandbox/backends.ts";
import { GenericControlRunner, qualifyControl } from "../../src/adapters/execution/runner.ts";
import { reusableQualification, sensorDigest } from "../../src/application/qualification.ts";
import { orderControls, prerequisitesOf } from "../../src/domain/controls.ts";
import type { Protocol, Qualification } from "../../src/contracts/v1/protocol.ts";
import { parseNodeTestTap, parseJUnit, summarizeJUnit } from "../../src/adapters/execution/parsers.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type { ControlInvocation, ProcessObservation } from "../../src/ports/execution.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import { detectStack } from "../../src/application/target.ts";
import { fixtureTs } from "../helpers/fixtures.ts";
import { EXECUTOR, ENV } from "../helpers/change-fixture.ts";

let root: string;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "ctl-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const NODE = process.execPath;
function control(over: Partial<ControlDefinition> = {}): ControlDefinition {
	return {
		control_id: "unit",
		version: "1",
		title: "unit tests",
		command: [NODE, "--test", "--test-reporter=tap"],
		cwd: ".",
		env_allowlist: ["PATH", "HOME", "TMPDIR"],
		env: {},
		timeout_ms: 30000,
		parser: "node-test",
		report_path: null,
		structure_rules: [],
		scope_argument: null,
		network: "denied",
		writable_paths: [],
		provides: [],
		requires: [],
		requirement_refs: [{ requirement_id: "R1", revision: 1 }],
		protected: true,
		protected_paths: ["test/"],
		...over,
	};
}
function base(): Omit<ControlInvocation, "control" | "workspace_path"> {
	return {
		protocol: { protocol_id: "p", revision: 1, content_digest: digestValue("p") },
		candidate: {
			candidate_id: "c",
			manifest_digest: digestValue("c"),
			base_digest: digestValue("b"),
			workspace_id: "w",
		},
		subject: { kind: "candidate", id: "c", revision: 1, digest: digestValue("c") },
		environment: { environment_id: "env", digest: ENV, profile_id: "verify" },
		requirement_refs: [{ requirement_id: "R1", revision: 1 }],
		producer: EXECUTOR,
	};
}
function obs(over: Partial<ProcessObservation> = {}): ProcessObservation {
	return {
		exit_code: 0,
		signal: null,
		timed_out: false,
		spawn_error: null,
		stdout: new Uint8Array(),
		stderr: new Uint8Array(),
		stdout_truncated: false,
		stderr_truncated: false,
		started_at: "t",
		ended_at: "t",
		duration_ms: 1,
		...over,
	};
}

describe("parsers (VER-02, RM-016, RM-017, SA-014)", () => {
	it("node-test TAP: pass, fail, skip, no test, truncated summary, timeout", () => {
		const tap = (body: string) => body;
		assert.equal(
			parseNodeTestTap(obs(), tap("ok 1 - a\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n")).verdict,
			"PASS",
		);
		const failed = parseNodeTestTap(
			obs({ exit_code: 1 }),
			tap("not ok 1 - greet returns\n# tests 1\n# pass 0\n# fail 1\n"),
		);
		assert.equal(failed.verdict, "FAIL");
		assert.deepEqual(failed.failures, ["greet returns"]);
		assert.equal(
			parseNodeTestTap(obs(), tap("ok 1 - a # SKIP\n# tests 1\n# pass 0\n# fail 0\n# skipped 1\n")).verdict,
			"INDETERMINATE",
		);
		assert.equal(parseNodeTestTap(obs(), tap("# tests 0\n# pass 0\n# fail 0\n")).verdict, "INDETERMINATE");
		assert.equal(parseNodeTestTap(obs({ stdout_truncated: true }), tap("ok 1 - a\n")).verdict, "INDETERMINATE");
		assert.equal(
			parseNodeTestTap(obs({ timed_out: true, exit_code: null }), tap("# tests 3\n# pass 3\n# fail 0\n")).verdict,
			"INDETERMINATE",
		);
		assert.equal(parseNodeTestTap(obs({ spawn_error: "ENOENT", exit_code: null }), "").verdict, "INDETERMINATE");
	});
	it("junit-xml: sums suites, lists failed cases, refuses skips and empty reports", () => {
		const green =
			'<?xml version="1.0"?><testsuite name="A" tests="2" failures="0" errors="0" skipped="0"><testcase name="t1" classname="A"/><testcase name="t2" classname="A"/></testsuite>';
		const red =
			'<testsuite name="B" tests="1" failures="1" errors="0" skipped="0"><testcase name="t3" classname="B"><failure message="boom">trace</failure></testcase></testsuite>';
		assert.equal(parseJUnit(obs(), [green]).verdict, "PASS");
		const s = summarizeJUnit([green, red]);
		assert.deepEqual([s.tests, s.failures, s.failed_cases], [3, 1, ["B.t3"]]);
		assert.equal(parseJUnit(obs({ exit_code: 1 }), [green, red]).verdict, "FAIL");
		assert.equal(
			parseJUnit(obs(), ['<testsuite tests="1" skipped="1"><testcase name="x"><skipped/></testcase></testsuite>'])
				.verdict,
			"INDETERMINATE",
		);
		assert.equal(parseJUnit(obs(), []).verdict, "INDETERMINATE");
		assert.equal(parseJUnit(obs(), null).verdict, "INDETERMINATE");
		assert.equal(parseJUnit(obs(), ['<testsuite tests="0"/>']).verdict, "INDETERMINATE");
	});
});

describe("generic runner on F-TS (C-EXE, VER-01, PRE-03)", () => {
	it("runs node --test in the workspace and produces a canonical PASS evidence with raw outputs in the store", async () => {
		const ws = join(root, "ws");
		fixtureTs(ws);
		const cas = new CasObjectStore(join(root, "objects"));
		const runner = new GenericControlRunner(new UnconfinedSandbox(), cas);
		const { evidence } = await runner.runControl({ ...base(), control: control(), workspace_path: ws });
		assert.equal(evidence.verdict, "PASS", JSON.stringify(evidence.facts));
		assert.equal(evidence.facts.tests, 1);
		assert.ok(evidence.artifacts.some((a) => a.name === "stdout"));
		assert.equal(await cas.verify(evidence.artifacts[0]!.ref.digest), true);
		assert.equal(evidence.control_version, "1+node-test@1.0.0");
		assert.equal(evidence.subject.digest, digestValue("c"));
	});
	it("a failing feature gives FAIL with the failing test as a blocking finding; an absent feature is FAIL not INDETERMINATE (SA-010)", async () => {
		const ws = join(root, "ws");
		fixtureTs(ws);
		writeFileSync(join(ws, "src", "greet.js"), "export function greet(name) { return `Bye, ${name}`; }\n");
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const { evidence } = await runner.runControl({ ...base(), control: control(), workspace_path: ws });
		assert.equal(evidence.verdict, "FAIL");
		assert.equal(evidence.findings.length, 1);
		assert.equal(evidence.findings[0]?.severity, "blocker");
	});
	it("timeout, broken runner and unknown cwd give INDETERMINATE, never PASS (SA-014, REC-05)", async () => {
		const ws = join(root, "ws");
		fixtureTs(ws);
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const slow = await runner.runControl({
			...base(),
			control: control({ command: [NODE, "-e", "setInterval(()=>{},1000)"], timeout_ms: 300, parser: "exit-code" }),
			workspace_path: ws,
		});
		assert.equal(slow.evidence.verdict, "INDETERMINATE");
		assert.match(String(slow.evidence.facts.incident), /timeout/);
		const broken = await runner.runControl({
			...base(),
			control: control({ command: ["/nonexistent/495-runner"] }),
			workspace_path: ws,
		});
		assert.equal(broken.evidence.verdict, "INDETERMINATE");
		const escaping = await runner.runControl({ ...base(), control: control({ cwd: "../../" }), workspace_path: ws });
		assert.equal(escaping.evidence.verdict, "INDETERMINATE");
		assert.match(escaping.evidence.limits.notes[0] ?? "", /escapes/);
	});
	it("exit-code parser follows its contract only: lint script", async () => {
		const ws = join(root, "ws");
		fixtureTs(ws);
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const lint = control({ control_id: "lint", command: [NODE, "scripts/lint.js"], parser: "exit-code" });
		assert.equal((await runner.runControl({ ...base(), control: lint, workspace_path: ws })).evidence.verdict, "PASS");
		writeFileSync(join(ws, "src", "greet.js"), "export function greet(name) { var x = name; return `Hello, ${x}`; }\n");
		assert.equal((await runner.runControl({ ...base(), control: lint, workspace_path: ws })).evidence.verdict, "FAIL");
	});
	it("aggregates Surefire reports from every module in a Maven reactor", async () => {
		const ws = join(root, "reactor");
		const green = (name: string) =>
			`<testsuite name="${name}" tests="1" failures="0" errors="0" skipped="0"><testcase name="works" classname="${name}"/></testsuite>`;
		mkdirSync(join(ws, "domain", "target", "surefire-reports"), { recursive: true });
		mkdirSync(join(ws, "infrastructure", "target", "surefire-reports"), { recursive: true });
		writeFileSync(join(ws, "domain", "target", "surefire-reports", "TEST-domain.xml"), green("Domain"));
		writeFileSync(
			join(ws, "infrastructure", "target", "surefire-reports", "TEST-infrastructure.xml"),
			green("Infrastructure"),
		);
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const junit = control({
			command: [NODE, "-e", "process.exit(0)"],
			parser: "junit-xml",
			report_path: "**/target/surefire-reports",
		});
		const { evidence } = await runner.runControl({ ...base(), control: junit, workspace_path: ws });
		assert.equal(evidence.verdict, "PASS", JSON.stringify(evidence.limits.notes));
		assert.equal(evidence.facts.tests, 2);
		assert.deepEqual(
			evidence.artifacts.map((a) => a.name),
			[
				"report:domain/target/surefire-reports/TEST-domain.xml",
				"report:infrastructure/target/surefire-reports/TEST-infrastructure.xml",
			],
		);
	});
	it("a non-zero exit no test failure explains is a FAIL naming the build error, not an incident", () => {
		const green =
			'<testsuite name="Domain" tests="12" failures="0" errors="0" skipped="0"><testcase name="works" classname="Domain"/></testsuite>';
		const log = [
			"[ERROR] COMPILATION ERROR : ",
			"[ERROR] /ws/infrastructure/src/main/java/UserJdbcRepository.java:[47,44] cannot find symbol",
			"[ERROR]   symbol:   method metadata()",
		].join("\n");
		const broken = parseJUnit(obs({ exit_code: 1 }), [green], log);
		assert.equal(broken.verdict, "FAIL", "green reports plus a broken build is a property of the candidate");
		assert.match(broken.notes[0] ?? "", /outside the tests that ran/);
		assert.ok(
			broken.failures.some((f) => f.includes("cannot find symbol")),
			"the compilation error reaches the findings",
		);
		// Only the incident dimension can answer differently on an identical re-run.
		assert.equal(parseJUnit(obs({ exit_code: null, timed_out: true }), [green]).verdict, "INDETERMINATE");
		assert.equal(parseJUnit(obs({ exit_code: null, spawn_error: "ENOENT" }), [green]).verdict, "INDETERMINATE");
		assert.equal(parseJUnit(obs({ exit_code: 0 }), [green]).verdict, "PASS");
		// The same contract on the TAP side.
		const tap = "# tests 3\n# pass 3\n# fail 0\n";
		assert.equal(parseNodeTestTap(obs({ exit_code: 1 }), tap).verdict, "FAIL");
		assert.equal(parseNodeTestTap(obs({ exit_code: 1 }), "SyntaxError: bad\n").verdict, "FAIL");
		assert.equal(parseNodeTestTap(obs({ exit_code: 1, stdout_truncated: true }), "partial").verdict, "INDETERMINATE");
	});
	it("qualification requires a positive PASS, a negative FAIL and an incident INDETERMINATE (SA-009, VER-05)", async () => {
		const pos = join(root, "pos");
		const neg = join(root, "neg");
		fixtureTs(pos);
		fixtureTs(neg);
		writeFileSync(join(neg, "src", "greet.js"), "export function greet() { return 'nope'; }\n");
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const q = await qualifyControl(runner, control(), { positive_path: pos, negative_path: neg }, base());
		assert.deepEqual([q.positive, q.negative, q.incident, q.qualified], ["PASS", "FAIL", "INDETERMINATE", true]);
		const blind = control({
			control_id: "blind",
			command: [NODE, "-e", "console.log('# tests 1\\n# pass 1\\n# fail 0')"],
		});
		const qb = await qualifyControl(runner, blind, { positive_path: pos, negative_path: neg }, base());
		assert.equal(qb.qualified, false);
		assert.ok(qb.notes.some((n) => n.includes("does not detect")));
		assert.ok(
			qb.notes.some((n) => n.includes("tests=1")),
			"the persisted qualification explains the observed verdict",
		);
		// A sensor that produces no report is unqualified either way, but the reason is not the same:
		// exiting zero proves nothing, exiting non-zero says the build broke before the tests.
		const silentReports = control({
			control_id: "junit-silent",
			command: [NODE, "-e", "process.exit(0)"],
			parser: "junit-xml",
			report_path: "target/surefire-reports",
		});
		const qs = await qualifyControl(runner, silentReports, { positive_path: pos, negative_path: neg }, base());
		assert.equal(qs.qualified, false);
		assert.match(qs.notes[0] ?? "", /no JUnit report found/);
		const brokenBuild = control({
			control_id: "junit",
			command: [NODE, "-e", "process.exit(1)"],
			parser: "junit-xml",
			report_path: "target/surefire-reports",
		});
		const qi = await qualifyControl(runner, brokenBuild, { positive_path: pos, negative_path: neg }, base());
		assert.equal(qi.qualified, false);
		assert.match(qi.notes[0] ?? "", /before producing any test report/);
	});
	it("an established qualification is reused for the same sensor, never across a changed sensor or environment", () => {
		const qualified: Qualification = {
			positive: "PASS",
			negative: "FAIL",
			incident: "INDETERMINATE",
			qualified: true,
			environment_digest: ENV,
			notes: [],
		};
		const protocolWith = (c: ControlDefinition, q: Qualification): Protocol => ({
			protocol_id: "prt",
			change_id: "chg",
			controls: [c],
			qualifications: { [c.control_id]: q },
			capability_diagnosis: {
				stack: "node",
				level: "executed",
				test_files: 1,
				discovered: 1,
				executed: 1,
				undiscriminated_requirements: [],
				unobserved_requirements: [],
				notes: [],
			},
			obligations: [],
			required_reviews: [],
			arbitration: "human_decision",
			baseline: {
				compare_to_reference: true,
				tolerance: "no_aggravation",
				instability: "confirm_then_indeterminate",
				max_confirmations: 1,
			},
			environment_digest: ENV,
		});
		const unit = control();
		const priors = [protocolWith(unit, qualified)];
		assert.deepEqual(
			reusableQualification(priors, unit, ENV),
			qualified,
			"the same sensor in the same environment is not requalified",
		);
		// What the control protects is a G4 concern: it cannot change what the witnesses observe.
		assert.ok(
			reusableQualification(priors, control({ protected_paths: ["test/", "docs/"] }), ENV),
			"protected paths do not invalidate a qualification",
		);
		assert.equal(sensorDigest(unit), sensorDigest(control({ protected_paths: ["other/"] })));
		// What the control runs, and where it runs, do.
		assert.equal(
			reusableQualification(priors, control({ command: [NODE, "--test"] }), ENV),
			null,
			"a different command is a different sensor",
		);
		assert.equal(
			reusableQualification(priors, control({ parser: "exit-code" }), ENV),
			null,
			"a different parser is a different sensor",
		);
		assert.equal(
			reusableQualification(priors, unit, digestValue("other-environment")),
			null,
			"another environment must be qualified again",
		);
		assert.equal(
			reusableQualification([protocolWith(unit, { ...qualified, qualified: false })], unit, ENV),
			null,
			"a refused qualification is never reused",
		);
		// The most recent establishment wins.
		const newer = { ...qualified, notes: ["newer"] };
		assert.deepEqual(
			reusableQualification([protocolWith(unit, qualified), protocolWith(unit, newer)], unit, ENV)?.notes,
			["newer"],
		);
	});
	(process.platform === "darwin" ? it : it.skip)(
		"runs the same control under seatbelt with the candidate read-only",
		async () => {
			const ws = join(root, "ws");
			fixtureTs(ws);
			const runner = new GenericControlRunner(new SeatbeltSandbox(), new CasObjectStore(join(root, "objects")));
			const { evidence } = await runner.runControl({ ...base(), control: control(), workspace_path: ws });
			assert.equal(evidence.verdict, "PASS", JSON.stringify(evidence));
			const mutate = await runner.runControl({
				...base(),
				control: control({
					control_id: "mut",
					command: [NODE, "-e", 'require("fs").writeFileSync("src/greet.js","x")'],
					parser: "exit-code",
				}),
				workspace_path: ws,
			});
			assert.equal(mutate.evidence.verdict, "FAIL", "write to the frozen candidate is refused by the sandbox");
		},
	);
});

/**
 * A sensor that produces no measurement of its own and reads the report another control leaves in
 * the workspace (QLT-04). Its witnesses are only meaningful once that control has run where they
 * live: a fresh witness workspace carries no report, and an absent measurement is INDETERMINATE.
 */
describe("a sensor that reads the report another control writes (VER-05, PRE-03)", () => {
	const SUITE = [
		'import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";',
		'const list = (dir) => { try { return readdirSync(dir).filter((f) => f.endsWith(".js")).sort(); } catch { return []; } };',
		'const xml = (name, cases) => `<testsuite name="${name}" tests="${cases.length}" failures="${cases.filter((c) => c.failed).length}" errors="0" skipped="0">` + cases.map((c) => c.failed ? `<testcase name="${c.name}" classname="${name}"><failure message="${c.message}">-</failure></testcase>` : `<testcase name="${c.name}" classname="${name}"/>`).join("") + "</testsuite>";',
		'const tests = list("test");',
		'const suiteText = tests.map((f) => readFileSync(`test/${f}`, "utf8")).join("\\n");',
		'const suiteCases = tests.map((f) => ({ name: f, failed: readFileSync(`test/${f}`, "utf8").includes("495-defect"), message: "injected defect" }));',
		'mkdirSync("target/reports", { recursive: true });',
		'writeFileSync("target/reports/TEST-suite.xml", xml("suite", suiteCases));',
		"// the audit is written by the same build, after the suite: a red suite stops it before the measurement",
		"if (!suiteCases.some((c) => c.failed)) {",
		'  const auditCases = list("src").map((f) => ({ name: f, failed: !suiteText.includes(f), message: "no test refers to this source" }));',
		'  mkdirSync("target/audit", { recursive: true });',
		'  writeFileSync("target/audit/TEST-audit.xml", xml("audit", auditCases));',
		"}",
		"process.exit(suiteCases.some((c) => c.failed) ? 1 : 0);",
	].join("\n");

	function tree(ws: string, over: Record<string, string> = {}): void {
		const files: Record<string, string> = {
			"package.json": JSON.stringify({ name: "f-report", version: "1.0.0", type: "module" }, null, 2),
			"src/feature.js": "export function feature() {\n  return 1;\n}\n",
			"test/feature.test.js":
				'import { feature } from "../src/feature.js";\nif (feature() !== 1) throw new Error("feature");\n',
			"scripts/suite.js": SUITE,
			...over,
		};
		for (const [rel, content] of Object.entries(files)) {
			mkdirSync(join(ws, rel, ".."), { recursive: true });
			writeFileSync(join(ws, rel), content);
		}
	}

	const suite = () =>
		control({
			control_id: "suite",
			title: "the build that writes both reports",
			command: [NODE, "scripts/suite.js"],
			parser: "junit-xml",
			report_path: "target/reports",
			writable_paths: ["target"],
			provides: ["suite-report", "audit-report"],
			requires: [],
		});
	const audit = () =>
		control({
			control_id: "audit",
			title: "the audit report the build leaves behind",
			command: [NODE, "-e", ""],
			parser: "junit-xml",
			report_path: "target/audit",
			writable_paths: [],
			provides: [],
			requires: ["audit-report"],
		});

	it("orders the controls by what each declares it writes and reads, names a cycle and lets an external report through", () => {
		const ordered = orderControls([audit(), suite()]);
		assert.deepEqual(
			ordered.ordered.map((c) => c.control_id),
			["suite", "audit"],
			"the reader follows the writer whatever the order of the array",
		);
		assert.deepEqual(ordered.cycles, []);
		assert.deepEqual(
			prerequisitesOf(audit(), ordered.ordered).map((c) => c.control_id),
			["suite"],
		);
		assert.deepEqual(
			prerequisitesOf(suite(), ordered.ordered).map((c) => c.control_id),
			[],
		);
		// Controls that declare nothing about each other keep the order they are declared in: nothing
		// separates them but their cost, and only the adapter that proposes them knows it.
		const independent = orderControls([
			control({ control_id: "lint" }),
			control({ control_id: "audit" }),
			control({ control_id: "unit" }),
		]);
		assert.deepEqual(
			independent.ordered.map((c) => c.control_id),
			["lint", "audit", "unit"],
		);
		// A report no control in the list writes is already there: an external prerequisite blocks nobody.
		const orphan = orderControls([control({ control_id: "reader", requires: ["written-elsewhere"] })]);
		assert.deepEqual([orphan.ordered.map((c) => c.control_id), orphan.cycles], [["reader"], []]);
		// Two controls waiting on each other are named instead of being run in an arbitrary order.
		const cycle = orderControls([
			control({ control_id: "x", provides: ["a"], requires: ["b"] }),
			control({ control_id: "y", provides: ["b"], requires: ["a"] }),
		]);
		assert.deepEqual(cycle.cycles, ["x", "y"]);
	});

	it("runs the producing control in each witness workspace, so the sensor's own negative witness holds a report to judge", async () => {
		const pos = join(root, "pos");
		const shared = join(root, "shared");
		const own = join(root, "own");
		tree(pos);
		// The shared negative witness is a failing test: it proves the suite, and stops the build
		// before the audit is written, which is why the sensor needs a witness workspace of its own.
		tree(shared, { "test/495-negative-witness.test.js": '// 495-defect\nthrow new Error("injected");\n' });
		// The defect this sensor claims to detect: a source no test refers to. The suite stays green.
		tree(own, { "src/orphan.js": "export function orphan() {\n  return 2;\n}\n" });
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));

		const qs = await qualifyControl(runner, suite(), { positive_path: pos, negative_path: shared }, base());
		assert.deepEqual(
			[qs.positive, qs.negative, qs.incident, qs.qualified],
			["PASS", "FAIL", "INDETERMINATE", true],
			JSON.stringify(qs.notes),
		);

		// The positive workspace carries the audit report only because the suite was just qualified in
		// it; the sensor's own negative workspace is a fresh copy where nothing has run.
		const qa = await qualifyControl(
			runner,
			audit(),
			{ positive_path: pos, negative_path: own },
			base(),
			prerequisitesOf(audit(), orderControls([suite(), audit()]).ordered),
		);
		assert.deepEqual(
			[qa.positive, qa.negative, qa.incident, qa.qualified],
			["PASS", "FAIL", "INDETERMINATE", true],
			JSON.stringify(qa.notes),
		);
		assert.ok(
			qa.notes.every((n) => !n.includes("no JUnit report found")),
			JSON.stringify(qa.notes),
		);
	});
});

/** JUnit reports as vitest 5.0.0 wrote them: one suite per file, a `testsuites` root, the failure as text. */
const VITEST_GREEN_REPORT = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="1" failures="0" errors="0" time="0.000943834">
    <testsuite name="tests/sum.test.ts" timestamp="2026-09-29T08:59:18.273Z" hostname="host" tests="1" failures="0" errors="0" skipped="0" time="0.000943834">
        <testcase classname="tests/sum.test.ts" name="given two numbers, when added, then they sum" time="0.0005255">
        </testcase>
    </testsuite>
</testsuites>
`;
const VITEST_FAILING_REPORT = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="2" failures="1" errors="0" time="0.003157916">
    <testsuite name="tests/sum.test.ts" timestamp="2026-09-29T08:59:18.512Z" hostname="host" tests="2" failures="1" errors="0" skipped="0" time="0.003157916">
        <testcase classname="tests/sum.test.ts" name="given two numbers, when added, then they sum" time="0.000566625">
        </testcase>
        <testcase classname="tests/sum.test.ts" name="given two numbers, when subtracted, then they differ" time="0.002117541">
            <failure message="expected 1 to be 2 // Object.is equality" type="AssertionError">
AssertionError: expected 1 to be 2 // Object.is equality

- Expected
+ Received

- 2
+ 1

 ❯ tests/sum.test.ts:8:17
            </failure>
        </testcase>
    </testsuite>
</testsuites>
`;

/**
 * Stands in for vitest: bundles nothing but leaves a file in `node_modules/.vite-temp` as Vite does
 * when it compiles a configuration, copies the recorded report to the `--outputFile` it is given, and
 * exits as vitest does.
 */
class FakeVitest {
	readonly recorded: string | null;
	readonly exitCode: number;
	constructor(recorded: string | null, exitCode: number) {
		this.recorded = recorded;
		this.exitCode = exitCode;
	}
	install(workspace: string): void {
		mkdirSync(join(workspace, "node_modules", "vitest"), { recursive: true });
		const script = [
			'import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";',
			'import { dirname } from "node:path";',
			'mkdirSync("node_modules/.vite-temp", { recursive: true });',
			'writeFileSync("node_modules/.vite-temp/vitest.config.ts.timestamp.mjs", "export default {};");',
			'const out = process.argv.find((a) => a.startsWith("--outputFile="))?.slice("--outputFile=".length);',
			`if (out && ${this.recorded !== null}) { mkdirSync(dirname(out), { recursive: true }); copyFileSync(new URL("recorded.xml", import.meta.url), out); }`,
			`process.exit(${this.exitCode});`,
		].join("\n");
		writeFileSync(join(workspace, "node_modules", "vitest", "vitest.mjs"), script);
		if (this.recorded !== null) writeFileSync(join(workspace, "node_modules", "vitest", "recorded.xml"), this.recorded);
	}
}

/** The unit control the detection derives from a target whose `scripts.test` is `vitest run`. */
function derivedVitestControl(): ControlDefinition {
	const project = join(root, "target");
	mkdirSync(project, { recursive: true });
	writeFileSync(join(project, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
	return detectStack(project, [{ requirement_id: "R1", revision: 1 }], NODE).controls.find(
		(c) => c.control_id === "unit",
	)!;
}

describe("the derived vitest control through the runner", () => {
	it("given the derived vitest control run against a recorded vitest report, then the evidence is PASS for a green report, FAIL naming the failed case for a failing one, and INDETERMINATE when no report is written", async () => {
		const unit = derivedVitestControl();
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const run = async (fake: FakeVitest) => {
			const ws = mkdtempSync(join(root, "ws-"));
			fake.install(ws);
			return (await runner.runControl({ ...base(), control: unit, workspace_path: ws })).evidence;
		};
		const green = await run(new FakeVitest(VITEST_GREEN_REPORT, 0));
		assert.equal(green.verdict, "PASS", JSON.stringify(green.limits.notes));
		assert.equal(green.facts.tests, 1);
		const failing = await run(new FakeVitest(VITEST_FAILING_REPORT, 1));
		assert.equal(failing.verdict, "FAIL");
		assert.deepEqual(failing.facts.failed_cases, [
			"tests/sum.test.ts.given two numbers, when subtracted, then they differ",
		]);
		const silent = await run(new FakeVitest(null, 0));
		assert.equal(silent.verdict, "INDETERMINATE");
	});
	(process.platform === "darwin" ? it : it.skip)(
		"given the derived vitest control run under the verification sandbox against a stand-in that creates the parent directory of its output and the directory where Vite compiles its configuration, then the report is read and the verdict is PASS",
		async () => {
			const unit = derivedVitestControl();
			// The copy of a target carries no target/ directory: the sandbox has to let the control create it.
			const ws = mkdtempSync(join(root, "ws-"));
			new FakeVitest(VITEST_GREEN_REPORT, 0).install(ws);
			// No temporary directory is granted: the test tree may itself live under $TMPDIR, where a write
			// would succeed whatever the control declares writable.
			const sandbox = new SeatbeltSandbox({ temp_paths: [] });
			const runner = new GenericControlRunner(sandbox, new CasObjectStore(join(root, "objects")));
			const { evidence } = await runner.runControl({ ...base(), control: unit, workspace_path: ws });
			assert.equal(evidence.verdict, "PASS", JSON.stringify(evidence.limits.notes));
			assert.equal(evidence.facts.tests, 1);
		},
	);
});
