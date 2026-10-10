/**
 * Whether a contestation of a frozen case can be examined. The producer says a case of the frozen
 * protocol contradicts what the change adopted; the kernel keeps that signal only when it names every
 * identity it rests on, when the case is one the frozen obligation binds to its requirement, and when the
 * kernel's own run of the frozen control shows the case failing on the frozen candidate. Admitted or not, a
 * contestation authorizes nothing: the protocol, its protected paths and every verdict stand until an
 * examination finds otherwise.
 */
import { ranUnderProtocol, type ChangeState, type ContestationFacts, type FrozenProtocol } from "./state.ts";

/** What keeps a contestation from being examined, each naming the identity at fault; empty when it can be. */
export function contestationIssues(state: ChangeState, f: ContestationFacts): string[] {
	const named: [string, string][] = [
		["contestation_id", f.contestation_id],
		["intervention_id", f.intervention_id],
		["requirement_id", f.requirement_id],
		["case_name", f.case_name],
		["protocol.protocol_id", f.protocol.protocol_id],
		["candidate_digest", f.candidate_digest],
		["observation", f.observation],
		["reproduction.control_id", f.reproduction.control_id],
		["reproduction.evidence_id", f.reproduction.evidence_id],
	];
	const empty = named.filter(([, value]) => value.trim() === "").map(([field]) => field);
	if (empty.length > 0) return [`it is incomplete: ${empty.join(", ")} empty`];
	const issues: string[] = [];
	if ((state.contestations ?? []).some((c) => c.contestation_id === f.contestation_id))
		issues.push(`contestation ${f.contestation_id} is already filed`);
	const producer = state.interventions.find((i) => i.intervention_id === f.intervention_id);
	if (producer?.role !== "implement") issues.push(`${f.intervention_id} is not a producer intervention of this change`);
	const protocol = state.protocol;
	if (!protocol) return [...issues, "no protocol is frozen"];
	if (protocol.ref.protocol_id !== f.protocol.protocol_id || protocol.ref.revision !== f.protocol.revision)
		issues.push(
			`it contests protocol ${f.protocol.protocol_id} r${f.protocol.revision}, the frozen protocol is ${protocol.ref.protocol_id} r${protocol.ref.revision}`,
		);
	if (state.candidate?.manifest_digest !== f.candidate_digest)
		issues.push(`it contests candidate ${f.candidate_digest}, which is not the frozen candidate`);
	issues.push(...obligationIssues(protocol, f));
	if (!reproduces(state, f))
		issues.push(
			`evidence ${f.reproduction.evidence_id} does not show case "${f.case_name}" failing in ${f.reproduction.control_id} on the frozen candidate`,
		);
	return issues;
}

/** What keeps the contested case and its control from being those the frozen obligation of its requirement binds. */
function obligationIssues(protocol: FrozenProtocol, f: ContestationFacts): string[] {
	const obligation = protocol.obligations.find((o) => o.requirement.requirement_id === f.requirement_id);
	if (!obligation) return [`requirement ${f.requirement_id} is no obligation of the frozen protocol`];
	const issues: string[] = [];
	if (!obligation.control_ids.includes(f.reproduction.control_id))
		issues.push(`control ${f.reproduction.control_id} does not judge requirement ${f.requirement_id}`);
	// An obligation no preparation proved binds no case to hold the contested one against.
	if (obligation.oracle && !obligation.oracle.cases.includes(f.case_name))
		issues.push(`case "${f.case_name}" is none of the frozen cases of ${f.requirement_id}`);
	return issues;
}

/** Whether the cited run is the kernel's run of the named control on the contested candidate, failing on the case. */
function reproduces(state: ChangeState, f: ContestationFacts): boolean {
	const run = state.evidence.find((e) => e.evidence_id === f.reproduction.evidence_id);
	return (
		run?.valid === true &&
		run.control_id === f.reproduction.control_id &&
		run.subject_digest === f.candidate_digest &&
		ranUnderProtocol(run, f.protocol) &&
		run.verdict === "FAIL" &&
		!(run.passed_cases ?? []).includes(f.case_name)
	);
}
