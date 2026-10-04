import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { brancheCourante } from "../../cycle/src/git.ts";
import { tempDir, removedAfterEach } from "../helpers/fixtures.ts";
import { NODE, STORY, depotDe } from "../helpers/cycle.ts";

const MAIN = join(import.meta.dirname, "..", "..", "cycle", "src", "main.ts");
const cleanups = removedAfterEach();

/**
 * A PATH with node and git only: the entry point runs as `npm run cycle` runs it, and the sound and
 * the notification it starts when it hands back find no program, so a test plays nothing.
 */
function chemins(): string {
	const bin = tempDir("495-", cleanups);
	symlinkSync(NODE, join(bin, "node"));
	symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), join(bin, "git"));
	return bin;
}

function banc(statut = "à faire"): { root: string; racine: string; env: NodeJS.ProcessEnv } {
	const root = depotDe((r) => {
		mkdirSync(join(r, "specs", "stories", "e01"), { recursive: true });
		writeFileSync(
			join(r, "specs", "stories", "e01", "e01s05-greet-shouts.md"),
			STORY.replace("Statut : à faire", `Statut : ${statut}`),
		);
	});
	const racine = tempDir("495-", cleanups);
	return { root, racine, env: { ...process.env, PATH: chemins(), CYCLE_495_DIR: racine, NO_COLOR: "1" } };
}

function cycle(args: string[], b: { root: string; env: NodeJS.ProcessEnv }, env: NodeJS.ProcessEnv = {}) {
	const r = spawnSync(NODE, [MAIN, ...args], {
		cwd: b.root,
		env: { ...b.env, ...env },
		encoding: "utf8",
		timeout: 60_000,
	});
	return { code: r.status, sortie: stripVTControlCharacters(r.stdout), erreur: stripVTControlCharacters(r.stderr) };
}

describe("the entry point of the cycle", () => {
	it("refuses a subcommand it does not know, with its usage, and runs no step", () => {
		const b = banc();
		const r = cycle(["e01s05", "etats"], b);
		assert.equal(r.code, 2);
		assert.match(r.erreur, /usage: cycle /);
		assert.equal(brancheCourante(b.root), "main");
		assert.equal(r.sortie, "");
	});

	it("refuses a CYCLE_495_ setting that is not a number, naming the setting and its value, before anything runs", () => {
		const b = banc();
		for (const [nom, args] of [
			["CYCLE_495_PLAFOND_USD", ["e01s05", "auto"]],
			["CYCLE_495_REPRISES_MAX", ["reprises"]],
			["CYCLE_495_DEFAUTS_MAX", ["defauts"]],
		] as const) {
			for (const valeur of ["abc", "", "-1"]) {
				const r = cycle([...args], b, { [nom]: valeur });
				assert.equal(r.code, 2, `${nom}=${JSON.stringify(valeur)}`);
				assert.ok(r.erreur.includes(`${nom}=${JSON.stringify(valeur)}`), r.erreur);
				assert.equal(brancheCourante(b.root), "main");
			}
		}
	});

	it("prints the state with the cost as the run shows it and the time of day of this machine", () => {
		const b = banc();
		mkdirSync(join(b.racine, "e01s05"), { recursive: true });
		writeFileSync(
			join(b.racine, "e01s05", "journal.jsonl"),
			`${JSON.stringify({ at: "2026-10-04T08:05:09.000Z", pas: "story", genre: "session", nom: "story", ok: true, cout_usd: 0.5, duree_ms: 1000, tours: 1 })}\n`,
		);
		const r = cycle(["e01s05", "etat"], b, { TZ: "Europe/Paris" });
		assert.equal(r.code, 0);
		assert.match(r.sortie, /10:05:09 +story +session +story · 1 s · 0,50 \$/);
	});

	it("opens the first step of a run without the time and cost elapsed since the run began", () => {
		const b = banc("versée");
		mkdirSync(join(b.racine, "e01s05"), { recursive: true });
		// A journal long enough that reading it twice before the first step takes more than a millisecond.
		const ligne = JSON.stringify({ at: "2026-10-04T08:05:09.000Z", pas: "story", genre: "note" });
		writeFileSync(join(b.racine, "e01s05", "journal.jsonl"), `${`${ligne}\n`.repeat(50_000)}`);
		const r = cycle(["e01s05"], b);
		assert.equal(r.code, 1);
		const direct = readFileSync(join(b.racine, "e01s05", "en-direct.log"), "utf8");
		assert.match(direct, /▶ e01s05 · story/);
		assert.doesNotMatch(direct, /depuis/);
	});

	it("leaves on Ctrl-C while it follows a story from another terminal", async () => {
		const b = banc();
		const enfant = spawn(NODE, [MAIN, "e01s05", "suivre"], {
			cwd: b.root,
			env: b.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		await new Promise<void>((resolve) => enfant.stdout.once("data", () => resolve()));
		const fin = new Promise<number | null>((resolve) => enfant.once("exit", (code) => resolve(code)));
		enfant.kill("SIGINT");
		const code = await Promise.race([fin, new Promise<"toujours là">((r) => setTimeout(() => r("toujours là"), 3000))]);
		if (code === "toujours là") enfant.kill("SIGKILL");
		assert.equal(code, 130);
	});
});
