import { GATES, type GateId } from "../../contracts/v1/common.ts";
import type { DecisionRequest } from "../../contracts/v1/decision.ts";
import type { IncrementStatus, JudgedGap } from "../../domain/program/program.ts";
import type { CodeAuthorship } from "../../domain/survey.ts";
import type { EngineeringReport, MechanicalObservation, SurveySection } from "../../application/report.ts";
import type { Consumption, StatusGap, StatusMeasure, StatusView } from "../../application/views.ts";
import type { AgentContext } from "../../ports/execution.ts";

const L = {
	fr: {
		program: "Programme",
		change: "Changement",
		none: "aucun",
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
		none: "none",
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

type ChangeView = NonNullable<StatusView["change"]>;

/** The mark of a verdict: passed, failed, undecided, or not reached yet. */
function mark(verdict: string | undefined): string {
	if (verdict === undefined) return "○";
	return verdict === "PASS" ? "✔" : verdict === "FAIL" ? "✘" : "?";
}

const S = {
	fr: {
		gates: {
			G0: "Cadrage",
			G1: "Spécification",
			G2: "Qualification",
			G3: "Conception",
			G4: "Implémentation",
			G5: "Acceptation",
			G6: "Intégration",
		},
		onAttempt: (used: number, max: number) => ` à la tentative ${used} sur ${max}`,
		closed: "Clos",
		accepted: "Accepté",
		integrated: "Intégré",
		blocked: "Bloqué",
		rejected: "Rejeté",
		abandoned: "Abandonné",
		waiting: "En attente de votre décision — /495 decide",
		phases: {
			intake: "prise de la demande",
			clarifying: "clarification de la demande",
			specifying: "rédaction des exigences",
			verification_design: "gel des contrôles",
			preparing: "préparation des contrôles",
			designing: "conception du changement",
			implementing: "écriture du candidat",
			verifying: "exécution des contrôles",
			reviewing: "relecture du candidat",
			deciding: "décision d'acceptation",
			integrating: "intégration",
		} as Record<string, string>,
		sandbox: (backend: string) => `Le bac à sable ${backend} n'est pas qualifié`,
		checks: "Contrôles du candidat",
		verdicts: {
			PASS: "réussi",
			FAIL: "échoué",
			INDETERMINATE: "indéterminé",
			NOT_RUN: "non exécuté",
			NOT_APPLICABLE: "sans objet",
		} as Record<string, string>,
		invalid: "invalide",
		used: "Dépensé par les agents",
		last: "Dernière",
		next: "Ensuite",
		done: "/495 review pour lire le changement, /495 report pour le détail",
		truncated: "interrompue par le budget de durée",
		continuations: "reprises",
		toolCalls: "appels d'outils",
	},
	en: {
		gates: {
			G0: "Scoping",
			G1: "Specification",
			G2: "Qualification",
			G3: "Design",
			G4: "Implementation",
			G5: "Acceptance",
			G6: "Integration",
		},
		onAttempt: (used: number, max: number) => ` on attempt ${used} of ${max}`,
		closed: "Closed",
		accepted: "Accepted",
		integrated: "Integrated",
		blocked: "Blocked",
		rejected: "Rejected",
		abandoned: "Abandoned",
		waiting: "Waiting for your decision — /495 decide",
		phases: {
			intake: "taking the request",
			clarifying: "clarifying the request",
			specifying: "writing the requirements",
			verification_design: "freezing the checks",
			preparing: "preparing the checks",
			designing: "designing the change",
			implementing: "writing the candidate",
			verifying: "running the checks",
			reviewing: "reviewing the candidate",
			deciding: "deciding acceptance",
			integrating: "integrating",
		} as Record<string, string>,
		sandbox: (backend: string) => `The ${backend} sandbox is not qualified`,
		checks: "Checks on the candidate",
		verdicts: {
			PASS: "passed",
			FAIL: "failed",
			INDETERMINATE: "indeterminate",
			NOT_RUN: "not run",
			NOT_APPLICABLE: "not applicable",
		} as Record<string, string>,
		invalid: "invalid",
		used: "Spent by agents",
		last: "Last",
		next: "Next",
		done: "/495 review to read the change, /495 report for the details",
		truncated: "stopped by the duration budget",
		continuations: "resumptions",
		toolCalls: "tool calls",
	},
};

/** The step each phase belongs to, named as its gate (D-83). */
const STEP_OF_PHASE: Record<string, GateId> = {
	intake: "G0",
	clarifying: "G0",
	specifying: "G1",
	verification_design: "G2",
	preparing: "G2",
	designing: "G3",
	implementing: "G4",
	verifying: "G5",
	reviewing: "G5",
	deciding: "G5",
	integrating: "G6",
};

/** The step that contains a phase, by its name, or Closed once the change is. */
export function formatStep(phase: string, lang: "fr" | "en"): string {
	const step = STEP_OF_PHASE[phase];
	if (step) return S[lang].gates[step];
	return phase === "closed" ? S[lang].closed : phase;
}

/** A phase as the owner reads it: the step that contains it, then the activity. */
function stepAndActivity(phase: string, lang: "fr" | "en"): string {
	const step = STEP_OF_PHASE[phase];
	return step ? `${S[lang].gates[step]} · ${S[lang].phases[phase] ?? phase}` : formatStep(phase, lang);
}

type Cause = { gate: string | null; reason: string };

/** The stop detail the kernel writes for an error: its code, its sentence, then the actions it names. */
function stopParts(detail: string): { reason: string; named: string[] } {
	const [, reason = detail, named] = /^(?:[A-Z_]+: )?(.*?)(?: \(next: ([^)]*)\))?$/s.exec(detail) ?? [];
	return { reason, named: named?.split(", ") ?? [] };
}

/** What stopped the change, once: the first reason of the first gate that did not pass, else the stop itself. */
function causeOf(c: ChangeView): Cause | null {
	const stop = c.stop_detail ? stopParts(c.stop_detail).reason : c.stop_reason;
	const failed = c.gates.find((g) => g.verdict !== "PASS" && g.reasons[0]);
	const reason = failed?.reasons[0];
	// A block whose detail does not repeat that reason, as a stagnation, stopped for its detail, not for the gate.
	const stoppedApart = c.status === "blocked" && !!stop && !!reason && !stop.includes(reason);
	if (failed && reason && !stoppedApart) return { gate: failed.gate, reason };
	return stop ? { gate: null, reason: stop } : null;
}

/**
 * The /495 commands out of a stop: those it names — a bare word is a command, a snake_case word a step
 * of the kernel — and the resume when the kernel says it lifts the stop; a cancel, which leaves any stop,
 * when there is neither.
 */
function commandsOutOf(c: ChangeView): string[] {
	const named = c.stop_detail ? stopParts(c.stop_detail).named : [];
	const resumable = c.resume_lifts_stop ? ["resume"] : [];
	const commands = [...new Set([...resumable, ...named])].filter((a) => /^[a-z]+$/.test(a));
	return (commands.length ? commands : ["cancel"]).map((a) => `/495 ${a}`);
}

/**
 * Where the request stands, in one line, with the cause of a stop when there is one: a cause said here
 * is said nowhere else, and a change that has not stopped leaves its gate reasons under the gates.
 */
function verdictLine(c: ChangeView, lang: "fr" | "en"): { line: string; cause: Cause | null } {
	const t = S[lang];
	const attempt = c.attempts.used > 0 ? t.onAttempt(c.attempts.used, c.attempts.max) : "";
	if (c.status === "decision_required") return { line: `⏸ ${t.waiting}`, cause: null };
	if (c.outcome === "accepted" || c.outcome === "integrated")
		return { line: `✔ ${t[c.outcome]}${attempt}`, cause: null };
	const stopped =
		c.status === "blocked"
			? t.blocked
			: c.outcome === "rejected"
				? t.rejected
				: c.outcome === "abandoned" || c.status === "cancelled"
					? t.abandoned
					: null;
	if (stopped === null) return { line: `… ${stepAndActivity(c.phase, lang)}${attempt}`, cause: null };
	const cause = causeOf(c);
	return { line: `✘ ${stopped}${attempt}${cause ? ` — ${cause.reason}` : ""}`, cause };
}

/** A limit worth the reader's attention: a qualified sandbox is none, an unqualified one is named. */
function limitLines(limits: string[], lang: "fr" | "en"): string[] {
	return limits.flatMap((l) => {
		const sandbox = /^sandbox:(.+):(qualified|not-qualified)$/.exec(l);
		if (!sandbox) return [`⚠ ${l}`];
		return sandbox[2] === "not-qualified" ? [`⚠ ${S[lang].sandbox(sandbox[1]!)}`] : [];
	});
}

/**
 * Plain-text status shared by print mode, notifications and the conversational tool (UX-03): the
 * request and what became of it, the gates in words, the checks of the candidate, what was used and
 * what to do next. Identifiers, digests and revisions stay in the view and the dossier.
 */
export function formatStatus(view: StatusView, lang: "fr" | "en" = "fr"): string {
	const lines: string[] = [];
	// A program the owner wrote is shown as such; the single increment a request opens says nothing more.
	const program = view.program;
	if (program && (program.increments.length > 1 || program.milestones.length > 0 || program.baseline !== null))
		lines.push(...programLines(program, lang));
	const c = view.change;
	if (!c) {
		lines.push(`${L[lang].change}: ${L[lang].none}`, ...limitLines(view.limits, lang));
		return lines.join("\n");
	}
	const t = S[lang];
	const title = program?.increments.find((i) => i.increment_id === c.increment_id)?.title;
	const { line: verdict, cause } = verdictLine(c, lang);
	lines.push(title ? `495 · ${title}` : "495", verdict, ...limitLines(view.limits, lang));
	const decided = new Map(c.gates.map((g) => [g.gate, g]));
	lines.push("", `  ${GATES.map((g) => `${mark(decided.get(g)?.verdict)} ${t.gates[g]}`).join("  ")}`);
	for (const g of c.gates)
		if (g.verdict !== "PASS")
			for (const r of g.reasons.slice(0, 6))
				if (cause?.gate !== g.gate || cause.reason !== r)
					lines.push(`    ${t.gates[g.gate as GateId] ?? g.gate}: ${r}`);
	const checks = c.evidence.filter((e) => e.current_candidate);
	if (checks.length) {
		lines.push("", `  ${t.checks}`);
		for (const e of checks)
			lines.push(
				`    ${mark(e.verdict)} ${e.control_id.padEnd(10)} ${t.verdicts[e.verdict] ?? e.verdict}${e.valid ? "" : ` (${t.invalid})`}`,
			);
	}
	const facts: [string, string][] = [];
	const used = formatConsumption(c.consumption, lang);
	if (used) facts.push([t.used, used]);
	// A session cut short is not a proposal: saying so is what tells a slow model from a stuck one.
	if (c.last_intervention && c.phase !== "closed") {
		const i = c.last_intervention;
		const cut = i.result === "truncated" ? ` — ${t.truncated}` : "";
		const resumed = c.continuations > 0 ? `, ${c.continuations} ${t.continuations}` : "";
		facts.push([
			t.last,
			`${i.role} ${i.result}${cut}${resumed} (${Math.round(i.duration_ms / 1000)}s, ${i.tool_calls} ${t.toolCalls})`,
		]);
	}
	const finished = c.phase === "closed" && (c.outcome === "accepted" || c.outcome === "integrated");
	// The next action of a block repeats its cause, which the verdict line already says.
	const out = c.status === "blocked" && cause ? commandsOutOf(c) : null;
	facts.push([t.next, out ? out.join(", ") : finished ? t.done : c.next_action]);
	// The long label of the agents' consumption takes three spaces, so that it does not push every value far right.
	const width = Math.max(t.last.length + 4, t.next.length + 4, used ? t.used.length + 3 : 0);
	lines.push("", ...facts.map(([label, value]) => `  ${label.padEnd(width)}${value}`));
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
		title: "rapport",
		outcomes: {
			pending: "… En cours",
			accepted: "✔ Accepté",
			integrated: "✔ Intégré",
			rejected: "✘ Rejeté",
			abandoned: "✘ Abandonné",
		} satisfies Record<EngineeringReport["outcome"], string>,
		asked: "Ce qui était demandé",
		measured: "Ce qui a été mesuré",
		concluded: "Ce qui a été conclu",
		uncertain: "Ce qui reste incertain",
		reference: "référence",
		candidate: "candidat",
		nothingMeasured: "rien n'a été mesuré",
		qualified: (controls: number, runs: number) =>
			`${controls} contrôle${controls === 1 ? " a été qualifié" : "s ont été qualifiés"} sur ${runs} essai${runs === 1 ? "" : "s"} témoin${runs === 1 ? "" : "s"} avant d'être retenu${controls === 1 ? "" : "s"}.`,
		tried: (controls: number, runs: number, unqualified: number) =>
			`${controls} contrôle${controls === 1 ? " a été essayé" : "s ont été essayés"} sur ${runs} essai${runs === 1 ? "" : "s"} témoin${runs === 1 ? "" : "s"} ; ${unqualified} n'${unqualified === 1 ? "a" : "ont"} pas été qualifié${unqualified === 1 ? "" : "s"}.`,
		and: "et",
		passed: "Le noyau a passé",
		failed: "Le noyau a refusé",
		undecided: "Le noyau n'a pas pu trancher",
		decidedBy: "Décidé par",
		reviewedBy: "Relu par",
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
	},
	en: {
		title: "report",
		outcomes: {
			pending: "… In progress",
			accepted: "✔ Accepted",
			integrated: "✔ Integrated",
			rejected: "✘ Rejected",
			abandoned: "✘ Abandoned",
		} satisfies Record<EngineeringReport["outcome"], string>,
		asked: "What was asked",
		measured: "What was measured",
		concluded: "What was concluded",
		uncertain: "What remains uncertain",
		reference: "reference",
		candidate: "candidate",
		nothingMeasured: "nothing was measured",
		qualified: (controls: number, runs: number) =>
			`${controls} check${controls === 1 ? " was" : "s were"} qualified on ${runs} witness run${runs === 1 ? "" : "s"} before ${controls === 1 ? "it was" : "they were"} trusted.`,
		tried: (controls: number, runs: number, unqualified: number) =>
			`${controls} check${controls === 1 ? " was" : "s were"} tried on ${runs} witness run${runs === 1 ? "" : "s"}; ${unqualified} ${unqualified === 1 ? "was" : "were"} not qualified.`,
		and: "and",
		passed: "The kernel passed",
		failed: "The kernel refused",
		undecided: "The kernel could not decide",
		decidedBy: "Decided by",
		reviewedBy: "Reviewed by",
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
	},
};

/** The mark of a set of verdicts: all passed, one failed, or nothing to conclude. */
function overallMark(verdicts: readonly string[]): string {
	if (verdicts.includes("FAIL")) return "✘";
	return verdicts.length > 0 && verdicts.every((v) => v === "PASS") ? "✔" : "?";
}

/** `a, b and c`, as the language joins the last item. */
function listed(items: readonly string[], and: string): string {
	return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${and} ${items.at(-1)}`;
}

/** Each requirement by its statement, the mark of its controls on the candidate, and the controls that carry it. */
function askedLines(report: EngineeringReport, lang: "fr" | "en"): string[] {
	const t = R[lang];
	if (report.requirements.length === 0) return [`  ${t.none}`];
	return report.requirements.map((q) => {
		if (q.decided_by_owner) return `  ? ${q.statement} — ${t.decidedByOwner}`;
		const controls = [...new Set(q.controls.map((k) => k.control_id))];
		const verdict = overallMark(q.controls.map((k) => k.verdict));
		return `  ${verdict} ${q.statement}${controls.length ? ` — ${controls.join(", ")}` : ""}`;
	});
}

/**
 * One row per control with its latest verdict on the reference and on the current candidate, then how
 * many controls the qualification witnesses tried and on how many runs. A witness run judges the
 * control, so it is counted, never listed.
 */
function measuredLines(report: EngineeringReport, lang: "fr" | "en"): string[] {
	const t = R[lang];
	const onReference = report.observations.filter((o) => o.subject_kind === "reference");
	const onCandidate = report.observations.filter(
		(o) => o.subject_kind === "candidate" && o.subject_digest === report.candidate?.manifest_digest,
	);
	const controls = [...new Set([...onReference, ...onCandidate].map((o) => o.control_id))];
	const width = Math.max(10, ...controls.map((c) => c.length));
	const cell = (header: string, observed: readonly MechanicalObservation[], control: string) => {
		const verdict = observed.findLast((o) => o.control_id === control)?.verdict;
		const at = Math.floor((header.length - 1) / 2);
		return `${" ".repeat(at)}${verdict === undefined ? "?" : mark(verdict)}`.padEnd(header.length);
	};
	const lines = controls.length
		? [
				`  ${"".padEnd(width)}  ${t.reference}  ${t.candidate}`,
				...controls.map((c) =>
					`  ${c.padEnd(width)}  ${cell(t.reference, onReference, c)}  ${cell(t.candidate, onCandidate, c)}`.trimEnd(),
				),
			]
		: [`  ${t.nothingMeasured}`];
	const witnesses = report.observations.filter((o) => o.subject_kind === "fixture");
	if (witnesses.length === 0) return lines;
	const tried = new Set(witnesses.map((o) => o.control_id)).size;
	const unqualified = report.residual_risks.filter((r) => r.code === "control_not_qualified").length;
	lines.push(`  ${unqualified ? t.tried(tried, witnesses.length, unqualified) : t.qualified(tried, witnesses.length)}`);
	return lines;
}

/** The gates the kernel passed in one line, each gate it did not pass with its reasons, then each decision and review. */
function concludedLines(report: EngineeringReport, lang: "fr" | "en"): string[] {
	const t = R[lang];
	const gates = report.judgments
		.filter((j) => j.kind === "gate")
		.flatMap((j) => {
			const decided = /^(G\d) (PASS|FAIL|INDETERMINATE)(?:: (.*))?$/s.exec(j.statement);
			return decided ? [{ gate: decided[1] as GateId, verdict: decided[2]!, reasons: decided[3] ?? "" }] : [];
		})
		.sort((a, b) => a.gate.localeCompare(b.gate));
	const passed = gates.filter((g) => g.verdict === "PASS").map((g) => S[lang].gates[g.gate]);
	const lines = passed.length ? [`  ✔ ${t.passed} ${listed(passed, t.and)}`] : [];
	for (const g of gates)
		if (g.verdict !== "PASS")
			lines.push(
				`  ${mark(g.verdict)} ${g.verdict === "FAIL" ? t.failed : t.undecided} ${S[lang].gates[g.gate]}${g.reasons ? `: ${g.reasons}` : ""}`,
			);
	for (const j of report.judgments)
		if (j.kind !== "gate")
			lines.push(`  · ${j.kind === "review" ? t.reviewedBy : t.decidedBy} ${j.by}: ${j.statement}`);
	return lines.length ? lines : [`  ${t.none}`];
}

/** The survey of a change that delivers the state of the project, in its own section. */
function surveyLines(survey: SurveySection, lang: "fr" | "en"): string[] {
	const t = R[lang];
	const lines = [`## ${t.survey}`];
	for (const q of survey.requirements) {
		const answer = [
			...q.controls.map((k) => `${k.control_id}=${k.verdict}`),
			...(q.blind_spot === null ? [] : [q.blind_spot]),
		].join("; ");
		lines.push(`  ${q.requirement_id}: ${q.statement}${answer ? ` — ${answer}` : ""}`);
	}
	const referential = survey.referential;
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
	if (survey.findings.length === 0) lines.push(`    ${t.none}`);
	for (const f of survey.findings)
		lines.push(`    ${f.control_id}${f.path === null ? "" : ` ${f.path}`}: ${f.message}`);
	lines.push(`  ${t.blindSpots}:`);
	if (survey.blind_spots.length === 0) lines.push(`    ${t.none}`);
	for (const b of survey.blind_spots) lines.push(`    ${b.control_id}: ${b.reason}`);
	return lines;
}

/**
 * What was asked, then the three natures in three sections, in this order and never merged: what
 * was measured, what was concluded from it, and what remains unestablished (IMP-05). Codes, digests
 * and the runs of the qualification witnesses stay in the report object.
 */
export function formatReport(report: EngineeringReport, lang: "fr" | "en" = "fr"): string {
	const t = R[lang];
	const lines = [`495 ${t.title}${report.title ? ` · ${report.title}` : ""} — ${t.outcomes[report.outcome]}`];
	lines.push("", t.asked, ...askedLines(report, lang));
	if (report.survey) lines.push("", ...surveyLines(report.survey, lang));
	lines.push("", t.measured, ...measuredLines(report, lang));
	lines.push("", t.concluded, ...concludedLines(report, lang));
	lines.push("", t.uncertain);
	if (report.residual_risks.length === 0) lines.push(`  ${t.none}`);
	for (const r of report.residual_risks) lines.push(`  · ${r.statement}`);
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
