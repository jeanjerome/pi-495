/**
 * One Claude Code session for one step that needs a model: a prompt in, a structured answer out,
 * the whole transcript kept in the object store. The session runs unattended, in the foreground, and
 * ends when its turn ends; the owner may watch its stream, line by line, but cannot answer it.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { ObjectRef } from "../../src/contracts/v1/common.ts";
import type { Etape, Journal } from "./journal.ts";

export interface Session {
	ok: boolean;
	sortie: Record<string, unknown> | null;
	resume: string;
	cout_usd: number;
	duree_ms: number;
	tours: number;
	session_id: string | null;
	transcript: ObjectRef;
}

export interface Demande {
	invite: string;
	schema: Record<string, unknown>;
	consignes?: string;
	cwd: string;
	/** The binary to run; a test substitutes a script that speaks the same stream. */
	claude?: string;
	/** Each line of the stream as it arrives, for whoever watches the session run. */
	suivi?: (ligne: string) => void;
}

const CONSIGNES_COMMUNES = `This session runs one step of the development cycle of 495 unattended: nobody answers it live and no
question tool exists. Read cycle/README.md, CONVENTIONS.md and AGENTS.md first. Carry the step named
in the prompt to its end and return the structured output the prompt asks for; the next step runs in
another session. Never push to a remote. Never kill a process by name or pattern (pkill, killall, pkill -f): other sessions
of the cycle run at the same time and their command lines carry the same words as yours; stop only a process
you started, by its own pid. Run every command and sub-agent in the foreground and read
its result before going on; give a long command a Bash timeout of up to 60 minutes. Commit messages
follow cycle/README.md § Git et commits, whatever the harness suggests.`;

function shell(env: NodeJS.ProcessEnv): string {
	// The agents write bash; the login shell here is zsh, where an unquoted $var is not split.
	return env.CYCLE_495_SHELL ?? (existsSync("/opt/homebrew/bin/bash") ? "/opt/homebrew/bin/bash" : "/bin/bash");
}

interface Resultat {
	structured_output?: Record<string, unknown>;
	result?: string;
	total_cost_usd?: number;
	duration_ms?: number;
	num_turns?: number;
	session_id?: string;
	is_error?: boolean;
}

/** The last `result` line of the stream, and whether a task was still running when it came. */
export function lireFlux(flux: string): { resultat: Resultat | null; tueeEnCours: boolean } {
	const lines = flux.split("\n").filter((l) => l.startsWith("{"));
	let resultat: Resultat | null = null;
	let resultAt = -1;
	lines.forEach((line, i) => {
		if (line.includes('"type":"result"')) {
			try {
				resultat = JSON.parse(line) as Resultat;
				resultAt = i;
			} catch {
				// a truncated line is not the result
			}
		}
	});
	const tueeEnCours = resultAt >= 0 && lines.slice(resultAt).some((l) => l.includes('"status":"killed"'));
	return { resultat, tueeEnCours };
}

export async function lancerSession(demande: Demande, journal: Journal): Promise<Session> {
	const args = [
		"-p",
		demande.invite,
		"--permission-mode",
		"auto",
		"--permission-prompts",
		"none",
		"--output-format",
		"stream-json",
		"--verbose",
		"--json-schema",
		JSON.stringify(demande.schema),
		"--settings",
		JSON.stringify({ attribution: { commit: "", pr: "" } }),
		"--append-system-prompt",
		`${CONSIGNES_COMMUNES}\n${demande.consignes ?? ""}`,
	];
	const flux = await new Promise<string>((resolve, reject) => {
		const child = spawn(demande.claude ?? "claude", args, {
			cwd: demande.cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
				BASH_MAX_TIMEOUT_MS: "3600000",
				CLAUDE_CODE_SHELL: shell(process.env),
			},
		});
		const chunks: Buffer[] = [];
		const errs: Buffer[] = [];
		let reste = "";
		child.stdout.on("data", (c: Buffer) => {
			chunks.push(c);
			if (!demande.suivi) return;
			const lignes = (reste + c.toString("utf8")).split("\n");
			reste = lignes.pop() ?? "";
			for (const ligne of lignes) demande.suivi(ligne);
		});
		child.stderr.on("data", (c: Buffer) => errs.push(c));
		child.on("error", reject);
		child.on("close", () => {
			resolve(`${Buffer.concat(chunks).toString("utf8")}\n${Buffer.concat(errs).toString("utf8")}`);
		});
	});
	const transcript = await journal.garder(flux, "application/x-ndjson");
	const { resultat, tueeEnCours } = lireFlux(flux);
	const sortie = resultat?.structured_output ?? null;
	return {
		ok: resultat !== null && !resultat.is_error && sortie !== null && !tueeEnCours,
		sortie,
		resume: tueeEnCours
			? "session closed on a task still running, killed unread"
			: (resultat?.result ?? "no result line in the stream"),
		cout_usd: resultat?.total_cost_usd ?? 0,
		duree_ms: resultat?.duration_ms ?? 0,
		tours: resultat?.num_turns ?? 0,
		session_id: resultat?.session_id ?? null,
		transcript,
	};
}

/**
 * Runs one session named `nom` and records it as a `session` event of `pas`, whatever its outcome:
 * the cost ceiling, the state, the display and the export all read this event.
 */
export async function sessionInscrite(
	journal: Journal,
	pas: Etape,
	nom: string,
	demande: { invite: string; schema: Record<string, unknown>; cwd: string },
	o: { claude?: string; suivi?: (nom: string, ligne: string) => void },
): Promise<Session> {
	const s = await lancerSession(
		{
			...demande,
			...(o.claude ? { claude: o.claude } : {}),
			...(o.suivi ? { suivi: (ligne: string) => o.suivi?.(nom, ligne) } : {}),
		},
		journal,
	);
	journal.inscrire(pas, "session", {
		nom,
		ok: s.ok,
		cout_usd: s.cout_usd,
		duree_ms: s.duree_ms,
		tours: s.tours,
		session_id: s.session_id,
		transcript: s.transcript,
		resume: s.resume.slice(0, 2000),
	});
	return s;
}
