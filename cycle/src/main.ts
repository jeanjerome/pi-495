/**
 * `cycle <story>` drives the next steps of a story until one needs the owner or blocks;
 * `cycle <story> accepte [note]` records the owner's acceptance; `cycle <story> ecart "<texte>"`
 * sends the story back to the red-green for a gap the owner names; `cycle <story> etat` prints
 * where the story stands.
 */
import { join } from "node:path";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { PREFLIGHT, Executeur } from "./controls.ts";
import { type Contexte, accepter, conduirePas, rouvrir } from "./cycle.ts";
import { Journal, racineCycle } from "./journal.ts";
import { lireStory } from "./story.ts";

function duree(ms: number): string {
	const s = Math.round(ms / 1000);
	return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
}

function contexte(id: string): Contexte {
	const root = process.cwd();
	const racine = racineCycle();
	// The suite of this repository qualifies Seatbelt itself, and a sandbox does not nest: the
	// controls run unconfined through the kernel's runner, and every evidence says so.
	const executeur = new Executeur(new UnconfinedSandbox(), new CasObjectStore(join(racine, "objects")));
	return {
		root,
		story: lireStory(id, root),
		journal: new Journal(id, racine),
		executeur,
		cible: "main",
		preflight: PREFLIGHT,
	};
}

function etat(ctx: Contexte): void {
	console.log(`${ctx.story.id} · ${ctx.story.titre} · ${ctx.story.statut}`);
	for (const e of ctx.journal.lire()) {
		const extra =
			e.genre === "session"
				? ` ${e.nom} · ${duree(Number(e.duree_ms))} · ${Number(e.cout_usd).toFixed(2)} $`
				: e.genre === "controle"
					? ` ${e.controle} · ${e.verdict}`
					: e.genre === "tour"
						? ` tour ${e.tour} · porte ${e.porte} · ${e.constats} constat(s)`
						: "";
		console.log(`  ${e.at.slice(11, 19)}  ${e.pas.padEnd(12)} ${e.genre.padEnd(10)}${extra}`);
	}
	console.log(`prochain pas : ${ctx.journal.prochainPas() ?? "aucun, la story est versée"}`);
}

async function main(argv: string[]): Promise<number> {
	const [id, commande, ...reste] = argv;
	if (!id) {
		console.error("usage: cycle <story> [etat | accepte [note] | ecart <texte>]");
		return 2;
	}
	let ctx: Contexte;
	try {
		ctx = contexte(id);
	} catch (e) {
		console.error(`⛔ ${(e as Error).message}`);
		return 2;
	}
	if (commande === "etat") {
		etat(ctx);
		return 0;
	}
	if (commande === "accepte") {
		accepter(ctx, reste.join(" "));
		console.log(`${id} : recette acceptée.`);
	} else if (commande === "ecart") {
		if (reste.length === 0) {
			console.error("cycle <story> ecart <ce qui manque>");
			return 2;
		}
		rouvrir(ctx, reste.join(" "));
		console.log(`${id} : rouverte au rouge-vert.`);
	}
	for (;;) {
		const pas = ctx.journal.prochainPas();
		if (!pas) {
			console.log(`${id} : versée. Le push de ${ctx.cible} est à vous.`);
			return 0;
		}
		const started = Date.now();
		console.log(`▶ ${id} · ${pas}`);
		const issue = await conduirePas(ctx, pas);
		const sessions = ctx.journal.depuisReouverture().filter((e) => e.pas === pas && e.genre === "session");
		const cout = sessions.reduce((sum, e) => sum + Number(e.cout_usd), 0);
		console.log(`  ${issue.statut} · ${duree(Date.now() - started)} · ${cout.toFixed(2)} $`);
		if (issue.statut === "proprietaire") {
			console.log(`\n${issue.question}`);
			return 0;
		}
		if (issue.statut === "bloque") {
			console.error(`\n⛔ ${issue.motif}`);
			return 1;
		}
	}
}

process.exitCode = await main(process.argv.slice(2));
