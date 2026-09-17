import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox, SeatbeltSandbox } from "../../src/adapters/sandbox/backends.ts";
import { GenericControlRunner, qualifyControl } from "../../src/adapters/execution/runner.ts";
import { reusableQualification, sensorDigest } from "../../src/application/qualification.ts";
import type { Protocol, Qualification } from "../../src/contracts/v1/protocol.ts";
import { parseNodeTestTap, parseJUnit, summarizeJUnit } from "../../src/adapters/execution/parsers.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type { ControlInvocation, ProcessObservation } from "../../src/ports/execution.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import { fixtureTs } from "../helpers/fixtures.ts";
import { EXECUTOR, ENV } from "../helpers/change-fixture.ts";

let root: string;
beforeEach(() => { mkdirSync(join(process.cwd(), "test-output"), { recursive: true }); root = mkdtempSync(join(process.cwd(), "test-output", "ctl-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

const NODE = process.execPath;
function control(over: Partial<ControlDefinition> = {}): ControlDefinition {
	return { control_id: "unit", version: "1", title: "unit tests", command: [NODE, "--test", "--test-reporter=tap"], cwd: ".", env_allowlist: ["PATH", "HOME", "TMPDIR"], env: {}, timeout_ms: 30000, parser: "node-test", report_path: null, structure_rules: [], scope_argument: null, network: "denied", writable_paths: [], requirement_refs: [{ requirement_id: "R1", revision: 1 }], protected: true, protected_paths: ["test/"], ...over };
}
function base(): Omit<ControlInvocation, "control" | "workspace_path"> {
	return { protocol: { protocol_id: "p", revision: 1, content_digest: digestValue("p") }, candidate: { candidate_id: "c", manifest_digest: digestValue("c"), base_digest: digestValue("b"), workspace_id: "w" }, subject: { kind: "candidate", id: "c", revision: 1, digest: digestValue("c") }, environment: { environment_id: "env", digest: ENV, profile_id: "verify" }, requirement_refs: [{ requirement_id: "R1", revision: 1 }], producer: EXECUTOR };
}
function obs(over: Partial<ProcessObservation> = {}): ProcessObservation {
	return { exit_code: 0, signal: null, timed_out: false, spawn_error: null, stdout: new Uint8Array(), stderr: new Uint8Array(), stdout_truncated: false, stderr_truncated: false, started_at: "t", ended_at: "t", duration_ms: 1, ...over };
}

describe("parsers (VER-02, RM-016, RM-017, SA-014)", () => {
	it("node-test TAP: pass, fail, skip, no test, truncated summary, timeout", () => {
		const tap = (body: string) => body;
		assert.equal(parseNodeTestTap(obs(), tap("ok 1 - a\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n")).verdict, "PASS");
		const failed = parseNodeTestTap(obs({ exit_code: 1 }), tap("not ok 1 - greet returns\n# tests 1\n# pass 0\n# fail 1\n"));
		assert.equal(failed.verdict, "FAIL");
		assert.deepEqual(failed.failures, ["greet returns"]);
		assert.equal(parseNodeTestTap(obs(), tap("ok 1 - a # SKIP\n# tests 1\n# pass 0\n# fail 0\n# skipped 1\n")).verdict, "INDETERMINATE");
		assert.equal(parseNodeTestTap(obs(), tap("# tests 0\n# pass 0\n# fail 0\n")).verdict, "INDETERMINATE");
		assert.equal(parseNodeTestTap(obs({ stdout_truncated: true }), tap("ok 1 - a\n")).verdict, "INDETERMINATE");
		assert.equal(parseNodeTestTap(obs({ timed_out: true, exit_code: null }), tap("# tests 3\n# pass 3\n# fail 0\n")).verdict, "INDETERMINATE");
		assert.equal(parseNodeTestTap(obs({ spawn_error: "ENOENT", exit_code: null }), "").verdict, "INDETERMINATE");
	});
	it("junit-xml: sums suites, lists failed cases, refuses skips and empty reports", () => {
		const green = '<?xml version="1.0"?><testsuite name="A" tests="2" failures="0" errors="0" skipped="0"><testcase name="t1" classname="A"/><testcase name="t2" classname="A"/></testsuite>';
		const red = '<testsuite name="B" tests="1" failures="1" errors="0" skipped="0"><testcase name="t3" classname="B"><failure message="boom">trace</failure></testcase></testsuite>';
		assert.equal(parseJUnit(obs(), [green]).verdict, "PASS");
		const s = summarizeJUnit([green, red]);
		assert.deepEqual([s.tests, s.failures, s.failed_cases], [3, 1, ["B.t3"]]);
		assert.equal(parseJUnit(obs({ exit_code: 1 }), [green, red]).verdict, "FAIL");
		assert.equal(parseJUnit(obs(), ['<testsuite tests="1" skipped="1"><testcase name="x"><skipped/></testcase></testsuite>']).verdict, "INDETERMINATE");
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
		const slow = await runner.runControl({ ...base(), control: control({ command: [NODE, "-e", "setInterval(()=>{},1000)"], timeout_ms: 300, parser: "exit-code" }), workspace_path: ws });
		assert.equal(slow.evidence.verdict, "INDETERMINATE");
		assert.match(String(slow.evidence.facts.incident), /timeout/);
		const broken = await runner.runControl({ ...base(), control: control({ command: ["/nonexistent/495-runner"] }), workspace_path: ws });
		assert.equal(broken.evidence.verdict, "INDETERMINATE");
		const escape = await runner.runControl({ ...base(), control: control({ cwd: "../../" }), workspace_path: ws });
		assert.equal(escape.evidence.verdict, "INDETERMINATE");
		assert.match(escape.evidence.limits.notes[0] ?? "", /escapes/);
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
		const green = (name: string) => `<testsuite name="${name}" tests="1" failures="0" errors="0" skipped="0"><testcase name="works" classname="${name}"/></testsuite>`;
		mkdirSync(join(ws, "domain", "target", "surefire-reports"), { recursive: true });
		mkdirSync(join(ws, "infrastructure", "target", "surefire-reports"), { recursive: true });
		writeFileSync(join(ws, "domain", "target", "surefire-reports", "TEST-domain.xml"), green("Domain"));
		writeFileSync(join(ws, "infrastructure", "target", "surefire-reports", "TEST-infrastructure.xml"), green("Infrastructure"));
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const junit = control({ command: [NODE, "-e", "process.exit(0)"], parser: "junit-xml", report_path: "**/target/surefire-reports" });
		const { evidence } = await runner.runControl({ ...base(), control: junit, workspace_path: ws });
		assert.equal(evidence.verdict, "PASS", JSON.stringify(evidence.limits.notes));
		assert.equal(evidence.facts.tests, 2);
		assert.deepEqual(evidence.artifacts.map((a) => a.name), ["report:domain/target/surefire-reports/TEST-domain.xml", "report:infrastructure/target/surefire-reports/TEST-infrastructure.xml"]);
	});
	it("a non-zero exit no test failure explains is a FAIL naming the build error, not an incident", () => {
		const green = '<testsuite name="Domain" tests="12" failures="0" errors="0" skipped="0"><testcase name="works" classname="Domain"/></testsuite>';
		const log = [
			"[ERROR] COMPILATION ERROR : ",
			"[ERROR] /ws/infrastructure/src/main/java/UserJdbcRepository.java:[47,44] cannot find symbol",
			"[ERROR]   symbol:   method metadata()",
		].join("\n");
		const broken = parseJUnit(obs({ exit_code: 1 }), [green], log);
		assert.equal(broken.verdict, "FAIL", "green reports plus a broken build is a property of the candidate");
		assert.match(broken.notes[0] ?? "", /outside the tests that ran/);
		assert.ok(broken.failures.some((f) => f.includes("cannot find symbol")), "the compilation error reaches the findings");
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
		const blind = control({ control_id: "blind", command: [NODE, "-e", "console.log('# tests 1\\n# pass 1\\n# fail 0')"] });
		const qb = await qualifyControl(runner, blind, { positive_path: pos, negative_path: neg }, base());
		assert.equal(qb.qualified, false);
		assert.ok(qb.notes.some((n) => n.includes("does not detect")));
		assert.ok(qb.notes.some((n) => n.includes("tests=1")), "the persisted qualification explains the observed verdict");
		// A sensor that produces no report is unqualified either way, but the reason is not the same:
		// exiting zero proves nothing, exiting non-zero says the build broke before the tests.
		const silentReports = control({ control_id: "junit-silent", command: [NODE, "-e", "process.exit(0)"], parser: "junit-xml", report_path: "target/surefire-reports" });
		const qs = await qualifyControl(runner, silentReports, { positive_path: pos, negative_path: neg }, base());
		assert.equal(qs.qualified, false);
		assert.match(qs.notes[0] ?? "", /no JUnit report found/);
		const brokenBuild = control({ control_id: "junit", command: [NODE, "-e", "process.exit(1)"], parser: "junit-xml", report_path: "target/surefire-reports" });
		const qi = await qualifyControl(runner, brokenBuild, { positive_path: pos, negative_path: neg }, base());
		assert.equal(qi.qualified, false);
		assert.match(qi.notes[0] ?? "", /before producing any test report/);
	});
	it("an established qualification is reused for the same sensor, never across a changed sensor or environment", () => {
		const qualified: Qualification = { positive: "PASS", negative: "FAIL", incident: "INDETERMINATE", qualified: true, environment_digest: ENV, notes: [] };
		const protocolWith = (c: ControlDefinition, q: Qualification): Protocol => ({ protocol_id: "prt", change_id: "chg", controls: [c], qualifications: { [c.control_id]: q }, capability_diagnosis: { stack: "node", level: "executed", test_files: 1, discovered: 1, executed: 1, undiscriminated_requirements: [], unobserved_requirements: [], notes: [] }, obligations: [], required_reviews: [], arbitration: "human_decision", baseline: { compare_to_reference: true, tolerance: "no_aggravation", instability: "confirm_then_indeterminate", max_confirmations: 1 }, environment_digest: ENV });
		const unit = control();
		const priors = [protocolWith(unit, qualified)];
		assert.deepEqual(reusableQualification(priors, unit, ENV), qualified, "the same sensor in the same environment is not requalified");
		// What the control protects is a G4 concern: it cannot change what the witnesses observe.
		assert.ok(reusableQualification(priors, control({ protected_paths: ["test/", "docs/"] }), ENV), "protected paths do not invalidate a qualification");
		assert.equal(sensorDigest(unit), sensorDigest(control({ protected_paths: ["other/"] })));
		// What the control runs, and where it runs, do.
		assert.equal(reusableQualification(priors, control({ command: [NODE, "--test"] }), ENV), null, "a different command is a different sensor");
		assert.equal(reusableQualification(priors, control({ parser: "exit-code" }), ENV), null, "a different parser is a different sensor");
		assert.equal(reusableQualification(priors, unit, digestValue("other-environment")), null, "another environment must be qualified again");
		assert.equal(reusableQualification([protocolWith(unit, { ...qualified, qualified: false })], unit, ENV), null, "a refused qualification is never reused");
		// The most recent establishment wins.
		const newer = { ...qualified, notes: ["newer"] };
		assert.deepEqual(reusableQualification([protocolWith(unit, qualified), protocolWith(unit, newer)], unit, ENV)?.notes, ["newer"]);
	});
	(process.platform === "darwin" ? it : it.skip)("runs the same control under seatbelt with the candidate read-only", async () => {
		const ws = join(root, "ws");
		fixtureTs(ws);
		const runner = new GenericControlRunner(new SeatbeltSandbox(), new CasObjectStore(join(root, "objects")));
		const { evidence } = await runner.runControl({ ...base(), control: control(), workspace_path: ws });
		assert.equal(evidence.verdict, "PASS", JSON.stringify(evidence));
		const mutate = await runner.runControl({ ...base(), control: control({ control_id: "mut", command: [NODE, "-e", 'require("fs").writeFileSync("src/greet.js","x")'], parser: "exit-code" }), workspace_path: ws });
		assert.equal(mutate.evidence.verdict, "FAIL", "write to the frozen candidate is refused by the sandbox");
	});
});
