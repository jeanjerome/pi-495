/**
 * Qualification of a control (CMP-VER, §11.3, VER-05): a positive witness must PASS, a negative
 * witness must FAIL and a broken runner must give INDETERMINATE. Only then may the control
 * contribute to G2.
 */
import { digestValue } from "../contracts/digest.ts";
import type { ControlDefinition, Protocol, Qualification } from "../contracts/v1/protocol.ts";
import type { EvidenceCandidate } from "../contracts/v1/evidence.ts";
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

export interface DetailedQualification {
	qualification: Qualification;
	evidence: { positive: EvidenceCandidate; negative: EvidenceCandidate; incident: EvidenceCandidate };
}

function technicalDetail(evidence: EvidenceCandidate): string {
	const details = [...evidence.limits.notes, ...evidence.findings.slice(0, 3).map((finding) => finding.message)];
	if (details.length > 0) return details.join("; ");
	const facts = Object.entries(evidence.facts).filter(([, value]) => value !== null && value !== undefined).slice(0, 6).map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
	return facts.join(", ");
}

/**
 * Qualifies one control. `prerequisites` are the controls that write the reports it reads, in the
 * order they run in: a sensor that measures nothing of its own is asked nothing meaningful in a
 * workspace where they have not run, and a witness workspace is a fresh copy of the reference. What
 * they answer there is not the question — only their effect on the tree is (VER-05, QLT-04).
 */
export async function qualifyControlDetailed(runner: ControlExecutionPort, control: ControlDefinition, fixtures: QualificationFixtures, base: Omit<ControlInvocation, "control" | "workspace_path">, prerequisites: readonly ControlDefinition[] = []): Promise<DetailedQualification> {
	const run = async (path: string, c: ControlDefinition, files: Record<string, string>) => (await runner.runControl({ ...base, control: c, workspace_path: path, introduced_lines: introducedByAddedFiles(files) })).evidence;
	const produce = async (path: string, files: Record<string, string>) => { for (const producer of prerequisites) await run(path, producer, files); };
	await produce(fixtures.positive_path, fixtures.positive_files ?? {});
	const positiveEvidence = await run(fixtures.positive_path, control, fixtures.positive_files ?? {});
	await produce(fixtures.negative_path, fixtures.negative_files ?? {});
	const negativeEvidence = await run(fixtures.negative_path, control, fixtures.negative_files ?? {});
	const incidentEvidence = await run(fixtures.positive_path, { ...control, command: ["/nonexistent/495-broken-runner", ...control.command.slice(1)] }, fixtures.positive_files ?? {});
	const positive = positiveEvidence.verdict;
	const negative = negativeEvidence.verdict;
	const incident = incidentEvidence.verdict;
	const positiveDetail = technicalDetail(positiveEvidence);
	const negativeDetail = technicalDetail(negativeEvidence);
	const incidentDetail = technicalDetail(incidentEvidence);
	const notes: string[] = [];
	if (positive !== "PASS") notes.push(`positive witness gave ${positive}${positiveDetail ? `: ${positiveDetail}` : ""}`);
	if (negative !== "FAIL") notes.push(`negative witness gave ${negative}: the control does not detect the defect it claims to cover${negativeDetail ? `; ${negativeDetail}` : ""}`);
	if (incident !== "INDETERMINATE") notes.push(`broken runner gave ${incident}${incidentDetail ? `: ${incidentDetail}` : ""}`);
	return {
		qualification: { positive, negative, incident, qualified: notes.length === 0, environment_digest: base.environment.digest, notes },
		evidence: { positive: positiveEvidence, negative: negativeEvidence, incident: incidentEvidence },
	};
}

export async function qualifyControl(runner: ControlExecutionPort, control: ControlDefinition, fixtures: QualificationFixtures, base: Omit<ControlInvocation, "control" | "workspace_path">, prerequisites: readonly ControlDefinition[] = []): Promise<Qualification> {
	return (await qualifyControlDetailed(runner, control, fixtures, base, prerequisites)).qualification;
}

/**
 * What a qualification is about: the sensor. Two control definitions that run the same command the
 * same way observe the same thing, whatever paths they go on to protect — `protected_paths` is a G4
 * concern and never changes what the three witnesses would answer.
 */
export function sensorDigest(control: ControlDefinition): string {
	return digestValue({ command: control.command, cwd: control.cwd, env: control.env, env_allowlist: control.env_allowlist, network: control.network, parser: control.parser, report_path: control.report_path, requires: control.requires, timeout_ms: control.timeout_ms, version: control.version, writable_paths: control.writable_paths });
}

/**
 * An established qualification for this exact sensor in this exact environment, most recent first.
 * Re-entering G2 — after a preparation, or after an earlier round was refused — then costs nothing
 * instead of running the three witnesses again.
 */
export function reusableQualification(priorProtocols: readonly Protocol[], control: ControlDefinition, environmentDigest: string): Qualification | null {
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
