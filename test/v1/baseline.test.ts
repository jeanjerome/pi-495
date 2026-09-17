import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { DEFAULT_WORKSPACE_POLICY, GitWorkspace } from "../../src/adapters/workspace/git-workspace.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type { ControlInvocation } from "../../src/ports/execution.ts";
import { applyInstability, blockingCount, candidateShape, compareToReference, divergesFromReference } from "../../src/domain/baseline.ts";
import { writeFiles } from "../helpers/fixtures.ts";
import { ENV, EXECUTOR } from "../helpers/change-fixture.ts";

let root: string;
beforeEach(() => { mkdirSync(join(process.cwd(), "test-output"), { recursive: true }); root = mkdtempSync(join(process.cwd(), "test-output", "bsl-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

const NODE = process.execPath;

/** A project whose suite reports one case per source file, so a finding names the file it is about. */
function fixtureStyle(path: string, sources: Record<string, string>): void {
	writeFiles(path, {
		"package.json": JSON.stringify({ name: "f-style", version: "1.0.0", type: "module" }, null, 2),
		"test/style.test.js": 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { readdirSync, readFileSync } from "node:fs";\nconst dir = new URL("../src/", import.meta.url);\nfor (const file of readdirSync(dir).sort()) {\n  test(`src/${file} must not use var`, () => {\n    assert.ok(!/\\bvar\\b/.test(readFileSync(new URL(file, dir), "utf8")));\n  });\n}\n',
		...sources,
	});
}

const INHERITED = "export var inherited = 1;\n";
const CLEAN = "export function greet(name) {\n  return `Hello, ${name}`;\n}\n";
const INTRODUCED = "export function greet(name) {\n  var greeting = `Hello, ${name}`;\n  return greeting;\n}\n";

const control: ControlDefinition = { control_id: "unit", version: "1", title: "node:test suite", command: [NODE, "--test", "--test-reporter=tap"], cwd: ".", env_allowlist: ["PATH", "HOME", "TMPDIR"], env: {}, timeout_ms: 60_000, parser: "node-test", report_path: null, structure_rules: [], network: "denied", writable_paths: [], requirement_refs: [{ requirement_id: "R1", revision: 1 }], protected: true, protected_paths: ["test/"] };

function invocation(workspacePath: string, subjectDigest: string, kind: "reference" | "candidate"): ControlInvocation {
	return { control, protocol: { protocol_id: "prt_1", revision: 1, content_digest: digestValue("prt") }, candidate: { candidate_id: kind, manifest_digest: subjectDigest, base_digest: subjectDigest, workspace_id: "ws" }, subject: { kind, id: kind, revision: 1, digest: subjectDigest }, workspace_path: workspacePath, environment: { environment_id: "env", digest: ENV, profile_id: "verify" }, requirement_refs: control.requirement_refs, producer: EXECUTOR };
}

describe("the same control on the reference and on the candidate (VER-08)", () => {
	function runner(): GenericControlRunner {
		return new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
	}
	const referenceDigest = digestValue("reference-tree");
	const candidateDigest = digestValue("candidate-tree");

	async function passes(candidateSources: Record<string, string>, moveInWorkspace?: (path: string) => void) {
		// The reference carries a defect of its own; the candidate starts from it.
		const referencePath = join(root, "reference");
		fixtureStyle(referencePath, { "src/legacy.js": INHERITED, "src/greet.js": CLEAN });
		const workspace = new GitWorkspace(join(root, "workspaces"));
		const reference = await workspace.captureReference(referencePath, DEFAULT_WORKSPACE_POLICY);
		const referenceWorkspace = await workspace.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
		const candidateWorkspace = await workspace.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
		for (const [relative, content] of Object.entries(candidateSources)) writeFileSync(join(candidateWorkspace.path, relative), content);
		moveInWorkspace?.(candidateWorkspace.path);
		const manifest = await workspace.snapshotCandidate(candidateWorkspace, reference, DEFAULT_WORKSPACE_POLICY);
		const run = runner();
		const onReference = (await run.runControl(invocation(referenceWorkspace.path, referenceDigest, "reference"))).evidence;
		const onCandidate = (await run.runControl(invocation(candidateWorkspace.path, candidateDigest, "candidate"))).evidence;
		return { onReference, onCandidate, shape: candidateShape(manifest), reference };
	}

	it("a tree carrying an inherited defect and an introduced one produces two distinct findings; only the introduced one blocks", async () => {
		const { onReference, onCandidate, shape, reference } = await passes({ "src/greet.js": INTRODUCED });
		assert.equal(onReference.verdict, "FAIL", JSON.stringify(onReference.facts));
		assert.deepEqual(onReference.findings.map((f) => f.path), ["src/legacy.js"]);
		assert.deepEqual(onCandidate.findings.map((f) => f.path).sort(), ["src/greet.js", "src/legacy.js"]);
		const outcome = compareToReference(onCandidate.verdict, onCandidate.findings, { reference_id: reference.reference_id, reference_digest: referenceDigest, verdict: onReference.verdict, findings: onReference.findings, evidence_id: "evr_1", reused: false }, shape, "no_aggravation");
		assert.deepEqual(outcome.findings.map((f) => [f.path, f.baseline_state]).sort(), [["src/greet.js", "new"], ["src/legacy.js", "preexisting"]]);
		assert.equal(outcome.verdict, "FAIL");
		assert.equal(outcome.comparison.blocking_findings, 1, "the inherited defect stays visible and stops blocking; the introduced one blocks");
		assert.equal(outcome.comparison.raw_verdict, "FAIL");
	});

	it("a candidate that adds nothing to the inherited defect is not refused for it", async () => {
		const { onReference, onCandidate, shape, reference } = await passes({});
		assert.equal(onCandidate.verdict, "FAIL", "the control still reports the inherited defect");
		const outcome = compareToReference(onCandidate.verdict, onCandidate.findings, { reference_id: reference.reference_id, reference_digest: referenceDigest, verdict: onReference.verdict, findings: onReference.findings, evidence_id: "evr_1", reused: false }, shape, "no_aggravation");
		assert.equal(outcome.verdict, "PASS");
		assert.equal(outcome.comparison.blocking_findings, 0);
		assert.equal(outcome.comparison.preexisting_findings, 1);
		assert.equal(blockingCount(outcome.findings, "block_any"), 1, "the other frozen tolerance would refuse the same candidate");
	});

	it("renaming the file that carries the defect does not turn it into an introduced one", async () => {
		const { onReference, onCandidate, shape, reference } = await passes({}, (path) => renameSync(join(path, "src", "legacy.js"), join(path, "src", "inherited.js")));
		assert.deepEqual(onCandidate.findings.map((f) => f.path), ["src/inherited.js"], "the control names the new path");
		assert.notEqual(onCandidate.findings[0]?.fingerprint, onReference.findings[0]?.fingerprint, "and the finding is not the same one to a plain comparison");
		assert.deepEqual([...shape.renames], [["src/legacy.js", "src/inherited.js"]]);
		const outcome = compareToReference(onCandidate.verdict, onCandidate.findings, { reference_id: reference.reference_id, reference_digest: referenceDigest, verdict: onReference.verdict, findings: onReference.findings, evidence_id: "evr_1", reused: false }, shape, "no_aggravation");
		assert.deepEqual(outcome.findings.map((f) => f.baseline_state), ["preexisting"]);
		assert.equal(outcome.comparison.new_findings, 0, "a rename adds no debt");
		assert.equal(outcome.comparison.removed_findings, 0, "and hides none (QLT-04)");
		assert.equal(outcome.verdict, "PASS");
	});

	it("a control that answers differently on two passes of the same candidate keeps INDETERMINATE", async () => {
		const referencePath = join(root, "reference");
		fixtureStyle(referencePath, { "src/greet.js": CLEAN });
		const workspace = new GitWorkspace(join(root, "workspaces"));
		const reference = await workspace.captureReference(referencePath, DEFAULT_WORKSPACE_POLICY);
		const referenceWorkspace = await workspace.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
		const candidateWorkspace = await workspace.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
		const run = runner();
		const onReference = (await run.runControl(invocation(referenceWorkspace.path, referenceDigest, "reference"))).evidence;
		assert.equal(onReference.verdict, "PASS");
		// The candidate pass fails on a tree the reference passes: the divergence is real, its cause is not.
		writeFileSync(join(candidateWorkspace.path, "src", "greet.js"), INTRODUCED);
		const first = (await run.runControl(invocation(candidateWorkspace.path, candidateDigest, "candidate"))).evidence;
		assert.equal(first.verdict, "FAIL");
		assert.equal(divergesFromReference(first.verdict, onReference.verdict), true);
		// The pre-registered rule pays for one confirmation; here it comes back green.
		writeFileSync(join(candidateWorkspace.path, "src", "greet.js"), CLEAN);
		const confirmation = (await run.runControl(invocation(candidateWorkspace.path, candidateDigest, "candidate"))).evidence;
		assert.equal(confirmation.verdict, "PASS");
		const outcome = applyInstability(compareToReference(first.verdict, first.findings, { reference_id: reference.reference_id, reference_digest: referenceDigest, verdict: onReference.verdict, findings: onReference.findings, evidence_id: "evr_1", reused: false }, candidateShape(await workspace.snapshotCandidate(candidateWorkspace, reference, DEFAULT_WORKSPACE_POLICY)), "no_aggravation"), confirmation.verdict, "evc_1");
		assert.equal(outcome.verdict, "INDETERMINATE", "the green pass is not the one adopted");
		assert.equal(outcome.comparison.unstable, true);
		assert.equal(outcome.comparison.confirmations, 1);
	});
});
