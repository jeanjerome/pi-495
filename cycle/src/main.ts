/**
 * `cycle <story>` drives the next steps of a story until one needs the owner or blocks;
 * `cycle <story> accepte [note]` records the owner's acceptance; `cycle <story> ecart "<texte>"`
 * sends the story back to the red-green for a gap the owner names; `cycle <story> etat` prints
 * where the story stands.
 */
import { join } from "node:path";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import {
	Titre,
	annonce,
	cloture,
	duree,
	etiquetee,
	ligneDuJournal,
	lignesDuFlux,
	ouverture,
	sonner,
} from "./affichage.ts";
import { PREFLIGHT, Executeur } from "./controls.ts";
import { type Contexte, accepter, conduirePas, rouvrir } from "./cycle.ts";
import { commitsEntre, revision } from "./git.ts";
import { Journal, type Pas, racineCycle } from "./journal.ts";
import { lireStory } from "./story.ts";

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
	// What the owner sees while the story runs: each session's stream, each journal event, each
	// control as it starts, and the terminal title on the step with how long nothing was shown.
	const titre = new Titre();
	const lancement = Date.now();
	let depense = 0;
	let courant: Pas | null = null;
	ctx.journal.observateur = (e) => {
		titre.activite();
		if (e.genre === "session") depense += Number(e.cout_usd);
		const ligne = ligneDuJournal(e);
		if (ligne) console.log(ligne);
	};
	ctx.suivi = (nom, brut) => {
		titre.activite();
		for (const ligne of lignesDuFlux(brut, ctx.root)) console.log(nom === courant ? ligne : etiquetee(nom, ligne));
	};
	ctx.annonce = (texte) => {
		titre.activite();
		console.log(annonce(texte));
	};
	process.on("SIGINT", () => {
		titre.arreter();
		console.log(`\nCycle interrompu. \`npm run cycle -- ${id}\` reprend au pas en cours.`);
		process.exit(130);
	});
	for (;;) {
		const pas = ctx.journal.prochainPas();
		if (!pas) {
			titre.arreter();
			sonner(`${id} est versée`);
			console.log(`\n${id} : versée. Le push de ${ctx.cible} est à vous.`);
			return 0;
		}
		const started = Date.now();
		const avant = revision(ctx.root);
		courant = pas;
		console.log(ouverture(id, pas, started === lancement ? null : started - lancement, depense));
		titre.suivre(`▶ ${id} · ${pas}`);
		const issue = await conduirePas(ctx, pas);
		titre.arreter();
		const sessions = ctx.journal.depuisReouverture().filter((e) => e.pas === pas && e.genre === "session");
		const cout = sessions.reduce((sum, e) => sum + Number(e.cout_usd), 0);
		console.log(cloture(pas, issue.statut, Date.now() - started, cout, commitsEntre(ctx.root, avant)));
		if (issue.statut === "proprietaire") {
			sonner(`${id} · ${pas} attend votre décision`);
			titre.arreter(`? ${id} · ${pas} attend votre décision`);
			console.log(`\n${issue.question}`);
			return 0;
		}
		if (issue.statut === "bloque") {
			sonner(`${id} · ${pas} bloqué`);
			titre.arreter(`⛔ ${id} · ${pas} bloqué`);
			console.error(`\n⛔ ${issue.motif}`);
			return 1;
		}
	}
}

process.exitCode = await main(process.argv.slice(2));
