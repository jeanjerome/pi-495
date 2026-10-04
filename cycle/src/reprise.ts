/**
 * The short path of a refactoring that changes no behaviour (`specs/adr/D-80`): the next refactoring
 * `specs/reprises.md` lists is done by one session on its own branch, the tool checks what it can
 * without a model — a commit, a clean tree, no assertion of the tests lost, Preflight green after a
 * rebuild, as many tests as before — then a fresh session reads the diff for a behaviour change. A
 * refactoring that passes lands on `main` as one commit that marks it landed in the list; the run
 * goes on to the next, and stops, with the reason, at the first that does not pass. Nothing is pushed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Controle, Executeur, Preuve } from "./controls.ts";
import {
	arbreDetache,
	arbrePropre,
	brancheCourante,
	commiter,
	commitsEntre,
	fichiersChanges,
	git,
	retirerArbre,
	revision,
} from "./git.ts";
import { invite } from "./invite.ts";
import { Journal } from "./journal.ts";
import { sessionInscrite, type Session } from "./session.ts";

export interface Reprise {
	id: string;
	titre: string;
	/** `à faire`, `versée`, or `écartée — <raison>`. */
	statut: string;
	/** The section below its status line: where, what the audit read, the change, the rule, the limit. */
	corps: string;
}

const TITRE = /^## (R\d+) — (.+?)\s*$/;
const STATUT = /^Statut : (.+?)\s*$/;
const A_FAIRE = "à faire";

function cheminDeLaListe(root: string): string {
	return join(root, "specs", "reprises.md");
}

export function lireReprises(root: string, chemin = cheminDeLaListe(root)): Reprise[] {
	const reprises: Reprise[] = [];
	for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
		const t = TITRE.exec(ligne);
		if (t) {
			reprises.push({ id: t[1]!, titre: t[2]!, statut: "", corps: "" });
			continue;
		}
		const courante = reprises.at(-1);
		if (!courante) continue;
		const s = STATUT.exec(ligne);
		if (s && courante.statut === "") courante.statut = s[1]!;
		else courante.corps += `${ligne}\n`;
	}
	return reprises.map((r) => ({ ...r, corps: r.corps.trim() }));
}

/** Rewrites the status line of one section; the rest of the list is left as written. */
export function marquerReprise(root: string, id: string, statut: string, chemin = cheminDeLaListe(root)): void {
	const lignes = readFileSync(chemin, "utf8").split("\n");
	const debut = lignes.findIndex((l) => TITRE.exec(l)?.[1] === id);
	const i = debut < 0 ? -1 : lignes.findIndex((l, n) => n > debut && STATUT.test(l));
	if (i < 0) throw new Error(`${chemin}: no status line for ${id}`);
	lignes[i] = `Statut : ${statut}`;
	writeFileSync(chemin, lignes.join("\n"));
}

const ASSERTION = /\bassert\b/;

/**
 * The assertion lines of a unified diff of `test/` that are removed and do not come back as written:
 * a refactoring may move an assertion, never rewrite nor drop it. Indentation does not count.
 */
export function assertionsPerdues(diff: string): string[] {
	const ajoutees = new Map<string, number>();
	const retirees: string[] = [];
	for (const ligne of diff.split("\n")) {
		if (ligne.startsWith("+++") || ligne.startsWith("---")) continue;
		const texte = ligne.slice(1).trim();
		if (!ASSERTION.test(texte)) continue;
		if (ligne.startsWith("+")) ajoutees.set(texte, (ajoutees.get(texte) ?? 0) + 1);
		else if (ligne.startsWith("-")) retirees.push(texte);
	}
	return retirees.filter((texte) => {
		const n = ajoutees.get(texte) ?? 0;
		if (n === 0) return true;
		ajoutees.set(texte, n - 1);
		return false;
	});
}

/** The number of tests the last summary of a node:test run reports, spec (`ℹ`) or TAP (`#`). */
export function nombreDeTests(sortie: string): number | null {
	const comptes = [...sortie.matchAll(/^(?:ℹ|#) tests (\d+)\s*$/gm)];
	const dernier = comptes.at(-1);
	return dernier ? Number(dernier[1]) : null;
}

export interface OptionsReprises {
	root: string;
	/** Where each refactoring's journal and the objects it cites live. */
	racine: string;
	cible: string;
	executeur: Executeur;
	preflight: Controle;
	/** Rebuilds `dist/`, which Preflight compares with `src/`. */
	build: Controle;
	claude?: string;
	/** How many refactorings one run lands or sets aside before it hands back. */
	max?: number;
	annonce?: (texte: string) => void;
	suivi?: (nom: string, ligne: string) => void;
}

class Arret extends Error {}

const MESSAGE = /^(refactor|test|chore|docs|perf): \S/;

const SCHEMA_REPRISE = {
	type: "object",
	properties: {
		status: { type: "string", enum: ["faite", "ecartee"] },
		message: { type: "string" },
		raison: { type: "string" },
		resume: { type: "string" },
	},
	required: ["status", "message", "raison", "resume"],
};

const SCHEMA_RELECTURE = {
	type: "object",
	properties: {
		verdict: { type: "string", enum: ["constant", "change"] },
		constats: {
			type: "array",
			items: {
				type: "object",
				properties: { fichier: { type: "string" }, constat: { type: "string" } },
				required: ["fichier", "constat"],
			},
		},
		resume: { type: "string" },
	},
	required: ["verdict", "constats", "resume"],
};

async function sessionDeReprise(
	o: OptionsReprises,
	journal: Journal,
	nom: string,
	texte: string,
	schema: Record<string, unknown>,
	cwd: string,
): Promise<Session> {
	const s = await sessionInscrite(journal, "reprise", nom, { invite: texte, schema, cwd }, o);
	if (!s.ok || !s.sortie) throw new Arret(`session ${nom}: ${s.resume}`);
	return s;
}

async function controler(o: OptionsReprises, journal: Journal, c: Controle, id: string): Promise<Preuve> {
	o.annonce?.(`${c.id} à ${revision(o.root).slice(0, 7)}…`);
	const preuve = await o.executeur.executer(c, o.root, id);
	journal.inscrire("reprise", "controle", { ...preuve });
	return preuve;
}

/** Rebuilds `dist/`, runs Preflight, and answers the number of tests it ran. */
async function preflightVerte(o: OptionsReprises, journal: Journal, id: string): Promise<number> {
	const build = await controler(o, journal, o.build, id);
	if (build.verdict !== "PASS") throw new Arret(`${o.build.id} ${build.verdict} at ${revision(o.root).slice(0, 7)}`);
	const preuve = await controler(o, journal, o.preflight, id);
	if (preuve.verdict !== "PASS")
		throw new Arret(
			`Preflight ${preuve.verdict} at ${revision(o.root).slice(0, 7)}: ${preuve.echecs.slice(0, 5).join("; ")}`,
		);
	const stdout = preuve.artifacts.find((a) => a.name === "stdout");
	const octets = stdout ? await journal.objets.get(stdout.ref) : null;
	const n = octets ? nombreDeTests(new TextDecoder().decode(octets)) : null;
	if (n === null) throw new Arret("Preflight passed without a test summary the tool can read");
	return n;
}

type Issue = { versee: true; tests: number } | { versee: false };

/** One refactoring, from its branch to its landing or its setting aside. */
async function conduire(o: OptionsReprises, r: Reprise, testsAvant: number): Promise<Issue> {
	const journal = new Journal(r.id.toLowerCase(), o.racine);
	const base = revision(o.root);
	const branche = `reprise-${r.id.toLowerCase()}`;
	git(o.root, ["checkout", "-q", "-B", branche]);
	journal.inscrire("reprise", "debute", { revision: base, branche });
	const champs = { id: r.id, titre: r.titre, corps: r.corps, branche, base };
	const s = await sessionDeReprise(o, journal, "reprise", invite("reprise", champs), SCHEMA_REPRISE, o.root);
	const sortie = s.sortie as { status: string; message: string; raison: string };
	if (!arbrePropre(o.root)) throw new Arret(`${r.id}: the session left the tree modified`);
	if (sortie.status === "ecartee") {
		if (commitsEntre(o.root, base).length > 0) throw new Arret(`${r.id}: set aside, but the branch carries commits`);
		git(o.root, ["checkout", "-q", o.cible]);
		git(o.root, ["branch", "-q", "-D", branche]);
		const raison = sortie.raison.trim().split("\n")[0] || "sans raison donnée";
		marquerReprise(o.root, r.id, `écartée — ${raison}`);
		commiter(o.root, `docs: the refactoring list sets ${r.id} aside`, ["specs/reprises.md"]);
		journal.inscrire("reprise", "ecartee", { raison });
		o.annonce?.(`${r.id} écartée : ${raison}`);
		return { versee: false };
	}
	const message = sortie.message.trim().split("\n")[0] ?? "";
	if (!MESSAGE.test(message))
		throw new Arret(`${r.id}: the commit message is not one line of the cycle's form: ${message}`);
	if (commitsEntre(o.root, base).length === 0) throw new Arret(`${r.id}: the session committed nothing`);
	if (fichiersChanges(o.root, base).includes("specs/reprises.md"))
		throw new Arret(`${r.id}: the session modified specs/reprises.md, which the tool writes`);
	const perdues = assertionsPerdues(git(o.root, ["diff", "-U0", `${base}...HEAD`, "--", "test/"]));
	if (perdues.length > 0)
		throw new Arret(
			`${r.id}: assertions of the tests are rewritten or removed:\n${perdues.map((p) => `- ${p}`).join("\n")}`,
		);
	const tests = await preflightVerte(o, journal, r.id);
	if (tests < testsAvant) throw new Arret(`${r.id}: Preflight ran ${tests} tests, ${testsAvant} before`);
	const tete = revision(o.root);
	const arbre = arbreDetache(o.root, tete);
	let relecture: Session;
	try {
		const texte = invite("reprise-relecture", { id: r.id, titre: r.titre, corps: r.corps, base, tete });
		relecture = await sessionDeReprise(o, journal, "relecture", texte, SCHEMA_RELECTURE, arbre);
	} finally {
		retirerArbre(o.root, arbre);
	}
	const avis = relecture.sortie as { verdict: string; constats: { fichier: string; constat: string }[] };
	journal.inscrire("reprise", "relecture", { verdict: avis.verdict, constats: avis.constats });
	if (avis.verdict !== "constant")
		throw new Arret(
			`${r.id}: the review sees a behaviour change or a change beyond the refactoring:\n${avis.constats.map((c) => `- ${c.fichier} : ${c.constat}`).join("\n")}`,
		);
	git(o.root, ["checkout", "-q", o.cible]);
	git(o.root, ["merge", "--squash", "-q", branche]);
	marquerReprise(o.root, r.id, "versée");
	commiter(o.root, message, ["specs/reprises.md"]);
	git(o.root, ["branch", "-q", "-D", branche]);
	journal.inscrire("reprise", "versement", { commit: revision(o.root), message });
	o.annonce?.(`${r.id} versée : ${message}`);
	return { versee: true, tests };
}

/** Runs the refactorings of the list in order. Returns 0 when none is left or the run's ceiling is reached, else 1. */
export async function reprendre(o: OptionsReprises): Promise<number> {
	let testsAvant: number | null = null;
	const max = o.max ?? Number.POSITIVE_INFINITY;
	try {
		for (let faites = 0; faites < max; faites++) {
			if (brancheCourante(o.root) !== o.cible)
				throw new Arret(`the run starts from ${o.cible}, not ${brancheCourante(o.root)}`);
			if (!arbrePropre(o.root)) throw new Arret("the run starts from a clean tree: files are modified");
			const r = lireReprises(o.root).find((x) => x.statut === A_FAIRE);
			if (!r) {
				o.annonce?.("aucune reprise à faire : la liste est finie");
				return 0;
			}
			if (testsAvant === null) testsAvant = await preflightVerte(o, new Journal("reprises", o.racine), "reprises");
			o.annonce?.(`${r.id} · ${r.titre}`);
			const issue = await conduire(o, r, testsAvant);
			if (issue.versee) testsAvant = issue.tests;
		}
		o.annonce?.(`${max} reprise(s) traitées : la course rend la main (CYCLE_495_REPRISES_MAX)`);
		return 0;
	} catch (error) {
		if (!(error instanceof Arret)) throw error;
		o.annonce?.(`⛔ ${error.message}`);
		return 1;
	}
}
