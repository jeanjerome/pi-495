/**
 * An exploration of a model holds for what it read. It reads the manifest, the root model and every module it reaches,
 * the configuration, the Java runtime and the jar, the variables passed to TLC, and the checker that runs and reads it
 * — `scripts/check-formal.ts` and the code of 495 it loads, though not the libraries it loads from `node_modules` —
 * under one Node on one platform. A later preparation whose exploration would read the same cites the earlier one
 * instead of running TLC again; anything that cannot be identified — a module found nowhere, a tool not found, a
 * checker that differs from `HEAD`, a module TLC reports it processed that the reading of the imports missed — runs it.
 *
 * The conclusive explorations, a completed one or a counterexample, are kept beside the stories' journals, so a story
 * cites what another one ran. Only an execution is kept, never a citation: every citation names the original.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { delimiter, isAbsolute, join, posix } from "node:path";
import type { ObjectRef } from "../../src/contracts/v1/common.ts";
import { digestBytes, digestValue } from "../../src/contracts/digest.ts";
import { formalInputsOf, uncoveredModules } from "../../src/application/formal-reuse.ts";
import type { FormalInputs } from "../../src/domain/formal-package.ts";
import type { Controle } from "./controls.ts";
import { git } from "./git.ts";

const FICHIER = "explorations.jsonl";
/** The variables the exploration passes to TLC: `PATH` and `JAVA_HOME` choose the Java it runs. */
const VARIABLES = ["PATH", "HOME", "TMPDIR", "LANG", "JAVA_HOME"];
/** The checker an exploration of the cycle runs: the script, and the code of 495 it loads to run TLC and read it. */
const VERIFICATEUR = ["scripts/check-formal.ts", "src"];

/** One exploration that ran to a conclusion, as a later preparation finds it. */
export interface ExplorationRetenue {
	identite: string;
	manifeste: string;
	issue: "completed" | "counterexample";
	trace: ObjectRef;
	story: string;
	at: string;
}

/** The value of an option in a command, such as the path after `--jar`. */
function option(commande: readonly string[], nom: string): string | undefined {
	const at = commande.indexOf(nom);
	return at >= 0 ? commande[at + 1] : undefined;
}

/** The Java the exploration runs: the one `--java` names, or the first `java` on `PATH`, as `check-formal.ts` does. */
function javaDe(commande: readonly string[], env: NodeJS.ProcessEnv): string {
	const nomme = option(commande, "--java") ?? "java";
	if (nomme.includes("/")) return nomme;
	for (const dir of (env.PATH ?? "").split(delimiter)) {
		const chemin = join(dir, nomme);
		if (dir !== "" && existsSync(chemin)) return chemin;
	}
	return nomme;
}

/**
 * The identity of what the exploration `controle` of `manifeste` would read in the tree at `root`, or the inputs
 * that keep it from having one.
 */
export async function identiteDExploration(
	root: string,
	manifeste: string,
	controle: Controle,
	env: NodeJS.ProcessEnv = process.env,
): Promise<{ identite: string; lu: FormalInputs } | { non_identifiees: string[] }> {
	if (git(root, ["status", "--porcelain", "--", ...VERIFICATEUR]) !== "")
		return { non_identifiees: [`${VERIFICATEUR.join(", ")} différent de HEAD`] };
	let modele: { model?: unknown; config?: unknown };
	try {
		modele = JSON.parse(readFileSync(join(root, manifeste), "utf8")) as typeof modele;
	} catch {
		// A manifest that cannot be read identifies nothing: the exploration runs, and says why itself.
		return { non_identifiees: [manifeste] };
	}
	if (typeof modele.model !== "string" || typeof modele.config !== "string") return { non_identifiees: [manifeste] };
	const dossier = posix.dirname(manifeste);
	const jar = option(controle.commande, "--jar");
	const lu = await formalInputsOf(
		{
			model: posix.join(dossier, modele.model),
			config: posix.join(dossier, modele.config),
			// `scripts/check-formal.ts` runs TLC in a copy of the manifest's directory.
			cwd: dossier,
			tools: [javaDe(controle.commande, env), ...(jar ? [isAbsolute(jar) ? jar : join(root, jar)] : [])],
			env_allowlist: VARIABLES,
		},
		root,
		env,
	);
	const non_identifiees = Object.keys(lu).filter((nom) => lu[nom] === null);
	if (non_identifiees.length > 0) return { non_identifiees };
	return {
		identite: digestValue({
			commande: controle.commande,
			manifeste: digestBytes(readFileSync(join(root, manifeste))),
			lu,
			verificateur: git(root, ["ls-tree", "HEAD", "--", ...VERIFICATEUR]),
			node: process.version,
			plateforme: `${process.platform}-${process.arch}`,
		}),
		lu,
	};
}

/**
 * The modules the exploration printed in `sortie` reports TLC processed, on the line `scripts/check-formal.ts` prints
 * them on, that what it would read now, `lu`, does not cover: what the reading of the imports missed.
 */
export function modulesNonCouverts(sortie: string, lu: FormalInputs): string[] {
	const ligne = sortie.split("\n").find((l) => l.startsWith("modules: "));
	return uncoveredModules(ligne ? ligne.slice("modules: ".length).split(", ") : [], lu);
}

/** The latest conclusive exploration of that identity kept under `racine`, by any story. */
export function explorationAnterieure(racine: string, identite: string): ExplorationRetenue | null {
	const chemin = join(racine, FICHIER);
	if (!existsSync(chemin)) return null;
	const lignes = readFileSync(chemin, "utf8").split("\n").filter(Boolean);
	return lignes.map((l) => JSON.parse(l) as ExplorationRetenue).findLast((e) => e.identite === identite) ?? null;
}

/** Keeps a conclusive exploration under `racine`, where any later preparation finds it. */
export function retenirExploration(racine: string, e: ExplorationRetenue): void {
	appendFileSync(join(racine, FICHIER), `${JSON.stringify(e)}\n`);
}
