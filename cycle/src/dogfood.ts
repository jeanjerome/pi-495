/**
 * The dogfooding campaign: a stable, identified build of pi-495 — the controller — drives a change of another copy
 * of pi-495 — the candidate — in a real Pi with a real model. This launcher only extracts the two revisions from the
 * repository it runs in: the controller at its revision, with its dependencies, and the candidate as a repository of
 * one commit. It then hands the campaign to the controller's own `cycle/src/dogfood-controleur.ts`, run from the
 * controller's tree, so that the declaration of the controls, the driver of Pi and the record are those of the
 * controller's revision even when the launcher runs from the candidate's working tree. The launcher itself runs only
 * when it is the one the controller's revision carries: a candidate that rewrites it runs no campaign from its own
 * tree. It imports nothing of the tree but erased types, since a module it loaded would be the tree's, which that
 * check does not cover: it keeps its own copy of the option reading and the timestamp of `campagne.ts`. A controller
 * whose revision carries no such campaign cannot drive one. It is launched by `node` alone, never by a package
 * script: the line of the tree's `package.json` would run before it, and could load what it wants into it.
 *
 * Usage: `node cycle/src/dogfood.ts --objectif "<the change>" [--controleur <revision>] [--candidat <revision>]
 * [--model <provider/id>] [--thinking <level>]`; the controller defaults to `main`, the candidate to `HEAD`.
 *
 * The campaign lives under `~/.495/campagnes/dogfood-<timestamp>/`: `controleur/` is the controller's tree and build,
 * `cible/` the copy the change is made in, `dossier/` the controller's data directory, and `releve.json` its record.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Lancement } from "./dogfood-controleur.ts";

const CAMPAGNE_DU_CONTROLEUR = join("cycle", "src", "dogfood-controleur.ts");
const LANCEUR = "cycle/src/dogfood.ts";
const MODELE_PAR_DEFAUT = "anthropic/claude-sonnet-5-5";

function option(args: string[], nom: string, parDefaut: string): string {
	const i = args.indexOf(nom);
	return i === -1 ? parDefaut : (args[i + 1] ?? parDefaut);
}

function executer(commande: string[], cwd: string): string {
	const [programme, ...arguments_] = commande;
	return execFileSync(programme!, arguments_, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

/**
 * Whether the launcher that runs is the one the controller's revision `sha` carries, byte for byte: a launcher the
 * candidate rewrote could change the controller's tree after extracting it and before handing over to it.
 */
function lanceurDuControleur(depot: string, sha: string): boolean {
	const attendu = spawnSync("git", ["rev-parse", "-q", "--verify", `${sha}:${LANCEUR}`], {
		cwd: depot,
		encoding: "utf8",
	});
	const lance = executer(["git", "hash-object", fileURLToPath(import.meta.url)], depot);
	return attendu.status === 0 && attendu.stdout.trim() === lance;
}

/**
 * The tree of `depot` at `revision`, extracted into `dossier` with its dependencies installed, no install script run
 * and its `.npmrc` set aside: the candidate's scripts, and a program its npm configuration names — the `git` npm runs
 * to fetch a git dependency —, would run unconfined beside the controller's tree before the controller identifies
 * itself.
 */
function extraire(depot: string, revision: string, dossier: string): string {
	mkdirSync(dossier, { recursive: true });
	const sha = executer(["git", "rev-parse", `${revision}^{commit}`], depot);
	const archive = `${dossier}.tar`;
	executer(["git", "archive", "--format=tar", "-o", archive, sha], depot);
	executer(["tar", "-xf", archive, "-C", dossier], depot);
	rmSync(archive);
	const [npmrc, aside] = [join(dossier, ".npmrc"), `${dossier}.npmrc`];
	const configured = existsSync(npmrc);
	if (configured) renameSync(npmrc, aside);
	execFileSync("npm", ["ci", "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: dossier, stdio: "inherit" });
	if (configured) renameSync(aside, npmrc);
	return sha;
}

function horodatage(): string {
	return new Date()
		.toISOString()
		.replace(/\.\d+Z$/, "")
		.replace(/[-:]/g, "");
}

function main(): number {
	const args = process.argv.slice(2);
	const objectif = option(args, "--objectif", "");
	if (!objectif) {
		console.error(
			'usage: node cycle/src/dogfood.ts --objectif "<the change>" [--controleur <revision>] [--candidat <revision>] [--model <id>] [--thinking <level>]',
		);
		return 2;
	}
	const depot = process.cwd();
	const campagne = join(homedir(), ".495", "campagnes", `dogfood-${horodatage()}`);
	const [controleur, cible] = [join(campagne, "controleur"), join(campagne, "cible")];

	const revisionControleur = executer(["git", "rev-parse", `${option(args, "--controleur", "main")}^{commit}`], depot);
	if (!lanceurDuControleur(depot, revisionControleur)) {
		console.error(
			`the launcher that runs is not the one the controller at ${revisionControleur} carries (${LANCEUR}): run the campaign from a tree whose launcher is the controller's`,
		);
		return 2;
	}
	console.log(`campaign ${campagne}`);
	extraire(depot, revisionControleur, controleur);
	const script = join(controleur, CAMPAGNE_DU_CONTROLEUR);
	if (!existsSync(script)) {
		console.error(
			`the controller at ${revisionControleur} carries no dogfooding campaign (${CAMPAGNE_DU_CONTROLEUR}): name a controller revision that does`,
		);
		return 2;
	}

	const revisionCandidat = extraire(depot, option(args, "--candidat", "HEAD"), cible);
	const git = (...a: string[]) =>
		executer(["git", "-c", "user.name=dogfood", "-c", "user.email=dogfood@localhost", ...a], cible);
	git("init", "-q", "-b", "main");
	git("add", "-A");
	git("commit", "-q", "-m", `pi-495 at ${revisionCandidat}`);

	const lancement: Lancement = {
		campagne,
		revision_controleur: revisionControleur,
		revision_candidat: revisionCandidat,
		cible,
		depart: git("rev-parse", "HEAD"),
		objectif,
		modele: option(args, "--model", MODELE_PAR_DEFAUT),
		reflexion: option(args, "--thinking", "high"),
	};
	return (
		spawnSync(process.execPath, [script, JSON.stringify(lancement)], { cwd: controleur, stdio: "inherit" }).status ?? 1
	);
}

process.exitCode = main();
