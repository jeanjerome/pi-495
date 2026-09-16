/**
 * Qualification of a control (§11.3, VER-05): a positive witness must PASS, a negative witness
 * must FAIL and a broken runner must give INDETERMINATE. Only then may the control contribute to G2.
 */
import type { ControlDefinition, Qualification } from "../contracts/v1/protocol.ts";
import type { ControlExecutionPort, ControlInvocation } from "../ports/execution.ts";

export interface QualificationFixtures {
	/** Workspace where the property holds. */
	positive_path: string;
	/** Workspace where the targeted defect is present. */
	negative_path: string;
}

export async function qualifyControl(runner: ControlExecutionPort, control: ControlDefinition, fixtures: QualificationFixtures, base: Omit<ControlInvocation, "control" | "workspace_path">): Promise<Qualification> {
	const run = async (path: string, c: ControlDefinition) => (await runner.runControl({ ...base, control: c, workspace_path: path })).evidence.verdict;
	const positive = await run(fixtures.positive_path, control);
	const negative = await run(fixtures.negative_path, control);
	const incident = await run(fixtures.positive_path, { ...control, command: ["/nonexistent/495-broken-runner", ...control.command.slice(1)] });
	const notes: string[] = [];
	if (positive !== "PASS") notes.push(`positive witness gave ${positive}`);
	if (negative !== "FAIL") notes.push(`negative witness gave ${negative}: the control does not detect the defect it claims to cover`);
	if (incident !== "INDETERMINATE") notes.push(`broken runner gave ${incident}`);
	return { positive, negative, incident, qualified: notes.length === 0, environment_digest: base.environment.digest, notes };
}
