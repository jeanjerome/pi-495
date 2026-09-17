/**
 * Qualification of a control (§11.3, VER-05): a positive witness must PASS, a negative witness
 * must FAIL and a broken runner must give INDETERMINATE. Only then may the control contribute to G2.
 */
import type { ControlDefinition, Qualification } from "../contracts/v1/protocol.ts";
import type { EvidenceCandidate } from "../contracts/v1/evidence.ts";
import type { ControlExecutionPort, ControlInvocation } from "../ports/execution.ts";

export interface QualificationFixtures {
	/** Workspace where the property holds. */
	positive_path: string;
	/** Workspace where the targeted defect is present. */
	negative_path: string;
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

export async function qualifyControlDetailed(runner: ControlExecutionPort, control: ControlDefinition, fixtures: QualificationFixtures, base: Omit<ControlInvocation, "control" | "workspace_path">): Promise<DetailedQualification> {
	const run = async (path: string, c: ControlDefinition) => (await runner.runControl({ ...base, control: c, workspace_path: path })).evidence;
	const positiveEvidence = await run(fixtures.positive_path, control);
	const negativeEvidence = await run(fixtures.negative_path, control);
	const incidentEvidence = await run(fixtures.positive_path, { ...control, command: ["/nonexistent/495-broken-runner", ...control.command.slice(1)] });
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

export async function qualifyControl(runner: ControlExecutionPort, control: ControlDefinition, fixtures: QualificationFixtures, base: Omit<ControlInvocation, "control" | "workspace_path">): Promise<Qualification> {
	return (await qualifyControlDetailed(runner, control, fixtures, base)).qualification;
}
