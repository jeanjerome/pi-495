/**
 * The part of `specs/bugs/registry.yaml` the cycle reads and writes: the defects still open with
 * their severity, those a branch records with the severity the arbitration retains for them, and a
 * defect marked fixed once the story that repairs it has landed. The registry is read with a YAML
 * reader, so an entry is seen whatever valid form it is written in, and written back through the
 * reader's source tokens, so every line the cycle does not change stays as it was written.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { CST, Composer, type Pair, Parser, type YAMLMap, isMap, isScalar, isSeq, parse } from "yaml";
import { contenuA } from "./git.ts";

export type Gravite = "low" | "medium" | "high";

export interface Defaut {
	id: string;
	gravite: Gravite;
	titre: string;
}

const ORDRE: Record<string, number> = { low: 0, medium: 1, high: 2 };

/** The registry, relative to the root of the repository: read in the tree and as a commit holds it. */
export const REGISTRE = "specs/bugs/registry.yaml";
/** Where an entry goes once fixed: the registry keeps the open defects only. */
const ARCHIVE = "specs/bugs/registry-fixed.yaml";

function chemin(root: string): string {
	return join(root, REGISTRE);
}

/** One entry of a registry: its defect and status, its content as a YAML reader reads it, and its node. */
interface Entree extends Defaut {
	statut: string;
	contenu: Record<string, unknown>;
	noeud: YAMLMap.Parsed;
}

/**
 * A registry as read: its source tokens and the source of its list, the content of each item of the list, and its
 * entries, the items that are a defect with an identifier.
 */
interface Lecture {
	tokens: CST.Token[];
	liste: CST.BlockSequence | CST.FlowCollection | undefined;
	contenus: unknown[];
	entrees: Entree[];
}

function illisible(raison: string, fichier = REGISTRE): Error {
	return new Error(`${fichier}: ${raison}`);
}

/** Reads a registry text with the YAML reader. Throws on a text the reader does not read: an entry in it would go unread. */
function lire(texte: string, fichier = REGISTRE): Lecture {
	const tokens = [...new Parser().parse(texte === "" || texte.endsWith("\n") ? texte : `${texte}\n`)];
	const docs = [...new Composer({ keepSourceTokens: true }).compose(tokens)];
	if (docs.length > 1) throw illisible("holds more than one YAML document", fichier);
	const doc = docs[0];
	const vide = { tokens, liste: undefined, contenus: [], entrees: [] };
	if (!doc) return vide;
	const erreur = doc.errors[0];
	if (erreur) throw illisible(erreur.message, fichier);
	const racine = doc.contents;
	if (racine !== null && !isMap(racine)) throw illisible("is not a map of a bugs list", fichier);
	// One pair, keyed bugs as written: a defect under another key, or under bugs reached through an alias, would go unread.
	const paire = racine?.items[0];
	if (racine && (racine.items.length !== 1 || !isScalar(paire?.key) || paire.key.value !== "bugs"))
		throw illisible("holds at its root anything but one bugs key", fichier);
	const liste = paire?.value;
	if (liste == null || (isScalar(liste) && liste.value === null)) return vide;
	if (!isSeq(liste)) throw illisible("bugs is not a list", fichier);
	const contenus = liste.items.map((noeud): unknown => noeud.toJS(doc));
	const entrees = liste.items.flatMap((noeud, i): Entree[] => {
		const contenu = contenus[i];
		if (!isMap(noeud) || !estEntree(contenu)) return [];
		const { bug_id, severity, title, status } = contenu;
		const gravite = String(severity ?? "low") as Gravite;
		return [{ id: bug_id, gravite, titre: String(title ?? ""), statut: String(status ?? ""), contenu, noeud }];
	});
	return { tokens, liste: liste.srcToken, contenus, entrees };
}

function estEntree(contenu: unknown): contenu is Record<string, unknown> & { bug_id: string } {
	return (
		typeof contenu === "object" && contenu !== null && typeof (contenu as { bug_id?: unknown }).bug_id === "string"
	);
}

function defaut({ id, gravite, titre }: Entree): Defaut {
	return { id, gravite, titre };
}

/**
 * Checks that a YAML reader reads in `texte` the items `attendus`, so that an edit of the source tokens never writes a
 * registry that reads otherwise than intended.
 */
function verifier(texte: string, attendus: unknown[], fichier: string): void {
	const lus = lire(texte, fichier).contenus;
	if (!isDeepStrictEqual(lus, attendus)) throw illisible("the edit would not read back as intended", fichier);
}

function texteDe(tokens: CST.Token[]): string {
	return tokens.map((t) => CST.stringify(t)).join("");
}

/** Writes `valeur` into a scalar token, quoted only where a YAML reader would read it as another value. */
function ecrireScalaire(token: CST.Token, valeur: string): void {
	CST.setScalarValue(token, valeur, parse(valeur) === valeur ? {} : { type: "QUOTE_DOUBLE" });
}

/** The pairs of `noeud` under the key `cle`, in its order. */
function paires(noeud: YAMLMap.Parsed, cle: string): Pair[] {
	return noeud.items.filter((p) => isScalar(p.key) && p.key.value === cle);
}

function itemsDe(noeud: YAMLMap.Parsed): CST.CollectionItem[] {
	const items = noeud.srcToken?.items;
	if (!items) throw illisible("an entry has no source to write into");
	return items;
}

/** Adds `cle: valeur` to `noeud` right after its pair `apres`, written in the form of that pair. */
function ajouterApres(noeud: YAMLMap.Parsed, apres: Pair | undefined, cle: string, valeur: string): void {
	const items = itemsDe(noeud);
	const modele = apres?.srcToken;
	const copie = modele ? structuredClone(modele) : undefined;
	if (!modele || !copie?.key || !copie.value) throw illisible(`cannot add ${cle} to an entry`);
	ecrireScalaire(copie.key, cle);
	ecrireScalaire(copie.value, valeur);
	items.splice(items.indexOf(modele) + 1, 0, copie);
}

function retirer(noeud: YAMLMap.Parsed, p: Pair): void {
	const items = itemsDe(noeud);
	if (p.srcToken) items.splice(items.indexOf(p.srcToken), 1);
}

/** The defects still open whose severity is at least `seuil`, most severe first, oldest first within a severity. */
export function defautsOuverts(root: string, seuil: Gravite): Defaut[] {
	if (!existsSync(chemin(root))) return [];
	return lire(readFileSync(chemin(root), "utf8"))
		.entrees.filter((d) => d.statut === "open" && (ORDRE[d.gravite] ?? 0) >= ORDRE[seuil]!)
		.map(defaut)
		.sort((a, b) => (ORDRE[b.gravite] ?? 0) - (ORDRE[a.gravite] ?? 0));
}

/**
 * Tells, for each of `contenus`, whether the registry at `base` carried it. An item is matched on its whole content as
 * a YAML reader reads it, each item of the base once: an identifier the base already carries does not make a new
 * entry old, and an entry the branch only re-indents or re-quotes stays old.
 */
function connusA(root: string, base: string, contenus: unknown[]): boolean[] {
	const aLaBase = lire(contenuA(root, base, REGISTRE) ?? "").contenus;
	return contenus.map((contenu) => {
		const i = aLaBase.findIndex((c) => isDeepStrictEqual(c, contenu));
		if (i >= 0) aLaBase.splice(i, 1);
		return i >= 0;
	});
}

/** The entries of `lecture` whose item `connus` does not mark as carried at the base: those the branch records. */
function nouvelles(lecture: Lecture, connus: boolean[]): Entree[] {
	return lecture.entrees.filter((d) => !connus[lecture.contenus.indexOf(d.contenu)]);
}

/**
 * The defects the registry carries at the head and did not carry at `base`: those the branch records. Throws on a
 * registry the YAML reader does not read, or on an item the branch adds that is not a defect with an identifier: an
 * entry the cycle cannot read would go unweighed.
 */
export function defautsInscrits(root: string, base: string): Defaut[] {
	if (!existsSync(chemin(root))) return [];
	const lecture = lire(readFileSync(chemin(root), "utf8"));
	const connus = connusA(root, base, lecture.contenus);
	const etranger = lecture.contenus.findIndex((c, i) => !connus[i] && !lecture.entrees.some((d) => d.contenu === c));
	if (etranger >= 0) throw illisible(`entry ${etranger + 1} of bugs is not a defect with a bug_id`);
	return nouvelles(lecture, connus).map(defaut);
}

/** One defect as a line of a list read by the owner or a session: its identifier, its severity, its title. */
export function ligneDeDefaut(d: Defaut): string {
	return `- ${d.id} (${d.gravite}) : ${d.titre}`;
}

/**
 * Writes `gravite` as the one severity of every entry `id` the registry did not carry at `base`: the entries the
 * branch records under that identifier, and none the base already carried under it.
 */
export function fixerGravite(root: string, base: string, id: string, gravite: Gravite): void {
	const fichier = chemin(root);
	const lecture = lire(readFileSync(fichier, "utf8"));
	const visees = nouvelles(lecture, connusA(root, base, lecture.contenus)).filter((d) => d.id === id);
	if (visees.length === 0) throw new Error(`${REGISTRE}: ${id} not found among the entries of the branch`);
	for (const { noeud } of visees) {
		// The reader refuses an entry with two severity keys: an entry holds one at most.
		const severite = paires(noeud, "severity")[0];
		const token = severite?.srcToken?.value;
		if (token) ecrireScalaire(token, gravite);
		else {
			if (severite) retirer(noeud, severite);
			ajouterApres(noeud, noeud.items.filter((p) => p !== severite).at(-1), "severity", gravite);
		}
	}
	const texte = texteDe(lecture.tokens);
	const fixee = (c: unknown) => visees.find((d) => d.contenu === c);
	verifier(
		texte,
		lecture.contenus.map((c) => {
			const d = fixee(c);
			return d ? { ...d.contenu, severity: gravite } : c;
		}),
		REGISTRE,
	);
	writeFileSync(fichier, texte);
}

/** The registry entry a correction story cites: the first identifier of the kind the registry writes. */
export function defautDeLaStory(markdown: string): string | null {
	return /BUG-\d{4}-\d{2}-\d{2}T\d{6}/.exec(markdown)?.[0] ?? null;
}

/**
 * Removes `entree` from the source of the list, and returns its text at the column of the list. The indentation of
 * the first item lies before it, in the key of the list: the item that follows takes it over.
 */
function extraire(lecture: Lecture, entree: Entree): string {
	const liste = lecture.liste;
	if (liste?.type !== "block-seq") throw illisible("bugs is not written as a block list");
	const i = liste.items.findIndex((item) => item.value === entree.noeud.srcToken);
	const item = liste.items[i];
	if (!item) throw illisible(`${entree.id} has no source to move`);
	liste.items.splice(i, 1);
	const enTete = item.start[0]?.type !== "space";
	const suivant = liste.items[i]?.start;
	if (enTete && suivant?.[0]?.type === "space") suivant.shift();
	return `${enTete ? " ".repeat(liste.indent) : ""}${CST.stringify(item)}`;
}

/** Moves an open entry to the archive of fixed defects, marked fixed at the revision that fixed it. */
export function marquerCorrige(root: string, id: string, sha: string): void {
	const fichier = chemin(root);
	const lecture = lire(readFileSync(fichier, "utf8"));
	const entree = lecture.entrees.find((d) => d.id === id);
	if (!entree) throw new Error(`${REGISTRE}: ${id} not found`);
	const statut = paires(entree.noeud, "status").at(-1);
	const token = statut?.srcToken?.value;
	if (entree.statut !== "open" || !token) throw new Error(`${REGISTRE}: ${id} is not open`);
	ecrireScalaire(token, "fixed");
	ajouterApres(entree.noeud, statut, "fixed_in", sha);
	const texteEntree = extraire(lecture, entree);
	const archive = join(root, ARCHIVE);
	const dejaArchives = existsSync(archive) ? readFileSync(archive, "utf8") : "bugs:\n";
	const texteArchive = `${dejaArchives}${texteEntree}`;
	const texte = texteDe(lecture.tokens);
	const corrige = { ...entree.contenu, status: "fixed", fixed_in: sha };
	verifier(texteArchive, [...lire(dejaArchives, ARCHIVE).contenus, corrige], ARCHIVE);
	verifier(
		texte,
		lecture.contenus.filter((c) => c !== entree.contenu),
		REGISTRE,
	);
	writeFileSync(archive, texteArchive);
	writeFileSync(fichier, texte);
}
