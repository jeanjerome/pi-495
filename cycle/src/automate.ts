/**
 * What the cycle does where it used to wait for the owner. The owner delegated three answers, and
 * each stays an explicit, recorded act of the tool rather than a silence: the acceptance after the
 * acceptance run is decided by a fresh session under written rules; a promise the review left
 * unkept goes back to the red-green, since it was never the owner's to waive; and a gap the
 * acceptance run finds is written into the story before the red-green resumes, so the next review
 * judges it. A run stops, and says why, when the gaps exceed the ceiling or a session fails.
 */
import { readFileSync } from "node:fs";
import { messageOf } from "../../src/domain/errors.ts";
import { type Contexte, type Issue, Blocage, accepter, rouvrir, session } from "./cycle.ts";
import { arbrePropre, baseDe, git, revision } from "./git.ts";
import { invite } from "./invite.ts";
import type { Pas } from "./journal.ts";
import { lireStory } from "./story.ts";

/** How many times a story may go back to the red-green before the run gives it to the owner. */
export const ECARTS_MAX = 3;

export type Poursuite = { continuer: true } | { continuer: false; motif: string };

const CONTINUER: Poursuite = { continuer: true };

function arret(motif: string): Poursuite {
	return { continuer: false, motif };
}

/** What follows a step that would have waited for the owner or stopped on a gap it reopened. */
export async function apresIssue(ctx: Contexte, pas: Pas, issue: Issue, reouvertAvant: number): Promise<Poursuite> {
	if (issue.statut === "fini") return CONTINUER;
	try {
		if (issue.statut === "proprietaire") {
			if (pas === "recette") return await arbitrer(ctx, issue.question);
			// A promise the review left unkept is corrected, never waived: the story already says it.
			return reouvrirSous(ctx, issue.nonTenues ?? issue.question, false, "relecture");
		}
		if (ctx.journal.reouvertures() > reouvertAvant) return await epingler(ctx, String(lastReouverture(ctx)));
		return arret(issue.motif);
	} catch (e) {
		if (e instanceof Blocage) return arret(e.message);
		throw e;
	}
}

function lastReouverture(ctx: Contexte): unknown {
	return ctx.journal.dernier("rouvert")?.motif ?? "";
}

async function reouvrirSous(
	ctx: Contexte,
	motif: string,
	epingle: boolean,
	origine: "recette" | "relecture" = "recette",
): Promise<Poursuite> {
	if (ctx.journal.reouvertures() >= ECARTS_MAX)
		return arret(`the story went back to the red-green ${ECARTS_MAX} times: the owner decides what is left\n${motif}`);
	rouvrir(ctx, motif, origine);
	return epingle ? await epingler(ctx, motif) : CONTINUER;
}

async function arbitrer(ctx: Contexte, question: string): Promise<Poursuite> {
	const preparee = ctx.journal.dernier("preparee", "recette");
	const registre = git(ctx.root, ["diff", `${baseDe(ctx.root, ctx.cible)}...HEAD`, "--", "specs/bugs/registry.yaml"]);
	const s = await session(
		ctx,
		"recette",
		"arbitrage",
		invite("arbitrage", {
			id: ctx.story.id,
			branche: git(ctx.root, ["rev-parse", "--abbrev-ref", "HEAD"]),
			tete: revision(ctx.root),
			compte_rendu: String(preparee?.compte_rendu ?? question),
			registre: registre.slice(0, 30_000) || "(aucune entrée)",
			story: readFileSync(ctx.story.chemin, "utf8"),
		}),
		{
			type: "object",
			properties: {
				decision: { type: "string", enum: ["accepte", "ecart"] },
				note: { type: "string" },
				ecart: { type: "string" },
				raisons: { type: "string" },
			},
			required: ["decision", "note", "ecart", "raisons"],
		},
	);
	const sortie = s.sortie as { decision: string; note: string; ecart: string; raisons: string };
	ctx.journal.inscrire("recette", "arbitrage", { ...sortie, origine: "automate" });
	if (sortie.decision === "accepte") {
		accepter(ctx, `arbitrage automatique : ${sortie.note}`);
		return CONTINUER;
	}
	if (sortie.ecart.trim() === "") return arret("the arbitration names a gap but does not say which");
	return await reouvrirSous(ctx, sortie.ecart, true);
}

/** Writes a gap into the story, checks the story still holds its format, and leaves the tree clean. */
async function epingler(ctx: Contexte, ecart: string): Promise<Poursuite> {
	const avant = ctx.story.taches.length + ctx.story.scenarios.length;
	const s = await session(
		ctx,
		"recette",
		"ecart",
		invite("ecart", {
			id: ctx.story.id,
			ecart,
			chemin: ctx.story.chemin,
			branche: git(ctx.root, ["rev-parse", "--abbrev-ref", "HEAD"]),
			story: readFileSync(ctx.story.chemin, "utf8"),
		}),
		{
			type: "object",
			properties: {
				status: { type: "string", enum: ["fini", "bloque"] },
				message: { type: "string" },
				resume: { type: "string" },
			},
			required: ["status", "message", "resume"],
		},
	);
	const sortie = s.sortie as { status: string; resume: string };
	if (sortie.status !== "fini") return arret(`the gap could not be written into the story: ${sortie.resume}`);
	if (!arbrePropre(ctx.root)) return arret("writing the gap into the story left the tree modified");
	try {
		ctx.story = lireStory(ctx.story.id, ctx.root);
	} catch (e) {
		return arret(`the story no longer holds its format after the gap was written: ${messageOf(e)}`);
	}
	if (ctx.story.taches.length + ctx.story.scenarios.length <= avant)
		return arret("writing the gap into the story added neither a scenario nor a task");
	return CONTINUER;
}
