/**
 * Structural findings of the frozen architecture (ARC-04, CON-03). The sensor reads the package and
 * import declarations of the tree it is given: no Maven run is needed to exercise it, and the V4
 * campaign covers the real target. What it blocks on is the delta, as at every other differential
 * control — a violation the candidate wrote, never one it inherited.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { analyzeJavaStructure, owningPackage, packageEdges, readDeclarations, readJavaSources, stronglyConnectedComponents, underPrefix } from "../../src/adapters/execution/structure.ts";
import { buildContext, type ContextInput } from "../../src/application/context.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import { detectStack } from "../../src/application/target.ts";
import { compareToReference } from "../../src/domain/baseline.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { Finding } from "../../src/contracts/v1/evidence.ts";
import type { ControlDefinition, StructureRule } from "../../src/contracts/v1/protocol.ts";
import type { ControlInvocation, ProcessObservation } from "../../src/ports/execution.ts";
import { fixtureMavenHexagonal, fixtureMavenMultiModule, writeFiles } from "../helpers/fixtures.ts";
import { EXECUTOR, ENV } from "../helpers/change-fixture.ts";

const SERVICE = "domain/src/main/java/io/demo/domain/service/UserService.java";
const USER = "domain/src/main/java/io/demo/domain/user/User.java";
/** The reference and the candidate both carry it: `user` and `service` import each other. */
const CYCLIC_USER = 'package io.demo.domain.user;\n\nimport io.demo.domain.service.UserService;\n\npublic final class User {\n    public String name() { return "x"; }\n}\n';
const FORBIDDEN_SERVICE = "package io.demo.domain.service;\n\nimport io.demo.domain.user.User;\nimport io.demo.infra.UserRepository;\n\npublic final class UserService {\n    public User keep(User user) { return user; }\n}\n";

let root: string;
beforeEach(() => { mkdirSync(join(process.cwd(), "test-output"), { recursive: true }); root = mkdtempSync(join(process.cwd(), "test-output", "arc-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

function obs(over: Partial<ProcessObservation> = {}): ProcessObservation {
	return { exit_code: 0, signal: null, timed_out: false, spawn_error: null, stdout: new Uint8Array(), stderr: new Uint8Array(), stdout_truncated: false, stderr_truncated: false, started_at: "t", ended_at: "t", duration_ms: 1, ...over };
}

function base(): Omit<ControlInvocation, "control" | "workspace_path"> {
	return { protocol: { protocol_id: "p", revision: 1, content_digest: digestValue("p") }, candidate: { candidate_id: "c", manifest_digest: digestValue("c"), base_digest: digestValue("b"), workspace_id: "w" }, subject: { kind: "candidate", id: "c", revision: 1, digest: digestValue("c") }, environment: { environment_id: "env", digest: ENV, profile_id: "verify" }, requirement_refs: [{ requirement_id: "R1", revision: 1 }], producer: EXECUTOR };
}

const BOUNDARY: StructureRule = { rule_id: "structure:module-boundary:domain->infrastructure", kind: "forbidden_dependency", statement: "module demo-domain declares no dependency on module demo-infrastructure", scope: ["domain/src/main/java/"], forbidden: ["io.demo.infra"] };
const NO_CYCLE: StructureRule = { rule_id: "structure:package-cycle", kind: "no_cycle", statement: "two packages that import each other are one unit", scope: ["domain/src/main/java/"], forbidden: [] };

describe("reading what a Java tree declares about itself", () => {
	it("keeps the package, every import and its line, and nothing it would have to compile to know", () => {
		const source = readDeclarations("A.java", "package io.demo.a;\n\nimport io.demo.b.B;\nimport static io.demo.c.C.of;\nimport io.demo.d.*;\n\npublic final class A { /* import io.demo.e.E; */ }\n");
		assert.equal(source.package_name, "io.demo.a");
		assert.deepEqual(source.imports.map((i) => `${i.name}:${i.line}`), ["io.demo.b.B:3", "io.demo.c.C.of:4", "io.demo.d:5"]);
	});

	it("attributes an imported name to the longest package the tree declares, which is the only way to place a static import", () => {
		const declared = ["io.demo.a", "io.demo.a.b"];
		assert.equal(owningPackage("io.demo.a.b.C", declared), "io.demo.a.b");
		assert.equal(owningPackage("io.demo.a.C.MEMBER", declared), "io.demo.a");
		assert.equal(owningPackage("io.other.C", declared), null);
		assert.equal(underPrefix("jakarta.persistence.Entity", "jakarta."), true, "a prefix ending in a dot names a family");
		assert.equal(underPrefix("io.demoxtra.C", "io.demo"), false, "a prefix stops at a package separator");
	});

	it("names a cycle between packages and ignores what only looks like one", () => {
		const cyclic = [
			readDeclarations("a/A.java", "package p.a;\nimport p.b.B;\n"),
			readDeclarations("b/B.java", "package p.b;\nimport p.a.A;\n"),
			readDeclarations("c/C.java", "package p.c;\nimport p.a.A;\n"),
		];
		assert.deepEqual(stronglyConnectedComponents(packageEdges(cyclic)), [["p.a", "p.b"]]);
		const acyclic = [readDeclarations("a/A.java", "package p.a;\nimport p.b.B;\n"), readDeclarations("b/B.java", "package p.b;\n")];
		assert.deepEqual(stronglyConnectedComponents(packageEdges(acyclic)), []);
	});
});

describe("what the structural control blocks on (ARC-04, QLT-04)", () => {
	const sources = [readDeclarations(SERVICE, FORBIDDEN_SERVICE), readDeclarations(USER, CYCLIC_USER)];

	it("an introduced import of a forbidden module fails, named at its file, at its line and at its package", () => {
		const report = analyzeJavaStructure(obs(), sources, [BOUNDARY], { [SERVICE]: [4] });
		assert.equal(report.verdict, "FAIL");
		const finding = (report.findings ?? [])[0]!;
		assert.equal(finding.message, `${SERVICE}:4 forbidden import io.demo.infra.UserRepository, module demo-domain declares no dependency on module demo-infrastructure`);
		assert.deepEqual([finding.rule_id, finding.category, finding.severity, finding.symbol], [BOUNDARY.rule_id, "structure", "blocker", "io.demo.domain.service"]);
		assert.deepEqual([report.facts.violations, report.facts.introduced_violations], [1, 1]);
	});

	it("the same violation on a line the subject did not write is reported at its exact place and fails nothing", () => {
		const report = analyzeJavaStructure(obs(), sources, [BOUNDARY], {});
		assert.equal(report.verdict, "PASS", "a control that answered otherwise could never be qualified on a target carrying any debt");
		assert.equal((report.findings ?? []).length, 1, "the finding is what the comparison to the reference needs to pair the two passes");
		assert.deepEqual([report.facts.introduced_violations, report.facts.inherited_violations], [0, 1]);
		assert.match(report.notes.join(" "), /never opposed to the candidate/);
	});

	it("a cycle is named where the candidate closed it, and at its first import when nobody did", () => {
		const closed = analyzeJavaStructure(obs(), sources, [NO_CYCLE], { [USER]: [3] });
		assert.equal(closed.verdict, "FAIL");
		assert.equal((closed.findings ?? [])[0]!.message, `${USER}:3 import io.demo.domain.service closes a dependency cycle between 2 packages (io.demo.domain.service, io.demo.domain.user), two packages that import each other are one unit`);
		const inherited = analyzeJavaStructure(obs(), sources, [NO_CYCLE], {});
		assert.equal(inherited.verdict, "PASS");
		assert.equal((inherited.findings ?? [])[0]!.message.startsWith(`${SERVICE}:3 import io.demo.domain.user closes a dependency cycle`), true);
		assert.equal(inherited.facts.cycles, 1);
	});

	it("an absent rule, an absent source, an unknown set of introduced lines and a broken sensor are all INDETERMINATE", () => {
		assert.equal(analyzeJavaStructure(obs(), sources, [], {}).verdict, "INDETERMINATE");
		assert.equal(analyzeJavaStructure(obs(), [], [BOUNDARY], {}).verdict, "INDETERMINATE");
		assert.equal(analyzeJavaStructure(obs(), sources, [BOUNDARY], null).verdict, "INDETERMINATE");
		assert.equal(analyzeJavaStructure(obs({ exit_code: 1 }), sources, [BOUNDARY], {}).verdict, "INDETERMINATE");
		assert.equal(analyzeJavaStructure(obs({ spawn_error: "ENOENT", exit_code: null }), sources, [BOUNDARY], {}).verdict, "INDETERMINATE");
	});
});

describe("the boundaries a Maven reactor opposes to its own code (CON-03)", () => {
	it("derives them from the dependency direction of the POMs and the package root each module lays out", () => {
		const project = join(root, "hexa");
		fixtureMavenHexagonal(project);
		const detection = detectStack(project, [{ requirement_id: "R1", revision: 1 }]);
		const control = detection.controls.find((c) => c.control_id === "structure")!;
		assert.ok(control, "the sensor is proposed");
		assert.equal(detection.controls.at(-1)!.control_id, "structure", "the test control stays the first of the protocol");
		assert.deepEqual(control.structure_rules.map((rule) => rule.rule_id), ["structure:module-boundary:domain->infrastructure", "structure:framework-independence:domain", "structure:package-cycle"]);
		const boundary = control.structure_rules[0]!;
		assert.deepEqual([boundary.scope, boundary.forbidden], [["domain/src/main/java/"], ["io.demo.infra"]]);
		assert.match(boundary.statement, /declares no dependency on module demo-infrastructure/);
		assert.ok(control.structure_rules[1]!.forbidden.includes("org.springframework"), "the module the others build on carries no framework for them");
		assert.deepEqual(control.structure_rules[2]!.scope, ["domain/src/main/java/", "infrastructure/src/main/java/"]);
		assert.ok(control.protected_paths.includes("domain/pom.xml"), "declaring the missing dependency is not the producer's way out of the boundary");
		// Its own negative witness carries the defect a failing test could never exhibit.
		assert.deepEqual(Object.keys(detection.own_negative_witness.structure ?? {}), ["domain/src/main/java/witness495/Witness495Boundary.java"]);
	});

	it("opposes no direction it cannot read, and says so instead of inventing a convention", () => {
		const project = join(root, "flat");
		fixtureMavenMultiModule(project);
		const detection = detectStack(project, []);
		const rules = detection.controls.find((c) => c.control_id === "structure")!.structure_rules;
		assert.deepEqual(rules.map((rule) => rule.kind), ["no_cycle"], "two modules laid out under the same package root cannot be told apart by an import");
		assert.ok(detection.capability_missing.some((note) => note.includes("dependency direction between modules")));
	});
});

describe("the same sensor on the reference and on the candidate (ARC-04, VER-08)", () => {
	function tree(name: string, files: Record<string, string>): string {
		const path = join(root, name);
		fixtureMavenHexagonal(path);
		writeFiles(path, files);
		return path;
	}

	async function run(control: ControlDefinition, workspace: string, introduced: Record<string, number[]>) {
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		return (await runner.runControl({ ...base(), control, workspace_path: workspace, introduced_lines: introduced })).evidence;
	}

	it("a candidate placing a responsibility in a forbidden module is refused; the cycle it inherited is named and tolerated", async () => {
		const detection = detectStack(tree("reference", { [USER]: CYCLIC_USER }), []);
		const control = detection.controls.find((c) => c.control_id === "structure")!;
		// The reference introduces nothing: the sensor passes and still names the cycle already there.
		const onReference = await run(control, join(root, "reference"), {});
		assert.equal(onReference.verdict, "PASS");
		assert.deepEqual(onReference.findings.map((f) => `${f.path}:${f.region?.start_line}`), [`${SERVICE}:3`]);
		assert.equal(onReference.facts.inherited_violations, 1);

		const candidate = tree("candidate", { [USER]: CYCLIC_USER, [SERVICE]: FORBIDDEN_SERVICE });
		const onCandidate = await run(control, candidate, { [SERVICE]: [4] });
		assert.equal(onCandidate.verdict, "FAIL");
		assert.deepEqual(onCandidate.findings.map((f) => `${f.rule_id} ${f.path}:${f.region?.start_line}`), [
			`structure:module-boundary:domain->infrastructure ${SERVICE}:4`,
			`structure:package-cycle ${SERVICE}:3`,
		]);

		const reference = { reference_id: "ref_1", reference_digest: digestValue("tree"), verdict: onReference.verdict, findings: onReference.findings.map((f): Finding => ({ ...f, baseline_state: "preexisting" })), evidence_id: "evr_1", reused: false };
		const outcome = compareToReference(onCandidate.verdict, onCandidate.findings, reference, { renames: new Map(), disappeared: new Set() }, "no_aggravation");
		assert.equal(outcome.verdict, "FAIL");
		assert.deepEqual([outcome.comparison.new_findings, outcome.comparison.preexisting_findings, outcome.comparison.blocking_findings], [1, 1, 1]);
		assert.deepEqual(outcome.findings.map((f) => `${f.baseline_state} ${f.rule_id}`), ["new structure:module-boundary:domain->infrastructure", "preexisting structure:package-cycle"]);
	});

	it("a candidate that only inherits the cycle is accepted, and the cycle stays visible as preexisting", async () => {
		const detection = detectStack(tree("reference", { [USER]: CYCLIC_USER }), []);
		const control = detection.controls.find((c) => c.control_id === "structure")!;
		const onReference = await run(control, join(root, "reference"), {});
		const candidate = tree("candidate", { [USER]: CYCLIC_USER, [SERVICE]: FORBIDDEN_SERVICE.replace("import io.demo.infra.UserRepository;\n", "") });
		const onCandidate = await run(control, candidate, { [SERVICE]: [6] });
		assert.equal(onCandidate.verdict, "PASS");
		const reference = { reference_id: "ref_1", reference_digest: digestValue("tree"), verdict: onReference.verdict, findings: onReference.findings.map((f): Finding => ({ ...f, baseline_state: "preexisting" })), evidence_id: "evr_1", reused: false };
		const outcome = compareToReference(onCandidate.verdict, onCandidate.findings, reference, { renames: new Map(), disappeared: new Set() }, "no_aggravation");
		assert.equal(outcome.verdict, "PASS");
		assert.deepEqual(outcome.findings.map((f) => `${f.baseline_state} ${f.rule_id}`), ["preexisting structure:package-cycle"]);
		assert.deepEqual([outcome.comparison.new_findings, outcome.comparison.blocking_findings], [0, 0]);
	});

	it("is qualified on witnesses of its own: a boundary crossed, which no failing test would exhibit", async () => {
		const positive = tree("positive", {});
		const detection = detectStack(positive, []);
		const control = detection.controls.find((c) => c.control_id === "structure")!;
		const negativeFiles = detection.own_negative_witness.structure!;
		const negative = tree("negative", negativeFiles);
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
		const q = await qualifyControl(runner, control, { positive_path: positive, negative_path: negative, positive_files: {}, negative_files: negativeFiles }, base());
		assert.deepEqual([q.positive, q.negative, q.incident, q.qualified], ["PASS", "FAIL", "INDETERMINATE", true], JSON.stringify(q.notes));
	});

	it("reads the declarations of the scopes the rules name, and of nothing else", async () => {
		const project = tree("scoped", { "infrastructure/target/generated/Generated.java": "package io.demo.generated;\n", "domain/src/test/java/io/demo/domain/UserTest.java": "package io.demo.domain;\n" });
		const read = await readJavaSources(project, ["domain/src/main/java/", "infrastructure/src/main/java/", "absent/src/main/java/"]);
		assert.deepEqual(read.sources.map((s) => s.path), ["domain/src/main/java/io/demo/domain/port/UserPort.java", SERVICE, USER, "infrastructure/src/main/java/io/demo/infra/UserRepository.java"]);
		assert.deepEqual(read.notes, [], "a module without that source root is a fact of the tree, not a limit of the reading");
	});
});

describe("what the producer receives before it writes (ARC-04)", () => {
	const input: ContextInput = { role: "implement", objective: "add a use case", language: "en", adopted: [], untrusted: [], feedback: null, tools: [], budget_bytes: 10_000, boundaries: [BOUNDARY.statement] };

	it("hands the frozen boundaries to the intervention that produces, and tells it they are read in its code", () => {
		const prompt = buildContext(input).system_prompt;
		assert.match(prompt, /module demo-domain declares no dependency on module demo-infrastructure/);
		assert.match(prompt, /a control of the protocol reads in your code/, "an architecture announced without a control that observes it is a suggestion");
		assert.ok(!buildContext({ ...input, role: "review" }).system_prompt.includes(BOUNDARY.statement), "a reviewer writes nothing to constrain");
		assert.ok(!buildContext({ ...input, boundaries: [] }).system_prompt.includes("boundaries"), "a target that opposes no boundary is told of none");
	});
});
