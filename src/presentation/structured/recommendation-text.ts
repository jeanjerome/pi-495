/**
 * The architecture recommendation of a survey as the report writes it under the map: what the owner chose and when,
 * each alternative with its nature, its benefits, its cost, its risks and the constraints it cites, the alternative
 * the model recommended, and its pattern review; or why none is given. A reading of the model, never a finding.
 */
import type { SurveySection } from "../../application/report.ts";

type Recommendation = NonNullable<SurveySection["recommendation"]>;
type Given = Extract<Recommendation, { given: true }>;
type Alternative = Given["alternatives"][number];

/** The nature of an alternative, as the owner reads it. */
export const NATURES = {
	fr: { keep: "conserver", adjust: "ajuster", transform: "transformer" },
	en: { keep: "keep", adjust: "adjust", transform: "transform" },
} as const;

const L = {
	fr: {
		none: (missing: readonly string[]) =>
			`Aucune recommandation d'architecture n'est donnée, parce que la forme de son argument ne tient pas : ${missing.join("; ")}`,
		heading:
			"Recommandation d'architecture, lecture du modèle qui n'est pas un constat et dont aucun verdict ne dépend :",
		choice: (choice: Given["choice"]) =>
			choice.kind === "chosen"
				? `le propriétaire a choisi ${choice.alternative_id} le ${choice.on}`
				: choice.kind === "suspended"
					? `le propriétaire a laissé le choix en suspens le ${choice.on}`
					: "le propriétaire n'a pas encore choisi",
		natures: NATURES.fr,
		colon: " : ",
		chosen: "choisie",
		discarded: "écartée",
		benefits: "bénéfices :",
		cost: (a: Alternative) => `coût en complexité : ${a.cost.complexity} ; coût en migration : ${a.cost.migration}`,
		risks: "risques :",
		constraints: "contraintes :",
		recommended: (r: Given["recommended"]) =>
			`le modèle recommandait ${r.alternative_id} : ${r.conclusion} (${r.constraints.join(", ")})`,
		review: "revue de patterns, lecture du modèle :",
		kinds: { pattern: "pattern", anti_pattern: "anti-pattern" },
		quoted: (name: string) => `« ${name} »`,
		setAside: (kind: string, name: string, hint: string) =>
			`observation écartée : ${kind} « ${name} », parce que son indice ${hint} ne désigne aucune ligne de la référence`,
		nothing: "aucune",
	},
	en: {
		none: (missing: readonly string[]) =>
			`No architecture recommendation is given, because the form of its argument does not hold: ${missing.join("; ")}`,
		heading: "Architecture recommendation, a reading of the model which is not a finding and no verdict depends on:",
		choice: (choice: Given["choice"]) =>
			choice.kind === "chosen"
				? `the owner chose ${choice.alternative_id} on ${choice.on}`
				: choice.kind === "suspended"
					? `the owner left the choice pending on ${choice.on}`
					: "the owner has not chosen yet",
		natures: NATURES.en,
		colon: ": ",
		chosen: "chosen",
		discarded: "set aside",
		benefits: "benefits:",
		cost: (a: Alternative) => `cost in complexity: ${a.cost.complexity}; cost in migration: ${a.cost.migration}`,
		risks: "risks:",
		constraints: "constraints:",
		recommended: (r: Given["recommended"]) =>
			`the model recommended ${r.alternative_id}: ${r.conclusion} (${r.constraints.join(", ")})`,
		review: "pattern review, a reading of the model:",
		kinds: { pattern: "pattern", anti_pattern: "anti-pattern" },
		quoted: (name: string) => `“${name}”`,
		setAside: (kind: string, name: string, hint: string) =>
			`observation set aside: ${kind} “${name}”, because its hint ${hint} designates no line of the reference`,
		nothing: "none",
	},
} as const;

/** The lines of the recommendation of a survey, indented under the survey section, in `lang`. */
export function recommendationLines(recommendation: Recommendation, lang: "fr" | "en"): string[] {
	const t = L[lang];
	if (!recommendation.given) return [`  ${t.none(recommendation.missing)}`];
	const { choice } = recommendation;
	const lines = [`  ${t.heading}`, `    ${t.choice(choice)}`];
	for (const a of recommendation.alternatives) {
		// An alternative is set aside only by the owner's choice of another; a pending choice sets none aside.
		const standing =
			choice.kind !== "chosen" ? "" : `, ${choice.alternative_id === a.alternative_id ? t.chosen : t.discarded}`;
		lines.push(
			`    ${a.alternative_id} — ${t.natures[a.nature]}${standing}${t.colon}${a.description}`,
			`      ${t.benefits} ${a.benefits.join("; ") || t.nothing}`,
			`      ${t.cost(a)}`,
			`      ${t.risks} ${a.risks.join("; ") || t.nothing}`,
			`      ${t.constraints} ${a.constraints.map((c) => `${c.id}: ${c.says}`).join("; ")}`,
		);
	}
	lines.push(`    ${t.recommended(recommendation.recommended)}`);
	const { kept, set_aside } = recommendation.review;
	if (kept.length + set_aside.length === 0) return lines;
	lines.push(`    ${t.review}`);
	for (const o of kept)
		lines.push(
			`      ${t.kinds[o.kind]} ${t.quoted(o.name)} — ${o.hints.map((h) => `${h.path}:${h.line} ${h.says}`.trim()).join("; ")}`,
		);
	for (const o of set_aside) lines.push(`      ${t.setAside(t.kinds[o.kind], o.name, o.hint)}`);
	return lines;
}
