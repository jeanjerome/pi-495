/**
 * Comparison of a control's two passes (VER-08).
 *
 * The same control runs on the reference and on the candidate in the same environment. What it
 * reports on both sides is a defect the change inherited; what it reports only on the candidate is a
 * defect the change introduced. The distinction is the whole point: a ratio over the whole tree
 * blocks a component that was already below the line and lets an untested addition through when the
 * rest compensates, while a rule on the delta names exactly what this change owes.
 */
import { digestValue } from "../contracts/digest.ts";
import type { ProtocolRef, Verdict } from "../contracts/v1/common.ts";
import type { CandidateManifest } from "../contracts/v1/candidate.ts";
import type { BaselineComparison, BaselineTolerance, Evidence, Finding } from "../contracts/v1/evidence.ts";
import type { ControlDefinition } from "../contracts/v1/protocol.ts";
import { fingerprintOf, locate } from "./findings.ts";

/** What a control ran on. Two passes with the same inputs digest observed the same thing. */
export function controlInputsDigest(control: Pick<ControlDefinition, "command" | "cwd" | "env">, subjectDigest: string): string {
	return digestValue({ command: control.command, cwd: control.cwd, env: control.env, candidate: subjectDigest });
}

/**
 * A reference pass already established for this sensor, this reference and this environment. A
 * reference does not change while a change is under way: running it again at every attempt would
 * spend the same time on the same tree to obtain the same answer.
 */
export function reusableReferencePass(evidence: readonly Evidence[], control: ControlDefinition, referenceDigest: string, environmentDigest: string, protocol: ProtocolRef): Evidence | null {
	const inputs = controlInputsDigest(control, referenceDigest);
	for (let i = evidence.length - 1; i >= 0; i--) {
		const pass = evidence[i]!;
		if (pass.control_id !== control.control_id || pass.facts.run !== "reference") continue;
		if (pass.subject.digest !== referenceDigest || pass.environment_digest !== environmentDigest || pass.inputs_digest !== inputs) continue;
		if (pass.protocol_revision.protocol_id !== protocol.protocol_id || pass.protocol_revision.revision !== protocol.revision) continue;
		return pass;
	}
	return null;
}

export interface ReferencePass {
	reference_id: string;
	reference_digest: string;
	verdict: Verdict;
	findings: readonly Finding[];
	evidence_id: string | null;
	/** The pass was read back from the ledger instead of being run again. */
	reused: boolean;
}

export interface CandidateShape {
	/** Reference path -> candidate path, for a file the candidate moved without changing its content. */
	renames: ReadonlyMap<string, string>;
	/** Reference paths the candidate tree no longer holds under that name. */
	disappeared: ReadonlySet<string>;
}

export interface BaselineOutcome {
	verdict: Verdict;
	findings: Finding[];
	comparison: BaselineComparison;
}

/**
 * What the candidate did to the tree, as the comparison needs it: a file moved under another name
 * with the same bytes, and a path the candidate no longer holds. Both are what QLT-04 forbids using
 * to make a debt disappear.
 */
export function candidateShape(manifest: CandidateManifest): CandidateShape {
	const renames = new Map<string, string>();
	const taken = new Set<string>();
	const added = manifest.entries.filter((entry) => entry.baseline_state === "added" && entry.kind === "file" && entry.content_digest !== null);
	const disappeared = new Set<string>();
	for (const gone of manifest.entries) {
		if (gone.baseline_state !== "deleted") continue;
		disappeared.add(gone.path);
		if (gone.kind !== "file" || gone.content_digest === null) continue;
		const moved = added.find((entry) => entry.content_digest === gone.content_digest && !taken.has(entry.path));
		if (!moved) continue;
		renames.set(gone.path, moved.path);
		taken.add(moved.path);
	}
	return { renames, disappeared };
}

/** Identity of a finding once its file is set aside: what survives a rename the manifest cannot prove. */
function pathlessKey(finding: Finding): string {
	return fingerprintOf({ tool: finding.tool, rule_id: finding.rule_id, symbol: finding.symbol, path: null, text: locate(finding.message).text });
}

/** Identity of a reference finding as it would read once its file took its candidate name. */
function relocatedKey(finding: Finding, path: string): string {
	return fingerprintOf({ tool: finding.tool, rule_id: finding.rule_id, symbol: finding.symbol, path, text: locate(finding.message).text });
}

interface Pool {
	/** Index of the next reference finding under this key, without claiming it. */
	peek(key: string): number | null;
	claim(key: string): void;
	size(key: string): number;
}

function pool(findings: readonly Finding[], consumed: ReadonlySet<number>, key: (finding: Finding) => string | null): Pool {
	const buckets = new Map<string, number[]>();
	findings.forEach((finding, index) => {
		if (consumed.has(index)) return;
		const k = key(finding);
		if (k === null) return;
		const bucket = buckets.get(k);
		if (bucket) bucket.push(index);
		else buckets.set(k, [index]);
	});
	return {
		peek: (k) => buckets.get(k)?.[0] ?? null,
		claim: (k) => void buckets.get(k)?.shift(),
		size: (k) => buckets.get(k)?.length ?? 0,
	};
}

export interface Classification {
	findings: Finding[];
	counts: { new: number; preexisting: number; removed: number };
	notes: string[];
}

/**
 * Pairs the findings of the two passes. Three passes over the same set, from the strictest match to
 * the loosest: same file and same words, then the same words in the file's new name when the
 * manifest proves the move, then the same words in a file the candidate no longer holds — the last
 * only when a single finding on each side can claim the pairing, so that a rename cannot turn
 * inherited debt into an introduced defect, nor hide it (QLT-04).
 */
export function classifyFindings(reference: readonly Finding[], candidate: readonly Finding[], shape: CandidateShape): Classification {
	const consumed = new Set<number>();
	const notes: string[] = [];
	const matched = new Map<number, Finding>();
	let pending = candidate.map((finding, index) => ({ finding, index }));

	const pass = (referenceKey: (finding: Finding) => string | null, candidateKey: (finding: Finding) => string | null, guard?: (candidateFinding: Finding, available: Pool, key: string) => boolean, note?: (referenceFinding: Finding, candidateFinding: Finding) => string) => {
		const available = pool(reference, consumed, referenceKey);
		const next: typeof pending = [];
		for (const entry of pending) {
			const key = candidateKey(entry.finding);
			if (key === null) { next.push(entry); continue; }
			const index = available.peek(key);
			if (index === null || (guard && !guard(entry.finding, available, key))) { next.push(entry); continue; }
			available.claim(key);
			consumed.add(index);
			matched.set(entry.index, { ...entry.finding, baseline_state: "preexisting" });
			if (note) notes.push(note(reference[index]!, entry.finding));
		}
		pending = next;
	};

	pass((f) => f.fingerprint, (f) => f.fingerprint);
	pass(
		(f) => (f.path !== null && shape.renames.has(f.path) ? relocatedKey(f, shape.renames.get(f.path)!) : null),
		(f) => f.fingerprint,
		undefined,
		(referenceFinding, candidateFinding) => `preexisting finding followed from ${referenceFinding.path} to ${candidateFinding.path}: the candidate renamed the file`,
	);
	const unmatchedByText = new Map<string, number>();
	for (const entry of pending) {
		const key = pathlessKey(entry.finding);
		unmatchedByText.set(key, (unmatchedByText.get(key) ?? 0) + 1);
	}
	pass(
		(f) => (f.path !== null && shape.disappeared.has(f.path) ? pathlessKey(f) : null),
		(f) => pathlessKey(f),
		// Only an unambiguous pairing: one finding gone with its file, one finding appeared elsewhere.
		(candidateFinding, available, key) => available.size(key) === 1 && unmatchedByText.get(pathlessKey(candidateFinding)) === 1,
		(referenceFinding, candidateFinding) => `preexisting finding followed from ${referenceFinding.path} to ${candidateFinding.path}: same finding, file no longer at its former path`,
	);

	const findings: Finding[] = candidate.map((finding, index) => matched.get(index) ?? { ...finding, baseline_state: "new" });
	const removed = reference.filter((_finding, index) => !consumed.has(index)).map((finding) => ({ ...finding, baseline_state: "removed" as const }));
	return {
		findings: [...findings, ...removed],
		counts: { new: findings.length - matched.size, preexisting: matched.size, removed: removed.length },
		notes,
	};
}

/**
 * Whether a finding blocks the change. Under `no_aggravation` a defect the reference already carried
 * stays visible and stops blocking; a defect whose state could not be established keeps blocking,
 * because an unknown baseline is not a tolerance.
 */
export function findingBlocks(finding: Finding, tolerance: BaselineTolerance): boolean {
	if (finding.severity !== "blocker") return false;
	if (finding.baseline_state === "removed") return false;
	if (tolerance === "block_any") return true;
	return finding.baseline_state !== "preexisting";
}

export function blockingCount(findings: readonly Finding[], tolerance: BaselineTolerance): number {
	return findings.filter((finding) => findingBlocks(finding, tolerance)).length;
}

/**
 * The verdict the control carries on the delta. A control that fails while every defect it names is
 * one the reference already carried reports inherited debt: under `no_aggravation` it does not
 * block, and the findings keep that debt visible. This covers the control that fails on both passes,
 * and equally the one whose reference pass reported the same defects without failing — a sensor that
 * judges the introduced lines passes on a tree it introduces nothing in, while still naming what it
 * finds there.
 *
 * Any other case keeps what the control observed: a reference pass that concluded nothing is not a
 * tolerance, and a failure the reference does not share is the candidate's.
 */
export function verdictUnderTolerance(raw: Verdict, referencePass: Verdict, findings: readonly Finding[], tolerance: BaselineTolerance): { verdict: Verdict; notes: string[] } {
	if (tolerance !== "no_aggravation" || raw !== "FAIL") return { verdict: raw, notes: [] };
	if (referencePass !== "FAIL" && referencePass !== "PASS") return { verdict: raw, notes: [] };
	if (blockingCount(findings, tolerance) > 0) return { verdict: raw, notes: [] };
	const preexisting = findings.filter((finding) => finding.baseline_state === "preexisting").length;
	if (preexisting === 0) return { verdict: raw, notes: [] };
	return { verdict: "PASS", notes: [`this control fails on nothing the reference does not already carry: ${preexisting} preexisting finding(s) tolerated, none aggravated (VER-08)`] };
}

/** The candidate pass is worse than the reference pass, and no preexisting defect explains it. */
export function divergesFromReference(raw: Verdict, referencePass: Verdict): boolean {
	return raw === "FAIL" && referencePass === "PASS";
}

/** Compares the two passes of one control and states what the candidate is worth against them. */
export function compareToReference(raw: Verdict, candidateFindings: readonly Finding[], referencePass: ReferencePass, shape: CandidateShape, tolerance: BaselineTolerance): BaselineOutcome {
	const classification = classifyFindings(referencePass.findings, candidateFindings, shape);
	const tolerated = verdictUnderTolerance(raw, referencePass.verdict, classification.findings, tolerance);
	return {
		verdict: tolerated.verdict,
		findings: classification.findings,
		comparison: {
			reference_id: referencePass.reference_id,
			reference_digest: referencePass.reference_digest,
			reference_verdict: referencePass.verdict,
			reference_evidence_id: referencePass.evidence_id,
			reused: referencePass.reused,
			tolerance,
			raw_verdict: raw,
			new_findings: classification.counts.new,
			preexisting_findings: classification.counts.preexisting,
			removed_findings: classification.counts.removed,
			blocking_findings: blockingCount(classification.findings, tolerance),
			unstable: false,
			confirmations: 0,
			notes: [...classification.notes, ...tolerated.notes],
		},
	};
}

/**
 * The pre-registered rule for a control whose two passes diverge (VER-08). One confirmation pass on
 * the same candidate, and the greener of two disagreeing answers is never the one adopted: a control
 * that alternates keeps INDETERMINATE and is not run again. Relaunching until the first green is
 * exactly what this forbids.
 */
export function applyInstability(outcome: BaselineOutcome, confirmation: Verdict, confirmationEvidenceId: string | null): BaselineOutcome {
	const reference = `confirmation pass ${confirmationEvidenceId ?? "(unrecorded)"}`;
	if (confirmation === outcome.comparison.raw_verdict) {
		return { ...outcome, comparison: { ...outcome.comparison, confirmations: outcome.comparison.confirmations + 1, notes: [...outcome.comparison.notes, `${reference} answered ${confirmation} again: the divergence from the reference is a property of the candidate`] } };
	}
	return {
		verdict: "INDETERMINATE",
		findings: outcome.findings,
		comparison: {
			...outcome.comparison,
			unstable: true,
			confirmations: outcome.comparison.confirmations + 1,
			blocking_findings: 0,
			notes: [...outcome.comparison.notes, `the control answered ${outcome.comparison.raw_verdict} then ${confirmation} on the same candidate (${reference}): unstable, verdict kept INDETERMINATE and the control is not run again (VER-08)`],
		},
	};
}

/**
 * Whether re-running the verification could answer differently. Re-running a frozen candidate
 * through a frozen protocol is a pure function: only a transient incident — spawn error, timeout,
 * signal — can, and only while it has not already reproduced identically. A control the frozen rule
 * has already declared unstable is never run again: its indetermination is the answer, and running
 * it until it comes out green is exactly what VER-08 forbids.
 *
 * `observations` are the indeterminate observations recorded on the frozen candidate, oldest first.
 */
export function retryCanDiffer(observations: readonly Evidence[]): boolean {
	const last = observations.at(-1);
	if (last?.limits.unstable) return false;
	if (!last || typeof last.facts.incident !== "string") return false;
	const signature = (e: Evidence) => `${e.inputs_digest}|${String(e.facts.incident ?? "")}`;
	return observations.filter((e) => signature(e) === signature(last)).length < 2;
}
