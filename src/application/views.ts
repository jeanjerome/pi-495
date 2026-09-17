import type { ChangeState } from "../domain/change/state.ts";
import type { ProgramState } from "../domain/program/program.ts";

/** Canonical status projection shared by every Pi entry (AT-07, UX-03). */
export interface StatusView {
	schema_version: 1;
	program: { program_id: string; title: string; project_path: string; increments: { increment_id: string; title: string; status: string }[] } | null;
	change: {
		change_id: string;
		increment_id: string;
		revision: number;
		phase: string;
		status: string;
		outcome: string;
		stop_reason: string | null;
		stop_detail: string | null;
		gates: { gate: string; verdict: string; reasons: string[]; next_action: string }[];
		attempts: { used: number; max: number };
		candidate: { candidate_id: string; manifest_digest: string } | null;
		evidence: { evidence_id: string; control_id: string; verdict: string; valid: boolean }[];
		pending_decisions: { decision_id: string; interaction: string }[];
		last_intervention: { role: string; result: string; tool_calls: number; duration_ms: number } | null;
		/** Interventions of the open attempt stopped by the duration budget and resumed since. */
		continuations: number;
		next_action: string;
		updated_at: string;
	} | null;
	limits: string[];
}

export function nextActionOf(s: ChangeState): string {
	if (s.phase === "closed") return s.outcome === "integrated" ? "done: integrated" : s.outcome === "accepted" ? "done: accepted (export available)" : `done: ${s.outcome}`;
	if (s.status === "decision_required") return `decide: ${s.pending_decisions.map((d) => d.interaction).join(", ")}`;
	if (s.status === "blocked") return `blocked: ${s.stop_reason ?? "unknown"} — ${s.stop_detail ?? ""}`;
	if (s.status === "paused") return "resume";
	if (s.status === "running") return "wait: intervention or verification running";
	switch (s.phase) {
		case "clarifying": return "clarify: specification intervention then G0";
		case "specifying": return "G1: adopt requirements";
		case "verification_design": return "G2: build and qualify the protocol";
		case "preparing": return "preparation: build the missing capability";
		case "designing": return "G3: adopt design";
		case "implementing": return "produce a candidate";
		case "verifying": return "run the frozen controls";
		case "reviewing": return "run required reviews";
		case "deciding": return "G5: evaluate acceptance";
		case "integrating": return "integrate locally (G6)";
		default: return "resume";
	}
}

export function statusView(program: ProgramState | null, change: ChangeState | null, limits: string[] = []): StatusView {
	const last = change?.interventions[change.interventions.length - 1] ?? null;
	return {
		schema_version: 1,
		program: program ? { program_id: program.program_id, title: program.title, project_path: program.project_path, increments: program.increments.map((i) => ({ increment_id: i.increment_id, title: i.title, status: i.status })) } : null,
		change: change
			? {
					change_id: change.change_id,
					increment_id: change.increment_id,
					revision: change.revision,
					phase: change.phase,
					status: change.status,
					outcome: change.outcome,
					stop_reason: change.stop_reason,
					stop_detail: change.stop_detail,
					gates: (["G0", "G1", "G2", "G3", "G4", "G5", "G6"] as const).filter((g) => change.gates[g]).map((g) => ({ gate: g, verdict: change.gates[g]!.verdict, reasons: change.gates[g]!.reasons, next_action: change.gates[g]!.next_action })),
					attempts: { used: change.budgets.attempts_used, max: change.budgets.max_attempts },
					candidate: change.candidate ? { candidate_id: change.candidate.candidate_id, manifest_digest: change.candidate.manifest_digest } : null,
					evidence: change.evidence.map((e) => ({ evidence_id: e.evidence_id, control_id: e.control_id, verdict: e.verdict, valid: e.valid })),
					pending_decisions: change.pending_decisions.map((d) => ({ decision_id: d.decision_id, interaction: d.interaction })),
					last_intervention: last ? { role: last.role, result: last.result, tool_calls: last.counters.tool_calls, duration_ms: last.counters.duration_ms } : null,
					continuations: last?.attempt_id ? change.interventions.filter((i) => i.attempt_id === last.attempt_id && i.result === "truncated").length : 0,
					next_action: nextActionOf(change),
					updated_at: change.updated_at,
				}
			: null,
		limits,
	};
}
