/**
 * What the terminal shows while a story runs, for the owner who launched it: each step opens on a
 * line that places it among the six, each session streams one line per event — the agent's text,
 * each tool call, each commit, the test totals a run prints, a failed call — each control says when
 * it starts and how it ended, and each step closes on its outcome, duration, cost and commits. The
 * terminal title names the step and how long nothing has been written. The same lines go to a file
 * of the story's dossier, which `cycle <story> suivre` follows from another terminal. None of it is a
 * record: the journal and the stored transcripts are.
 */
import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, openSync, readSync, statSync, writeFileSync } from "node:fs";
import { stripVTControlCharacters, styleText } from "node:util";
import type { Commit } from "./git.ts";
import { type Evenement, PAS, type Pas } from "./journal.ts";

type Style = Parameters<typeof styleText>[0];

// Styled whatever the stream: the file another terminal follows keeps the colours, and each
// reader strips them when its own output is not a terminal.
const s = (style: Style, texte: string): string => styleText(style, texte, { validateStream: false });

function pourCeTerminal(texte: string): string {
	return process.stdout.isTTY && !process.env.NO_COLOR ? texte : stripVTControlCharacters(texte);
}

/** The display of a run: on this terminal, and in a file another terminal can follow. */
export class Sortie {
	private readonly fichier: string;

	constructor(fichier: string) {
		this.fichier = fichier;
		writeFileSync(fichier, "");
	}

	ecrire(texte: string): void {
		console.log(pourCeTerminal(texte));
		appendFileSync(this.fichier, `${texte}\n`);
	}
}

/**
 * Follows, from another terminal, the file a run writes: what is already there, then each line as it
 * is added, until Ctrl-C. A new run empties the file, and the reading starts again from its top.
 */
export async function suivre(fichier: string, story: string): Promise<never> {
	console.log(pourCeTerminal(s("gray", `Suivi de ${story} — ${fichier} — Ctrl-C pour quitter`)));
	if (!existsSync(fichier)) console.log(pourCeTerminal(s("gray", "  aucun cycle lancé pour l'instant, en attente…")));
	let lu = 0;
	const lire = (): void => {
		const taille = existsSync(fichier) ? statSync(fichier).size : 0;
		if (taille < lu) lu = 0;
		if (taille === lu) return;
		const tampon = Buffer.alloc(taille - lu);
		const fd = openSync(fichier, "r");
		readSync(fd, tampon, 0, tampon.length, lu);
		closeSync(fd);
		// Only whole lines: a line the run is still writing is read on the next pass.
		const fin = tampon.lastIndexOf(0x0a);
		if (fin < 0) return;
		lu += fin + 1;
		process.stdout.write(pourCeTerminal(tampon.subarray(0, fin + 1).toString("utf8")));
	};
	lire();
	setInterval(lire, 500);
	return new Promise<never>(() => {});
}

const APROPOS: Record<Pas, string> = {
	story: "branche et base verte",
	"rouge-vert": "rouge puis vert, tâche par tâche",
	autocontrole: "relecture du diff contre les standards",
	relecture: "deux relecteurs neufs, deux tours au plus",
	recette: "exécution réelle et contrôle négatif",
	versement: "un commit écrasé sur la cible",
};

function clip(texte: string, n: number): string {
	return texte.length > n ? `${texte.slice(0, n)}…` : texte;
}

function premiereLigne(texte: string): string {
	const lignes = texte.split("\n");
	return lignes.length > 1 ? `${lignes[0]}  …(+${lignes.length - 1} lignes)` : texte;
}

/** The sum of every `# pass N` or `ℹ pass N` a node:test run prints, or null when there is none. */
function total(sortie: string, cle: "pass" | "fail"): number | null {
	let somme: number | null = null;
	for (const m of sortie.matchAll(new RegExp(`(?:#|ℹ) ${cle} (\\d+)`, "g"))) somme = (somme ?? 0) + Number(m[1]);
	return somme;
}

export function duree(ms: number): string {
	const sec = Math.round(ms / 1000);
	if (sec >= 3600) return `${Math.floor(sec / 3600)} h ${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;
	if (sec >= 60) return `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, "0")} s`;
	return `${sec} s`;
}

function argent(usd: number): string {
	return `${usd.toFixed(2).replace(".", ",")} $`;
}

interface Bloc {
	type?: string;
	text?: string;
	name?: string;
	input?: Record<string, unknown>;
	content?: unknown;
	is_error?: boolean;
}

interface Ligne {
	type?: string;
	subtype?: string;
	parent_tool_use_id?: string | null;
	message?: { content?: unknown } | string;
	content?: unknown;
}

function appel(b: Bloc, relatif: (p: unknown) => string): string | null {
	const i = b.input ?? {};
	switch (b.name) {
		case "Bash":
			return `$ ${clip(premiereLigne(String(i.command ?? "")), 200)}${i.description ? `   # ${String(i.description)}` : ""}`;
		case "Read":
			return `· Read ${relatif(i.file_path)}${i.offset ? ` @${String(i.offset)}` : ""}`;
		case "Write":
			return `· Write ${relatif(i.file_path)} (${String(i.content ?? "").split("\n").length} lignes)`;
		case "Edit":
			return `· Edit ${relatif(i.file_path)}`;
		case "Grep":
		case "Glob":
			return `· ${b.name} ${String(i.pattern ?? "")} ${i.path ? relatif(i.path) : ""}`.trimEnd();
		case "Agent":
			return `· Agent (${String(i.subagent_type ?? "general-purpose")}) ${String(i.description ?? "")}`;
		case "StructuredOutput":
			return null;
		default:
			return `· ${b.name ?? "?"}`;
	}
}

function resultat(b: Bloc): string | null {
	const sortie = Array.isArray(b.content)
		? (b.content as Bloc[]).map((c) => c.text ?? "").join("\n")
		: String(b.content ?? "");
	const commits = [...sortie.matchAll(/\[[^\]\n]+ ([0-9a-f]{7,})\] ([^\n]+)/g)];
	if (commits.length > 0) return commits.map((m) => s("green", `● commit ${m[1]} ${clip(m[2] ?? "", 160)}`)).join("\n");
	const pass = total(sortie, "pass");
	const fail = total(sortie, "fail");
	if ((fail ?? 0) > 0) return s("red", `✗ tests : ${fail} en échec, ${pass ?? 0} passent`);
	if (pass !== null) return s("green", `✓ tests : ${pass} passent`);
	if (b.is_error) {
		const lignes = sortie.split("\n").filter((l) => l.length > 0);
		return s("red", `  ✗ ${clip(lignes.slice(0, 2).join(" — "), 200)}`);
	}
	return null;
}

/**
 * The lines one event of a `claude -p --output-format stream-json` session shows: nothing for the
 * events that say nothing to the owner, one line per text, tool call, commit, test run or failure.
 */
export function lignesDuFlux(brut: string, repo: string): string[] {
	if (!brut.startsWith("{")) return [];
	let e: Ligne;
	try {
		e = JSON.parse(brut) as Ligne;
	} catch {
		// A line of the stream that is not JSON carries no event, so it has nothing to show.
		return [];
	}
	const pad = e.parent_tool_use_id ? "    ↳ " : "  ";
	const relatif = (p: unknown): string => String(p ?? "?").replace(`${repo}/`, "");
	const blocs = (): Bloc[] => {
		const contenu = typeof e.message === "object" ? e.message.content : undefined;
		return Array.isArray(contenu) ? (contenu as Bloc[]) : [];
	};
	if (e.type === "assistant")
		return blocs().flatMap((b) => {
			if (b.type === "text" && b.text)
				return [
					b.text
						.split("\n")
						.map((l) => pad + l)
						.join("\n"),
				];
			if (b.type !== "tool_use") return [];
			const ligne = appel(b, relatif);
			return ligne === null ? [] : [s(b.name === "Agent" ? "magenta" : "gray", pad + ligne)];
		});
	if (e.type === "user")
		return blocs()
			.filter((b) => b.type === "tool_result")
			.flatMap((b) => {
				const ligne = resultat(b);
				return ligne === null ? [] : [ligne.replace(/^/gm, pad)];
			});
	if (e.type === "system" && e.subtype === "permission_denied") {
		const texte = String(typeof e.message === "string" ? e.message : (e.content ?? ""));
		return [s("yellow", `  ⛔ refusé : ${clip(texte.split("\n").filter(Boolean).slice(0, 2).join(" — "), 200)}`)];
	}
	return [];
}

/** A line of one of several sessions running at once, prefixed with the session it comes from. */
export function etiquetee(nom: string, ligne: string): string {
	return ligne.replace(/^/gm, `${s("cyan", nom)} `);
}

/** A notice the journal does not carry, such as a control that has started. */
export function annonce(texte: string): string {
	return s("gray", `  ⋯ ${texte}`);
}

/** The line a journal event shows, when it says something the stream of a session does not. */
export function ligneDuJournal(e: Evenement): string | null {
	switch (e.genre) {
		case "controle": {
			const ms = Date.parse(String(e.ended_at)) - Date.parse(String(e.started_at));
			const texte = `${e.verdict === "PASS" ? "✓" : "✗"} ${String(e.controle)} · ${String(e.verdict)} à ${String(e.revision).slice(0, 7)} · ${duree(ms)}`;
			const echecs = (e.echecs as string[] | undefined) ?? [];
			return s(
				e.verdict === "PASS" ? "green" : "red",
				`  ${texte}${echecs.length ? `\n    ${echecs.slice(0, 5).join("\n    ")}` : ""}`,
			);
		}
		case "rouge":
			return s(
				e.rouge ? "green" : "red",
				`  ${e.rouge ? "✓" : "✗"} rouge rejoué à ${String(e.commit).slice(0, 7)} ${clip(String(e.sujet), 100)}`,
			);
		case "tour":
			return s("bold", `  tour ${String(e.tour)} · porte ${String(e.porte)} · ${String(e.constats)} constat(s)`);
		case "session":
			return s(
				e.ok ? "gray" : "red",
				`  ◼ session ${String(e.nom)} · ${duree(Number(e.duree_ms))} · ${argent(Number(e.cout_usd))} · ${String(e.tours)} tours`,
			);
		default:
			return null;
	}
}

/** The line a step opens on: the step, what it does, and where it stands among the six. */
export function ouverture(story: string, pas: Pas, depuisMs: number | null, depense: number): string {
	const rang = PAS.indexOf(pas);
	const frise = PAS.map((p, i) =>
		i < rang ? s("green", `✓ ${p}`) : i === rang ? s(["bold", "magenta"], `▶ ${p}`) : s("gray", `· ${p}`),
	).join("  ");
	const suite = depuisMs === null ? "" : s("gray", `  depuis ${duree(depuisMs)} · ${argent(depense)}`);
	return `\n${s("bold", `▶ ${story} · ${pas}`)} — ${APROPOS[pas]}\n  ${frise}${suite ? `\n${suite}` : ""}`;
}

/** The lines a step closes on: its outcome, what it took, and the commits it made. */
export function cloture(pas: Pas, statut: string, ms: number, cout: number, commits: Commit[]): string {
	const marque =
		statut === "fini"
			? s("green", "✓ fini")
			: statut === "proprietaire"
				? s("yellow", "? décision attendue")
				: s("red", "✗ bloqué");
	const lignes = [`■ ${pas} · ${marque}  ${s("gray", `${duree(ms)} · ${argent(cout)}`)}`];
	for (const c of commits) lignes.push(s("green", `  ● ${c.sha.slice(0, 7)} ${clip(c.sujet, 160)}`));
	return lignes.join("\n");
}

/** Keeps the terminal title on the step running, with how long nothing has been shown. */
export class Titre {
	private timer: NodeJS.Timeout | null = null;
	private derniere = Date.now();

	activite(): void {
		this.derniere = Date.now();
	}

	suivre(libelle: string): void {
		this.arreter();
		const debut = Date.now();
		this.derniere = debut;
		const poser = (): void => {
			const silence = Date.now() - this.derniere;
			ecrireTitre(
				`${libelle} · ${Math.floor((Date.now() - debut) / 60_000)} min${silence >= 60_000 ? ` · silence ${Math.floor(silence / 60_000)} min` : ""}`,
			);
		};
		poser();
		this.timer = setInterval(poser, 10_000);
	}

	arreter(texte = ""): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		ecrireTitre(texte);
	}
}

function ecrireTitre(texte: string): void {
	if (process.stdout.isTTY) process.stdout.write(`\u001b]0;${texte}\u0007`);
}

/** A sound and a notification, when the story needs the owner or stops; silent off macOS. */
export function sonner(message: string): void {
	if (process.platform !== "darwin") return;
	for (const [cmd, args] of [
		["afplay", [process.env.CYCLE_495_SON ?? "/System/Library/Sounds/Glass.aiff"]],
		["osascript", ["-e", `display notification ${JSON.stringify(message)} with title "Cycle 495"`]],
	] as const)
		spawn(cmd, args, { stdio: "ignore", detached: true })
			// A sound or a notification that fails must not stop a cycle.
			.on("error", () => {})
			.unref();
}
