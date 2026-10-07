/**
 * A green Preflight holds for what it read. It reads the code, the package's manifests and the few texts
 * its checks open — the README, NOTICE and LICENSE the distribution check reads, the normative corpus the
 * architecture check reads, the stories the story-format check reads — under one Node. A commit that
 * touches none of these, such as a decision, the plan, the registry or a record, a squash that leaves the
 * same content, or the start of a step on the head the previous step checked, does not run it again.
 *
 * The content is named by the Git objects of what Preflight reads at `HEAD`, so a working tree that
 * differs from `HEAD` has no name and always runs it. The names of green contents are kept beside the
 * stories' journals, so the next story starts on the content the last one landed without running it
 * again.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./git.ts";

/** What Preflight reads at the root of the repository, besides the `tsconfig*.json` files. */
const LUS_A_LA_RACINE = new Set([
	"src",
	"test",
	"scripts",
	"bench",
	"contracts",
	"cycle",
	"types",
	"README.md",
	"NOTICE",
	"LICENSE",
	"package.json",
	"package-lock.json",
	"biome.json",
]);
/** What Preflight reads under `specs/`. */
const LUS_DANS_SPECS = ["specs/amont", "specs/stories"];
const FICHIER = "preflight-vertes.txt";

/** The name of what Preflight would read at `HEAD`, or nothing when the working tree differs from it. */
export function contenuLu(root: string): string | null {
	if (git(root, ["status", "--porcelain"]) !== "") return null;
	const racine = git(root, ["ls-tree", "HEAD"])
		.split("\n")
		.filter((ligne) => {
			const nom = ligne.split("\t")[1] ?? "";
			return LUS_A_LA_RACINE.has(nom) || /^tsconfig.*\.json$/.test(nom);
		});
	const specs = git(root, ["ls-tree", "HEAD", "--", ...LUS_DANS_SPECS]);
	return createHash("sha256")
		.update(`${process.version}\n${racine.join("\n")}\n${specs}`)
		.digest("hex");
}

/** Whether a Preflight already passed on that content, in any story kept under `racine`. */
export function dejaVerte(racine: string, contenu: string): boolean {
	const chemin = join(racine, FICHIER);
	return existsSync(chemin) && readFileSync(chemin, "utf8").split("\n").includes(contenu);
}

export function retenirVerte(racine: string, contenu: string): void {
	appendFileSync(join(racine, FICHIER), `${contenu}\n`);
}
