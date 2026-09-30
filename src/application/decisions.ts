/**
 * Human decision adapter (CMP-HUM): the question, its options and the effect of each one, built for
 * the interaction the kernel opened. It presents a decision; it never takes one.
 */
import type { HumanInteraction, SubjectRef } from "../contracts/v1/common.ts";
import type { DecisionRequest } from "../contracts/v1/decision.ts";

type Lang = "fr" | "en";

const T = {
	fr: {
		"IH-01": (q: string) => ({
			question: q,
			options: [
				{
					id: "answer",
					label: "Répondre (texte libre)",
					effect: "La réponse devient une décision enregistrée sur cette révision.",
					risky: false,
				},
				{
					id: "close",
					label: "Clore : la question n'est plus matérielle",
					effect: "La question est close ; sa réponse ne liera plus aucune exigence.",
					risky: true,
				},
				{
					id: "abandon",
					label: "Abandonner le changement",
					effect: "Le changement est clôturé comme abandonné, le dossier est conservé.",
					risky: true,
				},
			],
		}),
		"IH-02": (kind: string) => ({
			question: `Adopter ${kind === "mandate" ? "le mandat" : "les exigences"} de ce changement ?`,
			options: [
				{
					id: "adopt",
					label: "Adopter",
					effect:
						"Le gate passe si le reste est satisfait ; l'adoption porte sur ce texte exact et tombe si l'artefact change.",
					risky: true,
				},
				{
					id: "refuse",
					label: "Refuser (motif en texte libre)",
					effect: "Le changement est bloqué ; le dossier est exportable.",
					risky: false,
				},
			],
		}),
		"IH-04": (requirements: string) => ({
			question: `Aucun test ne peut juger ${requirements}. Que décider ?`,
			options: [
				{
					id: "prepare",
					label: "Préparer",
					effect:
						"Une préparation de tests de plus est accordée, une seule ; si elle ne retient encore aucun test capable de juger l'exigence, la question est posée de nouveau.",
					risky: false,
				},
				{
					id: "assign_review",
					label: "Assigner à une revue humaine",
					effect:
						"Aucune mesure ne jugera l'exigence : c'est à vous de la juger à l'acceptation du candidat, et le rapport la liste comme décidée par un humain. La réponse tombe si les exigences sont révisées.",
					risky: true,
				},
				{
					id: "revise",
					label: "Réviser l'exigence (dire en texte libre ce qu'elle doit devenir)",
					effect:
						"La spécification est refaite avec votre consigne et vous adoptez les nouvelles exigences comme les premières ; les exigences, le protocole et la préparation adoptés jusque-là ne sont plus en vigueur, et la nouvelle formulation reçoit ses propres préparations avant qu'on vous redemande de trancher.",
					risky: true,
				},
			],
		}),
		"IH-07": (used: string) => ({
			question: `Le budget de tentatives est épuisé (${used}). Étendre le budget ?`,
			options: [
				{
					id: "extend",
					label: "Étendre d'une tentative (indiquer un nombre en texte libre)",
					effect:
						"Une nouvelle tentative de correction sera autorisée ; la consommation passée n'est pas remise à zéro.",
					risky: true,
				},
				{
					id: "stop",
					label: "Arrêter ici",
					effect: "Le changement reste bloqué ; le dossier est exportable.",
					risky: false,
				},
			],
		}),
		"IH-08": () => ({
			question: "Deux revues obligatoires sont contradictoires. Trancher ?",
			options: [
				{
					id: "accept",
					label: "Retenir l'approbation",
					effect: "La revue rejetante est écartée pour cette révision seulement.",
					risky: true,
				},
				{ id: "reject", label: "Retenir le rejet", effect: "Le candidat est refusé.", risky: false },
			],
		}),
		"IH-10": () => ({
			question: "Accepter ce candidat ?",
			options: [
				{
					id: "accept",
					label: "Accepter",
					effect: "G5 peut passer si toutes les autres obligations sont satisfaites.",
					risky: true,
				},
				{ id: "refuse", label: "Refuser", effect: "G5 échoue ; une correction ou un rejet suit.", risky: false },
				{
					id: "correct",
					label: "Demander une correction",
					effect: "Une nouvelle tentative est autorisée si le budget le permet.",
					risky: false,
				},
			],
		}),
		"IH-11": (dest: string) => ({
			question: `Intégrer le candidat accepté dans ${dest} ?`,
			options: [
				{
					id: "integrate",
					label: "Intégrer localement",
					effect: "Un commit local est créé ; aucun push, aucune publication.",
					risky: true,
				},
				{
					id: "export_only",
					label: "Exporter seulement",
					effect: "Aucun effet Git ; le dossier est exportable.",
					risky: false,
				},
				{ id: "cancel", label: "Annuler", effect: "Le changement reste accepté sans intégration.", risky: false },
			],
		}),
		"IH-12": (detail: string) => ({
			question: `L'effet Git est incertain (${detail}). Qu'observez-vous ?`,
			options: [
				{
					id: "confirm_applied",
					label: "Confirmer : effectué",
					effect: "L'intégration est considérée appliquée et vérifiée ensuite.",
					risky: true,
				},
				{
					id: "confirm_not_applied",
					label: "Confirmer : non effectué",
					effect: "L'opération est marquée échouée et peut être relancée.",
					risky: true,
				},
				{ id: "investigate", label: "Investiguer", effect: "Le changement reste bloqué.", risky: false },
			],
		}),
	},
	en: {
		"IH-01": (q: string) => ({
			question: q,
			options: [
				{
					id: "answer",
					label: "Answer (free text)",
					effect: "The answer becomes a recorded decision on this revision.",
					risky: false,
				},
				{
					id: "close",
					label: "Close: the question is no longer material",
					effect: "The question is closed; its answer will no longer bind any requirement.",
					risky: true,
				},
				{
					id: "abandon",
					label: "Abandon the change",
					effect: "The change is closed as abandoned; the dossier is kept.",
					risky: true,
				},
			],
		}),
		"IH-02": (kind: string) => ({
			question: `Adopt the ${kind === "mandate" ? "mandate" : "requirements"} of this change?`,
			options: [
				{
					id: "adopt",
					label: "Adopt",
					effect:
						"The gate passes if everything else is satisfied; the adoption covers this exact text and lapses if the artifact changes.",
					risky: true,
				},
				{
					id: "refuse",
					label: "Refuse (reason as free text)",
					effect: "The change is blocked; the dossier can be exported.",
					risky: false,
				},
			],
		}),
		"IH-04": (requirements: string) => ({
			question: `No test can judge ${requirements}. What should be done?`,
			options: [
				{
					id: "prepare",
					label: "Prepare",
					effect:
						"One more test preparation is granted, once; if it still retains no test able to judge the requirement, the question is asked again.",
					risky: false,
				},
				{
					id: "assign_review",
					label: "Assign to a human review",
					effect:
						"No measurement will judge the requirement: you judge it when the candidate is accepted, and the report lists it as decided by a human. The answer lapses if the requirements are revised.",
					risky: true,
				},
				{
					id: "revise",
					label: "Revise the requirement (say in free text what it should become)",
					effect:
						"The specification is redone with your instruction and you adopt the new requirements like the first ones; the requirements, protocol and preparation adopted so far no longer hold, and the new wording gets its own preparations before you are asked to decide again.",
					risky: true,
				},
			],
		}),
		"IH-07": (used: string) => ({
			question: `The attempt budget is exhausted (${used}). Extend it?`,
			options: [
				{
					id: "extend",
					label: "Extend by one attempt (give a number as free text)",
					effect: "A new correction attempt is allowed; past consumption is not reset.",
					risky: true,
				},
				{
					id: "stop",
					label: "Stop here",
					effect: "The change stays blocked; the dossier can be exported.",
					risky: false,
				},
			],
		}),
		"IH-08": () => ({
			question: "Two required reviews contradict each other. Arbitrate?",
			options: [
				{
					id: "accept",
					label: "Keep the approval",
					effect: "The rejecting review is set aside for this revision only.",
					risky: true,
				},
				{ id: "reject", label: "Keep the rejection", effect: "The candidate is refused.", risky: false },
			],
		}),
		"IH-10": () => ({
			question: "Accept this candidate?",
			options: [
				{ id: "accept", label: "Accept", effect: "G5 may pass if every other obligation is satisfied.", risky: true },
				{ id: "refuse", label: "Refuse", effect: "G5 fails; a correction or a rejection follows.", risky: false },
				{
					id: "correct",
					label: "Request a correction",
					effect: "A new attempt is allowed if the budget permits.",
					risky: false,
				},
			],
		}),
		"IH-11": (dest: string) => ({
			question: `Integrate the accepted candidate into ${dest}?`,
			options: [
				{
					id: "integrate",
					label: "Integrate locally",
					effect: "A local commit is created; no push, no publication.",
					risky: true,
				},
				{
					id: "export_only",
					label: "Export only",
					effect: "No Git effect; the dossier can be exported.",
					risky: false,
				},
				{ id: "cancel", label: "Cancel", effect: "The change stays accepted without integration.", risky: false },
			],
		}),
		"IH-12": (detail: string) => ({
			question: `The Git effect is uncertain (${detail}). What do you observe?`,
			options: [
				{
					id: "confirm_applied",
					label: "Confirm: applied",
					effect: "The integration is considered applied and then verified.",
					risky: true,
				},
				{
					id: "confirm_not_applied",
					label: "Confirm: not applied",
					effect: "The operation is marked failed and can be relaunched.",
					risky: true,
				},
				{ id: "investigate", label: "Investigate", effect: "The change stays blocked.", risky: false },
			],
		}),
	},
} as const;

/**
 * The way out of IH-04 that changes the target instead of judging anything: it applies the file edit
 * of a recommended complement. It is offered only when such an edit can be applied.
 */
const ADOPT_COMPLEMENT = {
	fr: (files: string) => ({
		id: "adopt_complement",
		label: `Adopter le complément (modifie ${files})`,
		effect: `495 applique à ${files} la modification exacte que la recommandation décrit, sans réseau et sans rien installer ; elle arrive dans le projet avec le candidat, à l'intégration que vous acceptez. Cela ne juge pas l'exigence : elle reste à préparer, à assigner ou à réviser, et la question est reposée sans cette issue si elle reste sans juge. La réponse tombe si les exigences sont révisées.`,
		risky: true,
	}),
	en: (files: string) => ({
		id: "adopt_complement",
		label: `Adopt the complement (edits ${files})`,
		effect: `495 applies to ${files} the exact edit the recommendation describes, with no network and nothing installed; it reaches the project with the candidate, at the integration you accept. It does not judge the requirement: it is still to be prepared, assigned or revised, and the question is asked again without this option if the requirement is still left without a judge. The answer lapses if the requirements are revised.`,
		risky: true,
	}),
} as const;

export function buildDecisionRequest(args: {
	decision_id: string;
	change_id: string;
	interaction: Exclude<HumanInteraction, "IH-03" | "IH-05" | "IH-06" | "IH-09">;
	subject: SubjectRef;
	language: Lang;
	facts: string[];
	recommendation: string | null;
	arg?: string;
	/** The files that the adoptable complements of an IH-04 would edit; none when no recommended edit can be applied. */
	adoptable_files?: readonly string[];
	requested_at: string;
	authority?: DecisionRequest["required_authority"];
}): DecisionRequest {
	const t = T[args.language][args.interaction](args.arg ?? "");
	const adoptableFiles = args.interaction === "IH-04" ? (args.adoptable_files ?? []) : [];
	const options =
		adoptableFiles.length > 0 ? [...t.options, ADOPT_COMPLEMENT[args.language](adoptableFiles.join(", "))] : t.options;
	return {
		decision_id: args.decision_id,
		change_id: args.change_id,
		interaction: args.interaction,
		subject: args.subject,
		question: t.question,
		facts: args.facts,
		recommendation: args.recommendation,
		options: [...options],
		required_authority: args.authority ?? (args.interaction === "IH-01" ? "requester" : "change_owner"),
		allow_free_text:
			args.interaction === "IH-01" ||
			args.interaction === "IH-02" ||
			args.interaction === "IH-04" ||
			args.interaction === "IH-07",
		requested_at: args.requested_at,
		expires_at: null,
		language: args.language,
	};
}
