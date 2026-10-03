/**
 * The six steps, one function each, and what the tool checks after a session: the reds replayed,
 * the tasks' commands and Preflight run through the kernel's runner, the review sorted, the
 * acceptance run handed to the owner, the branch landed. A step ends `fini`, or stops on a question
 * for the owner, or blocks with the reason.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { type Controle, type Executeur, type Preuve, controleDeTache, estUnRouge } from "./controls.ts";
import { exporterDossier } from "./export.ts";
import {
	arbreDetache,
	baseDe,
	brancheCourante,
	commitsEntre,
	estCommitDeTestSeul,
	git,
	retirerArbre,
	revision,
	versementEcrase,
} from "./git.ts";
import { invite } from "./invite.ts";
import type { Journal, Pas } from "./journal.ts";
import { type Rapport, SCHEMA_RAPPORT, TOURS_MAX, apresDernierTour, trier } from "./relecture.ts";
import { type Session, lancerSession } from "./session.ts";
import { type Story, avecStatut, lireStory } from "./story.ts";

export interface Contexte {
	root: string;
	story: Story;
	journal: Journal;
	executeur: Executeur;
	/** `main`, where the branch forks from and lands. */
	cible: string;
	preflight: Controle;
	claude?: string;
	/** Each line a session streams, with the session's name, for whoever watches the story run. */
	suivi?: (nom: string, ligne: string) => void;
	/** Told when a control starts, since only its end reaches the journal. */
	annonce?: (texte: string) => void;
}

export type Issue =
	| { statut: "fini" }
	| { statut: "proprietaire"; question: string }
	| { statut: "bloque"; motif: string };

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
	const s = await lancerSession(
		{
			invite: texte,
			schema,
			cwd,
			...(ctx.claude ? { claude: ctx.claude } : {}),
			...(ctx.suivi ? { suivi: (ligne: string) => ctx.suivi?.(nom, ligne) } : {}),
		},
		ctx.journal,
	);
	ctx.journal.inscrire(pas, "session", {
		nom,
		ok: s.ok,
		cout_usd: s.cout_usd,
		duree_ms: s.duree_ms,
		tours: s.tours,
		session_id: s.session_id,
		transcript: s.transcript,
		resume: s.resume.slice(0, 2000),
	});
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

async function preflightVerte(ctx: Contexte, pas: Pas): Promise<void> {
	const head = revision(ctx.root);
	const last = ctx.journal.depuisReouverture().findLast((e) => e.genre === "controle" && e.controle === "preflight");
	if (last && last.revision === head && last.verdict === "PASS") return;
	const preuve = await controle(ctx, pas, ctx.preflight);
	if (preuve.verdict !== "PASS")
		throw new Blocage(`Preflight ${preuve.verdict} at ${head}: ${preuve.echecs.slice(0, 5).join("; ")}`);
}

// --- 1. la story -----------------------------------------------------------------------------------

async function pasStory(ctx: Contexte): Promise<Issue> {
	if (ctx.story.statut === "versée") throw new Blocage(`${ctx.story.id} is already versée`);
	if (brancheCourante(ctx.root) === ctx.cible) git(ctx.root, ["checkout", "-q", "-b", ctx.story.id]);
	await preflightVerte(ctx, "story");
	if (ctx.story.statut === "à faire") {
		writeFileSync(ctx.story.chemin, avecStatut(storyMarkdown(ctx), "en cours"));
		git(ctx.root, ["add", "--", ctx.story.chemin]);
		git(ctx.root, ["commit", "-q", "-m", `docs: the story ${ctx.story.id} is in progress`]);
		ctx.story = lireStory(ctx.story.id, ctx.root);
	}
	ctx.journal.inscrire("story", "branche", { nom: brancheCourante(ctx.root), base: base(ctx) });
	return FINI;
}

// --- 2. le rouge-vert -------------------------------------------------------------------------------

function ecartEnCours(ctx: Contexte): string {
	const rouvert = ctx.journal.lire().findLast((e) => e.genre === "rouvert");
	return rouvert ? `\n\nÉcart trouvé à la recette, seul objet de ce passage :\n${String(rouvert.motif)}\n` : "";
}

async function pasRougeVert(ctx: Contexte): Promise<Issue> {
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
	await preflightVerte(ctx, "rouge-vert");
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
	await preflightVerte(ctx, "autocontrole");
	return FINI;
}

// --- 4. la relecture --------------------------------------------------------------------------------

function registreOuvert(ctx: Contexte): string {
	try {
		const yaml = readFileSync(`${ctx.root}/specs/bugs/registry.yaml`, "utf8");
		const open = [...yaml.matchAll(/bug_id: (\S+)[\s\S]*?title: "([^"]*)"[\s\S]*?status: (\w+)/g)].filter(
			(m) => m[3] === "open",
		);
		return open.length === 0 ? "aucune" : open.map((m) => `- ${m[1]} — ${m[2]}`).join("\n");
	} catch {
		return "aucune";
	}
}

async function relecteurs(ctx: Contexte, tour: number, b: string, tete: string, precedent: string): Promise<Rapport[]> {
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

async function reponse(ctx: Contexte, tour: number, constats: unknown[], mode: string): Promise<void> {
	await session(
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
		{
			type: "object",
			properties: {
				status: { type: "string", enum: ["fini", "bloque"] },
				reponses: {
					type: "array",
					items: {
						type: "object",
						properties: {
							id: { type: "string" },
							action: { type: "string", enum: ["corrige", "registre", "conteste"] },
							commit: { type: "string" },
							motif: { type: "string" },
						},
						required: ["id", "action", "motif"],
					},
				},
				resume: { type: "string" },
			},
			required: ["status", "reponses", "resume"],
		},
	);
	await preflightVerte(ctx, "relecture");
}

async function pasRelecture(ctx: Contexte): Promise<Issue> {
	const toursMax = ctx.journal.rouvert() ? 1 : TOURS_MAX;
	let b = base(ctx);
	let precedent = "";
	for (let tour = 1; tour <= toursMax; tour += 1) {
		const tete = revision(ctx.root);
		const rapports = await relecteurs(ctx, tour, b, tete, precedent);
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
		const dernier = tour === toursMax;
		if (tri.porte === "pass" || dernier) {
			const fin = apresDernierTour(rapports);
			const aRegistre = tri.porte === "pass" ? [...tri.aTraiter, ...tri.anterieurs] : fin.registre;
			if (aRegistre.length > 0)
				await reponse(
					ctx,
					tour,
					aRegistre,
					tri.porte === "pass"
						? "La porte est passée : corrige ce qui n'ajoute aucun comportement, inscris le reste au registre."
						: "C'était le dernier tour : ce qui reste s'inscrit au registre, rien ne se corrige ici.",
				);
			if (tri.porte === "fail" && fin.proprietaire.length > 0)
				return {
					statut: "proprietaire",
					question: `Après ${tour} tours, le code ne tient pas ${fin.proprietaire.length} promesse(s) :\n${fin.proprietaire.map((c) => `- ${c.id} (${c.scenario}) : ${c.constat}`).join("\n")}\nDécidez : \`cycle ${ctx.story.id} accepte\` verse tel quel, sinon corrigez et relancez.`,
				};
			return FINI;
		}
		await reponse(
			ctx,
			tour,
			[...tri.aTraiter, ...tri.anterieurs],
			"Corrige ce qui retient la porte ; un tour suivant relira ton diff.",
		);
		precedent = `Constats du tour précédent, déjà traités, et leurs réponses : voir le journal ; ne les recompte pas.\n${JSON.stringify(
			tri.aTraiter.map((c) => ({ id: c.id, constat: c.constat })),
			null,
			1,
		)}`;
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

export function rouvrir(ctx: Contexte, motif: string): void {
	ctx.journal.inscrire("recette", "rouvert", { motif });
	ctx.journal.inscrire("story", "fini");
}

export function accepter(ctx: Contexte, note: string): void {
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
	git(ctx.root, ["add", "--", ctx.story.chemin, relative(ctx.root, dossier.dir)]);
	git(ctx.root, ["commit", "-q", "-m", `docs: the story ${ctx.story.id} is landed and its dossier recorded`]);
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
			ctx.journal.inscrire(pas, issue.statut, { detail: issue.statut === "bloque" ? issue.motif : issue.question });
		return issue;
	} catch (e) {
		const motif = e instanceof Blocage ? e.message : `${(e as Error).stack ?? e}`;
		ctx.journal.inscrire(pas, "bloque", { detail: motif });
		return { statut: "bloque", motif };
	}
}
