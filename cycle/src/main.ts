/**
 * `cycle <story>` drives the next steps of a story until one needs the owner or blocks;
 * `cycle <story> auto` does the same and answers by itself where the owner would be asked;
 * `cycle suite` runs, one after the other, the epics the plan marks `prete: oui`, writing their
 * stories and driving each to its landing, and repairs the registry's open defects between them;
 * `cycle defauts [gravité]` repairs the open defects alone;
 * `cycle reprises` runs the refactorings of `specs/reprises.md` that change no behaviour, one commit each;
 * `cycle <story> suivre` follows a running story from another terminal;
 * `cycle <story> accepte [note]` records the owner's acceptance; `cycle <story> ecart "<texte>"`
 * sends the story back to the red-green for a gap the owner names; `cycle <story> etat` prints
 * where the story stands.
 */
import { join } from "node:path";
import {
	Sortie,
	Titre,
	annonce,
	cloture,
	duree,
	etiquetee,
	ligneDuJournal,
	lignesDuFlux,
	ouverture,
	sonner,
	suivre,
} from "./affichage.ts";
import { PREFLIGHT, executeurNonConfine } from "./controls.ts";
import { apresIssue } from "./automate.ts";
import { type Contexte, accepter, conduirePas, rouvrir } from "./cycle.ts";
import { commiter, commitsEntre, revision } from "./git.ts";
import { Journal, type Pas, racineCycle } from "./journal.ts";
import { marquerStoryListee } from "./plan.ts";
import { reprendre } from "./reprise.ts";
import { corrigerDefauts, suite } from "./suite.ts";
import { lireStory } from "./story.ts";

function contexte(id: string): Contexte {
	const root = process.cwd();
	const racine = racineCycle();
	return {
		root,
		story: lireStory(id, root),
		journal: new Journal(id, racine),
		executeur: executeurNonConfine(racine),
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

/** The ceiling of one phase of repairs, when the environment sets one. */
function defautsMax(): { defautsMax?: number } {
	return process.env.CYCLE_495_DEFAUTS_MAX !== undefined
		? { defautsMax: Number(process.env.CYCLE_495_DEFAUTS_MAX) }
		: {};
}

/** The ready epics, one after the other, the stories driven unattended. */
async function lancerSuite(): Promise<number> {
	const root = process.cwd();
	const code = await suite({
		root,
		racine: racineCycle(),
		cible: "main",
		deroulerStory: async (id) => derouler(contexte(id), id, true),
		...defautsMax(),
		annonce: (texte) => console.log(annonce(texte)),
	});
	sonner(code === 0 ? "la suite est finie" : "la suite est arrêtée");
	return code;
}

/** The open defects at or above a severity, repaired one story each, without running any epic. */
async function lancerDefauts(seuil: string | undefined): Promise<number> {
	if (seuil !== undefined && seuil !== "low" && seuil !== "medium" && seuil !== "high") {
		console.error("usage: cycle defauts [low | medium | high]");
		return 2;
	}
	const root = process.cwd();
	const r = await corrigerDefauts(
		{
			root,
			racine: racineCycle(),
			cible: "main",
			deroulerStory: async (id) => derouler(contexte(id), id, true),
			...defautsMax(),
			annonce: (texte) => console.log(annonce(texte)),
		},
		seuil ?? "medium",
		"le propriétaire a demandé la correction des défauts ouverts",
	);
	for (const d of r.aDecider) console.log(annonce(`à décider : ${d.bug_id} — ${d.raison}`));
	sonner(r.code === 0 ? "les défauts sont corrigés" : "la correction est arrêtée");
	return r.code;
}

/** The refactorings of the list that change no behaviour, each relayed to the terminal as it runs. */
async function lancerReprises(): Promise<number> {
	const root = process.cwd();
	const racine = racineCycle();
	const code = await reprendre({
		root,
		racine,
		cible: "main",
		executeur: executeurNonConfine(racine),
		preflight: PREFLIGHT,
		build: { id: "build", commande: ["npm", "run", "build"], reseau: "denied", timeout_ms: 300_000 },
		...(process.env.CYCLE_495_REPRISES_MAX ? { max: Number(process.env.CYCLE_495_REPRISES_MAX) } : {}),
		annonce: (texte) => console.log(annonce(texte)),
		suivi: (nom, brut) => {
			for (const ligne of lignesDuFlux(brut, root)) console.log(etiquetee(nom, ligne));
		},
	});
	sonner(code === 0 ? "les reprises sont finies" : "les reprises sont arrêtées");
	return code;
}

async function main(argv: string[]): Promise<number> {
	const [id, commande, ...reste] = argv;
	if (!id) {
		console.error(
			"usage: cycle suite | cycle defauts [gravité] | cycle reprises | cycle <story> [etat | suivre | auto | accepte [note] | ecart <texte>]",
		);
		return 2;
	}
	if (id === "suite") return await lancerSuite();
	if (id === "defauts") return await lancerDefauts(commande);
	if (id === "reprises") return await lancerReprises();
	let ctx: Contexte;
	try {
		ctx = contexte(id);
	} catch (e) {
		console.error(`⛔ ${(e as Error).message}`);
		return 2;
	}
	const direct = join(ctx.journal.dir, "en-direct.log");
	if (commande === "etat") {
		etat(ctx);
		return 0;
	}
	if (commande === "suivre") await suivre(direct, id);
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
	const code = await derouler(ctx, id, commande === "auto");
	// The suite marks the plan itself after each story it drives; a story driven alone is marked here.
	if (code === 0 && ctx.journal.prochainPas() === null && marquerStoryListee(ctx.root, id)) {
		commiter(ctx.root, `docs: the plan marks ${id} landed`, ["specs/plan.yaml"]);
	}
	return code;
}

let interruption: (() => void) | null = null;
process.on("SIGINT", () => interruption?.());

/** The most one story may spend before an unattended run gives it back to the owner. */
function plafond(): number {
	return Number(process.env.CYCLE_495_PLAFOND_USD ?? 80);
}

function coutTotal(ctx: Contexte): number {
	return ctx.journal
		.lire()
		.filter((e) => e.genre === "session")
		.reduce((sum, e) => sum + Number(e.cout_usd), 0);
}

/** Drives a story to its landing, or to the step that stops it; `auto` answers in the owner's place. */
async function derouler(ctx: Contexte, id: string, auto: boolean): Promise<number> {
	const direct = join(ctx.journal.dir, "en-direct.log");
	// What the owner sees while the story runs: each session's stream, each journal event, each
	// control as it starts, and the terminal title on the step with how long nothing was shown. The
	// same lines go to the file `cycle <story> suivre` follows from another terminal.
	const sortie = new Sortie(direct);
	const titre = new Titre();
	const lancement = Date.now();
	let depense = 0;
	let courant: Pas | null = null;
	ctx.journal.observateur = (e) => {
		titre.activite();
		if (e.genre === "session") depense += Number(e.cout_usd);
		const ligne = ligneDuJournal(e);
		if (ligne) sortie.ecrire(ligne);
	};
	ctx.suivi = (nom, brut) => {
		titre.activite();
		for (const ligne of lignesDuFlux(brut, ctx.root)) sortie.ecrire(nom === courant ? ligne : etiquetee(nom, ligne));
	};
	ctx.annonce = (texte) => {
		titre.activite();
		sortie.ecrire(annonce(texte));
	};
	interruption = () => {
		titre.arreter();
		sortie.ecrire(`\nCycle interrompu. \`npm run cycle -- ${id}\` reprend au pas en cours.`);
		process.exit(130);
	};
	for (;;) {
		const pas = ctx.journal.prochainPas();
		if (!pas) {
			titre.arreter();
			sonner(`${id} est versée`);
			sortie.ecrire(`\n${id} : versée. Le push de ${ctx.cible} est à vous.`);
			return 0;
		}
		if (auto && coutTotal(ctx) > plafond()) {
			sonner(`${id} · plafond de coût atteint`);
			titre.arreter(`⛔ ${id} · plafond de coût atteint`);
			sortie.ecrire(
				`\n⛔ ${id} a dépensé ${coutTotal(ctx).toFixed(2)} $, au-delà de ${plafond()} $ (CYCLE_495_PLAFOND_USD) : le propriétaire décide de la suite.`,
			);
			return 1;
		}
		const started = Date.now();
		const avant = revision(ctx.root);
		const reouvertAvant = ctx.journal.reouvertures();
		courant = pas;
		sortie.ecrire(ouverture(id, pas, started === lancement ? null : started - lancement, depense));
		titre.suivre(`▶ ${id} · ${pas}`);
		const issue = await conduirePas(ctx, pas);
		titre.arreter();
		const sessions = ctx.journal.depuisReouverture().filter((e) => e.pas === pas && e.genre === "session");
		const cout = sessions.reduce((sum, e) => sum + Number(e.cout_usd), 0);
		sortie.ecrire(cloture(pas, issue.statut, Date.now() - started, cout, commitsEntre(ctx.root, avant)));
		if (auto && issue.statut !== "fini") {
			const suite = await apresIssue(ctx, pas, issue, reouvertAvant);
			if (suite.continuer) continue;
			sonner(`${id} · ${pas} arrêté`);
			titre.arreter(`⛔ ${id} · ${pas} arrêté`);
			sortie.ecrire(`\n⛔ ${suite.motif}`);
			return 1;
		}
		if (issue.statut === "proprietaire") {
			sonner(`${id} · ${pas} attend votre décision`);
			titre.arreter(`? ${id} · ${pas} attend votre décision`);
			sortie.ecrire(`\n${issue.question}`);
			return 0;
		}
		if (issue.statut === "bloque") {
			sonner(`${id} · ${pas} bloqué`);
			titre.arreter(`⛔ ${id} · ${pas} bloqué`);
			sortie.ecrire(`\n⛔ ${issue.motif}`);
			return 1;
		}
	}
}

process.exitCode = await main(process.argv.slice(2));
