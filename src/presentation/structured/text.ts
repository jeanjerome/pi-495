import type { DecisionRequest } from "../../contracts/v1/decision.ts";
import type { EngineeringReport } from "../../application/report.ts";
import type { StatusView } from "../../application/views.ts";

const L = {
	fr: {
		program: "Programme",
		change: "Changement",
		phase: "Phase",
		status: "Statut",
		outcome: "Résultat",
		gates: "Gates",
		attempts: "Tentatives",
		candidate: "Candidat",
		evidence: "Preuves",
		pending: "Décisions en attente",
		next: "Prochaine action",
		none: "aucun",
		limits: "Limites",
		stop: "Motif d'arrêt",
		intervention: "Dernière intervention",
		truncated: "interrompue par le budget de durée",
		continuations: "reprises",
	},
	en: {
		program: "Program",
		change: "Change",
		phase: "Phase",
		status: "Status",
		outcome: "Outcome",
		gates: "Gates",
		attempts: "Attempts",
		candidate: "Candidate",
		evidence: "Evidence",
		pending: "Pending decisions",
		next: "Next action",
		none: "none",
		limits: "Limits",
		stop: "Stop reason",
		intervention: "Last intervention",
		truncated: "stopped by the duration budget",
		continuations: "resumptions",
	},
};

/** Plain-text status shared by print mode, notifications and the conversational tool (UX-03). */
export function formatStatus(view: StatusView, lang: "fr" | "en" = "fr"): string {
	const t = L[lang];
	const lines: string[] = [];
	if (view.program)
		lines.push(`${t.program}: ${view.program.title} (${view.program.program_id}) — ${view.program.project_path}`);
	const c = view.change;
	if (!c) {
		lines.push(`${t.change}: ${t.none}`);
		for (const l of view.limits) lines.push(`${t.limits}: ${l}`);
		return lines.join("\n");
	}
	lines.push(`${t.change}: ${c.change_id} r${c.revision} (${c.increment_id})`);
	lines.push(`${t.phase}: ${c.phase}   ${t.status}: ${c.status}   ${t.outcome}: ${c.outcome}`);
	if (c.stop_reason) lines.push(`${t.stop}: ${c.stop_reason}${c.stop_detail ? ` — ${c.stop_detail}` : ""}`);
	lines.push(`${t.gates}: ${c.gates.length ? c.gates.map((g) => `${g.gate}=${g.verdict}`).join(" ") : t.none}`);
	for (const g of c.gates)
		if (g.verdict !== "PASS") for (const r of g.reasons.slice(0, 6)) lines.push(`  ${g.gate}: ${r}`);
	lines.push(`${t.attempts}: ${c.attempts.used}/${c.attempts.max}`);
	// A session cut short is not a proposal: saying so is what tells a slow model from a stuck one.
	if (c.last_intervention) {
		const cut = c.last_intervention.result === "truncated" ? ` — ${t.truncated}` : "";
		const resumed = c.continuations > 0 ? `, ${c.continuations} ${t.continuations}` : "";
		lines.push(
			`${t.intervention}: ${c.last_intervention.role}=${c.last_intervention.result}${cut}${resumed} (${Math.round(c.last_intervention.duration_ms / 1000)}s, ${c.last_intervention.tool_calls} tool calls)`,
		);
	}
	if (c.candidate)
		lines.push(`${t.candidate}: ${c.candidate.candidate_id} ${c.candidate.manifest_digest.slice(0, 23)}`);
	if (c.evidence.length)
		lines.push(
			`${t.evidence}: ${c.evidence.map((e) => `${e.control_id}=${e.verdict}${e.valid ? "" : "(invalid)"}`).join(" ")}`,
		);
	if (c.pending_decisions.length)
		lines.push(`${t.pending}: ${c.pending_decisions.map((d) => `${d.interaction} ${d.decision_id}`).join(", ")}`);
	lines.push(`${t.next}: ${c.next_action}`);
	for (const l of view.limits) lines.push(`${t.limits}: ${l}`);
	return lines.join("\n");
}

export function formatDecision(req: DecisionRequest): string {
	const lines = [
		`[${req.interaction}] ${req.decision_id} — ${req.subject.kind} ${req.subject.id} r${req.subject.revision}`,
		req.question,
	];
	for (const f of req.facts.slice(0, 10)) lines.push(`  • ${f}`);
	if (req.recommendation)
		lines.push(`  (${req.language === "fr" ? "recommandation" : "recommendation"}: ${req.recommendation})`);
	for (const o of req.options) lines.push(`  - ${o.id}: ${o.label}${o.risky ? " ⚠" : ""} — ${o.effect}`);
	lines.push(
		req.language === "fr"
			? `  autorité requise: ${req.required_authority}`
			: `  required authority: ${req.required_authority}`,
	);
	return lines.join("\n");
}

const R = {
	fr: {
		title: "Rapport",
		observations: "Observations mécaniques",
		judgments: "Jugements",
		risks: "Risques résiduels",
		none: "aucun",
		outcome: "Résultat",
		candidate: "Candidat",
		authority: { kernel: "noyau", model: "modèle", human: "humain" },
	},
	en: {
		title: "Report",
		observations: "Mechanical observations",
		judgments: "Judgments",
		risks: "Residual risks",
		none: "none",
		outcome: "Outcome",
		candidate: "Candidate",
		authority: { kernel: "kernel", model: "model", human: "human" },
	},
};

/**
 * The three natures in three sections, in this order and never merged: what was measured, what was
 * concluded from it, and what remains unestablished (IMP-05).
 */
export function formatReport(report: EngineeringReport, lang: "fr" | "en" = "fr"): string {
	const t = R[lang];
	const lines = [`${t.title} ${report.change_id} — ${t.outcome}: ${report.outcome}`];
	if (report.candidate)
		lines.push(`${t.candidate}: ${report.candidate.candidate_id} ${report.candidate.manifest_digest.slice(0, 23)}`);
	lines.push("", `## ${t.observations}`);
	if (report.observations.length === 0) lines.push(`  ${t.none}`);
	for (const o of report.observations)
		lines.push(
			`  ${o.control_id} v${o.control_version} ${o.subject_kind} ${o.subject_digest.slice(0, 19)} → ${o.verdict}${o.blocking_findings ? ` (${o.blocking_findings})` : ""}${o.valid ? "" : " (invalid)"}`,
		);
	lines.push("", `## ${t.judgments}`);
	if (report.judgments.length === 0) lines.push(`  ${t.none}`);
	for (const j of report.judgments)
		lines.push(`  [${t.authority[j.authority]}] ${j.by}: ${j.statement}${j.binding ? "" : " (—)"}`);
	lines.push("", `## ${t.risks}`);
	if (report.residual_risks.length === 0) lines.push(`  ${t.none}`);
	for (const r of report.residual_risks) lines.push(`  ${r.code}: ${r.statement}`);
	return lines.join("\n");
}
