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

/** What an IH-04 asked on a survey offers to adopt: the quality referential of a stack, and the plugin it resolves. */
export interface ReferentialOffer {
	stack: string;
	install: PackageInstall;
}

const stackName = (stack: string): string => `${stack.charAt(0).toUpperCase()}${stack.slice(1)}`;

/**
 * IH-04 asked on a survey whose quality requirement no control measures while the adapter proposes a
 * referential that would: the owner adopts it, which resolves its plugin in a copy, or leaves the
 * requirement a blind spot. Nothing is prepared and nothing is assigned: a survey writes nothing.
 */
const REFERENTIAL_ADOPTION = {
	fr: (requirements: string, { stack, install }: ReferentialOffer) => ({
		question: `Aucun contrôle ne mesure ${requirements}. Adopter le référentiel de qualité proposé pour ${stackName(stack)} ?`,
		options: [
			{
				id: "adopt_referential",
				label: `Adopter le référentiel (déclare ${installedName(install)} dans une copie du POM et le résout, réseau ouvert pour cette seule étape)`,
				effect: `495 déclare ${installedName(install)} dans une copie du POM et résout le greffon avec Maven, en ouvrant le réseau pour cette seule étape et sans exécuter aucun but du greffon ; la copie est inspectée et la résolution n'est acceptée que si elle ne modifie aucun fichier autre que pom.xml ; rien n'est écrit dans le projet. Le référentiel est gelé dans le protocole avec la date de cette décision, et l'état des lieux mesure l'exigence avec lui. Si la résolution échoue, rien n'est adopté et l'exigence reste un angle mort avec la raison donnée par Maven. La réponse tombe si les exigences sont révisées.`,
				risky: true,
			},
			{
				id: "leave_blind_spot",
				label: "Laisser l'exigence en angle mort",
				effect:
					"Rien n'est résolu et le réseau reste fermé ; l'état des lieux nomme l'exigence comme angle mort, parce que le référentiel proposé n'a pas été adopté. La réponse tombe si les exigences sont révisées.",
				risky: false,
			},
		],
	}),
	en: (requirements: string, { stack, install }: ReferentialOffer) => ({
		question: `No control measures ${requirements}. Adopt the quality referential proposed for ${stackName(stack)}?`,
		options: [
			{
				id: "adopt_referential",
				label: `Adopt the referential (declares ${installedName(install)} in a copy of the POM and resolves it, network open for that step alone)`,
				effect: `495 declares ${installedName(install)} in a copy of the POM and resolves the plugin with Maven, opening the network for that step alone and running no goal of the plugin; the copy is inspected and the resolution is accepted only if it changes no file other than pom.xml; nothing is written in the project. The referential is frozen in the protocol with the date of this decision, and the survey measures the requirement with it. If the resolution fails, nothing is adopted and the requirement stays a blind spot with the reason Maven gave. The answer lapses if the requirements are revised.`,
				risky: true,
			},
			{
				id: "leave_blind_spot",
				label: "Leave the requirement a blind spot",
				effect:
					"Nothing is resolved and the network stays closed; the survey names the requirement as a blind spot, because the proposed referential was not adopted. The answer lapses if the requirements are revised.",
				risky: false,
			},
		],
	}),
} as const;

/**
 * IH-10 asked on a survey rather than on a candidate: there is nothing to correct, so the owner accepts
 * the state of the project as presented, or refuses it and says why.
 */
const SURVEY_ACCEPTANCE = {
	fr: {
		question: "Accepter cet état des lieux ?",
		options: [
			{
				id: "accept",
				label: "Accepter",
				effect: "Le changement est clos accepté ; l'état des lieux est adopté tel qu'il est présenté.",
				risky: false,
			},
			{
				id: "refuse",
				label: "Refuser (motif en texte libre)",
				effect: "Le changement est clos rejeté avec votre motif ; rien n'est corrigé ni retenté.",
				risky: false,
			},
		],
	},
	en: {
		question: "Accept this survey of the project?",
		options: [
			{
				id: "accept",
				label: "Accept",
				effect: "The change is closed accepted; the survey is adopted as presented.",
				risky: false,
			},
			{
				id: "refuse",
				label: "Refuse (reason as free text)",
				effect: "The change is closed rejected with your reason; nothing is corrected or retried.",
				risky: false,
			},
		],
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
	/** The quality referential an IH-04 asked on a survey offers instead of a preparation. */
	referential?: ReferentialOffer;
	requested_at: string;
}): DecisionRequest {
	// The only IH-10 asked on an artifact is the acceptance of a survey; a candidate's is asked on the candidate.
	const surveyed = args.interaction === "IH-10" && args.subject.kind === "artifact";
	const t = surveyed
		? SURVEY_ACCEPTANCE[args.language]
		: args.interaction === "IH-04" && args.referential
			? REFERENTIAL_ADOPTION[args.language](args.arg ?? "", args.referential)
			: T[args.language][args.interaction](args.arg ?? "");
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
			args.interaction === "IH-07" ||
			surveyed,
		requested_at: args.requested_at,
		expires_at: null,
		language: args.language,
	};
}
