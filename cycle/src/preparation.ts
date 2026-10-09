/**
 * The preparation of a story on the reinforced path, the one whose verification companion stands beside
 * it: a sub-step of the story the conductor checks at the threshold of the red-green, before any session
 * writes code. It holds when the companion is complete, when every upstream means it keeps has run to a
 * verdict — each state model explored by TLC to a completed exploration — and when no exploration is left
 * undetermined. Otherwise the story goes back to its preparation: an error of model or of requirement is
 * not a code to write, and no red-green attempt is spent on a specification no code can keep. A story
 * without a companion keeps the cycle it had, and the model never stands for a human agreement.
 *
 * A preparation is examined once per fingerprint — the companion, the promises of the story and every
 * file of the models it explores — and recorded once: a launch that finds the same fingerprint cites the
 * record instead of exploring again. A story reopened on the same fingerprint is a code to correct; a
 * changed fingerprint is a rule revised, which withdraws the previous preparation.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ObjectRef } from "../../src/contracts/v1/common.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { Controle, Preuve } from "./controls.ts";
import type { Evenement, Journal } from "./journal.ts";
import type { Story } from "./story.ts";
import { cheminDuCompagnon, resumeDeVerification } from "./verification-contract.ts";

/**
 * What an exploration ended on, read from the exit status of `scripts/check-formal.ts`; a run killed
 * before its end, its exit status null, is inconclusive.
 */
type IssueExploration = "completed" | "counterexample" | "inconclusive" | "error";

const ISSUE_DU_CODE: Record<number, IssueExploration> = { 0: "completed", 1: "counterexample", 2: "inconclusive" };

/** How many lines of an exploration's output the account of a block carries; the rest is in the trace. */
const LIGNES_CITEES = 12;

/** One exploration of the preparation: its manifest, its outcome, and its output kept in the object store. */
interface Resultat {
	manifeste: string;
	issue: IssueExploration;
	trace: ObjectRef | null;
}

interface Examen {
	verte: boolean;
	/** Why the preparation does not hold, said for whoever revises it; empty when it holds. */
	motif: string;
	resultats: Resultat[];
}

/** What the examination needs from the conductor: the story, a way to run a control, and to read its output. */
interface Outillage {
	root: string;
	story: Story;
	/** The control that explores the model a manifest pins. */
	exploration: (manifeste: string) => Controle;
	lancer: (c: Controle) => Promise<Preuve>;
	lire: (digest: string) => Promise<string | null>;
}

/** The preparation the red-green starts from: its account for the prompt, or the block it says. */
type Preparation = { verte: true; resume: string } | { verte: false; motif: string };

function bloquee(texte: string, resultats: Resultat[] = []): Examen {
	return {
		verte: false,
		motif: `la préparation ne tient pas : la story revient à la préparation, aucune session de rouge-vert n'est lancée.\n${texte}`,
		resultats,
	};
}

/** The state models the companion keeps, by manifest. */
function manifestesRetenus(story: Story): string[] {
	const manifestes = new Set<string>();
	for (const p of story.verification?.promesses ?? [])
		for (const m of p.moyens)
			if (m.retenu && m.moyen === "modele-d-etats") for (const f of m.manifestes) manifestes.add(f);
	return [...manifestes];
}

/** The means the companion keeps that no run of the cycle can settle. */
function indetermines(story: Story): string[] {
	const trouves: string[] = [];
	for (const p of story.verification?.promesses ?? [])
		for (const m of p.moyens.filter((x) => x.retenu)) {
			if (m.moyen === "modele-d-etats" && m.manifestes.length === 0)
				trouves.push(
					`« ${p.scenario} » : modèle d'états retenu sans manifeste ; attendu : le manifeste que TLC explore`,
				);
			if (m.moyen === "preuve-lean")
				trouves.push(`« ${p.scenario} » : preuve Lean retenue, et le cycle n'a pas de contrôle Lean à lancer`);
		}
	return trouves;
}

function issueDe(preuve: Preuve): IssueExploration {
	const code = preuve.facts.exit_code;
	if (typeof code !== "number") return "inconclusive";
	return ISSUE_DU_CODE[code] ?? "error";
}

/** One exploration that did not complete: its manifest, its outcome, the trace it left and its first lines. */
async function compteRendu(o: Outillage, r: Resultat): Promise<string> {
	if (!r.trace) return `- ${r.manifeste} : ${r.issue}, sans sortie`;
	const sortie = (await o.lire(r.trace.digest)) ?? "";
	const lignes = sortie.split("\n").filter((l) => l.trim() !== "");
	// The outcome line, then the counterexample's states when there are any: the header between them —
	// tool, files, budget — is in the trace.
	const debut = lignes.findIndex((l) => l.startsWith("counterexample to "));
	const citees = debut > 0 ? [lignes[0] ?? "", ...lignes.slice(debut)] : lignes;
	const extrait = citees.slice(0, LIGNES_CITEES).map((l) => `    ${l}`);
	const omises = lignes.length - extrait.length;
	if (omises > 0) extrait.push(`    … ${omises} ligne(s) de plus dans la trace`);
	return [`- ${r.manifeste} : ${r.issue}, trace ${r.trace.digest}`, ...extrait].join("\n");
}

/** Examines the preparation of a story that has a companion: its diagnostic, then each upstream means it keeps. */
async function examiner(o: Outillage): Promise<Examen> {
	const diagnostic = o.story.verification;
	if (diagnostic && !diagnostic.prete) return bloquee(resumeDeVerification(diagnostic, o.root));
	const indetermine = indetermines(o.story);
	if (indetermine.length > 0) return bloquee(`exploration indéterminée :\n${indetermine.join("\n")}`);
	const resultats: Resultat[] = [];
	for (const manifeste of manifestesRetenus(o.story)) {
		const preuve = await o.lancer(o.exploration(manifeste));
		const trace = preuve.artifacts.find((a) => a.name === "stdout")?.ref ?? null;
		resultats.push({ manifeste, issue: issueDe(preuve), trace });
	}
	const echecs = resultats.filter((r) => r.issue !== "completed");
	if (echecs.length === 0) return { verte: true, motif: "", resultats };
	const comptes = await Promise.all(echecs.map((r) => compteRendu(o, r)));
	return bloquee(`une propriété requise n'est pas établie par le modèle adopté :\n${comptes.join("\n")}`, resultats);
}

function sha256(chemin: string): string | null {
	return existsSync(chemin) ? `sha256:${createHash("sha256").update(readFileSync(chemin)).digest("hex")}` : null;
}

/** Every file of a model, the manifest, its model, its configuration and the files it pins, by path from the root. */
function fichiersDuModele(root: string, manifeste: string): string[] {
	const fichiers = new Set([manifeste]);
	try {
		const m = JSON.parse(readFileSync(join(root, manifeste), "utf8")) as Record<string, unknown>;
		const epingles = m.files && typeof m.files === "object" ? Object.keys(m.files) : [];
		for (const f of [m.model, m.config, ...epingles])
			if (typeof f === "string") fichiers.add(join(dirname(manifeste), f));
	} catch {
		// An unreadable manifest counts by its own digest; its exploration says what is wrong with it.
	}
	return [...fichiers];
}

/**
 * What a preparation is the preparation of, part by part: the companion, the promises and the security of
 * the story, and every file of the models it explores, each with its digest, null for a file that is
 * absent. A change to any part is a revision of the rule, and gives the preparation a new identity.
 */
function composantesDe(root: string, story: Story): Record<string, string | null> {
	const composantes: Record<string, string | null> = {
		compagnon: sha256(cheminDuCompagnon(story.chemin)),
		promesses: digestValue(story.promesses),
		securite: digestValue(story.securite),
	};
	for (const manifeste of manifestesRetenus(story))
		for (const f of fichiersDuModele(root, manifeste)) composantes[f] = sha256(join(root, f));
	return composantes;
}

/** The parts whose digest differs between two preparations, those of the new one first. */
function changements(avant: Record<string, unknown>, apres: Record<string, string | null>): string[] {
	const noms = new Set([...Object.keys(apres), ...Object.keys(avant)]);
	return [...noms].filter((n) => avant[n] !== apres[n]);
}

/** The bounded account a red-green prompt receives: the fingerprint and the objects it cites, never their content. */
function resume(e: Evenement, reprise: string | null): string {
	const resultats = (e.resultats as Resultat[] | undefined) ?? [];
	return [
		`préparation verte, empreinte ${String(e.empreinte)}`,
		...resultats.map((r) => `- ${r.manifeste} : ${r.issue}, sortie ${r.trace?.digest ?? "aucune"}`),
		...(reprise ? [reprise] : []),
	].join("\n");
}

/** Whether the story was sent back to the red-green since its preparation was last examined or cited. */
function rouverteDepuis(journal: Journal): boolean {
	const events = journal.lire();
	const preparation = events.findLastIndex((e) => e.genre.startsWith("preparation"));
	return preparation >= 0 && events.findLastIndex((e) => e.genre === "rouvert") > preparation;
}

const CORRECTION_DE_CODE =
	"reprise : correction de code — la préparation tient telle qu'examinée ; corrige le code, sans retoucher les règles adoptées ni affaiblir un test";

/**
 * The preparation of the story at the threshold of the red-green. A story without a companion is on the
 * cycle it had and leaves no record. A preparation of the same identity, when one was recorded, is cited,
 * and a story reopened since is a code correction; a different identity withdraws the previous
 * preparation — a revision of the rule — and the new one is examined and recorded once.
 */
export async function preparer(o: Outillage, journal: Journal): Promise<Preparation> {
	if (!o.story.verification) return { verte: true, resume: "aucune : la story n'a pas de compagnon de vérification" };
	const composantes = composantesDe(o.root, o.story);
	const empreinte = digestValue(composantes);
	const precedente = journal.dernier("preparation");
	let e: Evenement;
	let reprise: string | null = null;
	if (precedente?.empreinte === empreinte) {
		const code = rouverteDepuis(journal);
		journal.inscrire("rouge-vert", "preparation-retenue", {
			empreinte,
			...(code ? { reprise: "correction-de-code" } : {}),
		});
		if (code) reprise = CORRECTION_DE_CODE;
		e = precedente;
	} else {
		if (precedente) {
			const changes = changements((precedente.composantes as Record<string, unknown> | undefined) ?? {}, composantes);
			journal.inscrire("rouge-vert", "preparation-retiree", {
				ancienne: precedente.empreinte,
				empreinte,
				reprise: "revision-de-regle",
				changements: changes,
			});
			reprise = `reprise : révision de règle — la préparation ${String(precedente.empreinte)} est retirée, celle-ci la remplace ; a changé : ${changes.join(", ")}`;
		}
		e = journal.inscrire("rouge-vert", "preparation", { empreinte, composantes, ...(await examiner(o)) });
	}
	return e.verte === true ? { verte: true, resume: resume(e, reprise) } : { verte: false, motif: String(e.motif) };
}
