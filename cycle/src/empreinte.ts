/**
 * The identity of a build: the dogfooding campaign reads it on the controller's `dist/` before and after the change,
 * so that a controller replaced during the campaign does not go unnoticed.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** The digest of every file under `dossier`, by path. */
export function empreinte(dossier: string): string {
	const hash = createHash("sha256");
	const pile = [dossier];
	const fichiers: string[] = [];
	while (pile.length > 0) {
		const courant = pile.pop()!;
		for (const nom of readdirSync(courant)) {
			const chemin = join(courant, nom);
			if (statSync(chemin).isDirectory()) pile.push(chemin);
			else fichiers.push(chemin);
		}
	}
	for (const f of fichiers.sort()) hash.update(relative(dossier, f)).update("\0").update(readFileSync(f));
	return `sha256:${hash.digest("hex")}`;
}
