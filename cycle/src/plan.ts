/**
 * The part of `specs/plan.yaml` the cycle reads and writes: which epics are ready to run unattended,
 * the stories each lists, and the status of both. The plan has a regular shape — one `- id:` line
 * per epic, a `status:` line under it, and one flow line per story — so it is read line by line
 * rather than through a YAML library the repository does not carry.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface StoryDuPlan {
	id: string;
	statut: string;
	titre: string;
}

export interface EpicDuPlan {
	id: string;
	statut: string;
	/** The owner marked the epic ready to run unattended: `prete: oui` under its `status:`. */
	prete: boolean;
	stories: StoryDuPlan[];
}

const EPIC = /^ {2}- id: (e\d+)\s*$/;
const STATUT = /^ {4}status: (.+?)\s*$/;
const PRETE = /^ {4}prete: oui\s*$/;
const STORY = /^ {6}- \{ id: (e\d+s\d+), status: "([^"]+)", title: "(.*)" \}\s*$/;

function cheminDuPlan(root: string): string {
	return join(root, "specs", "plan.yaml");
}

export function lirePlan(root: string): EpicDuPlan[] {
	const epics: EpicDuPlan[] = [];
	let courante: EpicDuPlan | null = null;
	for (const ligne of readFileSync(cheminDuPlan(root), "utf8").split("\n")) {
		const e = EPIC.exec(ligne);
		if (e) {
			courante = { id: e[1]!, statut: "", prete: false, stories: [] };
			epics.push(courante);
			continue;
		}
		if (!courante) continue;
		const statut = STATUT.exec(ligne);
		if (statut && courante.statut === "") courante.statut = statut[1]!;
		else if (PRETE.test(ligne)) courante.prete = true;
		else {
			const s = STORY.exec(ligne);
			if (s) courante.stories.push({ id: s[1]!, statut: s[2]!, titre: s[3]! });
		}
	}
	return epics;
}

/**
 * The lines of one epic as the plan writes them, from its `- id:` line to the next epic or top-level
 * key. The epic line is matched exactly rather than through `EPIC`, which tolerates trailing blanks.
 */
export function texteDeLEpic(root: string, epic: string): string {
	const lignes = readFileSync(cheminDuPlan(root), "utf8").split("\n");
	const debut = lignes.indexOf(`  - id: ${epic}`);
	let fin = debut + 1;
	while (fin < lignes.length && !/^ {2}- id: /.test(lignes[fin]!) && !/^[a-z]/.test(lignes[fin]!)) fin++;
	return lignes.slice(debut, fin).join("\n").trimEnd();
}

/** The first epic in plan order that the owner marked ready and that is not landed yet. */
export function prochaineEpic(plan: EpicDuPlan[]): EpicDuPlan | null {
	return plan.find((e) => e.prete && e.statut !== "versé") ?? null;
}

/** The first story an epic lists that is not landed, or null when it lists none pending. */
export function prochaineStory(epic: EpicDuPlan): StoryDuPlan | null {
	return epic.stories.find((s) => s.statut !== "versée") ?? null;
}

/** Applies `transforme` to the plan's lines; `absente` says what is missing when it finds no line to change. */
function reecrire(root: string, absente: string, transforme: (lignes: string[]) => boolean): void {
	const chemin = cheminDuPlan(root);
	const lignes = readFileSync(chemin, "utf8").split("\n");
	if (!transforme(lignes)) throw new Error(`specs/plan.yaml: ${absente}`);
	writeFileSync(chemin, lignes.join("\n"));
}

export function marquerStory(root: string, storyId: string, statut: "versée"): void {
	reecrire(root, `the story ${storyId} is not listed`, (lignes) => {
		const i = lignes.findIndex((l) => STORY.exec(l)?.[1] === storyId);
		if (i < 0) return false;
		lignes[i] = lignes[i]!.replace(/status: "[^"]+"/, `status: "${statut}"`);
		return true;
	});
}

/** Marks a story landed when the plan lists it pending; false when it is not listed or already landed. */
export function marquerStoryListee(root: string, storyId: string): boolean {
	const story = lirePlan(root)
		.flatMap((e) => e.stories)
		.find((s) => s.id === storyId);
	if (!story || story.statut === "versée") return false;
	marquerStory(root, storyId, "versée");
	return true;
}

export function marquerEpic(root: string, epicId: string, statut: "versé"): void {
	reecrire(root, `the epic ${epicId} has no status line`, (lignes) => {
		const debut = lignes.findIndex((l) => EPIC.exec(l)?.[1] === epicId);
		if (debut < 0) return false;
		for (let i = debut + 1; i < lignes.length && !EPIC.test(lignes[i]!); i++) {
			if (STATUT.test(lignes[i]!)) {
				lignes[i] = `    status: ${statut}`;
				return true;
			}
		}
		return false;
	});
}
