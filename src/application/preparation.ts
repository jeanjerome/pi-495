/**
 * Preparation of verification means (PF-06 steps 3-5, PRE-01 to PRE-03, SA-008, SA-009):
 * a `prepare` intervention proposes tests in the target technology; the kernel checks scope,
 * loadability and discriminance, then adopts (or not) the prepared files. The producer never
 * adopts its own proposal.
 */
import type { CandidateManifest, ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type {
	CapabilityLevel,
	ControlCapabilityDiagnosis,
	ObservedCase,
	OracleQualification,
	RequirementOracle,
} from "../contracts/v1/protocol.ts";

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
	/**
	 * Of the retained files, those that existed on the reference: a test rewritten here changes what
	 * the target guaranteed until now.
	 */
	modified_existing: string[];
	/** Verdict of the prepared suite on the bare reference, which proves no requirement by itself. */
	on_reference: "PASS" | "FAIL" | "INDETERMINATE" | "NOT_RUN" | "NOT_APPLICABLE";
	/** Some requirement is proved by a case of its own failing by assertion on the reference. */
	discriminant: boolean;
	loadable: boolean;
	qualified: boolean;
	notes: string[];
	/**
	 * The oracle observed for each requirement of the mandate. Absent from a preparation recorded before
	 * observations were kept per requirement: such a record stays readable and proves no requirement.
	 */
	requirements?: RequirementOracle[];
}

/**
 * What a preparation retains: the files written under its roots, with those among them that existed
 * on the reference named apart. What it wrote elsewhere — a work log, a script, the feature itself —
 * is named and left out, never refused: the mandate bounds what is retained, not what a producer
 * may write to check itself. A deletion or a non-file entry under a root is refused, since nothing
 * of it can be retained.
 */
export function preparedFilesFrom(
	manifest: CandidateManifest,
	allowed: string[],
): { files: PreparedFile[]; modified_existing: string[]; out_of_scope: string[]; refused: string[] } {
	const files: PreparedFile[] = [];
	const modifiedExisting: string[] = [];
	const out: string[] = [];
	const refused: string[] = [];
	for (const e of manifest.entries) {
		if (e.baseline_state === "unchanged") continue;
		const inScope = allowed.some((a) => e.path.startsWith(a));
		if (!inScope) {
			out.push(e.path);
			continue;
		}
		if (e.baseline_state === "deleted" || e.kind !== "file" || !e.content_digest) {
			refused.push(`${e.path} (${e.baseline_state})`);
			continue;
		}
		files.push({ path: e.path, digest: e.content_digest, size_bytes: e.size });
		if (e.baseline_state !== "added") modifiedExisting.push(e.path);
	}
	return { files, modified_existing: modifiedExisting, out_of_scope: out, refused };
}

/**
 * Level 1 of the PRE-01 scale: the files of the reference under `testPaths` that its technology names as tests,
 * which says nothing about them ever running.
 */
export function referenceTestFiles(
	reference: ReferenceSnapshot,
	testPaths: string[],
	isTestFile: (path: string) => boolean,
): string[] {
	return reference.entries
		.filter((e) => e.kind === "file" && testPaths.some((d) => e.path.startsWith(d)) && isTestFile(e.path))
		.map((e) => e.path);
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
	/**
	 * The characterizations an earlier preparation for these requirements saw contradicted on the
	 * reference: a later preparation that drops the case, or rewrites it to pass, does not give the
	 * declaration back its weight.
	 */
	refuted?: readonly RequirementOracle[];
}

/** Some requirement the reference lacks is proved by a case of its own failing there by assertion. */
export function provesNewBehaviour(oracles: readonly RequirementOracle[]): boolean {
	return oracles.some((o) => o.category === "new_behaviour" && o.qualification === "proved");
}

/**
 * PRE-01 — what the controls already on the target can decide, on the four-level scale, and which
 * mandatory requirements they leave undecided.
 *
 * The scale is not cosmetic: every control the protocol may freeze is green on the reference, since
 * G2 refuses it unless its positive witness passes there. Such a control answers the same whether a
 * behaviour the reference does not have appears or not, so it can never decide a requirement asking
 * for that behaviour — only a case of its own that fails on the reference can. A requirement the
 * reference already honours is the opposite case: a characterization of its own that passes there
 * decides it, and without one, non-regression does, provided the existing suite actually executes
 * something, which is what levels 2 and 3 measure. A characterization that fails on the reference
 * refutes the declaration, which then decides nothing.
 */
export function diagnoseControlCapability(input: CapabilityInput): ControlCapabilityDiagnosis {
	const discovered = input.suite ? Math.max(0, input.suite.reported - input.suite.witnesses) : null;
	const executed = discovered === null || input.suite === null ? null : Math.max(0, discovered - input.suite.skipped);
	const oracles = input.prepared?.requirements ?? null;
	const discriminant = provesNewBehaviour(oracles ?? []);
	const level: CapabilityLevel = discriminant
		? "discriminating"
		: (executed ?? 0) > 0
			? "executed"
			: (discovered ?? 0) > 0
				? "discoverable"
				: input.test_files.length > 0
					? "file_present"
					: "none";
	const notes: string[] = [];
	if (input.test_files.length === 0) notes.push(`no test file under the test roots of this ${input.stack} target`);
	if (input.test_files.length > 0 && discovered === 0)
		notes.push(
			`${input.test_files.length} test file(s) are present but the target's own test command reports no case of its own: ${input.test_files.slice(0, 5).join(", ")}`,
		);
	if ((discovered ?? 0) > 0 && executed === 0)
		notes.push(`${discovered} case(s) are discovered and every one is skipped: the suite executes nothing`);
	if (input.prepared && oracles === null)
		notes.push(
			`preparation ${input.prepared.preparation_id} was recorded before observations were kept per requirement: it proves no requirement`,
		);
	if (discriminant) notes.push(`prepared suite adopted: ${input.prepared!.files.length} file(s)`);
	const undecided = undecidedRequirements(input.requirements, oracles ?? [], input.refuted ?? [], executed);
	return {
		stack: input.stack,
		level,
		test_files: input.test_files.length,
		discovered,
		executed,
		undiscriminated_requirements: undecided.undiscriminated,
		unobserved_requirements: undecided.unobserved,
		notes: [...notes, ...undecided.notes],
		...(oracles ? { oracles } : {}),
	};
}

/**
 * The mandatory requirements no control decides, and why. Its own proved oracle decides a requirement,
 * unless a preparation for these requirements saw its characterization contradicted, which leaves it
 * without one however a later preparation rewrites the case; so does a failed oracle.
 * Otherwise a requirement the reference lacks has nothing to detect its absence, and one the reference
 * honours rests on non-regression, unobserved until the suite has run and undecided when it executes
 * nothing.
 */
function undecidedRequirements(
	requirements: CapabilityInput["requirements"],
	oracles: readonly RequirementOracle[],
	refuted: readonly RequirementOracle[],
	executed: number | null,
): { undiscriminated: string[]; unobserved: string[]; notes: string[] } {
	const oracleOf = new Map(oracles.map((o) => [o.requirement_id, o] as const));
	const refutedOf = new Map(refuted.map((o) => [o.requirement_id, o] as const));
	const undiscriminated: string[] = [];
	const unobserved: string[] = [];
	const notes: string[] = [];
	for (const r of requirements) {
		if (!r.mandatory) continue;
		const oracle = oracleOf.get(r.requirement_id);
		const failed = failedOracles(oracle, refutedOf.get(r.requirement_id));
		if (failed.length > 0) {
			undiscriminated.push(r.requirement_id);
			notes.push(...failed.map(oracleNote));
			continue;
		}
		if (oracle?.qualification === "proved") continue;
		if (!r.satisfied_by_reference) {
			undiscriminated.push(r.requirement_id);
			notes.push(
				`${r.requirement_id} asks for behaviour the reference does not have: no control that passes on the reference can detect its absence`,
			);
			continue;
		}
		if (executed === null) unobserved.push(r.requirement_id);
		else if (executed === 0) {
			undiscriminated.push(r.requirement_id);
			notes.push(`${r.requirement_id} is proved by non-regression, and the reference executes no test of its own`);
		}
	}
	return { undiscriminated, unobserved, notes };
}

/**
 * The observations that leave a requirement without an oracle of its own: its latest oracle when that
 * one found a case and failed, and the contradiction an earlier preparation saw, which no later oracle
 * erases nor stands in for unless it is a contradiction itself.
 */
function failedOracles(
	oracle: RequirementOracle | undefined,
	refutation: RequirementOracle | undefined,
): RequirementOracle[] {
	const latest = oracle && oracle.qualification !== "no_case" && oracle.qualification !== "proved" ? oracle : undefined;
	if (!refutation || latest?.qualification === "contradicted") return latest ? [latest] : [];
	return latest ? [latest, refutation] : [refutation];
}

/** Why the cases bound to a requirement prove nothing about it, naming them. */
export function oracleNote(oracle: RequirementOracle): string {
	const cases = oracle.cases.map((c) => `"${c.name}" ${c.outcome.replace("_", " ")}`).join(", ");
	switch (oracle.qualification) {
		case "contradicted":
			return oracle.category === "characterization"
				? `${oracle.requirement_id} is declared satisfied by the reference, and its characterization contradicts it there: ${cases}`
				: `${oracle.requirement_id} asks for behaviour the reference does not have, and its cases pass there: ${cases}`;
		case "incident":
			return `${oracle.requirement_id}: its cases fail on the reference without an assertion, which proves nothing about it: ${cases}`;
		case "unlocatable":
			return `${oracle.requirement_id}: the reader of ${oracle.control_id} names no case, so no case of its own can be told apart from the global count`;
		default:
			return `${oracle.requirement_id}: no case of its own was observed`;
	}
}

/**
 * Whether a case names the requirement: its id as a whole word of the case name, whatever its case. A
 * case is bound by what it says it verifies, never by the file it sits in or by the count it adds to.
 * A hyphen of the id may be written as an underscore, since a Java method name cannot carry one and
 * Surefire reports the method name alone.
 */
function namesRequirement(caseName: string, requirementId: string): boolean {
	const id = requirementId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("-", "[-_]");
	return new RegExp(`(^|[^A-Za-z0-9])${id}($|[^A-Za-z0-9])`, "i").test(caseName);
}

/**
 * What the cases of one requirement prove on the reference. A requirement the reference lacks is
 * proved by a case that fails there by assertion, provided none of its cases fails otherwise; one the
 * reference is declared to honour is proved when every case of it passes there, and contradicted by a
 * case that fails by assertion.
 */
function qualificationOf(category: RequirementOracle["category"], cases: readonly ObservedCase[]): OracleQualification {
	if (cases.length === 0) return "no_case";
	const failedOtherwise = cases.some((c) => c.outcome === "failed_otherwise");
	const failedAssertion = cases.some((c) => c.outcome === "failed_assertion");
	if (category === "characterization")
		return failedAssertion ? "contradicted" : failedOtherwise ? "incident" : "proved";
	return failedOtherwise ? "incident" : failedAssertion ? "proved" : "contradicted";
}

/**
 * The oracle of each requirement, from the cases `controlId` reported on the reference. A reader that
 * names no case (`cases` null) leaves every requirement unlocatable rather than covered by a count.
 */
export function requirementOracles(
	requirements: readonly { requirement_id: string; satisfied_by_reference: boolean }[],
	controlId: string,
	cases: readonly ObservedCase[] | null,
): RequirementOracle[] {
	return requirements.map((r) => {
		const category = r.satisfied_by_reference ? "characterization" : "new_behaviour";
		const own = (cases ?? []).filter((c) => namesRequirement(c.name, r.requirement_id));
		return {
			requirement_id: r.requirement_id,
			category,
			control_id: controlId,
			expected: r.satisfied_by_reference ? "passed" : "failed_assertion",
			cases: own,
			qualification: cases === null ? "unlocatable" : qualificationOf(category, own),
		};
	});
}

export function samePreparationPaths(left: string[], right: string[]): boolean {
	const normal = (paths: string[]) => [...new Set(paths)].sort();
	return JSON.stringify(normal(left)) === JSON.stringify(normal(right));
}
