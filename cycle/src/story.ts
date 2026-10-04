/**
 * A story as `cycle/format-de-story.md` states it: a title, three header lines, five sections, and
 * tasks that each say what holds them. The reader is deliberately strict — a story the format
 * control refuses is not a story the cycle drives.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type Statut = "à faire" | "en cours" | "versée";

export interface Tache {
	numero: number;
	titre: string;
	description: string;
	/** The command that holds the task, as argv; null when the task is checked by hand. */
	verifie: string[] | null;
	/** The manual steps, when `Vérifie à la main :` stands for the command. */
	verifieALaMain: string | null;
	tient: string;
	rouge: string;
}

export interface Story {
	id: string;
	epic: string;
	titre: string;
	statut: Statut;
	chemin: string;
	gagne: string;
	promesses: string;
	scenarios: string[];
	securite: string;
	taches: Tache[];
	horsPerimetre: string;
}

const SECTION = /^## (\d+)\. (.+)$/;
const TASK = /^### Tâche (\d+) — (.+)$/;
const STORY_FILE = /^e\d+s\d+-.+\.md$/;

function sections(markdown: string): Map<string, string[]> {
	const found = new Map<string, string[]>();
	let current: string[] | null = null;
	let fenced = false;
	for (const line of markdown.split("\n")) {
		if (line.startsWith("```")) fenced = !fenced;
		const m = fenced ? null : SECTION.exec(line);
		if (m) {
			current = [];
			found.set(m[2]!.trim(), current);
		} else current?.push(line);
	}
	return found;
}

function header(preamble: string, key: string, source: string): string {
	const m = new RegExp(`^${key} : (.+)$`, "m").exec(preamble);
	if (!m) throw new Error(`${source}: story header "${key}" is missing`);
	return m[1]!.trim();
}

function ligne(lines: string[], label: string): string | null {
	const prefix = `- ${label}`;
	const found = lines.find((l) => l.startsWith(prefix));
	return found ? found.slice(prefix.length).trim() : null;
}

/** `` `node --test test/v2/x.test.ts` `` → its argv. A verify command carries no quoting. */
function commande(text: string): string[] {
	const m = /`([^`]+)`/.exec(text);
	return (m ? m[1]! : text).trim().split(/\s+/);
}

function taches(lines: string[]): Tache[] {
	const result: Tache[] = [];
	let current: { numero: number; titre: string; body: string[] } | null = null;
	const close = (): void => {
		if (!current) return;
		const body = current.body;
		const verifie = ligne(body, "Vérifie :");
		const aLaMain = ligne(body, "Vérifie à la main :");
		result.push({
			numero: current.numero,
			titre: current.titre,
			description: body
				.filter((l) => !l.startsWith("- "))
				.join("\n")
				.trim(),
			verifie: verifie ? commande(verifie) : null,
			verifieALaMain: aLaMain,
			tient: ligne(body, "Tient :") ?? "",
			rouge: ligne(body, "Rouge :") ?? "",
		});
	};
	for (const line of lines) {
		const m = TASK.exec(line);
		if (m) {
			close();
			current = { numero: Number(m[1]), titre: m[2]!.trim(), body: [] };
		} else current?.body.push(line);
	}
	close();
	return result;
}

export function parseStory(markdown: string, chemin = ""): Story {
	// What an error names: the file, or the story itself when it was not read from one.
	const source = chemin || "story";
	const preamble = markdown.split("\n## ")[0]!;
	const titre = /^# (.+)$/m.exec(preamble)?.[1]?.trim() ?? "";
	const statut = header(preamble, "Statut", source);
	if (statut !== "à faire" && statut !== "en cours" && statut !== "versée")
		throw new Error(`${source}: unknown statut "${statut}" (à faire, en cours or versée)`);
	const s = sections(markdown);
	const text = (name: string): string => (s.get(name) ?? []).join("\n").trim();
	const promesses = text("Promesses");
	return {
		id: header(preamble, "Story", source),
		epic: header(preamble, "Epic", source),
		titre,
		statut,
		chemin,
		gagne: text("Ce que le lecteur gagne"),
		promesses,
		scenarios: promesses
			.split("\n")
			.filter((l) => l.startsWith("Scenario:"))
			.map((l) => l.slice("Scenario:".length).trim()),
		securite: text("Sécurité"),
		taches: taches(s.get("Tâches") ?? []),
		horsPerimetre: text("Hors périmètre"),
	};
}

/** The story file of `id` under `specs/stories/`, wherever its epic directory puts it. */
export function trouverStory(id: string, root: string): string {
	const dir = join(root, "specs", "stories");
	if (!existsSync(dir)) throw new Error(`no specs/stories/ under ${root}`);
	const walk = (d: string): string | null => {
		for (const entry of readdirSync(d)) {
			const path = join(d, entry);
			if (statSync(path).isDirectory()) {
				const found = walk(path);
				if (found) return found;
			} else if (STORY_FILE.test(entry) && entry.startsWith(`${id}-`)) return path;
		}
		return null;
	};
	const found = walk(dir);
	if (!found) throw new Error(`story ${id} not found under specs/stories/`);
	return found;
}

export function lireStory(id: string, root: string): Story {
	const chemin = trouverStory(id, root);
	return parseStory(readFileSync(chemin, "utf8"), chemin);
}

/** Rewrites the `Statut` header line, the one line of a story the tool owns. */
export function avecStatut(markdown: string, statut: Statut): string {
	return markdown.replace(/^Statut : .+$/m, `Statut : ${statut}`);
}
