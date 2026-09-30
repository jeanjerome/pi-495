/**
 * The part of `specs/bugs/registry.yaml` the cycle reads and writes: the defects still open with
 * their severity, and a defect marked fixed once the story that repairs it has landed. The registry
 * has one `- bug_id:` line per entry and one line per scalar field, so it is read line by line, as
 * the plan is.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Gravite = "low" | "medium" | "high";

export interface Defaut {
	id: string;
	gravite: Gravite;
	titre: string;
}

const ENTREE = /^ {2}- bug_id: (BUG-\S+)\s*$/;
const CHAMP = /^ {4}(severity|status|title): (.+?)\s*$/;
const ORDRE: Record<string, number> = { low: 0, medium: 1, high: 2 };

function chemin(root: string): string {
	return join(root, "specs", "bugs", "registry.yaml");
}

/** The defects still open whose severity is at least `seuil`, most severe first, oldest first within a severity. */
export function defautsOuverts(root: string, seuil: Gravite): Defaut[] {
	if (!existsSync(chemin(root))) return [];
	const trouves: (Defaut & { statut: string })[] = [];
	let courant: (Defaut & { statut: string }) | null = null;
	for (const ligne of readFileSync(chemin(root), "utf8").split("\n")) {
		const e = ENTREE.exec(ligne);
		if (e) {
			courant = { id: e[1]!, gravite: "low", titre: "", statut: "" };
			trouves.push(courant);
			continue;
		}
		const c = CHAMP.exec(ligne);
		if (!c || !courant) continue;
		if (c[1] === "severity") courant.gravite = c[2] as Gravite;
		else if (c[1] === "status") courant.statut = c[2]!;
		else courant.titre = c[2]!.replace(/^"(.*)"$/, "$1");
	}
	return trouves
		.filter((d) => d.statut === "open" && (ORDRE[d.gravite] ?? 0) >= ORDRE[seuil]!)
		.map(({ statut: _statut, ...d }) => d)
		.sort((a, b) => (ORDRE[b.gravite] ?? 0) - (ORDRE[a.gravite] ?? 0));
}

/** The registry entry a correction story cites: the first identifier of the kind the registry writes. */
export function defautDeLaStory(markdown: string): string | null {
	return /BUG-\d{4}-\d{2}-\d{2}T\d{6}/.exec(markdown)?.[0] ?? null;
}

/** Where an entry goes once fixed: the registry keeps the open defects only. */
function cheminArchive(root: string): string {
	return join(root, "specs", "bugs", "registry-fixed.yaml");
}

/** Moves an open entry to the archive of fixed defects, marked fixed at the revision that fixed it. */
export function marquerCorrige(root: string, id: string, sha: string): void {
	const fichier = chemin(root);
	const lignes = readFileSync(fichier, "utf8").split("\n");
	const debut = lignes.findIndex((l) => ENTREE.exec(l)?.[1] === id);
	if (debut < 0) throw new Error(`specs/bugs/registry.yaml: ${id} not found`);
	let fin = debut + 1;
	while (fin < lignes.length && !ENTREE.test(lignes[fin]!) && lignes[fin] !== "") fin++;
	const i = lignes.slice(debut, fin).indexOf("    status: open");
	if (i < 0) throw new Error(`specs/bugs/registry.yaml: ${id} is not open`);
	const entree = lignes.slice(debut, fin);
	entree.splice(i, 1, "    status: fixed", `    fixed_in: ${sha}`);
	const archive = cheminArchive(root);
	const dejaArchives = existsSync(archive) ? readFileSync(archive, "utf8") : "bugs:\n";
	writeFileSync(archive, `${dejaArchives}${entree.join("\n")}\n`);
	lignes.splice(debut, fin - debut);
	writeFileSync(fichier, lignes.join("\n"));
}
