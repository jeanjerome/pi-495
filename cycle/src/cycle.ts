/**
 * The six steps, one function each, and what the tool checks after a session: the reds replayed,
 * the tasks' commands and Preflight run through the kernel's runner, the review sorted, the
 * acceptance run handed to the owner, the branch landed. A step ends `fini`, or stops on a question
 * for the owner, or blocks with the reason.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import {
	type Controle,
	type Executeur,
	type Preuve,
	controleDeTache,
	estUnRouge,
	explorationFormelle,
} from "./controls.ts";
import { exporterDossier } from "./export.ts";
import {
	arbreDetache,
	baseDe,
	brancheCourante,
	commiter,
	commitsEntre,
	estCommitDeTestSeul,
	git,
	retirerArbre,
	revision,
	versementEcrase,
} from "./git.ts";
import { invite } from "./invite.ts";
import {
	budgetMutation,
	ecrireConfigurationStryker,
	plagesIntroduites,
	raisonDeStryker,
	survivants,
	testsDesTaches,
	texteMutation,
	texteNonAboutie,
	RIEN_A_MUTER,
} from "./mutation.ts";
import { contenuLu, dejaVerte, retenirVerte } from "./preflight.ts";
import { preparer } from "./preparation.ts";
import type { Evenement, Journal, Pas } from "./journal.ts";
import { defautsOuverts } from "./registre.ts";
import {
	type Constat,
	type Rapport,
	type Reponse,
	type Tri,
	SCHEMA_RAPPORT,
	SCHEMA_REPONSE,
	TOURS_MAX,
	apresDernierTour,
	contournementsLaisses,
	contourne,
	ouvertsDuTourPrecedent,
	trier,
} from "./relecture.ts";
import { type Session, sessionInscrite } from "./session.ts";
import { type Story, avecStatut, lireStory } from "./story.ts";

export interface Contexte {
	root: string;
	story: Story;
	journal: Journal;
	executeur: Executeur;
	/** `main`, where the branch forks from and lands. */
	cible: string;
	preflight: Controle;
	/** The control that explores the model a manifest pins; `scripts/check-formal.ts` when unset. */
	exploration?: (manifeste: string) => Controle;
	claude?: string;
	/** Each line a session streams, with the session's name, for whoever watches the story run. */
	suivi?: (nom: string, ligne: string) => void;
	/** Told when a control starts, since only its end reaches the journal. */
	annonce?: (texte: string) => void;
}

export type Issue =
	| { statut: "fini" }
	// `nonTenues`: the promises the review left unkept, when the review is what asks the owner, and among them
	// `contournements`, the bypasses of the security section the review that follows a reopening replays.
	| { statut: "proprietaire"; question: string; nonTenues?: string; contournements?: Constat[] }
	// `origine`: the preparation, when the block is a model or a requirement to revise rather than code to write.
	| { statut: "bloque"; motif: string; origine?: "preparation" };

const FINI: Issue = { statut: "fini" };

export class Blocage extends Error {}

function storyMarkdown(ctx: Contexte): string {
	return readFileSync(ctx.story.chemin, "utf8");
}

function base(ctx: Contexte): string {
	return baseDe(ctx.root, ctx.cible);
}

export async function session(
	ctx: Contexte,
	pas: Pas,
	nom: string,
	texte: string,
	schema: Record<string, unknown>,
	cwd = ctx.root,
): Promise<Session> {
	const s = await sessionInscrite(ctx.journal, pas, nom, { invite: texte, schema, cwd }, ctx);
	if (!s.ok) throw new Blocage(`session ${nom}: ${s.resume}`);
	return s;
}

async function controle(ctx: Contexte, pas: Pas, c: Controle, sha?: string): Promise<Preuve> {
	ctx.annonce?.(`${c.id} à ${(sha ?? revision(ctx.root)).slice(0, 7)}…`);
	const preuve = sha
		? await ctx.executeur.executerA(c, ctx.root, sha, ctx.story.id)
		: await ctx.executeur.executer(c, ctx.root, ctx.story.id);
	ctx.journal.inscrire(pas, "controle", { ...preuve });
	return preuve;
}

/** How many correction sessions a red Preflight after a session's step gets before the step blocks. */
const CORRECTIONS_PREFLIGHT = 2;

/**
 * Preflight at the head, once per revision. Only the tool runs it: a session runs what its change
 * touches. After a session's step, a red Preflight goes to a correction session with the failures the
 * tool read, then runs again, up to `CORRECTIONS_PREFLIGHT` times; where no session wrote the head —
 * the base of a story, the squashed landing — a red Preflight blocks at once.
 */
async function preflightVerte(ctx: Contexte, pas: Pas, corriger = false): Promise<void> {
	const racine = dirname(ctx.journal.dir);
	for (let correction = 0; ; correction++) {
		const head = revision(ctx.root);
		const contenu = contenuLu(ctx.root);
		if (contenu && dejaVerte(racine, contenu)) {
			ctx.journal.inscrire(pas, "preflight-retenue", { revision: head, contenu });
			return;
		}
		const preuve = await controle(ctx, pas, ctx.preflight);
		if (preuve.verdict === "PASS") {
			if (contenu) retenirVerte(racine, contenu);
			return;
		}
		if (!corriger || correction === CORRECTIONS_PREFLIGHT)
			throw new Blocage(`Preflight ${preuve.verdict} at ${head}: ${preuve.echecs.slice(0, 5).join("; ")}`);
		await session(
			ctx,
			pas,
			`preflight-${correction + 1}`,
			invite("preflight", {
				id: ctx.story.id,
				branche: brancheCourante(ctx.root),
				pas,
				tete: head,
				echecs: preuve.echecs.length
					? preuve.echecs.map((e) => `- ${e}`).join("\n")
					: "(aucun test : un contrôle de lint ou de type)",
				story: storyMarkdown(ctx),
			}),
			{
				type: "object",
				properties: { status: { type: "string", enum: ["fini", "bloque"] }, resume: { type: "string" } },
				required: ["status", "resume"],
			},
		);
	}
}

// --- 1. la story -----------------------------------------------------------------------------------

async function pasStory(ctx: Contexte): Promise<Issue> {
	if (ctx.story.statut === "versée") throw new Blocage(`${ctx.story.id} is already versée`);
	if (brancheCourante(ctx.root) === ctx.cible) git(ctx.root, ["checkout", "-q", "-b", ctx.story.id]);
	await preflightVerte(ctx, "story");
	if (ctx.story.statut === "à faire") {
		writeFileSync(ctx.story.chemin, avecStatut(storyMarkdown(ctx), "en cours"));
		commiter(ctx.root, `docs: the story ${ctx.story.id} is in progress`, [ctx.story.chemin]);
		ctx.story = lireStory(ctx.story.id, ctx.root);
	}
	ctx.journal.inscrire("story", "branche", { nom: brancheCourante(ctx.root), base: base(ctx) });
	return FINI;
}

// --- 2. le rouge-vert -------------------------------------------------------------------------------

function ecartEnCours(ctx: Contexte): string {
	const rouvert = ctx.journal.dernier("rouvert");
	if (!rouvert) return "";
	const origine =
		rouvert.pas === "relecture" ? "Promesses que la relecture a laissées non tenues" : "Écart trouvé à la recette";
	return `\n\n${origine}, seul objet de ce passage :\n${String(rouvert.motif)}\n`;
}

/** The preparation of the story as it stands on the branch, its explorations run as controls of the red-green. */
function preparationDuRougeVert(ctx: Contexte): ReturnType<typeof preparer> {
	// The story is read again: its companion or its model may have changed since the run began.
	ctx.story = lireStory(ctx.story.id, ctx.root);
	return preparer(
		{
			root: ctx.root,
			story: ctx.story,
			exploration: ctx.exploration ?? explorationFormelle,
			lancer: (c) => controle(ctx, "rouge-vert", c),
			lire: async (digest) => {
				const octets = await ctx.journal.objets.get(digest);
				return octets ? new TextDecoder().decode(octets) : null;
			},
		},
		ctx.journal,
	);
}

async function pasRougeVert(ctx: Contexte): Promise<Issue> {
	const preparation = await preparationDuRougeVert(ctx);
	if (!preparation.verte) return { statut: "bloque", motif: preparation.motif, origine: "preparation" };
	const b = base(ctx);
	const depuis = revision(ctx.root);
	const deja = commitsEntre(ctx.root, b)
		.map((c) => `- ${c.sha.slice(0, 7)} ${c.sujet}`)
		.join("\n");
	const texte =
		invite("rouge-vert", {
			id: ctx.story.id,
			branche: brancheCourante(ctx.root),
			base: b,
			deja,
			preparation: preparation.resume,
			story: storyMarkdown(ctx),
		}) + ecartEnCours(ctx);
	await session(ctx, "rouge-vert", "rouge-vert", texte, {
		type: "object",
		properties: {
			status: { type: "string", enum: ["fini", "bloque"] },
			taches: {
				type: "array",
				items: {
					type: "object",
					properties: {
						numero: { type: "integer" },
						rouge_commit: { type: "string" },
						vert_commit: { type: "string" },
						message_rouge: { type: "string" },
					},
					required: ["numero"],
				},
			},
			resume: { type: "string" },
		},
		required: ["status", "taches", "resume"],
	});
	// A launch resumed after the work was done has nothing left to commit: the pass committed
	// something, whichever launch did it.
	const passe = ctx.journal.debutDePassage("rouge-vert") ?? depuis;
	if (commitsEntre(ctx.root, passe).length === 0) throw new Blocage("the red-green session committed nothing");
	// Every test-only commit of the pass, so one left by an earlier launch of it is replayed too. A
	// green test that a later step left on the branch is not a red the pass owes.
	for (const c of commitsEntre(ctx.root, passe).filter(estCommitDeTestSeul)) {
		const commandes = commandesDuCommit(ctx, c.fichiers);
		if (commandes.length === 0) continue;
		// A test-only commit may also edit the green test of an earlier task: it is a red when one of
		// the tasks it touches fails at it.
		let preuve = await controle(ctx, "rouge-vert", commandes[0]!, c.sha);
		for (const command of commandes.slice(1)) {
			if (estUnRouge(preuve)) break;
			preuve = await controle(ctx, "rouge-vert", command, c.sha);
		}
		ctx.journal.inscrire("rouge-vert", "rouge", {
			commit: c.sha,
			sujet: c.sujet,
			rouge: estUnRouge(preuve),
			echecs: preuve.echecs,
		});
		if (!estUnRouge(preuve))
			throw new Blocage(
				`${c.sha.slice(0, 7)} ${c.sujet}: no failing test read at this test-only commit (${preuve.verdict})`,
			);
	}
	for (const t of ctx.story.taches) {
		if (!t.verifie) continue;
		const preuve = await controle(ctx, "rouge-vert", controleDeTache(t.numero, t.verifie));
		if (preuve.verdict !== "PASS")
			throw new Blocage(`tâche ${t.numero}: ${preuve.commande.join(" ")} is ${preuve.verdict} at HEAD`);
	}
	await preflightVerte(ctx, "rouge-vert", true);
	return FINI;
}

/** The tasks whose test file a test-only commit touches, so their commands replay the red. */
function commandesDuCommit(ctx: Contexte, fichiers: string[]): Controle[] {
	return ctx.story.taches.flatMap((t) =>
		t.verifie && fichiers.some((f) => t.verifie!.includes(f)) ? [controleDeTache(t.numero, t.verifie)] : [],
	);
}

// --- 3. l'autocontrôle ------------------------------------------------------------------------------

async function pasAutocontrole(ctx: Contexte): Promise<Issue> {
	const texte = invite("autocontrole", {
		id: ctx.story.id,
		branche: brancheCourante(ctx.root),
		base: base(ctx),
		story: storyMarkdown(ctx),
	});
	await session(ctx, "autocontrole", "autocontrole", texte, {
		type: "object",
		properties: {
			status: { type: "string", enum: ["fini", "bloque"] },
			constats: {
				type: "array",
				items: {
					type: "object",
					properties: { point: { type: "string" }, corrige: { type: "boolean" }, commit: { type: "string" } },
					required: ["point", "corrige"],
				},
			},
			resume: { type: "string" },
		},
		required: ["status", "constats", "resume"],
	});
	await preflightVerte(ctx, "autocontrole", true);
	return FINI;
}

// --- 4. la relecture --------------------------------------------------------------------------------

function registreOuvert(ctx: Contexte): string {
	const ouverts = defautsOuverts(ctx.root, "low");
	return ouverts.length === 0 ? "aucune" : ouverts.map((d) => `- ${d.id} — ${d.titre}`).join("\n");
}

/** What a control printed on its standard output, as the object store keeps it. */
async function sortieDe(ctx: Contexte, preuve: Preuve): Promise<string> {
	const stdout = preuve.artifacts.find((a) => a.name === "stdout");
	return stdout ? new TextDecoder().decode((await ctx.journal.objets.get(stdout.ref)) ?? new Uint8Array()) : "";
}

/**
 * The mutation of the lines the branch introduces from `b` to `tete`, with the tests the tasks name, in a detached
 * tree removed afterwards: its report is kept in the journal, and the text returned tells the reviewers which
 * mutants survive, why the mutation did not complete, or that no line was to be mutated.
 */
async function mutation(ctx: Contexte, b: string, tete: string): Promise<string> {
	const plages = plagesIntroduites(ctx.root, b, tete);
	if (plages.length === 0) return RIEN_A_MUTER;
	const tests = testsDesTaches(ctx.story);
	const dossier = mkdtempSync(join(tmpdir(), "cycle-mutation-"));
	const nonAboutie = (raison: string): string => {
		ctx.journal.inscrire("relecture", "mutation", { plages, tests, raison });
		return texteNonAboutie(raison);
	};
	try {
		const stryker = ecrireConfigurationStryker(dossier, plages, tests, budgetMutation());
		const preuve = await controle(ctx, "relecture", stryker.controle, tete);
		if (!existsSync(stryker.rapport)) return nonAboutie(raisonDeStryker(preuve.facts, await sortieDe(ctx, preuve)));
		const rapport = readFileSync(stryker.rapport, "utf8");
		const vivants = survivants(rapport);
		ctx.journal.inscrire("relecture", "mutation", {
			plages,
			tests,
			rapport: await ctx.journal.garder(rapport, "application/json"),
			survivants: vivants.length,
		});
		return texteMutation(plages, tests, vivants);
	} catch (e) {
		// The surviving mutants inform the reviewers and hold no gate: a mutation that cannot run leaves the round to
		// take place, and says why.
		return nonAboutie((e as Error).message);
	} finally {
		rmSync(dossier, { recursive: true, force: true });
	}
}

async function relecteurs(
	ctx: Contexte,
	tour: number,
	b: string,
	tete: string,
	precedent: string,
	mutes: string,
): Promise<Rapport[]> {
	const arbres = [arbreDetache(ctx.root, tete), arbreDetache(ctx.root, tete)];
	try {
		// Both sessions end before their trees go: one that fails must not take the other's tree away.
		const issues = await Promise.allSettled(
			(["A", "B"] as const).map((r, i) =>
				session(
					ctx,
					"relecture",
					`relecteur-${r}-tour-${tour}`,
					invite("relecteur", {
						relecteur: r,
						tour,
						id: ctx.story.id,
						base: b,
						tete,
						tour_precedent: precedent,
						mutation: mutes,
						promesses: promesses(ctx),
						registre: registreOuvert(ctx),
					}),
					SCHEMA_RAPPORT,
					arbres[i]!,
				),
			),
		);
		const echec = issues.find((i) => i.status === "rejected");
		if (echec) throw echec.reason;
		const sessions = issues.map((i) => (i as PromiseFulfilledResult<Awaited<ReturnType<typeof session>>>).value);
		return sessions.map((s) => s.sortie as unknown as Rapport);
	} finally {
		for (const a of arbres) retirerArbre(ctx.root, a);
	}
}

function promesses(ctx: Contexte): string {
	return `## Promesses\n\n${ctx.story.promesses}\n\n## Sécurité\n\n${ctx.story.securite}`;
}

function resumer(cs: Constat[]): string {
	return JSON.stringify(
		cs.map((c) => ({ id: c.id, constat: c.constat })),
		null,
		1,
	);
}

/** What the reviewers are asked of the bypasses to replay, which `provenance` qualifies: to replay each on the head. */
function aRejouer(rejoues: Constat[], provenance: string): string {
	return rejoues.length === 0
		? ""
		: `Contournements ${provenance} : rejoue le chemin de chacun sur la tête de la branche ; s'il ne passe plus, cite son identifiant sous \`fermes\`, sinon relève-le de nouveau.\n${resumer(rejoues)}\n\n`;
}

/**
 * What the reviewers of the next round are told of this one: the bypasses its response claims fixed, to replay on
 * the head, and the other findings, already handled.
 */
function tourPrecedent(aTraiter: Constat[], rejoues: Constat[]): string {
	return `${aRejouer(rejoues, "que la réponse du tour précédent dit corrigés")}Constats du tour précédent, déjà traités, et leurs réponses : voir le journal ; ne les recompte pas.\n${resumer(
		aTraiter.filter((c) => !contourne(c)),
	)}`;
}

async function reponse(ctx: Contexte, tour: number, constats: unknown[], mode: string): Promise<Reponse[]> {
	const s = await session(
		ctx,
		"relecture",
		`reponse-tour-${tour}`,
		invite("reponse", {
			tour,
			id: ctx.story.id,
			branche: brancheCourante(ctx.root),
			mode,
			constats: JSON.stringify(constats, null, 1),
		}),
		SCHEMA_REPONSE,
	);
	return (s.sortie as { reponses?: Reponse[] } | null)?.reponses ?? [];
}

/**
 * What a round that does not close the review leaves open for the next one: the findings its response handles, the
 * bypasses that hold the next gate as they stand, and those to replay. Written to the journal before the response,
 * every bypass left open, and again once the response has answered, so that a review step relaunched after a block
 * resumes at the next round with them rather than at a first round that has forgotten them.
 */
interface Ouverts {
	tour: number;
	tete: string;
	traites: Constat[];
	laisses: Constat[];
	rejoues: Constat[];
}

function inscrireOuverts(ctx: Contexte, ouverts: Ouverts): void {
	ctx.journal.inscrire("relecture", "ouverts", { ...ouverts });
}

/** The last round of this run of the review step that left bypasses open, a run resumed after a block included. */
function ouvertsRepris(ctx: Contexte): Ouverts | null {
	const ouverts = ctx.journal.passage("relecture").findLast((e) => e.genre === "ouverts");
	return ouverts ? (ouverts as Evenement & Ouverts) : null;
}

/**
 * Where the review step starts: its first round, the revision that round's diff starts from, the bypasses the
 * previous round's response left open, which hold the gate as they stand, those it claims fixed, which hold it until
 * each reviewer of the round finds them closed, and what the reviewers are told of the previous round. A step
 * relaunched after a block resumes at the round after the last one answered.
 */
function depart(ctx: Contexte): {
	premier: number;
	depuis: string;
	laisses: Constat[];
	rejoues: Constat[];
	precedent: string;
} {
	const repris = ouvertsRepris(ctx);
	if (repris)
		return {
			premier: repris.tour + 1,
			depuis: repris.tete,
			laisses: repris.laisses,
			rejoues: repris.rejoues,
			precedent: tourPrecedent(repris.traites, repris.rejoues),
		};
	// After a gap, the one round reads the diff made since the story was reopened and replays the bypasses that sent
	// the story back to the red-green.
	const rouvert = ctx.journal.dernier("rouvert");
	const rejoues = (rouvert?.contournements as Constat[] | undefined) ?? [];
	return {
		premier: 1,
		depuis: typeof rouvert?.tete === "string" ? rouvert.tete : base(ctx),
		laisses: [],
		rejoues,
		precedent: aRejouer(rejoues, "qui ont rouvert la story au rouge-vert"),
	};
}

/**
 * The end of the review, on a round whose gate passed or on the last one: what remains goes to the registry, and a
 * promise the code does not keep, a bypass of the security section included, is put to the owner.
 */
async function clore(ctx: Contexte, tour: number, tri: Tri, rapports: Rapport[]): Promise<Issue> {
	const fin = apresDernierTour(rapports);
	const aRegistre = tri.porte === "pass" ? [...tri.aTraiter, ...tri.anterieurs] : fin.registre;
	if (aRegistre.length > 0) {
		await reponse(
			ctx,
			tour,
			aRegistre,
			tri.porte === "pass"
				? "La porte est passée : corrige ce qui n'ajoute aucun comportement, inscris le reste au registre."
				: "C'était le dernier tour : ce qui reste s'inscrit au registre, rien ne se corrige ici.",
		);
		await preflightVerte(ctx, "relecture", true);
	}
	if (tri.porte === "fail" && fin.proprietaire.length > 0) {
		const nonTenues = fin.proprietaire.map((c) => `- ${c.id} (${c.scenario}) : ${c.constat}`).join("\n");
		return {
			statut: "proprietaire",
			question: `Après ${tour} tours, le code ne tient pas ${fin.proprietaire.length} promesse(s) :\n${nonTenues}\nDécidez : \`cycle ${ctx.story.id} accepte\` verse tel quel, sinon corrigez et relancez.`,
			nonTenues,
			contournements: fin.proprietaire.filter(contourne),
		};
	}
	return FINI;
}

async function pasRelecture(ctx: Contexte): Promise<Issue> {
	const toursMax = ctx.journal.rouvert() ? 1 : TOURS_MAX;
	const debut = depart(ctx);
	let { depuis: b, laisses, rejoues, precedent } = debut;
	for (let tour = debut.premier; tour <= toursMax; tour += 1) {
		const tete = revision(ctx.root);
		const mutes = tour === 1 ? await mutation(ctx, b, tete) : "";
		const relus = await relecteurs(ctx, tour, b, tete, precedent, mutes);
		const rapports = [...relus, ...ouvertsDuTourPrecedent(laisses, rejoues, relus)];
		const tri = trier(rapports);
		const ref = await ctx.journal.garder(JSON.stringify(rapports, null, 1), "application/json");
		ctx.journal.inscrire("relecture", "tour", {
			tour,
			base: b,
			tete,
			porte: tri.porte,
			constats: rapports.flatMap((r) => r.constats).length,
			rapports: ref,
		});
		if (tri.porte === "pass" || tour === toursMax) return await clore(ctx, tour, tri, rapports);
		inscrireOuverts(ctx, { tour, tete, traites: tri.aTraiter, laisses: tri.aTraiter.filter(contourne), rejoues: [] });
		const reponses = await reponse(
			ctx,
			tour,
			[...tri.aTraiter, ...tri.anterieurs],
			"Corrige ce qui retient la porte ; un tour suivant relira ton diff.",
		);
		laisses = contournementsLaisses(
			tri.aTraiter,
			reponses,
			commitsEntre(ctx.root, tete).map((c) => c.sha),
		);
		rejoues = tri.aTraiter.filter((c) => contourne(c) && !laisses.includes(c));
		inscrireOuverts(ctx, { tour, tete, traites: tri.aTraiter, laisses, rejoues });
		await preflightVerte(ctx, "relecture", true);
		precedent = tourPrecedent(tri.aTraiter, rejoues);
		b = tete;
	}
	return FINI;
}

// --- 5. la recette ----------------------------------------------------------------------------------

async function pasRecette(ctx: Contexte): Promise<Issue> {
	const events = ctx.journal.depuisReouverture();
	if (events.some((e) => e.genre === "acceptee")) return FINI;
	const preparee = events.findLast((e) => e.genre === "preparee");
	if (preparee)
		return {
			statut: "proprietaire",
			question: `${String(preparee.compte_rendu)}\n\nAccepter : \`cycle ${ctx.story.id} accepte [note]\`. Nommer un écart : \`cycle ${ctx.story.id} ecart "<ce qui manque>"\`.`,
		};
	const s = await session(
		ctx,
		"recette",
		"recette",
		invite("recette", {
			id: ctx.story.id,
			branche: brancheCourante(ctx.root),
			tete: revision(ctx.root),
			promesses: promesses(ctx),
		}),
		{
			type: "object",
			properties: {
				status: { type: "string", enum: ["prete", "ecart", "bloque"] },
				campagnes: {
					type: "array",
					items: {
						type: "object",
						properties: { nom: { type: "string" }, commande: { type: "string" }, verdict: { type: "string" } },
						required: ["nom", "verdict"],
					},
				},
				ecarts: {
					type: "array",
					items: {
						type: "object",
						properties: { scenario: { type: "string" }, constat: { type: "string" } },
						required: ["scenario", "constat"],
					},
				},
				compte_rendu: { type: "string" },
			},
			required: ["status", "campagnes", "ecarts", "compte_rendu"],
		},
	);
	const sortie = s.sortie as {
		status: string;
		ecarts: { scenario: string; constat: string }[];
		compte_rendu: string;
		campagnes: unknown[];
	};
	if (sortie.status === "bloque") throw new Blocage(`recette: ${sortie.compte_rendu}`);
	if (sortie.status === "ecart") {
		rouvrir(ctx, sortie.ecarts.map((e) => `${e.scenario} : ${e.constat}`).join("\n"));
		return {
			statut: "bloque",
			motif: `la recette trouve un écart ; la story est rouverte au rouge-vert :\n${sortie.ecarts.map((e) => `- ${e.scenario} : ${e.constat}`).join("\n")}\nRelancez \`cycle ${ctx.story.id}\`.`,
		};
	}
	ctx.journal.inscrire("recette", "preparee", {
		compte_rendu: sortie.compte_rendu,
		campagnes: sortie.campagnes,
		tete: revision(ctx.root),
	});
	return {
		statut: "proprietaire",
		question: `${sortie.compte_rendu}\n\nAccepter : \`cycle ${ctx.story.id} accepte [note]\`. Nommer un écart : \`cycle ${ctx.story.id} ecart "<ce qui manque>"\`.`,
	};
}

/** Sends the story back to the red-green, for a gap of the acceptance run or a promise the review left unkept. */
export function rouvrir(
	ctx: Contexte,
	motif: string,
	origine: "recette" | "relecture" = "recette",
	contournements: Constat[] = [],
): void {
	ctx.journal.inscrire(origine, "rouvert", {
		motif,
		tete: revision(ctx.root),
		...(contournements.length > 0 ? { contournements } : {}),
	});
	ctx.journal.inscrire("story", "fini");
}

export function accepter(ctx: Contexte, note: string): void {
	// The owner who lands a story whose review handed them an unkept promise closes that review too.
	const attente = ctx.journal.lire().at(-1);
	if (attente?.pas === "relecture" && attente.genre === "proprietaire") ctx.journal.inscrire("relecture", "fini");
	ctx.journal.inscrire("recette", "acceptee", { note, tete: revision(ctx.root) });
	ctx.journal.inscrire("recette", "fini");
}

// --- 6. le versement --------------------------------------------------------------------------------

async function pasVersement(ctx: Contexte): Promise<Issue> {
	const branche = brancheCourante(ctx.root);
	const b = base(ctx);
	await preflightVerte(ctx, "versement");
	const s = await session(
		ctx,
		"versement",
		"message",
		invite("message", {
			id: ctx.story.id,
			branche,
			base: b,
			commits: commitsEntre(ctx.root, b)
				.map((c) => `- ${c.sujet}`)
				.join("\n"),
			story: storyMarkdown(ctx),
		}),
		{
			type: "object",
			properties: { message: { type: "string" } },
			required: ["message"],
		},
	);
	const message = String((s.sortie as { message: string }).message)
		.split("\n")[0]!
		.trim();
	const sha = versementEcrase(ctx.root, branche, ctx.cible, message);
	ctx.journal.inscrire("versement", "verse", { commit: sha, message, branche });
	writeFileSync(ctx.story.chemin, avecStatut(storyMarkdown(ctx), "versée"));
	const dossier = await exporterDossier(ctx.journal, ctx.root);
	ctx.journal.inscrire("versement", "fini");
	commiter(ctx.root, `docs: the story ${ctx.story.id} is landed and its dossier recorded`, [
		ctx.story.chemin,
		relative(ctx.root, dossier),
	]);
	return FINI;
}

// --- la conduite ------------------------------------------------------------------------------------

const PAS_FONCTIONS: Record<Pas, (ctx: Contexte) => Promise<Issue>> = {
	story: pasStory,
	"rouge-vert": pasRougeVert,
	autocontrole: pasAutocontrole,
	relecture: pasRelecture,
	recette: pasRecette,
	versement: pasVersement,
};

/** Runs one step and records how it ended. */
export async function conduirePas(ctx: Contexte, pas: Pas): Promise<Issue> {
	ctx.journal.inscrire(pas, "debute", { revision: revision(ctx.root) });
	try {
		const issue = await PAS_FONCTIONS[pas](ctx);
		if (issue.statut === "fini" && pas !== "versement") ctx.journal.inscrire(pas, "fini");
		else if (issue.statut !== "fini")
			ctx.journal.inscrire(
				pas,
				issue.statut,
				issue.statut === "bloque"
					? { detail: issue.motif, ...(issue.origine ? { origine: issue.origine } : {}) }
					: { detail: issue.question },
			);
		return issue;
	} catch (e) {
		const motif = e instanceof Blocage ? e.message : `${(e as Error).stack ?? e}`;
		ctx.journal.inscrire(pas, "bloque", { detail: motif });
		return { statut: "bloque", motif };
	}
}
