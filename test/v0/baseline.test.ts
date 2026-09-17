import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { digestValue } from "../../src/contracts/digest.ts";
import type { CandidateManifest, ManifestEntry } from "../../src/contracts/v1/candidate.ts";
import type { Evidence, Finding } from "../../src/contracts/v1/evidence.ts";
import { applyInstability, blockingCount, candidateShape, classifyFindings, compareToReference, controlInputsDigest, divergesFromReference, reusableReferencePass, verdictUnderTolerance } from "../../src/domain/baseline.ts";
import { fingerprintOf, locate, relativize } from "../../src/domain/findings.ts";
import { candidate, evidence, ENV, EXECUTOR, Runner } from "../helpers/change-fixture.ts";

function finding(message: string, over: Partial<Finding> = {}): Finding {
	const located = locate(message);
	const tool = over.tool ?? "unit";
	const rule = over.rule_id ?? `${tool}:failure`;
	return { rule_id: rule, category: "assertion", severity: "blocker", message, path: located.path, region: located.region, symbol: null, requirement_refs: [], baseline_state: "unknown", fingerprint: fingerprintOf({ tool, rule_id: rule, symbol: null, path: located.path, text: located.text }), tool, tool_version: "1", confidence: 1, raw_evidence_ref: null, ...over };
}

const NO_MOVE = { renames: new Map<string, string>(), disappeared: new Set<string>() };

describe("finding identity (VER-08, QLT-04)", () => {
	it("keeps the workspace and the line out of the identity, and reads the location of the usual tools", () => {
		const onReference = relativize("/tmp/ws_a/src/A.java:[47,44] cannot find symbol: method metadata()", "/tmp/ws_a");
		const onCandidate = relativize("/tmp/ws_b/src/A.java:[112,44] cannot find symbol: method metadata()", "/tmp/ws_b");
		assert.equal(locate(onReference).path, "src/A.java");
		assert.deepEqual(locate(onReference).region, { start_line: 47, end_line: 47, start_col: 44, end_col: null });
		assert.equal(locate(onCandidate).region?.start_line, 112);
		assert.equal(finding(onReference).fingerprint, finding(onCandidate).fingerprint, "the same defect moved down 65 lines is the same defect");
		assert.notEqual(finding(onReference).fingerprint, finding(relativize("/tmp/ws_b/src/B.java:[47,44] cannot find symbol: method metadata()", "/tmp/ws_b")).fingerprint, "another file is another defect");
		assert.deepEqual(locate("src/a.ts:12:3 - error TS2322: type mismatch"), { path: "src/a.ts", region: { start_line: 12, end_line: 12, start_col: 3, end_col: null }, text: "error TS2322: type mismatch" });
		assert.equal(locate("Program.cs(12,3): warning CA1822").path, "Program.cs");
		assert.equal(locate("src/lint.js:12: var is forbidden").region?.start_line, 12);
		assert.equal(locate("src/legacy.js must not use var").path, "src/legacy.js", "a bare path is still a location");
		assert.equal(locate("greet returns Hello, x").path, null, "a test name is not a path");
	});
});

describe("classification of findings against the reference (VER-08)", () => {
	const old = finding("src/legacy.js must not use var");
	const introduced = finding("src/greet.js must not use var");

	it("an inherited defect and an introduced one are two distinct findings, and only the introduced one blocks", () => {
		const classified = classifyFindings([old], [old, introduced], NO_MOVE);
		assert.deepEqual(classified.findings.map((f) => [f.path, f.baseline_state]), [["src/legacy.js", "preexisting"], ["src/greet.js", "new"]]);
		assert.deepEqual(classified.counts, { new: 1, preexisting: 1, removed: 0 });
		assert.equal(blockingCount(classified.findings, "no_aggravation"), 1, "the inherited defect stays visible and stops blocking");
		assert.equal(blockingCount(classified.findings, "block_any"), 2, "the other pre-registered tolerance blocks both");
	});

	it("a defect the candidate repaired is kept as removed and never blocks", () => {
		const classified = classifyFindings([old, introduced], [introduced], NO_MOVE);
		assert.deepEqual(classified.counts, { new: 0, preexisting: 1, removed: 1 });
		const removed = classified.findings.find((f) => f.baseline_state === "removed");
		assert.equal(removed?.path, "src/legacy.js");
		assert.equal(blockingCount(classified.findings, "block_any"), 1, "a finding no longer observed blocks nothing");
	});

	it("a renamed file does not turn an inherited defect into an introduced one", () => {
		const moved = finding("src/inherited.js must not use var");
		// The manifest proves the move: same bytes under another name.
		const proven = classifyFindings([old], [moved], { renames: new Map([["src/legacy.js", "src/inherited.js"]]), disappeared: new Set(["src/legacy.js"]) });
		assert.deepEqual(proven.counts, { new: 0, preexisting: 1, removed: 0 });
		assert.equal(blockingCount(proven.findings, "no_aggravation"), 0);
		assert.match(proven.notes[0] ?? "", /followed from src\/legacy.js to src\/inherited.js/);
		// Moved and edited: the manifest cannot prove it, one finding left on each side does.
		const edited = classifyFindings([old], [moved], { renames: new Map(), disappeared: new Set(["src/legacy.js"]) });
		assert.deepEqual(edited.counts, { new: 0, preexisting: 1, removed: 0 });
		// Nothing left to pair it with: the file is still there, so the finding elsewhere is a new one.
		const unrelated = classifyFindings([old], [moved], NO_MOVE);
		assert.deepEqual(unrelated.counts, { new: 1, preexisting: 0, removed: 1 });
	});

	it("an ambiguous move is not guessed: two candidates for one inherited finding stay introduced", () => {
		const first = finding("src/one.js must not use var");
		const second = finding("src/two.js must not use var");
		const ambiguous = classifyFindings([old], [first, second], { renames: new Map(), disappeared: new Set(["src/legacy.js"]) });
		assert.deepEqual(ambiguous.counts, { new: 2, preexisting: 0, removed: 1 });
	});

	it("repeated identical findings are counted, not collapsed: one more of the same is one introduced", () => {
		const twice = classifyFindings([old], [old, { ...old }], NO_MOVE);
		assert.deepEqual(twice.counts, { new: 1, preexisting: 1, removed: 0 });
	});
});

describe("tolerance and instability, frozen before any control runs (VER-08)", () => {
	const old = finding("src/legacy.js must not use var");
	const introduced = finding("src/greet.js must not use var");
	const reference = { reference_id: "ref_1", reference_digest: digestValue("tree"), verdict: "FAIL" as const, findings: [old], evidence_id: "evr_1", reused: false };

	it("a control failing on both passes without a new finding does not block; one new finding is enough to block", () => {
		const inherited = compareToReference("FAIL", [old], reference, NO_MOVE, "no_aggravation");
		assert.equal(inherited.verdict, "PASS");
		assert.equal(inherited.comparison.raw_verdict, "FAIL", "what the control observed is kept");
		assert.equal(inherited.comparison.blocking_findings, 0);
		assert.match(inherited.comparison.notes.join(" "), /nothing the reference does not already carry/);
		const aggravated = compareToReference("FAIL", [old, introduced], reference, NO_MOVE, "no_aggravation");
		assert.equal(aggravated.verdict, "FAIL");
		assert.equal(aggravated.comparison.blocking_findings, 1);
		assert.deepEqual([aggravated.comparison.new_findings, aggravated.comparison.preexisting_findings], [1, 1]);
	});

	it("a control that reports what it found without failing on it still establishes a baseline", () => {
		// A sensor judging the introduced lines passes on the reference, which introduces nothing, and
		// names what it found there all the same. What the candidate inherits from it is inherited debt.
		const reported = { ...reference, verdict: "PASS" as const };
		const inherited = compareToReference("FAIL", [old], reported, NO_MOVE, "no_aggravation");
		assert.equal(inherited.verdict, "PASS", "the candidate fails on nothing the reference does not already carry");
		assert.equal(inherited.comparison.preexisting_findings, 1);
		const aggravated = compareToReference("FAIL", [old, introduced], reported, NO_MOVE, "no_aggravation");
		assert.equal(aggravated.verdict, "FAIL");
		assert.equal(aggravated.comparison.blocking_findings, 1);
	});

	it("nothing is tolerated without a baseline, and an unusable observation is never tolerated", () => {
		assert.equal(verdictUnderTolerance("FAIL", "PASS", [introduced], "no_aggravation").verdict, "FAIL", "a failure the reference does not share is the candidate's");
		assert.equal(verdictUnderTolerance("FAIL", "INDETERMINATE", [old], "no_aggravation").verdict, "FAIL", "an unknown baseline is not a tolerance");
		assert.equal(verdictUnderTolerance("INDETERMINATE", "FAIL", [], "no_aggravation").verdict, "INDETERMINATE");
		assert.equal(verdictUnderTolerance("FAIL", "FAIL", [old], "block_any").verdict, "FAIL", "the other frozen tolerance blocks inherited debt too");
		assert.equal(verdictUnderTolerance("FAIL", "FAIL", [], "no_aggravation").verdict, "FAIL", "a failure that names no finding at all has nothing the reference could have carried");
		assert.equal(blockingCount([{ ...old, baseline_state: "unknown" }], "no_aggravation"), 1, "a finding of unknown state keeps blocking");
	});

	it("a control that alternates keeps INDETERMINATE: the greener of two disagreeing passes is never adopted", () => {
		assert.equal(divergesFromReference("FAIL", "PASS"), true);
		assert.equal(divergesFromReference("FAIL", "FAIL"), false, "a failure both passes share is not a divergence");
		assert.equal(divergesFromReference("PASS", "FAIL"), false);
		const green = { ...reference, verdict: "PASS" as const, findings: [] };
		const failed = compareToReference("FAIL", [introduced], green, NO_MOVE, "no_aggravation");
		const unstable = applyInstability(failed, "PASS", "evc_1");
		assert.equal(unstable.verdict, "INDETERMINATE", "a pass obtained on the second run does not make the control conforming");
		assert.equal(unstable.comparison.unstable, true);
		assert.equal(unstable.comparison.blocking_findings, 0);
		assert.equal(unstable.comparison.confirmations, 1);
		assert.match(unstable.comparison.notes.join(" "), /not run again/);
		const confirmed = applyInstability(failed, "FAIL", "evc_1");
		assert.equal(confirmed.verdict, "FAIL", "a divergence that reproduces is a property of the candidate");
		assert.equal(confirmed.comparison.unstable, false);
		assert.equal(confirmed.comparison.confirmations, 1);
	});
});

describe("what the candidate did to the tree, and the reuse of a reference pass (VER-08)", () => {
	function entry(path: string, state: ManifestEntry["baseline_state"], digest: string): ManifestEntry {
		return { path, kind: "file", content_digest: digest, size: 1, mode: "000644", symlink_target: null, baseline_state: state, origin: "agent", limits: null };
	}

	it("a file moved with its bytes is a rename; a path the candidate dropped is a disappearance", () => {
		const manifest = { entries: [entry("src/legacy.js", "deleted", digestValue("same")), entry("src/inherited.js", "added", digestValue("same")), entry("docs/gone.md", "deleted", digestValue("other")), entry("src/greet.js", "unchanged", digestValue("greet"))] } as CandidateManifest;
		const shape = candidateShape(manifest);
		assert.deepEqual([...shape.renames], [["src/legacy.js", "src/inherited.js"]]);
		assert.deepEqual([...shape.disappeared].sort(), ["docs/gone.md", "src/legacy.js"]);
	});

	it("a reference pass is reused for the same sensor, reference, environment and protocol, never across a change of any of them", () => {
		const reference = digestValue("tree");
		const control = { control_id: "unit", version: "1", title: "t", command: ["node", "--test"], cwd: ".", env_allowlist: [], env: {}, timeout_ms: 1000, parser: "node-test" as const, report_path: null, structure_rules: [], network: "denied" as const, writable_paths: [], requirement_refs: [], protected: true, protected_paths: [] };
		const protocol = { protocol_id: "prt_1", revision: 1, content_digest: digestValue("prt") };
		const pass: Evidence = { evidence_id: "evr_1", requirement_refs: [], control_id: "unit", control_version: "1", subject: { kind: "reference", id: "ref_1", revision: 1, digest: reference }, protocol_revision: protocol, environment_digest: ENV, inputs_digest: controlInputsDigest(control, reference), started_at: "2026-09-16T10:00:00.000Z", ended_at: "2026-09-16T10:00:01.000Z", verdict: "FAIL", facts: { run: "reference" }, findings: [], artifacts: [], limits: { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] }, baseline: null, producer: EXECUTOR, integrity: { content_digest: digestValue("i"), chained_to: null } };
		assert.equal(reusableReferencePass([pass], control, reference, ENV, protocol)?.evidence_id, "evr_1");
		assert.equal(reusableReferencePass([{ ...pass, facts: { run: "candidate" } }], control, reference, ENV, protocol), null, "a pass on the candidate is not a baseline");
		assert.equal(reusableReferencePass([pass], { ...control, command: ["node", "--test", "--only"] }, reference, ENV, protocol), null, "another command is another sensor");
		assert.equal(reusableReferencePass([pass], control, reference, digestValue("other-env"), protocol), null, "another environment is not comparable");
		assert.equal(reusableReferencePass([pass], control, digestValue("other-tree"), ENV, protocol), null, "another reference is another baseline");
		assert.equal(reusableReferencePass([pass], control, reference, ENV, { ...protocol, revision: 2 }), null, "a revised protocol establishes its passes again");
	});
});

describe("what the tolerance changes at G5 (VER-08, RM-036)", () => {
	it("a control whose only findings are inherited lets the change through; one introduced finding refuses it", () => {
		const c = candidate("tolerated");
		const inherited = new Runner().toImplementing().implement().freeze(c).verify([
			evidence({ control_id: "unit", subject_digest: c.manifest_digest, verdict: "PASS" }),
			evidence({ control_id: "lint", subject_digest: c.manifest_digest, verdict: "PASS", findings_blocking: 0 }),
		]).g5();
		assert.equal(inherited.s.gates.G5?.verdict, "PASS");
		const aggravated = new Runner().toImplementing().implement().freeze(c).verify([
			evidence({ control_id: "unit", subject_digest: c.manifest_digest, verdict: "PASS" }),
			evidence({ control_id: "lint", subject_digest: c.manifest_digest, verdict: "PASS", findings_blocking: 1 }),
		]).g5();
		assert.equal(aggravated.s.gates.G5?.verdict, "FAIL");
		assert.ok(aggravated.s.gates.G5?.reasons.some((r) => r.includes("R2")));
	});
});
