/**
 * The verification companion of a story: a JSON file beside it, of the same stem and ending in
 * `.verification.json`, that says for each promise how it will be observed and which assertion of
 * which task holds it. The Markdown stays the text of the need; the companion only refers to its
 * scenarios and tasks by their titles and numbers. Reading it yields a diagnostic, never a refusal to
 * read the story: the companion proposes checks, it runs none and grants nothing.
 */
import { relative } from "node:path";

/** What the companion is read against: the scenarios and the tasks the story declares. */
interface StoryLue {
	id: string;
	scenarios: string[];
	taches: { numero: number }[];
}

/**
 * A means of verification as the companion selects or sets it aside. The four means combine; none is
 * implied by another, and setting one aside takes a reason.
 */
interface MoyenDeclare {
	moyen: string;
	retenu: boolean;
	raison: string | null;
	/** What the means checks: required of a selected property test, state model or Lean proof. */
	proprietes: string[];
}

/**
 * An interaction the companion declares for a promise. The tool carries it as declared: it does not
 * detect interactions, and derives no requirement from them.
 */
interface InteractionDeclaree {
	genre: string;
	description: string;
}

interface DiagnosticPromesse {
	/** The id the companion gives the promise, or null when the companion does not declare it. */
	id: string | null;
	scenario: string;
	interactions: InteractionDeclaree[];
	moyens: MoyenDeclare[];
	prete: boolean;
	/** What keeps the promise from being ready, each with what is expected. */
	manques: string[];
}

export interface DiagnosticVerification {
	compagnon: string;
	/** Every scenario of the story, in its order, with what it lacks. */
	promesses: DiagnosticPromesse[];
	/** Each invalid entry of the companion, located by its path in the JSON. */
	erreurs: string[];
	prete: boolean;
}

const VERSION = 1;
const CATEGORIES = ["nouveau-comportement", "comportement-conserve", "structure", "jugement"];
const MOYENS = ["exemples", "proprietes", "modele-d-etats", "preuve-lean"];
/** The means that check stated properties, and are incomplete without them. */
const MOYENS_A_PROPRIETES = ["proprietes", "modele-d-etats", "preuve-lean"];
const INTERACTIONS = ["revision", "reprise", "ordre-des-evenements", "effet-externe"];

/** The companion's path for the story at `chemin`. */
export function cheminDuCompagnon(chemin: string): string {
	return chemin.replace(/\.md$/, ".verification.json");
}

type Objet = Record<string, unknown>;

const estObjet = (v: unknown): v is Objet => typeof v === "object" && v !== null && !Array.isArray(v);
const texteNonVide = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

type Erreur = (chemin: string, message: string) => void;

interface PromesseLue {
	id: string;
	oracle: boolean;
	interactions: InteractionDeclaree[];
	moyens: MoyenDeclare[];
}

function lireInteractions(p: Objet, ou: string, erreur: Erreur): InteractionDeclaree[] {
	const lues: InteractionDeclaree[] = [];
	for (const [j, i] of liste(p.interactions).entries()) {
		const at = `${ou}.interactions[${j}]`;
		if (!estObjet(i)) erreur(at, "attendu : un objet { genre, description }");
		else if (!INTERACTIONS.includes(String(i.genre)))
			erreur(`${at}.genre`, `${JSON.stringify(i.genre)} inconnu ; attendu : ${INTERACTIONS.join(", ")}`);
		else if (!texteNonVide(i.description)) erreur(`${at}.description`, "absente ; attendu : l'interaction, en texte");
		else lues.push({ genre: String(i.genre), description: i.description });
	}
	return lues;
}

function lireMoyens(p: Objet, ou: string, erreur: Erreur): MoyenDeclare[] {
	const lus: MoyenDeclare[] = [];
	for (const [j, m] of liste(p.moyens).entries()) {
		const at = `${ou}.moyens[${j}]`;
		if (!estObjet(m)) erreur(at, "attendu : un objet { moyen, retenu, raison }");
		else if (!MOYENS.includes(String(m.moyen)))
			erreur(`${at}.moyen`, `${JSON.stringify(m.moyen)} inconnu ; attendu : ${MOYENS.join(", ")}`);
		else if (lus.some((l) => l.moyen === m.moyen))
			erreur(`${at}.moyen`, `${JSON.stringify(m.moyen)} déjà déclaré ; attendu : une entrée par moyen`);
		else if (typeof m.retenu !== "boolean") erreur(`${at}.retenu`, "attendu : true ou false");
		else
			lus.push({
				moyen: String(m.moyen),
				retenu: m.retenu,
				raison: texteNonVide(m.raison) ? m.raison : null,
				proprietes: liste(m.proprietes).filter(texteNonVide),
			});
	}
	return lus;
}

/** What keeps the selection of means from being complete, each with what is expected. */
function manquesDesMoyens(moyens: MoyenDeclare[]): string[] {
	const manques: string[] = [];
	for (const nom of MOYENS) {
		const m = moyens.find((x) => x.moyen === nom);
		if (!m) manques.push(`${nom} ni retenu ni écarté ; attendu : retenu, ou écarté avec sa raison`);
		else if (!m.retenu && m.raison === null)
			manques.push(`${nom} écarté sans raison ; attendu : la raison de ne pas le retenir`);
		else if (m.retenu && MOYENS_A_PROPRIETES.includes(nom) && m.proprietes.length === 0)
			manques.push(`${nom} retenu sans propriété ; attendu : les propriétés qu'il vérifie`);
	}
	if (!moyens.some((m) => m.retenu)) manques.push("aucun moyen retenu ; attendu : au moins un moyen de vérification");
	return manques;
}

/** Counts the oracles of a promise that name a task of the story, a case and an assertion. */
function compterOracles(p: Objet, ou: string, numeros: number[], erreur: Erreur): number {
	let oracles = 0;
	for (const [j, o] of liste(p.oracles).entries()) {
		const at = `${ou}.oracles[${j}]`;
		if (!estObjet(o)) erreur(at, "attendu : un objet { tache, cas, assertion }");
		else if (typeof o.tache !== "number" || !numeros.includes(o.tache))
			erreur(
				`${at}.tache`,
				`la tâche ${JSON.stringify(o.tache)} n'existe pas ; attendu : une des tâches ${numeros.join(", ")}`,
			);
		else if (!texteNonVide(o.cas) || !texteNonVide(o.assertion))
			erreur(at, "attendu : le cas (fichier de test ou dossier) et l'assertion, en texte");
		else oracles++;
	}
	return oracles;
}

function verifierDependances(p: Objet, ou: string, ids: Set<string>, erreur: Erreur): void {
	for (const [j, d] of liste(p.dependances).entries()) {
		const at = `${ou}.dependances[${j}]`;
		if (d === p.id) erreur(at, `${JSON.stringify(d)} dépend d'elle-même ; attendu : l'id d'une autre promesse`);
		else if (typeof d !== "string" || !ids.has(d))
			erreur(at, `${JSON.stringify(d)} inconnue ; attendu : l'id d'une promesse du compagnon`);
	}
}

/** Checks one promise entry, pushing a located error for each invalid field, and reads what it declares. */
function lirePromesse(p: Objet, ou: string, story: StoryLue, ids: Set<string>, erreur: Erreur): PromesseLue {
	if (!CATEGORIES.includes(String(p.categorie)))
		erreur(`${ou}.categorie`, `${JSON.stringify(p.categorie)} inconnue ; attendu : ${CATEGORIES.join(", ")}`);
	if (!texteNonVide(p.observation)) erreur(`${ou}.observation`, "absente ; attendu : l'observation attendue, en texte");
	const oracles = compterOracles(
		p,
		ou,
		story.taches.map((t) => t.numero),
		erreur,
	);
	verifierDependances(p, ou, ids, erreur);
	return {
		id: String(p.id),
		oracle: oracles > 0,
		interactions: lireInteractions(p, ou, erreur),
		moyens: lireMoyens(p, ou, erreur),
	};
}

/** Parses the companion and checks its version and story; an unreadable companion reads as `{}`. */
function lireEntete(texte: string, story: StoryLue, erreur: Erreur): Objet {
	let racine: unknown;
	try {
		racine = JSON.parse(texte);
	} catch (e) {
		erreur("(fichier)", `JSON illisible (${e instanceof Error ? e.message : String(e)}) ; attendu : un objet JSON`);
		return {};
	}
	const c = estObjet(racine) ? racine : {};
	if (!estObjet(racine)) erreur("(fichier)", "attendu : un objet JSON");
	if (c.version !== VERSION) erreur("version", `${JSON.stringify(c.version)} inconnue ; attendu : ${VERSION}`);
	if (c.story !== story.id)
		erreur("story", `${JSON.stringify(c.story)} ; attendu : ${story.id}, la story qu'il accompagne`);
	return c;
}

/** Reads every promise entry, and keeps for each scenario of the story the first entry that declares it. */
function lireDeclarations(entrees: unknown[], story: StoryLue, erreur: Erreur): Map<string, PromesseLue> {
	const ids = new Set(entrees.filter(estObjet).map((p) => String(p.id)));
	const vus = new Set<string>();
	const declarees = new Map<string, PromesseLue>();
	for (const [i, p] of entrees.entries()) {
		const ou = `promesses[${i}]`;
		if (!estObjet(p)) {
			erreur(ou, "attendu : un objet par promesse");
			continue;
		}
		if (!texteNonVide(p.id) || vus.has(p.id))
			erreur(`${ou}.id`, `${JSON.stringify(p.id)} ; attendu : un id unique dans le compagnon`);
		vus.add(String(p.id));
		const scenario = String(p.scenario);
		if (!story.scenarios.includes(scenario))
			erreur(
				`${ou}.scenario`,
				`« ${scenario} » n'est pas un scénario de la story ; attendu : un titre de ses promesses`,
			);
		else if (declarees.has(scenario))
			erreur(`${ou}.scenario`, `« ${scenario} » est déjà déclaré ; attendu : une entrée par scénario`);
		const lue = lirePromesse(p, ou, story, ids, erreur);
		if (!declarees.has(scenario)) declarees.set(scenario, lue);
	}
	return declarees;
}

/** The diagnostic of one scenario of the story, from the entry that declares it, when there is one. */
function diagnostiquerScenario(scenario: string, d: PromesseLue | undefined): DiagnosticPromesse {
	const manques: string[] = [];
	if (!d?.oracle)
		manques.push(
			`sans oracle : aucune assertion d'une tâche ne lui est liée${d ? "" : ", le compagnon ne la déclare pas"} ; attendu : un cas et son assertion`,
		);
	if (d) manques.push(...manquesDesMoyens(d.moyens));
	return {
		id: d?.id ?? null,
		scenario,
		interactions: d?.interactions ?? [],
		moyens: d?.moyens ?? [],
		prete: manques.length === 0,
		manques,
	};
}

/** The diagnostic of `texte`, the companion at `compagnon`, read against the story it accompanies. */
export function diagnostiquer(texte: string, compagnon: string, story: StoryLue): DiagnosticVerification {
	const erreurs: string[] = [];
	const erreur: Erreur = (chemin, message) => {
		erreurs.push(`${compagnon}: ${chemin}: ${message}`);
	};
	const declarees = lireDeclarations(liste(lireEntete(texte, story, erreur).promesses), story, erreur);
	const promesses = story.scenarios.map((scenario) => diagnostiquerScenario(scenario, declarees.get(scenario)));
	return { compagnon, promesses, erreurs, prete: erreurs.length === 0 && promesses.every((p) => p.prete) };
}

/** How many invalid references an account names before it only counts the rest. */
const ERREURS_CITEES = 3;

/**
 * A bounded account of a diagnostic, for a prompt or the state of the cycle: the companion by its
 * path, each promise not ready by its title and what it lacks, and the first invalid references.
 * It never copies the story or the companion, which the reader opens by the path.
 */
export function resumeDeVerification(d: DiagnosticVerification | null, root: string): string {
	if (!d) return "sans compagnon de vérification";
	const compagnon = relative(root, d.compagnon);
	const lignes = [`compagnon ${compagnon} : ${d.prete ? "prête" : "incomplète"}`];
	for (const p of d.promesses.filter((x) => !x.prete))
		lignes.push(`non vérifiée « ${p.scenario} » : ${p.manques.join(" ; ")}`);
	for (const e of d.erreurs.slice(0, ERREURS_CITEES))
		lignes.push(`référence invalide ${e.slice(d.compagnon.length + 2)}`);
	if (d.erreurs.length > ERREURS_CITEES)
		lignes.push(`… et ${d.erreurs.length - ERREURS_CITEES} autre(s) référence(s) invalide(s)`);
	return lignes.join("\n");
}
