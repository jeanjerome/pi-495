/**
 * Preparation of verification means (PF-06 steps 3-5, PRE-01 to PRE-03, SA-008, SA-009):
 * a `prepare` intervention proposes tests in the target technology; the kernel checks scope,
 * loadability and discriminance, then adopts (or not) the prepared files. The producer never
 * adopts its own proposal.
 */
import type { CandidateManifest, ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type { CapabilityLevel, ControlCapabilityDiagnosis } from "../contracts/v1/protocol.ts";

export interface PreparedFile {
	path: string;
	digest: string;
	size_bytes: number;
}

export interface PreparationRecord {
	preparation_id: string;
	objective: string;
	allowed_paths: string[];
	files: PreparedFile[];
	/** Verdict of the prepared suite on the bare reference: FAIL means it detects the absent feature. */
	on_reference: "PASS" | "FAIL" | "INDETERMINATE" | "NOT_RUN" | "NOT_APPLICABLE";
	discriminant: boolean;
	loadable: boolean;
	qualified: boolean;
	notes: string[];
}

export function preparedFilesFrom(manifest: CandidateManifest, allowed: string[]): { files: PreparedFile[]; out_of_scope: string[] } {
	const files: PreparedFile[] = [];
	const out: string[] = [];
	for (const e of manifest.entries) {
		if (e.baseline_state === "unchanged") continue;
		const inScope = allowed.some((a) => e.path.startsWith(a));
		if (!inScope) { out.push(e.path); continue; }
		if (e.baseline_state === "deleted" || e.kind !== "file" || !e.content_digest) { out.push(`${e.path} (${e.baseline_state})`); continue; }
		files.push({ path: e.path, digest: e.content_digest, size_bytes: e.size });
	}
	return { files, out_of_scope: out };
}

export function isProtectedPrepared(path: string, prepared: PreparationRecord | null, digest: string | null): boolean {
	if (!prepared) return false;
	const f = prepared.files.find((x) => x.path === path);
	return Boolean(f && f.digest === digest);
}

/** Level 1 of the PRE-01 scale: a file named like a test, which says nothing about it ever running. */
const TEST_FILE_NAME = /\.(test|spec)\.[cm]?[jt]s$|Test\.java$|_test\.[jt]s$/;

export function referenceTestFiles(reference: ReferenceSnapshot, testPaths: string[]): string[] {
	return reference.entries.filter((e) => e.kind === "file" && testPaths.some((d) => e.path.startsWith(d)) && TEST_FILE_NAME.test(e.path)).map((e) => e.path);
}

/** What the target's own test command reported when it ran on a copy of the reference. */
export interface ReferenceSuiteObservation {
	/** Test cases reported, qualification witnesses included. */
	reported: number;
	/** Of those, the ones skipped or left todo: discovered, never executed. */
	skipped: number;
	/** Cases contributed by the witnesses, which exercise the runner and not the project. */
	witnesses: number;
}

export interface CapabilityInput {
	stack: string;
	test_files: string[];
	requirements: readonly { requirement_id: string; mandatory: boolean; satisfied_by_reference: boolean }[];
	/** Null until the suite has been run on the reference; the levels above `file_present` stay unknown. */
	suite: ReferenceSuiteObservation | null;
	prepared: PreparationRecord | null;
}

/**
 * PRE-01 — what the controls already on the target can decide, on the four-level scale, and which
 * mandatory requirements they leave undecided.
 *
 * The scale is not cosmetic: every control the protocol may freeze is green on the reference, since
 * G2 refuses it unless its positive witness passes there. Such a control answers the same whether a
 * behaviour the reference does not have appears or not, so it can never decide a requirement asking
 * for that behaviour — only a suite that fails on the reference can. A requirement the reference
 * already honours is the opposite case: non-regression decides it, provided the existing suite
 * actually executes something, which is what levels 2 and 3 measure.
 */
export function diagnoseControlCapability(input: CapabilityInput): ControlCapabilityDiagnosis {
	const discovered = input.suite ? Math.max(0, input.suite.reported - input.suite.witnesses) : null;
	const executed = discovered === null ? null : Math.max(0, discovered - input.suite!.skipped);
	const discriminant = Boolean(input.prepared?.discriminant);
	const level: CapabilityLevel = discriminant ? "discriminating" : (executed ?? 0) > 0 ? "executed" : (discovered ?? 0) > 0 ? "discoverable" : input.test_files.length > 0 ? "file_present" : "none";
	const notes: string[] = [];
	if (input.test_files.length === 0) notes.push(`no test file under the test roots of this ${input.stack} target`);
	if (input.test_files.length > 0 && discovered === 0) notes.push(`${input.test_files.length} test file(s) are present but the target's own test command reports no case of its own: ${input.test_files.slice(0, 5).join(", ")}`);
	if ((discovered ?? 0) > 0 && executed === 0) notes.push(`${discovered} case(s) are discovered and every one is skipped: the suite executes nothing`);
	if (discriminant) notes.push(`prepared suite adopted: ${input.prepared!.files.length} file(s) failing on the reference`);
	const undiscriminated: string[] = [];
	const unobserved: string[] = [];
	for (const r of input.requirements) {
		if (!r.mandatory || discriminant) continue;
		if (!r.satisfied_by_reference) {
			undiscriminated.push(r.requirement_id);
			notes.push(`${r.requirement_id} asks for behaviour the reference does not have: no control that passes on the reference can detect its absence`);
			continue;
		}
		if (executed === null) unobserved.push(r.requirement_id);
		else if (executed === 0) {
			undiscriminated.push(r.requirement_id);
			notes.push(`${r.requirement_id} is proved by non-regression, and the reference executes no test of its own`);
		}
	}
	return { stack: input.stack, level, test_files: input.test_files.length, discovered, executed, undiscriminated_requirements: undiscriminated, unobserved_requirements: unobserved, notes };
}

export function samePreparationPaths(left: string[], right: string[]): boolean {
	const normal = (paths: string[]) => [...new Set(paths)].sort();
	return JSON.stringify(normal(left)) === JSON.stringify(normal(right));
}
