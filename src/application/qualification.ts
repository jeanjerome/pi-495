/**
 * Qualification of a control (CMP-VER, §11.3, VER-05): a positive witness must PASS, a negative
 * witness must FAIL and a broken runner must give INDETERMINATE. Only then may the control
 * contribute to G2.
 */
import { digestValue } from "../contracts/digest.ts";
import type { Verdict } from "../contracts/v1/common.ts";
import type { ControlDefinition, Protocol, Qualification } from "../contracts/v1/protocol.ts";
import type { EvidenceCandidate } from "../contracts/v1/evidence.ts";
import { readerOf } from "../domain/survey.ts";
import type { ControlExecutionPort, ControlInvocation } from "../ports/execution.ts";
import { introducedByAddedFiles } from "./coverage.ts";

export interface QualificationFixtures {
	/** Workspace where the property holds. */
	positive_path: string;
	/** Workspace where the targeted defect is present. */
	negative_path: string;
	/**
	 * Files each witness workspace writes on top of the reference. A differential control judges what
	 * a subject introduces, so its witnesses are read the same way: the witness files are the
	 * introduced ones, and the reference around them is not the control's business.
	 */
	positive_files?: Record<string, string>;
	negative_files?: Record<string, string>;
}

/** The witnesses a detection offers its controls, as the qualification writes them on the reference. */
export interface ControlWitnesses {
	/** Files written on the reference so that the property every control claims holds. */
	positive: Record<string, string>;
	/** Files written on top of those so that the targeted defect is present. */
	negative: Record<string, string>;
	/** Per control, the defect only that one detects, when the shared one proves nothing for it. */
	own_negative: Record<string, Record<string, string>>;
	/** The controls whose positive witness is the reference alone, the shared one carrying what they detect. */
	reference_positive?: readonly string[];
}

/**
 * The files the witnesses of the control `controlId` are judged by: the shared positive witness, or none when
 * the reference alone is its positive witness, and the negative files, its own on top of the positive ones when
 * it has its own. The negative files are those written into its negative copy.
 */
export function witnessFilesOf(
	witnesses: ControlWitnesses,
	controlId: string,
): { positive: Record<string, string>; negative: Record<string, string>; own: boolean } {
	const own = witnesses.own_negative[controlId];
	const positive = witnesses.reference_positive?.includes(controlId) ? {} : witnesses.positive;
	if (own === undefined) return { positive, negative: { ...witnesses.positive, ...witnesses.negative }, own: false };
	return { positive, negative: { ...positive, ...own }, own: true };
}

export interface DetailedQualification {
	qualification: Qualification;
	evidence: { positive: EvidenceCandidate; negative: EvidenceCandidate; incident: EvidenceCandidate };
}

function technicalDetail(evidence: EvidenceCandidate): string {
	const details = [...evidence.limits.notes, ...evidence.findings.slice(0, 3).map((finding) => finding.message)];
	if (details.length > 0) return details.join("; ");
	const facts = Object.entries(evidence.facts)
		.filter(([, value]) => value !== null && value !== undefined)
		.slice(0, 6)
		.map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
	return facts.join(", ");
}

/**
 * What the witnesses' own cases gave, read off a parser that names its passing cases and locates its
 * failures, or null when it does not, or when a witness wrote no file its case could be read in. The
 * positive witness's case passed when a passing case is one a file the positive witness wrote
 * declares, by its name, and no failure is located in such a file: a passing case of the project
 * does not stand for it. The negative witness's case failed when a failure is located in a file only
 * the negative witness wrote.
 */
function witnessCases(
	positive: EvidenceCandidate,
	negative: EvidenceCandidate,
	fixtures: QualificationFixtures,
): { positive: Verdict; negative: Verdict } | null {
	if (typeof positive.facts.pass !== "number" || typeof negative.facts.pass !== "number") return null;
	const positiveFiles = new Set(Object.keys(fixtures.positive_files ?? {}));
	const negativeOnly = new Set(Object.keys(fixtures.negative_files ?? {}).filter((path) => !positiveFiles.has(path)));
	if (positiveFiles.size === 0 || negativeOnly.size === 0) return null;
	const inFiles = (evidence: EvidenceCandidate, files: Set<string>) =>
		evidence.findings.some((f) => f.path !== null && files.has(f.path));
	const witnessTexts = Object.values(fixtures.positive_files ?? {});
	const passingCases = positive.facts.passing_cases;
	const witnessPassed =
		Array.isArray(passingCases) &&
		passingCases.some((name) => witnessTexts.some((text) => text.includes(JSON.stringify(name))));
	const reports = (evidence: EvidenceCandidate) => evidence.verdict === "PASS" || evidence.verdict === "FAIL";
	return {
		positive: reports(positive) && witnessPassed && !inFiles(positive, positiveFiles) ? "PASS" : positive.verdict,
		negative: !reports(negative)
			? negative.verdict
			: inFiles(negative, negativeOnly) && !inFiles(negative, positiveFiles)
				? "FAIL"
				: "PASS",
	};
}

/**
 * What the witnesses gave, read off a sensor that judges the whole tree and locates what it finds, or
 * null for any other sensor. The positive witness passed when the run concluded and nothing it found
 * sits in a file the positive witness wrote; the negative witness failed when something it found sits
 * in a file the negative witness wrote. A defect the project already carries is in neither, so it
 * neither disqualifies the sensor nor stands for the defect it must detect.
 */
function witnessFindings(
	runner: ControlExecutionPort,
	control: ControlDefinition,
	positive: EvidenceCandidate,
	negative: EvidenceCandidate,
	fixtures: QualificationFixtures,
): { positive: Verdict; negative: Verdict } | null {
	if (!readerOf(runner.readers, control.parser)?.located) return null;
	const positiveFiles = new Set(Object.keys(fixtures.positive_files ?? {}));
	const negativeFiles = new Set(Object.keys(fixtures.negative_files ?? {}));
	const inFiles = (evidence: EvidenceCandidate, files: Set<string>) =>
		evidence.findings.some((f) => f.path !== null && files.has(f.path));
	const concluded = (evidence: EvidenceCandidate) => evidence.verdict === "PASS" || evidence.verdict === "FAIL";
	return {
		positive: !concluded(positive) ? positive.verdict : inFiles(positive, positiveFiles) ? "FAIL" : "PASS",
		negative: !concluded(negative) ? negative.verdict : inFiles(negative, negativeFiles) ? "FAIL" : "PASS",
	};
}

/**
 * Qualifies one control. `prerequisites` are the controls that write the reports it reads, in the
 * order they run in: a sensor that measures nothing of its own is asked nothing meaningful in a
 * workspace where they have not run, and a witness workspace is a fresh copy of the reference. What
 * they answer there is not the question — only their effect on the tree is (VER-05, QLT-04).
 */
export async function qualifyControlDetailed(
	runner: ControlExecutionPort,
	control: ControlDefinition,
	fixtures: QualificationFixtures,
	base: Omit<ControlInvocation, "control" | "workspace_path">,
	prerequisites: readonly ControlDefinition[] = [],
): Promise<DetailedQualification> {
	const run = async (path: string, c: ControlDefinition, files: Record<string, string>) =>
		(
			await runner.runControl({
				...base,
				control: c,
				workspace_path: path,
				introduced_lines: introducedByAddedFiles(files),
			})
		).evidence;
	const produce = async (path: string, files: Record<string, string>) => {
		for (const producer of prerequisites) await run(path, producer, files);
	};
	await produce(fixtures.positive_path, fixtures.positive_files ?? {});
	const positiveEvidence = await run(fixtures.positive_path, control, fixtures.positive_files ?? {});
	await produce(fixtures.negative_path, fixtures.negative_files ?? {});
	const negativeEvidence = await run(fixtures.negative_path, control, fixtures.negative_files ?? {});
	const incidentEvidence = await run(
		fixtures.positive_path,
		{ ...control, command: ["/nonexistent/495-broken-runner", ...control.command.slice(1)] },
		fixtures.positive_files ?? {},
	);
	// The witnesses are judged by their own cases rather than by the run's verdict, wherever the parser
	// reports cases: a test of the project that fails in every copy of the reference then does not hide
	// whether the sensor tells a passing case from a failing one.
	const cases =
		witnessFindings(runner, control, positiveEvidence, negativeEvidence, fixtures) ??
		witnessCases(positiveEvidence, negativeEvidence, fixtures);
	const positive = cases?.positive ?? positiveEvidence.verdict;
	const negative = cases?.negative ?? negativeEvidence.verdict;
	const incident = incidentEvidence.verdict;
	const positiveDetail = technicalDetail(positiveEvidence);
	const negativeDetail = technicalDetail(negativeEvidence);
	const incidentDetail = technicalDetail(incidentEvidence);
	const notes: string[] = [];
	if (positive !== "PASS")
		notes.push(`positive witness gave ${positive}${positiveDetail ? `: ${positiveDetail}` : ""}`);
	if (negative !== "FAIL")
		notes.push(
			`negative witness gave ${negative}: the control does not detect the defect it claims to cover${negativeDetail ? `; ${negativeDetail}` : ""}`,
		);
	if (incident !== "INDETERMINATE")
		notes.push(`broken runner gave ${incident}${incidentDetail ? `: ${incidentDetail}` : ""}`);
	return {
		qualification: {
			positive,
			negative,
			incident,
			qualified: notes.length === 0,
			environment_digest: base.environment.digest,
			notes,
		},
		evidence: { positive: positiveEvidence, negative: negativeEvidence, incident: incidentEvidence },
	};
}

export async function qualifyControl(
	runner: ControlExecutionPort,
	control: ControlDefinition,
	fixtures: QualificationFixtures,
	base: Omit<ControlInvocation, "control" | "workspace_path">,
	prerequisites: readonly ControlDefinition[] = [],
): Promise<Qualification> {
	return (await qualifyControlDetailed(runner, control, fixtures, base, prerequisites)).qualification;
}

/**
 * What a qualification is about: the sensor. Two control definitions that run the same command the
 * same way observe the same thing, whatever paths they go on to protect — `protected_paths` is a G4
 * concern and never changes what the three witnesses would answer.
 */
export function sensorDigest(control: ControlDefinition): string {
	return digestValue({
		command: control.command,
		cwd: control.cwd,
		env: control.env,
		env_allowlist: control.env_allowlist,
		network: control.network,
		parser: control.parser,
		report_path: control.report_path,
		requires: control.requires,
		timeout_ms: control.timeout_ms,
		version: control.version,
		writable_paths: control.writable_paths,
	});
}

/**
 * An established qualification for this exact sensor in this exact environment, most recent first.
 * Re-entering G2 — after a preparation, or after an earlier round was refused — then costs nothing
 * instead of running the three witnesses again.
 */
export function reusableQualification(
	priorProtocols: readonly Protocol[],
	control: ControlDefinition,
	environmentDigest: string,
): Qualification | null {
	const wanted = sensorDigest(control);
	for (let i = priorProtocols.length - 1; i >= 0; i--) {
		const prior = priorProtocols[i]!;
		const qualification = prior.qualifications[control.control_id];
		if (!qualification?.qualified) continue;
		if (qualification.environment_digest !== environmentDigest) continue;
		const priorControl = prior.controls.find((c) => c.control_id === control.control_id);
		if (!priorControl || sensorDigest(priorControl) !== wanted) continue;
		return structuredClone(qualification);
	}
	return null;
}
