import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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
	// A cycle running this suite sets its own CYCLE_495_ settings; the entry point under test reads only the bench's.
	const inherited = Object.fromEntries(Object.entries(process.env).filter(([nom]) => !nom.startsWith("CYCLE_495_")));
	return { root, racine, env: { ...inherited, PATH: chemins(), CYCLE_495_DIR: racine, NO_COLOR: "1" } };
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

	it("prints the state with the cost as the run shows it, the time of day of this machine and the story's verification", () => {
		const b = banc();
		mkdirSync(join(b.racine, "e01s05"), { recursive: true });
		writeFileSync(
			join(b.racine, "e01s05", "journal.jsonl"),
			`${JSON.stringify({ at: "2026-10-04T08:05:09.000Z", pas: "story", genre: "session", nom: "story", ok: true, cout_usd: 0.5, duree_ms: 1000, tours: 1 })}\n`,
		);
		const r = cycle(["e01s05", "etat"], b, { TZ: "Europe/Paris" });
		assert.equal(r.code, 0);
		assert.match(r.sortie, /10:05:09 +story +session +story · 1 s · 0,50 \$/);
		assert.match(r.sortie, /^vérification : sans compagnon de vérification$/m);
	});

	it("prints in the state whether the preparation holds, with the start of its fingerprint", () => {
		const b = banc();
		mkdirSync(join(b.racine, "e01s05"), { recursive: true });
		writeFileSync(
			join(b.racine, "e01s05", "journal.jsonl"),
			`${JSON.stringify({ at: "2026-10-04T08:05:09.000Z", pas: "rouge-vert", genre: "preparation", verte: false, empreinte: `sha256:${"b".repeat(64)}` })}\n`,
		);
		const r = cycle(["e01s05", "etat"], b);
		assert.equal(r.code, 0);
		assert.match(r.sortie, /rouge-vert +preparation bloquée · sha256:bbbbbbbbbbbb$/m);
	});

	it("prints in the state each promise of the story's verification companion that has no oracle", () => {
		const b = banc();
		writeFileSync(
			join(b.root, "specs", "stories", "e01", "e01s05-greet-shouts.verification.json"),
			JSON.stringify({
				version: 1,
				story: "e01s05",
				promesses: [
					{
						id: "P1",
						scenario: "greet shouts",
						categorie: "nouveau-comportement",
						observation: "the greeting is upper case",
						oracles: [],
						dependances: [],
						interactions: [],
						moyens: [
							{ moyen: "exemples", retenu: true },
							{ moyen: "proprietes", retenu: false, raison: "one input suffices" },
							{ moyen: "modele-d-etats", retenu: false, raison: "no state" },
							{ moyen: "preuve-lean", retenu: false, raison: "no decision rule" },
						],
					},
				],
			}),
		);
		const r = cycle(["e01s05", "etat"], b);
		assert.equal(r.code, 0);
		assert.match(
			r.sortie,
			/^vérification : compagnon specs\/stories\/e01\/e01s05-greet-shouts\.verification\.json : incomplète$/m,
		);
		assert.match(r.sortie, /^non vérifiée « greet shouts » : sans oracle/m);
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

	it("shows, during a phase of repairs, the stream of the session that chooses the defect", () => {
		const b = banc();
		mkdirSync(join(b.root, "specs", "bugs"), { recursive: true });
		writeFileSync(
			join(b.root, "specs", "bugs", "registry.yaml"),
			'bugs:\n  - bug_id: BUG-2026-10-04T120000\n    title: "greet forgets the name"\n    severity: high\n    status: open\n',
		);
		writeFileSync(
			join(b.root, "specs", "plan.yaml"),
			'epics:\n  - id: e28\n    title: "Correctifs"\n    status: à faire\n    stories: []\n',
		);
		execFileSync("git", ["add", "-A"], { cwd: b.root });
		execFileSync("git", ["commit", "-q", "-m", "docs: the plan and the registry list a defect"], { cwd: b.root });
		const sortie = { status: "aucun", story_id: "", bug_id: "", message: "", resume: "none", a_decider: [] };
		const claude = join(b.env.PATH!, "claude");
		writeFileSync(
			claude,
			`#!${NODE}\nconsole.log(${JSON.stringify(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "je lis le registre" }] } }))});\nconsole.log(${JSON.stringify(JSON.stringify({ type: "result", is_error: false, structured_output: sortie }))});\n`,
		);
		chmodSync(claude, 0o755);
		const r = cycle(["defauts", "low"], b);
		assert.equal(r.code, 0, r.erreur);
		assert.match(r.sortie, /correctif +je lis le registre/);
	});

	it("on Ctrl-C after a story of a phase of repairs has landed, names no step of that story to resume", async () => {
		const b = banc();
		const story = STORY.replace(/e01s05/g, "e28s01")
			.replace("Epic : e01", "Epic : e28")
			.replace("Whoever calls greet", "Corrige BUG-2026-10-04T120000 : whoever calls greet");
		mkdirSync(join(b.root, "specs", "stories", "e28"), { recursive: true });
		writeFileSync(join(b.root, "specs", "stories", "e28", "e28s01-greet-shouts.md"), story);
		writeFileSync(
			join(b.root, "specs", "plan.yaml"),
			'epics:\n  - id: e28\n    title: "Correctifs"\n    status: à faire\n    stories:\n      - { id: e28s01, status: "à faire", title: "greet shouts" }\n',
		);
		mkdirSync(join(b.root, "specs", "bugs"), { recursive: true });
		const entree = (id: string) => `  - bug_id: ${id}\n    title: "a defect"\n    severity: low\n    status: open\n`;
		writeFileSync(
			join(b.root, "specs", "bugs", "registry.yaml"),
			`bugs:\n${entree("BUG-2026-10-04T120000")}${entree("BUG-2026-10-04T130000")}`,
		);
		execFileSync("git", ["add", "-A"], { cwd: b.root });
		execFileSync("git", ["commit", "-q", "-m", "docs: a correction story waits"], { cwd: b.root });
		// The story has run every step: driving it lands it at once, and the phase goes on to the next defect.
		mkdirSync(join(b.racine, "e28s01"), { recursive: true });
		const pas = ["story", "rouge-vert", "autocontrole", "relecture", "recette", "versement"];
		writeFileSync(
			join(b.racine, "e28s01", "journal.jsonl"),
			[
				{ at: "2026-10-04T08:00:00.000Z", pas: "versement", genre: "verse", commit: "abcdef1234567890" },
				...pas.map((p) => ({ at: "2026-10-04T08:00:00.000Z", pas: p, genre: "fini" })),
			]
				.map((e) => `${JSON.stringify(e)}\n`)
				.join(""),
		);
		const claude = join(b.env.PATH!, "claude");
		writeFileSync(claude, `#!${NODE}\nsetTimeout(() => {}, 60_000);\n`);
		chmodSync(claude, 0o755);
		const enfant = spawn(NODE, [MAIN, "defauts", "low"], {
			cwd: b.root,
			env: b.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let sortie = "";
		enfant.stdout.on("data", (c: Buffer) => {
			sortie += c.toString("utf8");
		});
		const fin = new Promise<number | null>((resolve) => enfant.once("exit", (code) => resolve(code)));
		for (let i = 0; i < 200 && !sortie.includes("choix du prochain défaut"); i++)
			await new Promise((r) => setTimeout(r, 50));
		assert.match(sortie, /e28s01 : versée/);
		enfant.kill("SIGINT");
		const code = await Promise.race([fin, new Promise<"toujours là">((r) => setTimeout(() => r("toujours là"), 5000))]);
		if (code === "toujours là") enfant.kill("SIGKILL");
		assert.equal(code, 130);
		assert.doesNotMatch(sortie, /npm run cycle -- e28s01/);
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
