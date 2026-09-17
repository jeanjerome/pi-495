/**
 * Differential coverage (QLT-04): the sensor reads the report the frozen test control already wrote
 * and judges the lines the candidate introduced. No Maven run is needed to exercise it — a JaCoCo
 * report is an input like any other, and the V4 campaign covers the real chain.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { COVERAGE_RULE_PARTIAL, COVERAGE_RULE_UNCOVERED, measurableIntroducedPaths, parseJacoco } from "../../src/adapters/execution/parsers.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import { detectStack } from "../../src/application/target.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type { ControlInvocation, ProcessObservation } from "../../src/ports/execution.ts";
import { fixtureJava, JACOCO_PLUGIN } from "../helpers/fixtures.ts";
import { EXECUTOR, ENV } from "../helpers/change-fixture.ts";

const NODE = process.execPath;
const GREETER = "src/main/java/io/h495/Greeter.java";

let root: string;
beforeEach(() => { mkdirSync(join(process.cwd(), "test-output"), { recursive: true }); root = mkdtempSync(join(process.cwd(), "test-output", "cov-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

interface SourceSpec {
	file: string;
	methods?: { name: string; line: number }[];
	klass?: string;
	lines: { nr: number; ci?: number; mi?: number; mb?: number; cb?: number }[];
}

/** A JaCoCo XML report as the `report` goal writes it: classes with their methods, then line counters. */
function jacocoXml(packageName: string, sources: SourceSpec[]): string {
	const body = sources.map((s) => {
		const klass = s.klass ?? `${packageName ? `${packageName}/` : ""}${s.file.replace(/\.java$/, "")}`;
		const methods = (s.methods ?? []).map((m) => `<method name="${m.name}" desc="()V" line="${m.line}"><counter type="INSTRUCTION" missed="0" covered="1"/></method>`).join("");
		const lines = s.lines.map((l) => `<line nr="${l.nr}" mi="${l.mi ?? 0}" ci="${l.ci ?? 0}" mb="${l.mb ?? 0}" cb="${l.cb ?? 0}"/>`).join("");
		return `<class name="${klass}" sourcefilename="${s.file}">${methods}</class><sourcefile name="${s.file}">${lines}</sourcefile>`;
	}).join("");
	return `<?xml version="1.0" encoding="UTF-8"?><report name="fixture"><sessioninfo id="s" start="1" dump="2"/><package name="${packageName}">${body}</package></report>`;
}

function doc(text: string, name = "target/site/jacoco/jacoco.xml") {
	return [{ name, text }];
}

function obs(over: Partial<ProcessObservation> = {}): ProcessObservation {
	return { exit_code: 0, signal: null, timed_out: false, spawn_error: null, stdout: new Uint8Array(), stderr: new Uint8Array(), stdout_truncated: false, stderr_truncated: false, started_at: "t", ended_at: "t", duration_ms: 1, ...over };
}

function control(over: Partial<ControlDefinition> = {}): ControlDefinition {
	return { control_id: "coverage", version: "1", title: "introduced-line coverage", command: [NODE, "-e", ""], cwd: ".", env_allowlist: ["PATH", "HOME", "TMPDIR"], env: {}, timeout_ms: 30000, parser: "jacoco-xml", report_path: "**/target/site/jacoco", network: "denied", writable_paths: [], requirement_refs: [{ requirement_id: "R1", revision: 1 }], protected: true, protected_paths: ["pom.xml"], ...over };
}

function base(): Omit<ControlInvocation, "control" | "workspace_path"> {
	return { protocol: { protocol_id: "p", revision: 1, content_digest: digestValue("p") }, candidate: { candidate_id: "c", manifest_digest: digestValue("c"), base_digest: digestValue("b"), workspace_id: "w" }, subject: { kind: "candidate", id: "c", revision: 1, digest: digestValue("c") }, environment: { environment_id: "env", digest: ENV, profile_id: "verify" }, requirement_refs: [{ requirement_id: "R1", revision: 1 }], producer: EXECUTOR };
}

describe("coverage of the introduced lines (QLT-04)", () => {
	it("an introduced line no test exercises fails, named at its file, at its line and at its symbol", () => {
		// JaCoCo writes a constructor `&lt;init&gt;`; the five XML entities are decoded before a symbol is named.
		const report = jacocoXml("io/h495", [{ file: "Greeter.java", methods: [{ name: "&lt;init&gt;", line: 3 }, { name: "greet", line: 5 }, { name: "farewell", line: 9 }], lines: [{ nr: 3, mi: 3 }, { nr: 5, ci: 4 }, { nr: 9, mi: 3 }, { nr: 10, mi: 2 }] }]);
		const parsed = parseJacoco(obs(), doc(report), { [GREETER]: [3, 9, 10] });
		assert.equal(parsed.verdict, "FAIL");
		assert.deepEqual([parsed.facts.measured_lines, parsed.facts.uncovered_lines, parsed.facts.tolerated_uncovered_lines], [3, 3, 0]);
		const findings = parsed.findings ?? [];
		assert.deepEqual(findings.map((f) => f.message), [
			`${GREETER}:3 introduced line never exercised by the suite in io.h495.Greeter.<init>`,
			`${GREETER}:9 introduced line never exercised by the suite in io.h495.Greeter.farewell`,
			`${GREETER}:10 introduced line never exercised by the suite in io.h495.Greeter.farewell`,
		]);
		assert.deepEqual([findings[0]!.rule_id, findings[0]!.category, findings[0]!.severity], [COVERAGE_RULE_UNCOVERED, "quality", "blocker"]);
	});

	it("a refactoring that only touches exercised lines passes, and the debt it did not create is named, not counted against it", () => {
		// The same file carries three lines nothing has ever exercised; the candidate wrote none of them.
		const report = jacocoXml("io/h495", [{ file: "Greeter.java", methods: [{ name: "greet", line: 5 }], lines: [{ nr: 5, ci: 4 }, { nr: 6, ci: 2 }, { nr: 20, mi: 3 }, { nr: 21, mi: 3 }, { nr: 22, mi: 1 }] }]);
		const parsed = parseJacoco(obs(), doc(report), { [GREETER]: [5, 6] });
		assert.equal(parsed.verdict, "PASS", JSON.stringify(parsed.notes));
		assert.deepEqual(parsed.findings, []);
		assert.equal(parsed.facts.tolerated_uncovered_lines, 3);
		assert.ok(parsed.notes.some((n) => n.includes("already unexercised") && n.includes("not on a ratio")));
	});

	it("a global ratio would have answered the other way round on both trees", () => {
		// 2 of 5 instrumented lines exercised: 40 %, under any threshold a repository would set.
		const poor = jacocoXml("io/h495", [{ file: "Greeter.java", methods: [{ name: "greet", line: 5 }], lines: [{ nr: 5, ci: 4 }, { nr: 6, ci: 2 }, { nr: 20, mi: 3 }, { nr: 21, mi: 3 }, { nr: 22, mi: 1 }] }]);
		assert.equal(parseJacoco(obs(), doc(poor), { [GREETER]: [5] }).verdict, "PASS", "a component historically below the line is not blocked for a candidate that adds nothing to its debt");
		// 4 of 5 exercised: 80 %, above the same threshold, and the one line this candidate wrote is the missed one.
		const rich = jacocoXml("io/h495", [{ file: "Greeter.java", methods: [{ name: "greet", line: 5 }], lines: [{ nr: 5, ci: 4 }, { nr: 6, ci: 2 }, { nr: 7, ci: 2 }, { nr: 8, ci: 2 }, { nr: 22, mi: 1 }] }]);
		assert.equal(parseJacoco(obs(), doc(rich), { [GREETER]: [22] }).verdict, "FAIL", "an untested addition is not compensated by the rest of the tree");
	});

	it("an introduced line exercised on part of its branches is reported without blocking", () => {
		const report = jacocoXml("io/h495", [{ file: "Greeter.java", methods: [{ name: "greet", line: 5 }], lines: [{ nr: 5, ci: 4, cb: 1, mb: 1 }] }]);
		const parsed = parseJacoco(obs(), doc(report), { [GREETER]: [5] });
		assert.equal(parsed.verdict, "PASS");
		assert.equal(parsed.facts.partially_covered_lines, 1);
		assert.deepEqual([parsed.findings?.[0]?.rule_id, parsed.findings?.[0]?.severity], [COVERAGE_RULE_PARTIAL, "major"]);
	});

	it("an absent measurement is never read as coverage (QLT-02)", () => {
		const report = jacocoXml("io/h495", [{ file: "Greeter.java", methods: [{ name: "greet", line: 5 }], lines: [{ nr: 5, ci: 4 }] }]);
		const introduced = { [GREETER]: [5] };
		assert.equal(parseJacoco(obs(), null, introduced).verdict, "INDETERMINATE", "no report at all");
		assert.equal(parseJacoco(obs(), doc(report), null).verdict, "INDETERMINATE", "no introduced-line set");
		assert.equal(parseJacoco(obs({ exit_code: 3 }), doc(report), introduced).verdict, "INDETERMINATE", "the sensor itself failed");
		assert.equal(parseJacoco(obs({ spawn_error: "ENOENT", exit_code: null }), doc(report), introduced).verdict, "INDETERMINATE", "broken runner");
		const unmeasured = parseJacoco(obs(), doc(report), { ...introduced, "src/main/java/io/h495/Absent.java": [1] });
		assert.equal(unmeasured.verdict, "INDETERMINATE");
		assert.ok(unmeasured.notes[0]?.includes("src/main/java/io/h495/Absent.java"));
		// The reference introduces nothing, so the sensor has nothing to say about it and says so.
		assert.equal(parseJacoco(obs(), doc(report), {}).verdict, "PASS");
		assert.equal(parseJacoco(obs(), null, {}).verdict, "PASS");
	});

	it("only what JaCoCo instruments is expected in a report", () => {
		assert.deepEqual(measurableIntroducedPaths({
			[GREETER]: [1],
			"src/test/java/io/h495/GreeterTest.java": [1],
			"src/main/java/io/h495/package-info.java": [1],
			"src/main/java/module-info.java": [1],
			"src/main/resources/app.properties": [1],
			"pom.xml": [1],
			"domain/src/main/kotlin/io/h495/Port.kt": [1],
		}), ["domain/src/main/kotlin/io/h495/Port.kt", GREETER]);
	});

	it("reads one report per module and refuses to guess an ambiguous attribution", () => {
		const shared = jacocoXml("io/h495", [{ file: "Adapter.java", methods: [{ name: "run", line: 3 }], lines: [{ nr: 3, mi: 2 }] }]);
		const perModule = [{ name: "domain/target/site/jacoco/jacoco.xml", text: shared }, { name: "infrastructure/target/site/jacoco/jacoco.xml", text: shared }];
		const parsed = parseJacoco(obs(), perModule, { "domain/src/main/java/io/h495/Adapter.java": [3], "infrastructure/src/main/java/io/h495/Adapter.java": [3] });
		assert.equal(parsed.verdict, "FAIL");
		assert.equal(parsed.findings?.length, 2, "each module report is attributed to its own module");
		const rootReport = [{ name: "target/site/jacoco/jacoco.xml", text: shared }];
		const ambiguous = parseJacoco(obs(), rootReport, { "domain/src/main/java/io/h495/Adapter.java": [3], "infrastructure/src/main/java/io/h495/Adapter.java": [3] });
		assert.equal(ambiguous.verdict, "INDETERMINATE");
		assert.ok(ambiguous.notes.some((n) => n.includes("matches several touched paths")));
	});
});

describe("the coverage control through the generic runner", () => {
	function workspace(name: string, report: string): string {
		const ws = join(root, name);
		mkdirSync(join(ws, "target", "site", "jacoco"), { recursive: true });
		writeFileSync(join(ws, "target", "site", "jacoco", "jacoco.xml"), report);
		return ws;
	}

	it("runs no measurement of its own, reads the report left in the workspace and locates each finding", async () => {
		const ws = workspace("ws", jacocoXml("io/h495", [{ file: "Greeter.java", methods: [{ name: "greet", line: 5 }, { name: "farewell", line: 9 }], lines: [{ nr: 5, ci: 4 }, { nr: 9, mi: 3 }] }]));
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const { evidence } = await runner.runControl({ ...base(), control: control(), workspace_path: ws, introduced_lines: { [GREETER]: [9] } });
		assert.equal(evidence.verdict, "FAIL", JSON.stringify(evidence.limits.notes));
		assert.equal(evidence.control_version, "1+jacoco-xml@1.0.0");
		assert.equal(evidence.findings.length, 1);
		const finding = evidence.findings[0]!;
		assert.equal(finding.path, GREETER);
		assert.equal(finding.region?.start_line, 9);
		assert.equal(finding.symbol, "io.h495.Greeter.farewell");
		assert.deepEqual([finding.rule_id, finding.category, finding.severity], [COVERAGE_RULE_UNCOVERED, "quality", "blocker"]);
		assert.ok(evidence.artifacts.some((a) => a.name === "report:target/site/jacoco/jacoco.xml"), "the measurement it judged is kept as evidence");
		// The same sensor on the reference: nothing introduced, nothing to answer for, and no report
		// scanned for or kept — the pass costs the tree nothing.
		const onReference = await runner.runControl({ ...base(), control: control(), workspace_path: ws, introduced_lines: {} });
		assert.equal(onReference.evidence.verdict, "PASS");
		assert.deepEqual(onReference.evidence.findings, []);
		assert.deepEqual(onReference.evidence.artifacts.filter((a) => a.name.startsWith("report:")), []);
		assert.equal(onReference.evidence.facts.reports, 0);
	});

	it("qualifies on a covered introduction, an unexercised introduction and a broken sensor (VER-05)", async () => {
		const covered = { file: "Witness495Covered.java", methods: [{ name: "twice", line: 3 }], lines: [{ nr: 1, ci: 3 }, { nr: 3, ci: 4 }] };
		const uncovered = { file: "Witness495Uncovered.java", methods: [{ name: "half", line: 3 }], lines: [{ nr: 1, mi: 3 }, { nr: 3, mi: 4 }] };
		const pos = workspace("pos", jacocoXml("", [covered]));
		const neg = workspace("neg", jacocoXml("", [covered, uncovered]));
		const positiveFiles = { "src/main/java/Witness495Covered.java": "public final class Witness495Covered {\n    public int twice(int n) {\n        return n * 2;\n    }\n}\n" };
		const negativeFiles = { ...positiveFiles, "src/main/java/Witness495Uncovered.java": "public final class Witness495Uncovered {\n    public int half(int n) {\n        return n / 2;\n    }\n}\n" };
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const q = await qualifyControl(runner, control(), { positive_path: pos, negative_path: neg, positive_files: positiveFiles, negative_files: negativeFiles }, base());
		assert.deepEqual([q.positive, q.negative, q.incident, q.qualified], ["PASS", "FAIL", "INDETERMINATE", true], JSON.stringify(q.notes));
		// A negative witness made of a failing test proves nothing here: it is the shared witness, and
		// this sensor does not detect failing tests.
		const blind = await qualifyControl(runner, control(), { positive_path: pos, negative_path: pos, positive_files: positiveFiles, negative_files: positiveFiles }, base());
		assert.equal(blind.qualified, false);
		assert.ok(blind.notes.some((n) => n.includes("does not detect")));
	});
});

describe("the target adapter proposes the sensor only where a measurement exists", () => {
	it("adds the coverage control when JaCoCo writes a report at the test phase, with witnesses of its own", () => {
		const project = join(root, "target-project");
		fixtureJava(project, true);
		const detection = detectStack(project, [{ requirement_id: "R1", revision: 1 }]);
		assert.equal(detection.facts.jacoco_report_bound, true);
		const coverage = detection.controls.find((c) => c.control_id === "coverage");
		assert.ok(coverage, "the sensor is proposed");
		assert.deepEqual([coverage!.parser, coverage!.report_path, coverage!.writable_paths], ["jacoco-xml", "**/target/site/jacoco", []]);
		assert.ok(coverage!.protected_paths.includes("pom.xml"), "turning the measurement off in the POM is not the producer's to decide (QLT-04)");
		// Its positive witness introduces code the suite calls; its own negative witness introduces code nothing calls.
		assert.ok("src/main/java/Witness495Covered.java" in detection.positive_witness);
		assert.deepEqual(Object.keys(detection.own_negative_witness.coverage ?? {}), ["src/main/java/Witness495Uncovered.java"]);
		assert.equal(detection.witness_tests, 2);
		assert.deepEqual(detection.capability_missing, []);
	});

	it("names the missing measurement instead of proposing a sensor that would read nothing", () => {
		const project = join(root, "bare");
		fixtureJava(project);
		const detection = detectStack(project, [{ requirement_id: "R1", revision: 1 }]);
		assert.equal(detection.facts.jacoco_report_bound, false);
		assert.deepEqual(detection.controls.map((c) => c.control_id), ["maven-test"]);
		assert.deepEqual(detection.own_negative_witness, {});
		assert.ok(detection.capability_missing[0]?.includes("JaCoCo"));
	});

	it("a report bound only inside a profile is not a measurement mvn test produces", () => {
		const project = join(root, "profiled");
		fixtureJava(project);
		const pom = join(project, "pom.xml");
		writeFileSync(pom, readFileSync(pom, "utf8").replace("</project>", `  <profiles><profile><id>coverage</id><build><plugins>\n${JACOCO_PLUGIN}      </plugins></build></profile></profiles>\n</project>`));
		assert.equal(detectStack(project, []).facts.jacoco_report_bound, false);
	});
});
