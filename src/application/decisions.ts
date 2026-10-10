/**
 * Human decision adapter (CMP-HUM): the question, its options and the effect of each one, built for
 * the interaction the kernel opened. It presents a decision; it never takes one.
 */
import type { HumanInteraction, SubjectRef } from "../contracts/v1/common.ts";
import type { DecisionRequest } from "../contracts/v1/decision.ts";
import type { ArchitectureRecommendation, PackageInstall } from "../contracts/v1/protocol.ts";
import type { InstallCapability } from "./stacks/plugin.ts";

type Lang = "fr" | "en";

/** The human interactions a phase may open. The others belong to entry points, not to a phase. */
export type PhaseInteraction = Exclude<HumanInteraction, "IH-03" | "IH-06" | "IH-09">;

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
 * installs, and, by manager, the directory a manager that keeps what it writes outside the copy said it
 * writes, which its run writes from the adoption on.
 */
export interface Adoptable {
	files: readonly string[];
	installs: readonly PackageInstall[];
	outside_directories?: Readonly<Record<string, string>>;
}

/** The install capability of the technology that runs a package manager, as the owner is told of it; undefined when none does. */
type Installers = (manager: string) => InstallCapability | undefined;

const installedName = (install: PackageInstall): string => `${install.package} ${install.version}`;
const installedNames = (installs: readonly PackageInstall[]): string => installs.map(installedName).join(", ");

/** The installs of `installs` grouped by the capability that runs their manager, in the order they come. */
function byManager(
	installs: readonly PackageInstall[],
	installers: Installers,
): { install: InstallCapability; names: string }[] {
	const managers = [...new Set(installs.map((install) => install.manager))];
	return managers.flatMap((manager) => {
		const install = installers(manager);
		return install === undefined
			? []
			: [{ install, names: installedNames(installs.filter((i) => i.manager === manager)) }];
	});
}

/**
 * The way out of IH-04 that changes the target instead of judging anything: it applies the file edit of
 * a recommended complement, or brings its package into a copy with the manager of its technology, with
 * the network open for that step alone. What the manager does and what its inspection accepts are the
 * phrases its technology declares. It is offered only when something can be applied or installed.
 */
const ADOPT_COMPLEMENT = {
	fr: ({ files, installs, outside_directories = {} }: Adoptable, installers: Installers) => {
		const edits = files.join(", ");
		const groups = byManager(installs, installers);
		const what = [
			files.length > 0 ? `applique à ${edits} la modification exacte que la recommandation décrit` : null,
			...groups.map(({ install, names }) => {
				const said = install.phrases.fr;
				const kept = said.keptOutside ? ` ; ${said.keptOutside(outside_directories[install.manager])}` : "";
				return `${said.complementDoes(names)}, en ouvrant le réseau pour cette seule étape et ${said.runsNothing}${kept}`;
			}),
		]
			.filter((part) => part !== null)
			.join(", puis ");
		const inspected = groups.map(({ install }) => install.phrases.fr.complementInspected);
		return {
			id: "adopt_complement",
			label: `Adopter le complément (${[files.length > 0 ? `modifie ${edits}` : null, ...groups.map(({ install, names }) => `${install.phrases.fr.complementLabel(names)}, réseau ouvert pour cette seule étape`)].filter((part) => part !== null).join(" ; ")})`,
			effect: `495 ${what}${installs.length > 0 ? "" : ", sans réseau et sans rien installer"} ; ${inspected.map((part) => `${part} ; `).join("")}le complément arrive dans le projet avec le candidat, à l'intégration que vous acceptez. Cela ne juge pas l'exigence : elle reste à préparer, à assigner ou à réviser, et la question est reposée sans cette issue si elle reste sans juge. La réponse tombe si les exigences sont révisées.`,
			risky: true,
		};
	},
	en: ({ files, installs, outside_directories = {} }: Adoptable, installers: Installers) => {
		const edits = files.join(", ");
		const groups = byManager(installs, installers);
		const what = [
			files.length > 0 ? `applies to ${edits} the exact edit the recommendation describes` : null,
			...groups.map(({ install, names }) => {
				const said = install.phrases.en;
				const kept = said.keptOutside ? `; ${said.keptOutside(outside_directories[install.manager])}` : "";
				return `${said.complementDoes(names)}, opening the network for that step alone and ${said.runsNothing}${kept}`;
			}),
		]
			.filter((part) => part !== null)
			.join(", then ");
		const inspected = groups.map(({ install }) => install.phrases.en.complementInspected);
		return {
			id: "adopt_complement",
			label: `Adopt the complement (${[files.length > 0 ? `edits ${edits}` : null, ...groups.map(({ install, names }) => `${install.phrases.en.complementLabel(names)}, network open for that step alone`)].filter((part) => part !== null).join("; ")})`,
			effect: `495 ${what}${installs.length > 0 ? "" : ", with no network and nothing installed"}; ${inspected.map((part) => `${part}; `).join("")}the complement reaches the project with the candidate, at the integration you accept. It does not judge the requirement: it is still to be prepared, assigned or revised, and the question is asked again without this option if the requirement is still left without a judge. The answer lapses if the requirements are revised.`,
			risky: true,
		};
	},
} as const;

/**
 * The frozen case an IH-04 asks about: its examination found that the objection is to the requirement itself, or
 * found wrong a case the owner kept.
 */
export interface ContestedCase {
	requirement_id: string;
	case_name: string;
	/** The owner kept this case before, and the examination now finds it wrong. */
	kept?: true;
}

/**
 * IH-04 asked on a contested frozen case the examination found to assert the requirement as adopted, the
 * objection being to the requirement, or on a case the owner kept and the examination now finds wrong: only the
 * owner says whether the need changes. Keeping it keeps the case and the protocol; revising it rewrites the
 * specification. No option accepts the candidate.
 */
const CONTESTED_REQUIREMENT = {
	fr: ({ requirement_id, case_name, kept }: ContestedCase) => ({
		question: kept
			? `Vous avez répondu « garder » sur le cas gelé « ${case_name} » de ${requirement_id} ; le producteur le conteste de nouveau et l'examen conclut cette fois que le cas affirme ce que ${requirement_id} ne dit pas. Le cas n'est pas réécrit sans vous : que décider ?`
			: `Le cas gelé « ${case_name} » de ${requirement_id} est contesté par le producteur ; l'examen conclut qu'il exprime ${requirement_id} tel que vous l'avez adoptée et que l'objection porte sur l'exigence elle-même. Que décider ?`,
		options: [
			{
				id: "revise",
				label: "Réviser l'exigence (dire en texte libre ce qu'elle doit devenir)",
				effect:
					"La spécification est refaite avec votre consigne et vous adoptez les nouvelles exigences comme les premières ; les exigences, le protocole et la préparation adoptés jusque-là ne sont plus en vigueur, et les preuves déjà obtenues ne comptent plus.",
				risky: true,
			},
			{
				id: "keep",
				label: "Garder l'exigence",
				effect: "Le cas et le protocole gelés restent tels quels ; le code est à corriger dans une nouvelle tentative.",
				risky: false,
			},
		],
	}),
	en: ({ requirement_id, case_name, kept }: ContestedCase) => ({
		question: kept
			? `You answered "keep" on the frozen case "${case_name}" of ${requirement_id}; the producer contests it again and the examination now finds that the case asserts what ${requirement_id} does not say. The case is not rewritten without you: what should be done?`
			: `The frozen case "${case_name}" of ${requirement_id} is contested by the producer; the examination finds that it asserts ${requirement_id} as you adopted it and that the objection is to the requirement itself. What should be done?`,
		options: [
			{
				id: "revise",
				label: "Revise the requirement (say in free text what it should become)",
				effect:
					"The specification is redone with your instruction and you adopt the new requirements like the first ones; the requirements, protocol and preparation adopted so far no longer hold, and the evidence already obtained no longer counts.",
				risky: true,
			},
			{
				id: "keep",
				label: "Keep the requirement",
				effect: "The frozen case and protocol stay as they are; the code is to be corrected in a new attempt.",
				risky: false,
			},
		],
	}),
} as const;

/** What an IH-04 asked on a survey offers to adopt: the quality referential of a stack, and the packages its manager brings. */
export interface ReferentialOffer {
	stack: string;
	installs: readonly PackageInstall[];
}

/** The capability that brings a referential, all of whose packages one manager brings. */
function referentialInstaller(offer: ReferentialOffer, installers: Installers): InstallCapability {
	const manager = offer.installs[0]?.manager ?? "";
	const install = installers(manager);
	if (install === undefined) throw new Error(`no technology of 495 runs ${manager}, which brings the referential`);
	return install;
}

const stackName = (stack: string): string => `${stack.charAt(0).toUpperCase()}${stack.slice(1)}`;

/**
 * IH-04 asked on a survey whose quality requirement no control measures while the adapter proposes a
 * referential that would: the owner adopts it, which brings its packages into a copy with the manager of
 * its technology, or leaves the requirement a blind spot. Nothing is prepared and nothing is assigned: a
 * survey writes nothing.
 */
const REFERENTIAL_ADOPTION = {
	fr: (requirements: string, offer: ReferentialOffer, installers: Installers) => {
		const names = installedNames(offer.installs);
		const install = referentialInstaller(offer, installers);
		const said = install.phrases.fr;
		const resolves = install.form === "resolve";
		return {
			question: `Aucun contrôle ne mesure ${requirements}. Adopter le référentiel de qualité proposé pour ${stackName(offer.stack)} ?`,
			options: [
				{
					id: "adopt_referential",
					label: `Adopter le référentiel (${said.referentialLabel(names)}, réseau ouvert pour cette seule étape)`,
					effect: `495 ${said.referentialDoes(names)}, en ouvrant le réseau pour cette seule étape et ${said.runsNothing} ; ${said.referentialInspected} ; rien n'est écrit dans le projet. Le référentiel est gelé dans le protocole avec la date de cette décision, et l'état des lieux mesure l'exigence avec lui. Si ${resolves ? "la résolution" : "l'installation"} échoue, rien n'est adopté et l'exigence reste un angle mort avec la raison donnée par ${install.title}. La réponse tombe si les exigences sont révisées.`,
					risky: true,
				},
				{
					id: "leave_blind_spot",
					label: "Laisser l'exigence en angle mort",
					effect: `${resolves ? "Rien n'est résolu" : "Rien n'est installé"} et le réseau reste fermé ; l'état des lieux nomme l'exigence comme angle mort, parce que le référentiel proposé n'a pas été adopté. La réponse tombe si les exigences sont révisées.`,
					risky: false,
				},
			],
		};
	},
	en: (requirements: string, offer: ReferentialOffer, installers: Installers) => {
		const names = installedNames(offer.installs);
		const install = referentialInstaller(offer, installers);
		const said = install.phrases.en;
		const resolves = install.form === "resolve";
		return {
			question: `No control measures ${requirements}. Adopt the quality referential proposed for ${stackName(offer.stack)}?`,
			options: [
				{
					id: "adopt_referential",
					label: `Adopt the referential (${said.referentialLabel(names)}, network open for that step alone)`,
					effect: `495 ${said.referentialDoes(names)}, opening the network for that step alone and ${said.runsNothing}; ${said.referentialInspected}; nothing is written in the project. The referential is frozen in the protocol with the date of this decision, and the survey measures the requirement with it. If ${resolves ? "the resolution" : "the install"} fails, nothing is adopted and the requirement stays a blind spot with the reason ${install.title} gave. The answer lapses if the requirements are revised.`,
					risky: true,
				},
				{
					id: "leave_blind_spot",
					label: "Leave the requirement a blind spot",
					effect: `${resolves ? "Nothing is resolved" : "Nothing is installed"} and the network stays closed; the survey names the requirement as a blind spot, because the proposed referential was not adopted. The answer lapses if the requirements are revised.`,
					risky: false,
				},
			],
		};
	},
} as const;

/**
 * How adopting a proposed architecture map has it verified: the packages a manager brings into a copy to check
 * its rules, or, when none can, why no control will verify it.
 */
export interface MapVerificationOffer {
	installs: readonly PackageInstall[];
	unverified: string | null;
	/** The parts whose style has no internal rule a control checks, only their relations and their cycles. */
	unchecked_parts?: readonly string[];
}

/** The phrases of the manager that brings the analyser of the map, when one does, and the name it goes by. */
function verifier(offer: MapVerificationOffer, installers: Installers) {
	const [first] = offer.installs;
	const install = first === undefined ? undefined : installers(first.manager);
	const said = install?.phrases;
	return install && said?.fr.architecture && said.en.architecture
		? {
				fr: said.fr.architecture,
				en: said.en.architecture,
				names: installedNames(offer.installs),
				title: install.title,
				resolves: install.form === "resolve",
				/** Whether the verification is the work of several packages, which the sentences that name it agree with. */
				several: offer.installs.length > 1,
			}
		: null;
}

/**
 * IH-04 asked on a survey whose requirement about the architecture a model proposed a map for: the owner
 * adopts the map, and with it its verification, asks for another proposal with a remark, or leaves the
 * requirement a blind spot. Nothing is written in the project whatever the answer.
 */
const ARCHITECTURE_MAP_ADOPTION = {
	fr: (requirements: string, offer: MapVerificationOffer, installers: Installers) => {
		const verified = verifier(offer, installers);
		const frozen =
			"La carte devient l'architecture que le projet déclare : elle est gelée dans le protocole avec la date de cette décision et présentée dans le rapport";
		return {
			question: `Adopter la carte d'architecture proposée pour ${requirements} ?`,
			options: [
				{
					id: "adopt_map",
					label:
						verified === null
							? "Adopter la carte"
							: `Adopter la carte et sa vérification (${verified.fr.label(verified.names)}, réseau ouvert pour cette seule étape)`,
					effect:
						verified === null
							? `${frozen} ; rien n'est écrit dans le projet. Aucun contrôle ne vérifiera la carte${offer.unverified === null ? "" : ` : ${offer.unverified}`}. La réponse tombe si les exigences sont révisées.`
							: `${frozen}. 495 ${verified.fr.does(verified.names)}, en ouvrant le réseau pour cette seule étape ; ${verified.fr.inspected} ; rien n'est écrit dans le projet. Les règles que 495 écrit depuis la carte sont alors vérifiées, à chaque exécution : le style de chaque partie, les relations permises entre parties, l'absence de cycle et les sources qu'aucune partie ne couvre ; ${(offer.unchecked_parts ?? []).map((part) => `les règles internes de la partie ${part} ne sont pas vérifiées, seules ses relations et l'absence de cycle l'étant ; `).join("")}${verified.fr.alongside ?? ""}l'état des lieux mesure l'exigence avec ${verified.several ? "eux" : "lui"}. Si ${verified.resolves ? "la résolution" : "l'installation"} échoue, la carte est gelée sans contrôle d'architecture et l'exigence reste un angle mort avec la raison donnée par ${verified.title}. La réponse tombe si les exigences sont révisées.`,
					risky: true,
				},
				{
					id: "propose_map_again",
					label: "Demander une nouvelle proposition (votre remarque en texte libre)",
					effect:
						"Une nouvelle intervention en lecture seule reçoit cette carte et votre remarque, et propose une autre carte, qui vous est présentée avec les mêmes issues.",
					risky: false,
				},
				{
					id: "leave_blind_spot",
					label: "Laisser l'exigence en angle mort",
					effect:
						"Aucune carte n'est gelée ; l'état des lieux nomme l'exigence comme angle mort, parce que la carte proposée n'a pas été adoptée.",
					risky: false,
				},
			],
		};
	},
	en: (requirements: string, offer: MapVerificationOffer, installers: Installers) => {
		const verified = verifier(offer, installers);
		const frozen =
			"The map becomes the architecture the project declares: it is frozen in the protocol with the date of this decision and presented in the report";
		return {
			question: `Adopt the architecture map proposed for ${requirements}?`,
			options: [
				{
					id: "adopt_map",
					label:
						verified === null
							? "Adopt the map"
							: `Adopt the map and its verification (${verified.en.label(verified.names)}, network open for that step alone)`,
					effect:
						verified === null
							? `${frozen}; nothing is written in the project. No control will verify the map${offer.unverified === null ? "" : `: ${offer.unverified}`}. The answer lapses if the requirements are revised.`
							: `${frozen}. 495 ${verified.en.does(verified.names)}, opening the network for that step alone; ${verified.en.inspected}; nothing is written in the project. The rules 495 writes from the map are then checked, at each run: the style of each part, the relations permitted between parts, the absence of cycles and the sources no part covers; ${(offer.unchecked_parts ?? []).map((part) => `the internal rules of part ${part} are not verified, only its relations and the absence of cycles are; `).join("")}${verified.en.alongside ?? ""}the survey measures the requirement with ${verified.several ? "them" : "it"}. If ${verified.resolves ? "the resolution" : "the install"} fails, the map is frozen with no architecture control and the requirement stays a blind spot with the reason ${verified.title} gave. The answer lapses if the requirements are revised.`,
					risky: true,
				},
				{
					id: "propose_map_again",
					label: "Ask for another proposal (your remark as free text)",
					effect:
						"A new read-only intervention receives this map and your remark, and proposes another map, which is presented to you with the same options.",
					risky: false,
				},
				{
					id: "leave_blind_spot",
					label: "Leave the requirement a blind spot",
					effect:
						"No map is frozen; the survey names the requirement as a blind spot, because the proposed map was not adopted.",
					risky: false,
				},
			],
		};
	},
} as const;

/** An alternative of an architecture recommendation, as the option that chooses it names it. */
export type RecommendedAlternative = Pick<
	ArchitectureRecommendation["alternatives"][number],
	"alternative_id" | "nature" | "description"
>;

const NATURES = {
	fr: { keep: "conserver", adjust: "ajuster", transform: "transformer" },
	en: { keep: "keep", adjust: "adjust", transform: "transform" },
} as const;

/**
 * IH-05 asked on a survey whose adopted architecture map a model recommended alternatives for: the owner chooses
 * one, asks for another analysis with a remark, or leaves the choice pending. Nothing is written in the project and
 * no verdict changes whatever the answer.
 */
const RECOMMENDATION_CHOICE = {
	fr: (alternatives: readonly RecommendedAlternative[]) => ({
		question: "Quelle alternative retenir pour l'architecture du projet ?",
		options: [
			...alternatives.map((a) => ({
				id: a.alternative_id,
				label: `Choisir ${a.alternative_id} (${NATURES.fr[a.nature]}) : ${a.description}`,
				effect:
					"L'alternative est enregistrée comme choisie avec la date de cette décision et présentée dans le rapport ; rien n'est écrit dans le projet et aucun verdict ne change. L'état des lieux vous est ensuite soumis pour acceptation.",
				risky: false,
			})),
			{
				id: "ask_analysis",
				label: "Demander une autre analyse (votre remarque en texte libre)",
				effect:
					"Une nouvelle intervention en lecture seule reçoit cette recommandation et votre remarque, et propose une autre recommandation, qui vous est présentée avec les mêmes issues.",
				risky: false,
			},
			{
				id: "suspend",
				label: "Laisser le choix en suspens",
				effect:
					"Aucune alternative n'est enregistrée comme choisie ; le rapport présente les alternatives et dit que vous avez laissé le choix en suspens. L'état des lieux vous est ensuite soumis pour acceptation.",
				risky: false,
			},
		],
	}),
	en: (alternatives: readonly RecommendedAlternative[]) => ({
		question: "Which alternative should the architecture of the project take?",
		options: [
			...alternatives.map((a) => ({
				id: a.alternative_id,
				label: `Choose ${a.alternative_id} (${NATURES.en[a.nature]}): ${a.description}`,
				effect:
					"The alternative is recorded as chosen with the date of this decision and presented in the report; nothing is written in the project and no verdict changes. The survey is then put to your acceptance.",
				risky: false,
			})),
			{
				id: "ask_analysis",
				label: "Ask for another analysis (your remark as free text)",
				effect:
					"A new read-only intervention receives this recommendation and your remark, and proposes another recommendation, which is presented to you with the same options.",
				risky: false,
			},
			{
				id: "suspend",
				label: "Leave the choice pending",
				effect:
					"No alternative is recorded as chosen; the report presents the alternatives and says you left the choice pending. The survey is then put to your acceptance.",
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

/**
 * The question and the options of a decision: those of the acceptance of a survey, of the adoption of what
 * an IH-04 offers on a survey instead of a preparation, or else those of its interaction.
 */
function questionOf(args: Parameters<typeof buildDecisionRequest>[0], surveyed: boolean, installers: Installers) {
	if (surveyed) return SURVEY_ACCEPTANCE[args.language];
	if (args.interaction === "IH-05") return RECOMMENDATION_CHOICE[args.language](args.alternatives ?? []);
	if (args.interaction === "IH-04" && args.contested) return CONTESTED_REQUIREMENT[args.language](args.contested);
	if (args.interaction === "IH-04" && args.referential)
		return REFERENTIAL_ADOPTION[args.language](args.arg ?? "", args.referential, installers);
	if (args.interaction === "IH-04" && args.architecture_map)
		return ARCHITECTURE_MAP_ADOPTION[args.language](args.arg ?? "", args.architecture_map, installers);
	return T[args.language][args.interaction](args.arg ?? "");
}

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
	/** The contested frozen case an IH-04 asks the owner whether the need changes for. */
	contested?: ContestedCase;
	/** The quality referential an IH-04 asked on a survey offers instead of a preparation. */
	referential?: ReferentialOffer;
	/** How the architecture map an IH-04 asked on a survey proposes instead of a preparation would be verified. */
	architecture_map?: MapVerificationOffer;
	/** The alternatives of the architecture recommendation an IH-05 asked on a survey offers to choose from. */
	alternatives?: readonly RecommendedAlternative[];
	/** The install capability that runs a package manager, whose phrases say what adopting its packages does. */
	installers?: Installers;
	requested_at: string;
}): DecisionRequest {
	const installers = args.installers ?? (() => undefined);
	// The only IH-10 asked on an artifact is the acceptance of a survey; a candidate's is asked on the candidate.
	const surveyed = args.interaction === "IH-10" && args.subject.kind === "artifact";
	const t = questionOf(args, surveyed, installers);
	const adoptable = args.interaction === "IH-04" ? (args.adoptable ?? { files: [], installs: [] }) : null;
	const options =
		adoptable !== null && (adoptable.files.length > 0 || adoptable.installs.length > 0)
			? [...t.options, ADOPT_COMPLEMENT[args.language](adoptable, installers)]
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
			args.interaction === "IH-05" ||
			args.interaction === "IH-07" ||
			surveyed,
		requested_at: args.requested_at,
		expires_at: null,
		language: args.language,
	};
}
