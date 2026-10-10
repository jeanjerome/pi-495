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
import { arbrePropre, baseDe, commiter, estAncetre, fichiersChanges, git, revision } from "./git.ts";
import { invite } from "./invite.ts";
import type { Pas } from "./journal.ts";
import { type Defaut, type Gravite, REGISTRE, defautsInscrits, fixerGravite, ligneDeDefaut } from "./registre.ts";
import type { Constat } from "./relecture.ts";
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
			return reouvrirSous(ctx, issue.nonTenues ?? issue.question, false, "relecture", issue.contournements);
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
	contournements: Constat[] = [],
): Promise<Poursuite> {
	if (ctx.journal.reouvertures() >= ECARTS_MAX)
		return arret(`the story went back to the red-green ${ECARTS_MAX} times: the owner decides what is left\n${motif}`);
	rouvrir(ctx, motif, origine, contournements);
	return epingle ? await epingler(ctx, motif) : CONTINUER;
}

/** The severity the arbitration retains for one defect the branch records, and why. */
interface GraviteRetenue {
	bug_id: string;
	gravite: Gravite;
	raison: string;
}

async function arbitrer(ctx: Contexte, question: string): Promise<Poursuite> {
	const preparee = ctx.journal.dernier("preparee", "recette");
	const base = baseDe(ctx.root, ctx.cible);
	const registre = git(ctx.root, ["diff", `${base}...HEAD`, "--", REGISTRE]);
	// The session that introduced a defect chose its severity: the arbitration, which did not, sets the one kept.
	let inscrits: Defaut[];
	try {
		inscrits = defautsInscrits(ctx.root, base);
	} catch (e) {
		return arret(messageOf(e));
	}
	const avant = revision(ctx.root);
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
			defauts: inscrits.map(ligneDeDefaut).join("\n") || "(aucun)",
			story: readFileSync(ctx.story.chemin, "utf8"),
		}),
		{
			type: "object",
			properties: {
				decision: { type: "string", enum: ["accepte", "ecart"] },
				note: { type: "string" },
				ecart: { type: "string" },
				raisons: { type: "string" },
				gravites: {
					type: "array",
					items: {
						type: "object",
						properties: {
							bug_id: { type: "string" },
							gravite: { type: "string", enum: ["low", "medium", "high"] },
							raison: { type: "string" },
						},
						required: ["bug_id", "gravite", "raison"],
					},
				},
			},
			required: ["decision", "note", "ecart", "raisons", "gravites"],
		},
	);
	const sortie = s.sortie as {
		decision: string;
		note: string;
		ecart: string;
		raisons: string;
		gravites?: GraviteRetenue[];
	};
	// The arbitration may record in the registry a defect it finds missing there, and nothing else.
	if (!arbrePropre(ctx.root)) return arret("the arbitration left the tree modified");
	// A rewound branch leaves the diff since `avant` empty, and would land a head no campaign was played at.
	if (!estAncetre(ctx.root, avant)) return arret("the arbitration moved the branch off the head it was given");
	const autres = fichiersChanges(ctx.root, avant).filter((f) => f !== REGISTRE);
	if (autres.length > 0) return arret(`the arbitration changed files beyond the registry: ${autres.join(", ")}`);
	const sansGravite = inscrits.filter((d) => !sortie.gravites?.some((g) => g.bug_id === d.id));
	if (sansGravite.length > 0)
		return arret(
			`the arbitration retains no severity for the defects the branch records: ${sansGravite.map((d) => d.id).join(", ")}`,
		);
	const gravites = retenirGravites(ctx, base, inscrits, sortie.gravites ?? []);
	// Only the fields of the decision: what else the output carries would land in the event, its genre included.
	const { decision, note, ecart, raisons } = sortie;
	ctx.journal.inscrire("recette", "arbitrage", { decision, note, ecart, raisons, gravites, origine: "automate" });
	if (sortie.decision === "accepte") {
		// The tool checked that the arbitration committed the registry alone: the code it accepts is the one at `avant`.
		accepter(ctx, `arbitrage automatique : ${sortie.note}`, avant);
		return CONTINUER;
	}
	if (sortie.ecart.trim() === "") return arret("the arbitration names a gap but does not say which");
	return await reouvrirSous(ctx, sortie.ecart, true);
}

/**
 * Writes into the registry the severity the arbitration retains for each defect the branch records, commits it when
 * one changed, and returns, for the journal, the severity each was recorded with beside the one retained. It writes
 * it even when the branch recorded the same: the arbitration may have changed the registry since.
 */
function retenirGravites(ctx: Contexte, base: string, inscrits: Defaut[], retenues: GraviteRetenue[]) {
	const releve = inscrits.map((d) => {
		const g = retenues.find((r) => r.bug_id === d.id)!;
		fixerGravite(ctx.root, base, d.id, g.gravite);
		return { bug_id: d.id, inscrite: d.gravite, retenue: g.gravite, raison: g.raison };
	});
	if (!arbrePropre(ctx.root))
		commiter(
			ctx.root,
			"docs: the registry carries the severity the arbitration retains for the defects of the branch",
			[REGISTRE],
		);
	return releve;
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
