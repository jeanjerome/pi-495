/**
 * What a story's dossier says of the way it was made, measured from its journal and its branch: how long it took
 * to land, what it cost, how often it waited for the owner, what review and the acceptance run found, and what was
 * reworked after the red-green — test revisions apart from code corrections, since a revised test changes what the
 * story proves where a corrected line only changes how it keeps it. A value the dossier does not hold stays `null`:
 * a journal written before sessions carried their cost has no cost, not a cost of zero.
 *
 * Stories are grouped by the profile they were made under, and each profile is compared with the simple one: a means
 * that costs more without finding fewer defects at the acceptance run is reserved to the stories whose risk
 * justifies it. A recommendation chooses means, never obligations: what the cycle requires of every change of that
 * path stays required, whatever time dropping it would save.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commitsDetailles, type CommitDetaille } from "./git.ts";
import type { Etape, Evenement } from "./journal.ts";
import { manifestesRetenus } from "./preparation.ts";
import { lireStory } from "./story.ts";

interface Mesures {
	story: string;
	/** From the first event to the landing; null for a story that has not landed. */
	duree_totale_ms: number | null;
	/** The time spent in each step, the owner's waits included, summed over each run of the step. */
	duree_par_pas_ms: Partial<Record<Etape, number>>;
	/** What the sessions reported spending; null when none reported a cost. */
	cout_usd: number | null;
	/** The times the story waited for the owner, the waits the tool answered in their place left out. */
	interventions: number;
	/** The agreements an independent session gave in the owner's place. */
	arbitrages_automate: number;
	tours_de_relecture: number;
	constats_de_relecture: number;
	/** The gaps the acceptance run found, each sending the story back to the red-green. */
	ecarts_de_recette: number;
	/** The sessions that returned no output and the steps that blocked. */
	incidents: number;
	/** Commits after the red-green that remove or rewrite lines of a test; null when the branch is not in reach. */
	revisions_de_tests: number | null;
	/** Commits after the red-green that change code; null when the branch is not in reach. */
	reprises_de_code: number | null;
}

interface Profil {
	stories: string[];
	mediane_duree_ms: number | null;
	mediane_cout_usd: number | null;
}

interface Recommandation {
	profil: string;
	recommandation: string;
	/** What the cycle keeps requiring of every change made under this profile. */
	obligations_maintenues: string[];
	/** Always empty: a profile slower than another is never made faster by dropping what its path requires. */
	obligations_retirees: string[];
}

interface Bilan {
	stories: Mesures[];
	/** The median time to landing of the stories that landed; null when none did. */
	mediane_duree_ms: number | null;
	profils: Record<string, Profil>;
	recommandations: Recommandation[];
}

/** The profile the others are compared with: a story made with examples alone. */
const REFERENCE = "simple";

/** The profile of a story whose companion keeps a state model TLC explores. */
const PROFIL_A_ETATS = "tla";

/** What a story's path requires (`cycle/README.md` § The six steps), and what a refactoring's requires (`D-80`). */
const OBLIGATIONS = {
	story: [
		"le rouge vu sur l'assertion annoncée avant le code",
		"deux relecteurs indépendants, deux tours au plus",
		"une recette réelle avec un témoin négatif",
		"une Preflight verte avant le versement",
	],
	reprise: [
		"une Preflight verte, sans moins de tests qu'avant",
		"aucune assertion de test retirée",
		"une relecture indépendante du diff",
	],
};

/** The journal a landed story exported, or the one still under the cycle's directory. */
function evenementsDe(story: string, root: string, racine: string): Evenement[] {
	const chemins = [join(root, "specs", "verifications", story, "journal.jsonl"), join(racine, story, "journal.jsonl")];
	const chemin = chemins.find((c) => existsSync(c));
	if (!chemin) throw new Error(`${story} has no journal: neither ${chemins.join(" nor ")} exists`);
	return readFileSync(chemin, "utf8")
		.split("\n")
		.filter((l) => l.length > 0)
		.map((l) => JSON.parse(l) as Evenement);
}

function ms(e: Evenement): number {
	return Date.parse(e.at);
}

/** Each run of consecutive events of one step lasts from its first event to its last. */
function dureeParPas(evenements: Evenement[]): Partial<Record<Etape, number>> {
	const durees: Partial<Record<Etape, number>> = {};
	let debut = 0;
	for (let i = 0; i < evenements.length; i++) {
		const e = evenements[i]!;
		const suivant = evenements[i + 1];
		if (suivant?.pas === e.pas) continue;
		durees[e.pas] = (durees[e.pas] ?? 0) + ms(e) - ms(evenements[debut]!);
		debut = i + 1;
	}
	return durees;
}

function cout(evenements: Evenement[]): number | null {
	const couts = evenements.filter((e) => e.genre === "session" && typeof e.cout_usd === "number");
	return couts.length === 0 ? null : couts.reduce((sum, e) => sum + Number(e.cout_usd), 0);
}

/**
 * Whether the wait at `i` was answered by the tool in the owner's place: unattended, the agreement after the acceptance
 * run is an arbitration, and a promise the review left unkept reopens the review, each written right after the wait,
 * the arbitration's session aside. Both are counted where they belong, not as the owner's.
 */
function trancheeParLAutomate(evenements: Evenement[], i: number): boolean {
	const suite = evenements.slice(i + 1).find((e) => e.genre !== "session");
	return suite?.genre === "arbitrage" || (suite?.genre === "rouvert" && suite.pas === "relecture");
}

const HORS_CODE = /^(test\/|specs\/|dist\/)|\.md$/;

/** The commits made on the story's branch after the red-green, or null when the journal or git cannot say which. */
function commitsApresRougeVert(evenements: Evenement[], root: string): CommitDetaille[] | null {
	const branche = evenements.find((e) => e.genre === "branche")?.nom;
	const apres = evenements.find((e) => e.pas === "autocontrole" && e.genre === "debute")?.revision;
	if (typeof branche !== "string" || typeof apres !== "string") return null;
	return commitsDetailles(root, apres, branche);
}

function mesurer(story: string, evenements: Evenement[], root: string): Mesures {
	const de = (genre: string, pas?: Etape) => evenements.filter((e) => e.genre === genre && (!pas || e.pas === pas));
	const verse = de("verse").at(-1) ?? de("versement", "reprise").at(-1);
	const apres = commitsApresRougeVert(evenements, root);
	return {
		story,
		duree_totale_ms: verse && evenements[0] ? ms(verse) - ms(evenements[0]) : null,
		duree_par_pas_ms: dureeParPas(evenements),
		cout_usd: cout(evenements),
		interventions: evenements.filter((e, i) => e.genre === "proprietaire" && !trancheeParLAutomate(evenements, i))
			.length,
		arbitrages_automate: de("arbitrage").length,
		tours_de_relecture: de("tour").length,
		constats_de_relecture: de("tour").reduce((sum, e) => sum + Number(e.constats ?? 0), 0),
		ecarts_de_recette: de("rouvert", "recette").length,
		incidents: de("bloque").length + de("session").filter((e) => e.ok === false).length,
		revisions_de_tests:
			apres?.filter((c) => c.changements.some((x) => x.chemin.startsWith("test/") && x.retirees > 0)).length ?? null,
		reprises_de_code: apres?.filter((c) => c.changements.some((x) => !HORS_CODE.test(x.chemin))).length ?? null,
	};
}

function mediane(valeurs: number[]): number | null {
	const tri = [...valeurs].sort((a, b) => a - b);
	if (tri.length === 0) return null;
	const milieu = Math.floor(tri.length / 2);
	return tri.length % 2 === 1 ? tri[milieu]! : (tri[milieu - 1]! + tri[milieu]!) / 2;
}

function connues<T>(valeurs: (T | null)[]): T[] {
	return valeurs.filter((v): v is T => v !== null);
}

function profilDe(mesures: Mesures[]): Profil {
	return {
		stories: mesures.map((m) => m.story),
		mediane_duree_ms: mediane(connues(mesures.map((m) => m.duree_totale_ms))),
		mediane_cout_usd: mediane(connues(mesures.map((m) => m.cout_usd))),
	};
}

/** Whether `a` is known to exceed `b`; an unknown value compares with nothing. */
function depasse(a: number | null, b: number | null): boolean {
	return a !== null && b !== null && a > b;
}

function ecartsParStory(mesures: Mesures[]): number {
	return mesures.reduce((sum, m) => sum + m.ecarts_de_recette, 0) / mesures.length;
}

function recommander(profil: string, mesures: Mesures[], reference: Mesures[] | undefined): string {
	if (profil === REFERENCE) return "profil de référence";
	if (!reference) return `aucun profil ${REFERENCE} mesuré : aucune adaptation proposée`;
	const [p, r] = [profilDe(mesures), profilDe(reference)];
	const plusCher = depasse(p.mediane_duree_ms, r.mediane_duree_ms) || depasse(p.mediane_cout_usd, r.mediane_cout_usd);
	if (!plusCher)
		return `le profil ${profil} ne coûte pas plus que le profil ${REFERENCE} : rien ne s'oppose à l'étendre`;
	if (ecartsParStory(mesures) < ecartsParStory(reference))
		return `garder le profil ${profil} là où le risque le justifie : il coûte plus et trouve moins de défauts en recette`;
	return `réserver le profil ${profil} aux stories dont le risque le justifie : il coûte plus que le profil ${REFERENCE} sans trouver moins de défauts en recette`;
}

/**
 * Refuses a story given under the state-machine profile when its companion keeps no state model with a manifest: the
 * profile is read in what the story was verified with, not in the label it is given, so a bilan never recommends a
 * formal means on a story that used none.
 */
function verifierProfil(profil: string | null, story: string, root: string): void {
	if (profil !== PROFIL_A_ETATS || manifestesRetenus(lireStory(story, root)).length > 0) return;
	throw new Error(
		`${story} is given under the ${PROFIL_A_ETATS} profile, and its companion keeps no modele-d-etats with a manifest: measure it under the profile of the means its companion keeps`,
	);
}

/**
 * The measurements of each story, read from its dossier and its branch, with the median time to landing, and, for the
 * stories given as `<profil>=<story>`, each profile's medians and what the bilan recommends of it.
 */
export function bilan(designations: string[], root: string, racine: string): Bilan {
	const lues = designations.map((a) => {
		const [profil, story] = a.includes("=") ? (a.split("=", 2) as [string, string]) : [null, a];
		verifierProfil(profil, story, root);
		const evenements = evenementsDe(story, root, racine);
		return { profil, reprise: evenements[0]?.pas === "reprise", mesures: mesurer(story, evenements, root) };
	});
	const parProfil = new Map<string, typeof lues>();
	for (const l of lues) if (l.profil !== null) parProfil.set(l.profil, [...(parProfil.get(l.profil) ?? []), l]);
	const reference = parProfil.get(REFERENCE)?.map((l) => l.mesures);
	return {
		stories: lues.map((l) => l.mesures),
		mediane_duree_ms: mediane(connues(lues.map((l) => l.mesures.duree_totale_ms))),
		profils: Object.fromEntries([...parProfil].map(([p, ls]) => [p, profilDe(ls.map((l) => l.mesures))])),
		recommandations: [...parProfil].map(([profil, ls]) => ({
			profil,
			recommandation: recommander(
				profil,
				ls.map((l) => l.mesures),
				reference,
			),
			obligations_maintenues: ls.every((l) => l.reprise) ? OBLIGATIONS.reprise : OBLIGATIONS.story,
			obligations_retirees: [],
		})),
	};
}
