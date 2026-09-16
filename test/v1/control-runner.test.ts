import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox, SeatbeltSandbox } from "../../src/adapters/sandbox/backends.ts";
import { GenericControlRunner, qualifyControl } from "../../src/adapters/execution/runner.ts";
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
	return { control_id: "unit", version: "1", title: "unit tests", command: [NODE, "--test", "--test-reporter=tap"], cwd: ".", env_allowlist: ["PATH", "HOME", "TMPDIR"], env: {}, timeout_ms: 30000, parser: "node-test", report_path: null, network: "denied", writable_paths: [], requirement_refs: [{ requirement_id: "R1", revision: 1 }], protected: true, protected_paths: ["test/"], ...over };
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
