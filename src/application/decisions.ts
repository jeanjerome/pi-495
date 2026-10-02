/**
 * Human decision adapter (CMP-HUM): the question, its options and the effect of each one, built for
 * the interaction the kernel opened. It presents a decision; it never takes one.
 */
import type { HumanInteraction, SubjectRef } from "../contracts/v1/common.ts";
import type { DecisionRequest } from "../contracts/v1/decision.ts";
import type { PackageInstall } from "../contracts/v1/protocol.ts";

type Lang = "fr" | "en";

/** The human interactions a phase may open. The others belong to entry points, not to a phase. */
export type PhaseInteraction = Exclude<HumanInteraction, "IH-03" | "IH-05" | "IH-06" | "IH-09">;

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
 * What the owner is offered to adopt on an IH-04: the files a recommendation edits and the packages one
 * installs, and for a Maven install the local repository Maven announced, which the resolution writes.
 */
export interface Adoptable {
	files: readonly string[];
	installs: readonly PackageInstall[];
	local_repository?: string;
}

const installedName = (install: PackageInstall): string => `${install.package} ${install.version}`;
const installedNames = (installs: readonly PackageInstall[]): string => installs.map(installedName).join(", ");
const installsWith = (installs: readonly PackageInstall[], manager: PackageInstall["manager"]): PackageInstall[] =>
	installs.filter((install) => install.manager === manager);

/**
 * The way out of IH-04 that changes the target instead of judging anything: it applies the file edit of
 * a recommended complement, installs its package in a copy, or resolves its Maven plugin in a copy, with
 * the network open for that step alone. It is offered only when something can be applied or installed.
 */
const ADOPT_COMPLEMENT = {
	fr: ({ files, installs, local_repository }: Adoptable) => {
		const edits = files.join(", ");
		const npm = installsWith(installs, "npm");
		const maven = installsWith(installs, "maven");
		const repository = local_repository === undefined ? "" : ` (${local_repository})`;
		const what = [
			files.length > 0 ? `applique à ${edits} la modification exacte que la recommandation décrit` : null,
			npm.length > 0
				? `installe ${installedNames(npm)} dans une copie du projet, en ouvrant le réseau pour cette seule étape et sans exécuter de script d'installation`
				: null,
			maven.length > 0
				? `résout ${installedNames(maven)} avec Maven dans une copie du projet, en ouvrant le réseau pour cette seule étape et sans exécuter aucun but du greffon ; les fichiers téléchargés sont écrits dès l'adoption dans le dépôt local que Maven désigne${repository} et y restent si l'intégration est refusée`
				: null,
		]
			.filter((part) => part !== null)
			.join(", puis ");
		const inspected = [
			npm.length > 0
				? "le résultat est inspecté et n'est accepté que s'il ajoute des paquets sans rien modifier de ce qui existait"
				: null,
			maven.length > 0
				? "la copie est inspectée et la résolution n'est acceptée que si elle ne modifie aucun fichier autre que pom.xml"
				: null,
		].filter((part) => part !== null);
		return {
			id: "adopt_complement",
			label: `Adopter le complément (${[files.length > 0 ? `modifie ${edits}` : null, npm.length > 0 ? `installe ${installedNames(npm)}, réseau ouvert pour cette seule étape` : null, maven.length > 0 ? `résout ${installedNames(maven)}, réseau ouvert pour cette seule étape` : null].filter((part) => part !== null).join(" ; ")})`,
			effect: `495 ${what}${installs.length > 0 ? "" : ", sans réseau et sans rien installer"} ; ${inspected.map((part) => `${part} ; `).join("")}le complément arrive dans le projet avec le candidat, à l'intégration que vous acceptez. Cela ne juge pas l'exigence : elle reste à préparer, à assigner ou à réviser, et la question est reposée sans cette issue si elle reste sans juge. La réponse tombe si les exigences sont révisées.`,
			risky: true,
		};
	},
	en: ({ files, installs, local_repository }: Adoptable) => {
		const edits = files.join(", ");
		const npm = installsWith(installs, "npm");
		const maven = installsWith(installs, "maven");
		const repository = local_repository === undefined ? "" : ` (${local_repository})`;
		const what = [
			files.length > 0 ? `applies to ${edits} the exact edit the recommendation describes` : null,
			npm.length > 0
				? `installs ${installedNames(npm)} in a copy of the project, opening the network for that step alone and running no install script`
				: null,
			maven.length > 0
				? `resolves ${installedNames(maven)} with Maven in a copy of the project, opening the network for that step alone and running no goal of the plugin; the downloaded files are written from the adoption into the local repository Maven designates${repository} and stay there if the integration is refused`
				: null,
		]
			.filter((part) => part !== null)
			.join(", then ");
		const inspected = [
			npm.length > 0
				? "the result is inspected and accepted only if it adds packages and changes nothing that existed"
				: null,
			maven.length > 0
				? "the copy is inspected and the resolution is accepted only if it changes no file other than pom.xml"
				: null,
		].filter((part) => part !== null);
		return {
			id: "adopt_complement",
			label: `Adopt the complement (${[files.length > 0 ? `edits ${edits}` : null, npm.length > 0 ? `installs ${installedNames(npm)}, network open for that step alone` : null, maven.length > 0 ? `resolves ${installedNames(maven)}, network open for that step alone` : null].filter((part) => part !== null).join("; ")})`,
			effect: `495 ${what}${installs.length > 0 ? "" : ", with no network and nothing installed"}; ${inspected.map((part) => `${part}; `).join("")}the complement reaches the project with the candidate, at the integration you accept. It does not judge the requirement: it is still to be prepared, assigned or revised, and the question is asked again without this option if the requirement is still left without a judge. The answer lapses if the requirements are revised.`,
			risky: true,
		};
	},
} as const;

export function buildDecisionRequest(args: {
	decision_id: string;
	change_id: string;
	interaction: PhaseInteraction;
	subject: SubjectRef;
	language: Lang;
	facts: string[];
	recommendation: string | null;
	arg?: string;
	/** What an IH-04 offers to adopt; nothing when no recommended edit can be applied and no install run. */
	adoptable?: Adoptable;
	requested_at: string;
}): DecisionRequest {
	const t = T[args.language][args.interaction](args.arg ?? "");
	const adoptable = args.interaction === "IH-04" ? (args.adoptable ?? { files: [], installs: [] }) : null;
	const options =
		adoptable !== null && (adoptable.files.length > 0 || adoptable.installs.length > 0)
			? [...t.options, ADOPT_COMPLEMENT[args.language](adoptable)]
			: t.options;
	return {
		decision_id: args.decision_id,
		change_id: args.change_id,
		interaction: args.interaction,
		subject: args.subject,
		question: t.question,
		facts: args.facts,
		recommendation: args.recommendation,
		options: [...options],
		required_authority: args.interaction === "IH-01" ? "requester" : "change_owner",
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
