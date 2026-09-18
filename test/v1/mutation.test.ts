/**
 * Mutation of the classes the candidate modified (VER-04). The sensor is the generic runner plus a
 * parser, so a PITest report is an input like any other and no Maven run is needed to exercise it;
 * the V4 campaign covers the real chain. What is checked here is what the control decides: a
 * surviving mutant on a line the candidate wrote, a survivor it did not write, a budget that ends
 * the run, and the three witnesses.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { analyzeMutation, mutableIntroducedPaths, mutationScopeOf, MUTATION_RULE_SURVIVED, MUTATION_RULE_UNCOVERED, type MutationScope } from "../../src/adapters/execution/mutation.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import { detectStack, mutationCapabilityMissing, readsMutationReport } from "../../src/application/target.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import { SCOPE_PLACEHOLDER, type ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type { ControlInvocation, ProcessObservation } from "../../src/ports/execution.ts";
import { fixtureJava, PITEST_PLUGIN } from "../helpers/fixtures.ts";
import { candidate, evidence, protocol, Runner, EXECUTOR, ENV } from "../helpers/change-fixture.ts";

const NODE = process.execPath;
const GREETER = "src/main/java/io/h495/Greeter.java";
const GREETER_SOURCE = "package io.h495;\n\npublic final class Greeter {\n    public int twice(int n) {\n        return n * 2;\n    }\n}\n";

let root: string;
beforeEach(() => { mkdirSync(join(process.cwd(), "test-output"), { recursive: true }); root = mkdtempSync(join(process.cwd(), "test-output", "mut-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

interface MutantSpec {
	status: string;
	line: number;
	klass?: string;
	file?: string;
	method?: string;
	mutator?: string;
	description?: string;
}

/** A PITest `mutations.xml` as the XML output format writes it. */
function pitestXml(mutants: MutantSpec[], closed = true): string {
	const body = mutants.map((m) => {
		const klass = m.klass ?? "io.h495.Greeter";
		const file = m.file ?? `${(klass.split("$")[0] ?? klass).split(".").pop()}.java`;
		const mutator = m.mutator ?? "org.pitest.mutationtest.engine.gregor.mutators.MathMutator";
		const description = m.description ?? "Replaced integer multiplication with division";
		return `<mutation detected="${m.status === "KILLED" || m.status === "TIMED_OUT"}" status="${m.status}" numberOfTestsRun="1"><sourceFile>${file}</sourceFile><mutatedClass>${klass}</mutatedClass><mutatedMethod>${m.method ?? "twice"}</mutatedMethod><methodDescription>(I)I</methodDescription><lineNumber>${m.line}</lineNumber><mutator>${mutator}</mutator><indexes><index>3</index></indexes><blocks><block>0</block></blocks><description>${description}</description></mutation>`;
	}).join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>\n<mutations partial="false">\n${body}\n${closed ? "</mutations>\n" : ""}`;
}

function doc(text: string, name = "target/pit-reports/mutations.xml") {
	return [{ name, text }];
}

function obs(over: Partial<ProcessObservation> = {}): ProcessObservation {
	return { exit_code: 0, signal: null, timed_out: false, spawn_error: null, stdout: new Uint8Array(), stderr: new Uint8Array(), stdout_truncated: false, stderr_truncated: false, started_at: "t", ended_at: "t", duration_ms: 1, ...over };
}

/** The scope a run on `paths` would have been given, as `mutationScopeOf` derives it from the tree. */
function scopeOf(...paths: string[]): MutationScope {
	const classes = paths.flatMap((path) => {
		const type = `io.h495.${path.split("/").pop()!.replace(/\.java$/, "")}`;
		return [type, `${type}$*`];
	});
	return { classes: [...new Set(classes)].sort(), paths, notes: [] };
}

function control(over: Partial<ControlDefinition> = {}): ControlDefinition {
	return { control_id: "mutation", version: "1", title: "surviving mutants on the modified classes", command: [NODE, "-e", ""], cwd: ".", env_allowlist: ["PATH", "HOME", "TMPDIR"], env: {}, timeout_ms: 30000, parser: "pitest-xml", report_path: "**/target/pit-reports", structure_rules: [], provides: ["pit-reports"], requires: [], scope_argument: `-DtargetClasses=${SCOPE_PLACEHOLDER}`, network: "denied", writable_paths: ["target"], requirement_refs: [{ requirement_id: "R1", revision: 1 }], protected: true, protected_paths: ["pom.xml"], ...over };
}

function base(): Omit<ControlInvocation, "control" | "workspace_path"> {
	return { protocol: { protocol_id: "p", revision: 1, content_digest: digestValue("p") }, candidate: { candidate_id: "c", manifest_digest: digestValue("c"), base_digest: digestValue("b"), workspace_id: "w" }, subject: { kind: "candidate", id: "c", revision: 1, digest: digestValue("c") }, environment: { environment_id: "env", digest: ENV, profile_id: "verify" }, requirement_refs: [{ requirement_id: "R1", revision: 1 }], producer: EXECUTOR };
}

describe("surviving mutants on the introduced lines (VER-04)", () => {
	it("a mutant surviving on a line the candidate wrote fails, named at its file, its line, its operator and its method", () => {
		const report = pitestXml([
			{ status: "KILLED", line: 4 },
			{ status: "SURVIVED", line: 5, description: "Replaced integer multiplication with division" },
		]);
		const parsed = analyzeMutation(obs(), doc(report), { [GREETER]: [4, 5] }, scopeOf(GREETER));
		assert.equal(parsed.verdict, "FAIL", JSON.stringify(parsed.notes));
		assert.deepEqual([parsed.facts.introduced_mutants, parsed.facts.killed_mutants, parsed.facts.surviving_mutants], [2, 1, 1]);
		const finding = (parsed.findings ?? [])[0]!;
		assert.equal(finding.message, `${GREETER}:5 introduced line whose mutation no test notices: Replaced integer multiplication with division (MathMutator) in io.h495.Greeter.twice`);
		assert.deepEqual([finding.rule_id, finding.category, finding.severity, finding.symbol], [MUTATION_RULE_SURVIVED, "quality", "blocker", "io.h495.Greeter.twice"]);
	});

	it("a mutant surviving on a class the candidate did not touch does not fail it", () => {
		// The run is scoped to the modified class, so a report naming another one is left aside: a
		// wider configuration on the target side never turns its own debt into this candidate's failure.
		const elsewhere = pitestXml([{ status: "SURVIVED", line: 12, klass: "io.h495.Untouched", method: "half" }]);
		const parsed = analyzeMutation(obs(), doc(elsewhere), { [GREETER]: [4, 5] }, scopeOf(GREETER));
		assert.equal(parsed.verdict, "PASS", JSON.stringify(parsed.notes));
		assert.deepEqual(parsed.findings, []);
		assert.equal(parsed.facts.out_of_scope_mutants, 1);
		assert.ok(parsed.notes.some((n) => n.includes("outside the scope of this run")));
	});

	it("a mutant surviving on a line of a modified class the candidate did not write is debt of that class, not its failure", () => {
		const mixed = pitestXml([{ status: "KILLED", line: 5 }, { status: "SURVIVED", line: 20, method: "untouched" }]);
		const parsed = analyzeMutation(obs(), doc(mixed), { [GREETER]: [5] }, scopeOf(GREETER));
		assert.equal(parsed.verdict, "PASS", JSON.stringify(parsed.notes));
		assert.deepEqual(parsed.findings, []);
		assert.equal(parsed.facts.inherited_survivors, 1);
		assert.ok(parsed.notes.some((n) => n.includes("this subject did not write") && n.includes("QLT-04")));
	});

	it("a line no mutant reaches is reported as its own defect, and a mutant that never ran is excluded", () => {
		const uncovered = pitestXml([{ status: "NO_COVERAGE", line: 5 }]);
		const parsed = analyzeMutation(obs(), doc(uncovered), { [GREETER]: [5] }, scopeOf(GREETER));
		assert.equal(parsed.verdict, "FAIL");
		assert.deepEqual([parsed.findings?.[0]?.rule_id, parsed.findings?.[0]?.severity], [MUTATION_RULE_UNCOVERED, "blocker"]);
		// A non-viable mutant is one the engine could not run at all: it is not a defect of the candidate.
		const excluded = analyzeMutation(obs(), doc(pitestXml([{ status: "NON_VIABLE", line: 5 }])), { [GREETER]: [5] }, scopeOf(GREETER));
		assert.equal(excluded.verdict, "PASS");
		assert.equal(excluded.facts.excluded_mutants, 1);
		assert.ok(excluded.notes.some((n) => n.includes("non-viable")));
	});

	it("a mutant the engine could not decide leaves the control indeterminate rather than green", () => {
		const parsed = analyzeMutation(obs(), doc(pitestXml([{ status: "RUN_ERROR", line: 5 }])), { [GREETER]: [5] }, scopeOf(GREETER));
		assert.equal(parsed.verdict, "INDETERMINATE");
		assert.equal(parsed.facts.undecided_mutants, 1);
		assert.ok(parsed.notes.some((n) => n.includes("could not decide")));
		// A timeout on a mutant is a behaviour the suite imposed on it: that one is detected.
		assert.equal(analyzeMutation(obs(), doc(pitestXml([{ status: "TIMED_OUT", line: 5 }])), { [GREETER]: [5] }, scopeOf(GREETER)).verdict, "PASS");
	});

	it("a budget that ends the run gives INDETERMINATE, never FAIL, and the incident it names is what a retry may differ on", () => {
		const parsed = analyzeMutation(obs({ timed_out: true, exit_code: null, duration_ms: 1_800_000 }), null, { [GREETER]: [5] }, scopeOf(GREETER));
		assert.equal(parsed.verdict, "INDETERMINATE");
		assert.equal(typeof parsed.facts.incident, "string");
		assert.ok(String(parsed.facts.incident).includes("timeout after 1800000 ms"));
		assert.ok(parsed.notes.some((n) => n.includes("mutation budget") && n.includes("no threshold is lowered")));
	});

	it("an absent or incomplete report is never read as a suite that kills every mutant", () => {
		const introduced = { [GREETER]: [5] };
		assert.equal(analyzeMutation(obs(), null, introduced, scopeOf(GREETER)).verdict, "INDETERMINATE", "no report at all");
		assert.equal(analyzeMutation(obs(), doc(pitestXml([{ status: "KILLED", line: 5 }], false)), introduced, scopeOf(GREETER)).verdict, "INDETERMINATE", "a report the run never closed");
		assert.equal(analyzeMutation(obs(), doc(pitestXml([{ status: "KILLED", line: 5 }])), null, scopeOf(GREETER)).verdict, "INDETERMINATE", "no introduced-line set");
		// The report is written once the analysis is over: without one, a non-zero exit is the build.
		const broken = analyzeMutation(obs({ exit_code: 1 }), null, introduced, scopeOf(GREETER), "[ERROR] /ws/src/main/java/io/h495/Greeter.java:[5,9] cannot find symbol");
		assert.equal(broken.verdict, "FAIL");
		assert.ok(broken.failures[0]?.includes("cannot find symbol"));
		// The reference introduces nothing, so this sensor has nothing to mutate and says so.
		assert.equal(analyzeMutation(obs(), null, {}, { classes: [], paths: [], notes: [] }).verdict, "PASS");
	});

	it("a threshold the target sets over everything it mutated is not what is opposed to the candidate", () => {
		// PITest exits non-zero when its own module threshold is missed, and it writes the report first.
		// The rule here is per mutant and on the introduced lines: the ratio is named, never adopted.
		const report = pitestXml([{ status: "KILLED", line: 5 }, { status: "SURVIVED", line: 30, method: "old" }]);
		const parsed = analyzeMutation(obs({ exit_code: 1 }), doc(report), { [GREETER]: [5] }, scopeOf(GREETER));
		assert.equal(parsed.verdict, "PASS", JSON.stringify(parsed.notes));
		assert.ok(parsed.notes.some((n) => n.includes("a ratio is not what is opposed to this candidate")));
	});

	it("reads one report per module and refuses to guess an ambiguous attribution", () => {
		const shared = pitestXml([{ status: "SURVIVED", line: 5, klass: "io.h495.Adapter", file: "Adapter.java", method: "run" }]);
		const perModule = [{ name: "domain/target/pit-reports/mutations.xml", text: shared }, { name: "infrastructure/target/pit-reports/mutations.xml", text: shared }];
		const paths = ["domain/src/main/java/io/h495/Adapter.java", "infrastructure/src/main/java/io/h495/Adapter.java"];
		const parsed = analyzeMutation(obs(), perModule, { [paths[0]!]: [5], [paths[1]!]: [5] }, { classes: ["io.h495.Adapter"], paths, notes: [] });
		assert.equal(parsed.verdict, "FAIL");
		assert.equal(parsed.findings?.length, 2, "each module report is attributed to its own module");
		const rootReport = [{ name: "target/pit-reports/mutations.xml", text: shared }];
		const ambiguous = analyzeMutation(obs(), rootReport, { [paths[0]!]: [5], [paths[1]!]: [5] }, { classes: ["io.h495.Adapter"], paths, notes: [] });
		assert.equal(ambiguous.verdict, "PASS");
		assert.ok(ambiguous.notes.some((n) => n.includes("matches several scoped paths")));
	});

	it("reads the report as the engine writes it, apostrophes and entities included", () => {
		// Verbatim shape of a PITest report: the engine quotes its own attributes with apostrophes and
		// escapes the quotes inside a description. A reader that only knows one of the two forms would
		// see every mutant as UNKNOWN and decide nothing.
		const asWritten = `<?xml version="1.0" encoding="UTF-8"?>\n<mutations partial="true">\n<mutation detected='false' status='SURVIVED' numberOfTestsRun='1'><sourceFile>Greeter.java</sourceFile><mutatedClass>io.h495.Greeter</mutatedClass><mutatedMethod>greet</mutatedMethod><methodDescription>(Ljava/lang/String;)Ljava/lang/String;</methodDescription><lineNumber>7</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.returns.EmptyObjectReturnValsMutator</mutator><indexes><index>5</index></indexes><blocks><block>0</block></blocks><killingTest/><description>replaced return value with &quot;&quot; for io/h495/Greeter::greet</description></mutation>\n</mutations>\n`;
		const parsed = analyzeMutation(obs(), doc(asWritten), { [GREETER]: [7] }, scopeOf(GREETER));
		assert.equal(parsed.verdict, "FAIL", JSON.stringify(parsed.notes));
		assert.equal(parsed.findings?.[0]?.message, `${GREETER}:7 introduced line whose mutation no test notices: replaced return value with "" for io/h495/Greeter::greet (EmptyObjectReturnValsMutator) in io.h495.Greeter.greet`);
	});

	it("a scoped class holding nothing to mutate is a fact of that class, not a missing measurement", () => {
		// The engine writes no report when its scope generates no mutant — an interface, a record, a
		// holder of constants. It says so, and that is the difference with a report that went missing.
		const said = analyzeMutation(obs(), null, { [GREETER]: [5] }, scopeOf(GREETER), "[INFO] ...\nPIT >> WARNING : No mutations found. This probably means there is an issue with either the supplied classpath or filters.\n");
		assert.equal(said.verdict, "PASS", JSON.stringify(said.notes));
		assert.deepEqual([said.facts.mutants, said.facts.introduced_mutants], [0, 0]);
		assert.ok(said.notes.some((n) => n.includes("generated no mutant")));
		assert.equal(analyzeMutation(obs(), null, { [GREETER]: [5] }, scopeOf(GREETER), "[INFO] nothing about mutants").verdict, "INDETERMINATE");
	});

	it("a nested type is judged in the source of the type that holds it", () => {
		const nested = pitestXml([{ status: "SURVIVED", line: 5, klass: "io.h495.Greeter$Inner", file: "Greeter.java", method: "inner" }]);
		const parsed = analyzeMutation(obs(), doc(nested), { [GREETER]: [5] }, scopeOf(GREETER));
		assert.equal(parsed.verdict, "FAIL");
		assert.equal(parsed.findings?.[0]?.symbol, "io.h495.Greeter$Inner.inner");
	});
});

describe("the scope of a mutation run", () => {
	it("is the classes the subject introduced, with the package each source declares", async () => {
		const ws = join(root, "ws");
		mkdirSync(join(ws, "src", "main", "java", "io", "h495"), { recursive: true });
		writeFileSync(join(ws, GREETER), GREETER_SOURCE);
		mkdirSync(join(ws, "src", "main", "java"), { recursive: true });
		writeFileSync(join(ws, "src/main/java/Loose.java"), "public final class Loose {}\n");
		const scope = await mutationScopeOf(ws, { [GREETER]: [4], "src/main/java/Loose.java": [1] });
		assert.deepEqual(scope.paths, ["src/main/java/Loose.java", GREETER]);
		assert.deepEqual(scope.classes, ["Loose", "Loose$*", "io.h495.Greeter", "io.h495.Greeter$*"]);
	});

	it("leaves out what no engine mutates, and reports a source it could not read", async () => {
		assert.deepEqual(mutableIntroducedPaths({
			[GREETER]: [1],
			"src/test/java/io/h495/GreeterTest.java": [1],
			"src/main/java/io/h495/package-info.java": [1],
			"src/main/java/module-info.java": [1],
			"src/main/resources/app.properties": [1],
			"pom.xml": [1],
		}), [GREETER]);
		const scope = await mutationScopeOf(join(root, "empty"), { [GREETER]: [1] });
		assert.deepEqual([scope.paths, scope.classes], [[], []]);
		assert.ok(scope.notes[0]?.includes("unreadable source"));
	});
});

describe("the mutation control through the generic runner", () => {
	/** A workspace whose control command copies a prepared report where PITest would leave one. */
	function workspace(name: string, report: string | null, sources: Record<string, string>): string {
		const ws = join(root, name);
		mkdirSync(ws, { recursive: true });
		for (const [rel, text] of Object.entries(sources)) {
			mkdirSync(join(ws, rel, ".."), { recursive: true });
			writeFileSync(join(ws, rel), text);
		}
		if (report !== null) writeFileSync(join(ws, "495-mutations.xml"), report);
		return ws;
	}

	/** Writes the prepared report at the stable path and echoes the arguments it was scoped with. */
	const ENGINE = [NODE, "-e", "const fs=require('node:fs');fs.mkdirSync('target/pit-reports',{recursive:true});fs.copyFileSync('495-mutations.xml','target/pit-reports/mutations.xml');process.stdout.write(process.argv.slice(1).join(' '));", "--"];

	it("scopes the frozen command to the classes of the candidate, reads the report it left and locates each surviving mutant", async () => {
		const report = pitestXml([{ status: "KILLED", line: 4 }, { status: "SURVIVED", line: 5 }]);
		const ws = workspace("ws", report, { [GREETER]: GREETER_SOURCE });
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const { evidence: observed } = await runner.runControl({ ...base(), control: control({ command: ENGINE }), workspace_path: ws, introduced_lines: { [GREETER]: [5] } });
		assert.equal(observed.verdict, "FAIL", JSON.stringify(observed.limits.notes));
		assert.equal(observed.control_version, "1+pitest-xml@1.0.0");
		// The argument the run was actually given is the one the evidence records, and the run received it.
		assert.deepEqual((observed.facts.command as string[]).at(-1), "-DtargetClasses=io.h495.Greeter,io.h495.Greeter$*");
		assert.equal(readFileSync(join(ws, "target", "pit-reports", "mutations.xml"), "utf8"), report);
		assert.equal(observed.findings.length, 1);
		const finding = observed.findings[0]!;
		assert.deepEqual([finding.path, finding.region?.start_line, finding.symbol], [GREETER, 5, "io.h495.Greeter.twice"]);
		assert.ok(observed.artifacts.some((a) => a.name === "report:target/pit-reports/mutations.xml"), "the report it judged is kept as evidence");
	});

	it("spawns nothing on a subject that introduces no class, and nothing when no one established what it introduced", async () => {
		const ws = workspace("bare", null, { [GREETER]: GREETER_SOURCE });
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		// A command that cannot be spawned: reaching the sandbox at all would be an INDETERMINATE.
		const unspawnable = control({ command: ["/nonexistent/495-mutation-engine"] });
		const onReference = await runner.runControl({ ...base(), control: unspawnable, workspace_path: ws, introduced_lines: {} });
		assert.equal(onReference.evidence.verdict, "PASS", JSON.stringify(onReference.evidence.limits.notes));
		assert.equal(onReference.observation, null, "the reference pass costs the target no mutation run");
		assert.deepEqual(onReference.evidence.artifacts, []);
		assert.ok(onReference.evidence.limits.notes.some((n) => n.includes("no mutation run was spawned")));
		// Lines nobody computed are not a scope: mutating the whole tree is never the fallback.
		const unscoped = await runner.runControl({ ...base(), control: unspawnable, workspace_path: ws, introduced_lines: null });
		assert.equal(unscoped.evidence.verdict, "INDETERMINATE");
		assert.equal(unscoped.observation, null);
		assert.ok(unscoped.evidence.limits.notes.some((n) => n.includes("would mutate the whole tree")));
	});

	it("a budget shorter than the run gives an incident, not a verdict on the candidate", async () => {
		const ws = workspace("slow", pitestXml([{ status: "KILLED", line: 5 }]), { [GREETER]: GREETER_SOURCE });
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const slow = control({ command: [NODE, "-e", "setTimeout(() => {}, 60000);", "--"], timeout_ms: 300 });
		const { evidence: observed } = await runner.runControl({ ...base(), control: slow, workspace_path: ws, introduced_lines: { [GREETER]: [5] } });
		assert.equal(observed.verdict, "INDETERMINATE");
		assert.equal(typeof observed.facts.incident, "string");
		assert.ok(observed.limits.notes.some((n) => n.includes("mutation budget")));
		assert.deepEqual(observed.findings, [], "a budget that ran out names no defect of the candidate");
		assert.equal(observed.limits.unstable, false, "the two marks a bounded technical retry reads: a named incident and no instability");
	});

	it("qualifies on a killed introduction, an unasserted introduction and a broken engine (VER-05)", async () => {
		const covered = "public final class Witness495Covered {\n    public int twice(int n) {\n        return n * 2;\n    }\n}\n";
		const unasserted = "public final class Witness495Unasserted {\n    public int half(int n) {\n        return n / 2;\n    }\n}\n";
		const positiveFiles = { "src/main/java/Witness495Covered.java": covered };
		const negativeFiles = { ...positiveFiles, "src/main/java/Witness495Unasserted.java": unasserted, "src/test/java/NegativeMutationWitness495Test.java": "public class NegativeMutationWitness495Test {}\n" };
		const killed = pitestXml([{ status: "KILLED", line: 3, klass: "Witness495Covered", file: "Witness495Covered.java" }]);
		const survivor = pitestXml([
			{ status: "KILLED", line: 3, klass: "Witness495Covered", file: "Witness495Covered.java" },
			{ status: "SURVIVED", line: 3, klass: "Witness495Unasserted", file: "Witness495Unasserted.java", method: "half", description: "Replaced integer division with multiplication" },
		]);
		const pos = workspace("pos", killed, positiveFiles);
		const neg = workspace("neg", survivor, negativeFiles);
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const q = await qualifyControl(runner, control({ command: ENGINE }), { positive_path: pos, negative_path: neg, positive_files: positiveFiles, negative_files: negativeFiles }, base());
		assert.deepEqual([q.positive, q.negative, q.incident, q.qualified], ["PASS", "FAIL", "INDETERMINATE", true], JSON.stringify(q.notes));
		// The shared negative witness of a Maven target is a failing test; this sensor does not detect one.
		const blind = await qualifyControl(runner, control({ command: ENGINE }), { positive_path: pos, negative_path: pos, positive_files: positiveFiles, negative_files: positiveFiles }, base());
		assert.equal(blind.qualified, false);
		assert.ok(blind.notes.some((n) => n.includes("does not detect")));
	});
});

describe("the target adapter proposes the sensor only where its report can be read", () => {
	it("adds the mutation control when the engine writes XML at a path no timestamp moves, with witnesses of its own", () => {
		const project = join(root, "target-project");
		fixtureJava(project, false, true);
		const detection = detectStack(project, [{ requirement_id: "R1", revision: 1 }]);
		assert.equal(detection.facts.mutation_report_readable, true);
		const mutation = detection.controls.find((c) => c.control_id === "mutation");
		assert.ok(mutation, "the sensor is proposed");
		assert.deepEqual([mutation!.parser, mutation!.report_path, mutation!.scope_argument], ["pitest-xml", "**/target/pit-reports", "-DtargetClasses={classes}"]);
		assert.equal(mutation!.timeout_ms, 30 * 60_000, "an expensive control carries a budget of its own");
		assert.ok(mutation!.command.includes("-Dthreads=1"), "the run is single-threaded: a result that depends on scheduling is not reproducible");
		assert.ok(mutation!.protected_paths.includes("pom.xml"), "lowering the engine's threshold or excluding a mutator is not the producer's to decide (VER-04)");
		assert.equal(detection.controls.at(-1)!.control_id, "mutation", "the one control that runs a build of its own comes last");
		// Its positive witness is a class the suite asserts on; its own negative one is a class the suite
		// executes and checks nothing about — the defect coverage cannot see.
		assert.ok("src/main/java/witness495/Witness495Covered.java" in detection.positive_witness);
		assert.deepEqual(Object.keys(detection.own_negative_witness.mutation ?? {}), ["src/main/java/witness495/Witness495Unasserted.java", "src/test/java/witness495/NegativeMutationWitness495Test.java"]);
		assert.equal(detection.witness_tests, 2);
		assert.ok(!detection.capability_missing.some((note) => note.includes("mutation")));
	});

	it("names what the target would have to declare instead of proposing a sensor that would read nothing", () => {
		const bare = join(root, "bare");
		fixtureJava(bare);
		const detection = detectStack(bare, [{ requirement_id: "R1", revision: 1 }]);
		assert.equal(detection.facts.mutation_report_readable, false);
		assert.deepEqual(detection.controls.map((c) => c.control_id), ["maven-test", "structure"]);
		assert.deepEqual(Object.keys(detection.own_negative_witness), ["structure"], "no mutation witness where no mutation sensor is proposed");
		assert.ok(detection.capability_missing.some((n) => n.includes("no mutation engine declared outside a profile")));
		// Declared, but its report cannot be found or read: each missing property is named on its own.
		assert.equal(mutationCapabilityMissing({ declared: true, xml_report: false, stable_report_path: true, usable: false }), "a mutation engine is declared on this target but its report cannot be read: no XML report among its output formats (VER-04)");
		assert.ok(mutationCapabilityMissing({ declared: true, xml_report: true, stable_report_path: false, usable: false }).includes("timestamped report directories"));
	});

	it("an engine declared only inside a profile is not one the frozen command runs", () => {
		const project = join(root, "profiled");
		fixtureJava(project);
		const pom = join(project, "pom.xml");
		writeFileSync(pom, readFileSync(pom, "utf8").replace("</project>", `  <profiles><profile><id>mutation</id><build><plugins>\n${PITEST_PLUGIN}      </plugins></build></profile></profiles>\n</project>`));
		assert.deepEqual(readsMutationReport(project, ["pom.xml"]), { declared: false, xml_report: false, stable_report_path: false, usable: false });
	});
});

describe("what a mutation budget that runs out does to the change (VER-04, VER-02)", () => {
	const withMutation = protocol({
		controls: [...protocol().controls, control({ requirement_refs: [{ requirement_id: "R1", revision: 1 }] })],
		qualifications: { ...protocol().qualifications, mutation: { positive: "PASS", negative: "FAIL", incident: "INDETERMINATE", qualified: true, environment_digest: ENV, notes: [] } },
		obligations: [
			{ requirement: { requirement_id: "R1", revision: 1 }, mandatory: true, control_ids: ["unit", "mutation"], combination: "all_pass", human_interaction: null, not_applicable_reason: null },
			{ requirement: { requirement_id: "R2", revision: 1 }, mandatory: true, control_ids: ["lint"], combination: "all_pass", human_interaction: null, not_applicable_reason: null },
		],
	});

	it("leaves the change indeterminate and opens an incident, never a correction charged to the candidate", () => {
		const c = candidate("budget");
		const r = new Runner().create().g0().g1().g2(withMutation).g3().implement().freeze(c).verify([
			evidence({ control_id: "unit", subject_digest: c.manifest_digest, verdict: "PASS" }),
			evidence({ control_id: "lint", subject_digest: c.manifest_digest, verdict: "PASS" }),
			evidence({ control_id: "mutation", subject_digest: c.manifest_digest, requirement_ids: ["R1"], verdict: "INDETERMINATE" }),
		]).g5();
		assert.equal(r.s.gates.G5?.verdict, "INDETERMINATE");
		assert.deepEqual(r.s.gates.G5?.fail_requirements, [], "no threshold is lowered and no defect is attributed to the candidate");
		assert.deepEqual(r.s.gates.G5?.indeterminate_requirements, ["R1"]);
		assert.equal(r.s.gates.G5?.next_action, "resolve_incident");
		assert.equal(r.s.budgets.attempts_used, 1, "an incident does not spend an implementation attempt");
	});

	it("a mutant that survived is the candidate's, and the change is corrected for it", () => {
		const c = candidate("survivor");
		const r = new Runner().create().g0().g1().g2(withMutation).g3().implement().freeze(c).verify([
			evidence({ control_id: "unit", subject_digest: c.manifest_digest, verdict: "PASS" }),
			evidence({ control_id: "lint", subject_digest: c.manifest_digest, verdict: "PASS" }),
			evidence({ control_id: "mutation", subject_digest: c.manifest_digest, requirement_ids: ["R1"], verdict: "FAIL", findings_blocking: 1 }),
		]).g5();
		assert.equal(r.s.gates.G5?.verdict, "FAIL");
		assert.deepEqual(r.s.gates.G5?.fail_requirements, ["R1"]);
		assert.equal(r.s.gates.G5?.next_action, "correct");
	});
});
