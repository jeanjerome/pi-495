import type { DecisionRequest } from "../../contracts/v1/decision.ts";
import type { IncrementStatus, JudgedGap } from "../../domain/program/program.ts";
import type { CodeAuthorship } from "../../domain/survey.ts";
import type { EngineeringReport, SurveySection } from "../../application/report.ts";
import type { Consumption, StatusGap, StatusMeasure, StatusView } from "../../application/views.ts";
import type { AgentContext } from "../../ports/execution.ts";

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
		closed: "clos",
		increment: "Incrément",
		milestone: "Jalon",
		survey: "État des lieux",
		tree: "arbre",
		removes: "supprime",
		setAside: "Écarté",
		gap: (g: StatusGap) =>
			`${g.rule_id} dans ${g.module ?? "aucun module mesuré"}, ${g.authorship === "generated" ? "code généré" : "code propriétaire"}: ${g.violations} violation${g.violations === 1 ? "" : "s"} à l'état des lieux`,
		notEvaluated: "sans évaluation",
		remaining: "reste",
		indeterminate: "indéterminé",
		conform: "conforme au référentiel dans le périmètre contrôlé",
		exceptTolerated: ", sauf les écarts tolérés par une exception",
		measure: "Mesure",
		onIntegrated: "sur le projet intégré",
		judged: {
			removed: "supprimé",
			remaining: "reste",
			tolerated: "toléré",
			appeared: "apparu",
		} satisfies Record<Exclude<JudgedGap["outcome"], "set_aside">, string>,
		perimeter: "Périmètre contrôlé:",
		rule: "règle",
		modules: "modules mesurés",
		unmeasured: "hors de la mesure",
		outside: "hors du périmètre contrôlé",
		due: "échéance",
		exception: {
			current: "Exception en cours",
			expired: "Exception échue",
			withdrawn: "Exception retirée, son écart n'est plus mesuré",
			unjudged: "Exception",
		},
		increments: {
			planned: "planifié",
			ready: "prêt",
			active: "actif",
			accepted: "accepté",
			integrated: "intégré",
			blocked: "bloqué",
			abandoned: "abandonné",
		} satisfies Record<IncrementStatus, string>,
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
		closed: "closed",
		increment: "Increment",
		milestone: "Milestone",
		survey: "Survey",
		tree: "tree",
		removes: "removes",
		setAside: "Set aside",
		gap: (g: StatusGap) =>
			`${g.rule_id} in ${g.module ?? "no measured module"}, ${g.authorship} code: ${g.violations} violation${g.violations === 1 ? "" : "s"} at the survey`,
		notEvaluated: "not evaluated",
		remaining: "remaining",
		indeterminate: "indeterminate",
		conform: "conforms to the referential within the controlled perimeter",
		exceptTolerated: ", except the gaps an exception tolerates",
		measure: "Measure",
		onIntegrated: "on the integrated project",
		judged: {
			removed: "removed",
			remaining: "remaining",
			tolerated: "tolerated",
			appeared: "appeared",
		} satisfies Record<Exclude<JudgedGap["outcome"], "set_aside">, string>,
		perimeter: "Controlled perimeter:",
		rule: "rule",
		modules: "measured modules",
		unmeasured: "outside the measure",
		outside: "outside the controlled perimeter",
		due: "due",
		exception: {
			current: "Current exception",
			expired: "Expired exception",
			withdrawn: "Withdrawn exception, its gap is no longer measured",
			unjudged: "Exception",
		},
		increments: {
			planned: "planned",
			ready: "ready",
			active: "active",
			accepted: "accepted",
			integrated: "integrated",
			blocked: "blocked",
			abandoned: "abandoned",
		} satisfies Record<IncrementStatus, string>,
	},
};

/** Plain-text status shared by print mode, notifications and the conversational tool (UX-03). */
export function formatStatus(view: StatusView, lang: "fr" | "en" = "fr"): string {
	const t = L[lang];
	const lines: string[] = [];
	if (view.program) lines.push(...programLines(view.program, lang));
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

/**
 * The program and the survey it starts from, then each increment with its status and the gaps it
 * removes, then the gaps set aside with their reason, then each milestone with its verdict and what is
 * left, then each exception with its owner, due date, reason and standing.
 */
function programLines(program: NonNullable<StatusView["program"]>, lang: "fr" | "en"): string[] {
	const t = L[lang];
	const lines = [
		`${t.program}: ${program.title} (${program.program_id}) — ${program.project_path}${program.closed ? ` — ${t.closed}` : ""}`,
	];
	if (program.baseline)
		lines.push(
			`  ${t.survey}: ${program.baseline.change_id}, ${t.tree} ${program.baseline.reference_digest.slice(0, 23)}`,
		);
	for (const i of program.increments) {
		lines.push(`  ${t.increment} ${i.increment_id} (${i.title}): ${t.increments[i.status]}`);
		for (const g of i.gaps) lines.push(`    ${t.removes} ${t.gap(g)}`);
	}
	for (const g of program.set_aside) lines.push(`  ${t.setAside}: ${t.gap(g)} — ${g.reason}`);
	for (const m of program.milestones) {
		const e = m.evaluation;
		// Conformity is announced only for a milestone a survey of the integrated project passed.
		const tolerated = e?.measure?.gaps.some((g) => g.outcome === "tolerated") ? t.exceptTolerated : "";
		const conform = e?.verdict === "PASS" && e.measure ? [`${t.conform}${tolerated}`] : [];
		const left = e
			? [
					...(e.remaining.length ? [`${t.remaining}: ${e.remaining.join(", ")}`] : []),
					...(e.indeterminate.length ? [`${t.indeterminate}: ${e.indeterminate.join(", ")}`] : []),
				]
			: [];
		lines.push(
			`  ${t.milestone} ${m.milestone_id} (${m.title}): ${[e ? e.verdict : t.notEvaluated, ...conform, ...left].join(" — ")}`,
		);
		if (e?.measure) lines.push(...measureLines(e.measure, program.set_aside, lang));
	}
	for (const x of program.exceptions)
		lines.push(`  ${t.exception[x.standing ?? "unjudged"]}: ${t.gap(x)} — ${x.owner}, ${t.due} ${x.due} — ${x.reason}`);
	return lines;
}

/**
 * The survey a milestone was measured on and each gap it judged with its two counts, then, once the
 * milestone passed, the perimeter its analysers controlled and the gaps set aside out of it.
 */
function measureLines(
	measure: StatusMeasure,
	setAside: NonNullable<StatusView["program"]>["set_aside"],
	lang: "fr" | "en",
): string[] {
	const t = L[lang];
	const lines = [`    ${t.measure}: ${measure.change_id}`];
	for (const g of measure.gaps)
		if (g.outcome !== "set_aside")
			lines.push(
				`    ${t.judged[g.outcome]}: ${t.gap({ ...g, violations: g.surveyed })}, ${g.measured} ${t.onIntegrated}`,
			);
	const perimeter = measure.perimeter;
	if (!perimeter) return lines;
	lines.push(`    ${t.perimeter}`);
	for (const r of perimeter.rules) lines.push(`      ${t.rule} ${r.rule_id}: ${r.tool}`);
	lines.push(`      ${t.modules}: ${perimeter.modules.join(", ")}`);
	for (const u of perimeter.unmeasured) lines.push(`      ${t.unmeasured}: ${u.subject} — ${u.reason}`);
	for (const g of setAside) lines.push(`      ${t.outside}: ${t.gap(g)} — ${g.reason}`);
	return lines;
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

/** What the text says of one rule of an adopted referential. */
type RuleLabels = Omit<
	NonNullable<SurveySection["referential"]>["rules"][number],
	"findings" | "proprietary_by_module"
> & { adopted_on: string };

const R = {
	fr: {
		title: "Rapport",
		requirements: "Exigences",
		observations: "Observations mécaniques",
		judgments: "Jugements",
		risks: "Risques résiduels",
		none: "aucun",
		decidedByOwner: "décidée par le propriétaire",
		survey: "État des lieux",
		findings: "Constats",
		blindSpots: "Angles morts",
		referential: "Référentiel de qualité adopté",
		rule: (r: RuleLabels) =>
			`${r.rule_id} — ${r.nature}, oracle ${r.control_id} (${r.tool}), seuil : ${r.threshold}, source : ${r.source}, adoptée le ${r.adopted_on}`,
		proprietary: "code propriétaire :",
		generated: "code généré :",
		inModule: (violations: number, module: string | null) =>
			`${violations} ${module === null ? "hors des sources mesurées" : `dans ${module}`}`,
		unmeasured: "non mesuré par le référentiel :",
		outcome: "Résultat",
		candidate: "Candidat",
		authority: { kernel: "noyau", model: "modèle", human: "humain" },
	},
	en: {
		title: "Report",
		requirements: "Requirements",
		observations: "Mechanical observations",
		judgments: "Judgments",
		risks: "Residual risks",
		none: "none",
		decidedByOwner: "decided by the owner",
		survey: "Survey",
		findings: "Findings",
		blindSpots: "Blind spots",
		referential: "Adopted quality referential",
		rule: (r: RuleLabels) =>
			`${r.rule_id} — ${r.nature}, oracle ${r.control_id} (${r.tool}), threshold: ${r.threshold}, source: ${r.source}, adopted on ${r.adopted_on}`,
		proprietary: "proprietary code:",
		generated: "generated code:",
		inModule: (violations: number, module: string | null) =>
			`${violations} ${module === null ? "outside the measured sources" : `in ${module}`}`,
		unmeasured: "not measured by the referential:",
		outcome: "Outcome",
		candidate: "Candidate",
		authority: { kernel: "kernel", model: "model", human: "human" },
	},
};

/**
 * What was asked, then the three natures in three sections, in this order and never merged: what
 * was measured, what was concluded from it, and what remains unestablished (IMP-05).
 */
export function formatReport(report: EngineeringReport, lang: "fr" | "en" = "fr"): string {
	const t = R[lang];
	const lines = [`${t.title} ${report.change_id} — ${t.outcome}: ${report.outcome}`];
	if (report.candidate)
		lines.push(`${t.candidate}: ${report.candidate.candidate_id} ${report.candidate.manifest_digest.slice(0, 23)}`);
	lines.push("", `## ${t.requirements}`);
	if (report.requirements.length === 0) lines.push(`  ${t.none}`);
	for (const q of report.requirements) {
		const verdicts = q.decided_by_owner
			? t.decidedByOwner
			: q.controls.map((k) => `${k.control_id}=${k.verdict}`).join(", ");
		lines.push(`  ${q.requirement_id}: ${q.statement}${verdicts ? ` — ${verdicts}` : ""}`);
	}
	if (report.survey) {
		lines.push("", `## ${t.survey}`);
		for (const q of report.survey.requirements) {
			const answer = [
				...q.controls.map((k) => `${k.control_id}=${k.verdict}`),
				...(q.blind_spot === null ? [] : [q.blind_spot]),
			].join("; ");
			lines.push(`  ${q.requirement_id}: ${q.statement}${answer ? ` — ${answer}` : ""}`);
		}
		const referential = report.survey.referential;
		if (referential) {
			lines.push(`  ${t.referential}:`);
			for (const rule of referential.rules) {
				lines.push(`    ${t.rule({ ...rule, adopted_on: referential.adopted_on })}`);
				const located = (authorship: CodeAuthorship) =>
					rule.findings
						.filter((f) => f.authorship === authorship)
						.map((f) => `        ${f.path === null ? "" : `${f.path}: `}${f.message}`);
				const generated = located("generated");
				const counts = rule.proprietary_by_module.map((c) => t.inModule(c.violations, c.module));
				lines.push(`      ${t.proprietary} ${counts.length === 0 ? t.none : counts.join(", ")}`);
				lines.push(...located("proprietary"));
				lines.push(`      ${t.generated} ${generated.length === 0 ? t.none : generated.length}`);
				lines.push(...generated);
			}
			lines.push(`    ${t.unmeasured}`);
			if (referential.unmeasured.length === 0) lines.push(`      ${t.none}`);
			for (const u of referential.unmeasured) lines.push(`      ${u.subject}: ${u.reason}`);
		}
		lines.push(`  ${t.findings}:`);
		if (report.survey.findings.length === 0) lines.push(`    ${t.none}`);
		for (const f of report.survey.findings)
			lines.push(`    ${f.control_id}${f.path === null ? "" : ` ${f.path}`}: ${f.message}`);
		lines.push(`  ${t.blindSpots}:`);
		if (report.survey.blind_spots.length === 0) lines.push(`    ${t.none}`);
		for (const b of report.survey.blind_spots) lines.push(`    ${b.control_id}: ${b.reason}`);
	}
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

/** A count in thousands or millions, at one decimal, written as the language writes it. */
function scaled(count: number, unit: "k" | "M", lang: "fr" | "en"): string {
	const value = (count / (unit === "k" ? 1000 : 1_000_000)).toFixed(1);
	return lang === "fr" ? `${value.replace(".", ",")} ${unit}` : `${value}${unit}`;
}

/** Tokens as a reader counts them: exact under a thousand, then in thousands with one decimal. */
function tokenCount(tokens: number, lang: "fr" | "en"): string {
	if (tokens < 1000) return String(tokens);
	return scaled(tokens, "k", lang);
}

const GAUGE_CELLS = 20;

/**
 * One line for the gauge under the editor: twenty cells, one full per whole 5 % of the window the
 * agent's context fills, the rounded percentage, then the tokens against the window. A context the
 * host does not know is shown as such, never as an empty one.
 */
export function formatAgentContext(context: AgentContext, lang: "fr" | "en"): string {
	const label = lang === "fr" ? "Contexte de l'agent" : "Agent context";
	const count = (n: number) => scaled(n, n < 1_000_000 ? "k" : "M", lang);
	const capacity = count(context.context_window);
	if (context.tokens === null) return `${label}  ${"░".repeat(GAUGE_CELLS)}  ?   ? / ${capacity}`;
	const percent = (context.tokens / context.context_window) * 100;
	const full = Math.min(GAUGE_CELLS, Math.floor(percent / 5));
	const bar = "█".repeat(full) + "░".repeat(GAUGE_CELLS - full);
	const shown = `${Math.round(percent)}${lang === "fr" ? " %" : "%"}`;
	return `${label}  ${bar}  ${shown}   ${count(context.tokens)} / ${capacity}`;
}

/**
 * One line for a status bar: the tokens used, then the host's amount marked as an estimate, since
 * 495 reads no invoice. Empty before any intervention has used a token.
 */
export function formatConsumption(c: Consumption, lang: "fr" | "en" = "fr"): string {
	if (c.tokens === 0 && c.usd === null) return "";
	const parts = [`${tokenCount(c.tokens, lang)} ${lang === "fr" ? "jetons" : "tokens"}`];
	if (c.usd !== null) {
		const amount = c.usd.toFixed(2);
		const sub = c.subscription ? (lang === "fr" ? " (abonnement)" : " (sub)") : "";
		parts.push(lang === "fr" ? `~${amount.replace(".", ",")} $${sub}` : `~$${amount}${sub}`);
	}
	return parts.join(" · ");
}
