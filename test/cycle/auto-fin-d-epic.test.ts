import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NODE, STORY, depotDe } from "../helpers/cycle.ts";
import { tempDir, removedAfterEach } from "../helpers/fixtures.ts";

const MAIN = join(import.meta.dirname, "..", "..", "cycle", "src", "main.ts");
const cleanups = removedAfterEach();

const REGISTRE = `bugs:
  - bug_id: BUG-2026-10-10T100000
    date: "2026-10-10"
    title: "a medium defect"
    severity: medium
    status: open
`;

/**
 * A repository whose plan lists e01s05 pending in epic e01 beside `autres`, with a medium defect open in the
 * registry, and a dossier where e01s05 has run every step: driving it in auto lands it at once. The `claude` on
 * the PATH logs the start of each prompt and finds no defect to repair.
 */
function banc(autres: string): { root: string; env: NodeJS.ProcessEnv; sessions: () => string[] } {
	const root = depotDe((r) => {
		mkdirSync(join(r, "specs", "stories", "e01"), { recursive: true });
		writeFileSync(join(r, "specs", "stories", "e01", "e01s05-greet-shouts.md"), STORY);
		writeFileSync(
			join(r, "specs", "plan.yaml"),
			`epics:\n  - id: e01\n    title: "Greet"\n    status: à faire\n    stories:\n${autres}      - { id: e01s05, status: "à faire", title: "greet shouts" }\n\n  - id: e28\n    title: "Correctifs"\n    status: à faire\n    stories: []\n`,
		);
		mkdirSync(join(r, "specs", "bugs"), { recursive: true });
		writeFileSync(join(r, "specs", "bugs", "registry.yaml"), REGISTRE);
	});
	const racine = tempDir("495-", cleanups);
	mkdirSync(join(racine, "e01s05"), { recursive: true });
	const pas = ["story", "rouge-vert", "autocontrole", "relecture", "recette", "versement"];
	writeFileSync(
		join(racine, "e01s05", "journal.jsonl"),
		[
			{ at: "2026-10-10T08:00:00.000Z", pas: "versement", genre: "verse", commit: "abcdef1234567890" },
			...pas.map((p) => ({ at: "2026-10-10T08:00:00.000Z", pas: p, genre: "fini" })),
		]
			.map((e) => `${JSON.stringify(e)}\n`)
			.join(""),
	);
	const bin = tempDir("495-", cleanups);
	symlinkSync(NODE, join(bin, "node"));
	symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), join(bin, "git"));
	const log = join(tempDir("495-", cleanups), "sessions.log");
	const aucun = { status: "aucun", story_id: "", bug_id: "", message: "", resume: "none", a_decider: [] };
	writeFileSync(
		join(bin, "claude"),
		`#!${NODE}\nconst a = process.argv.slice(2);\nrequire("node:fs").appendFileSync(${JSON.stringify(log)}, a[a.indexOf("-p") + 1].replace(/^\\/[\\w-]+\\n+/, "").slice(0, 60).split("\\n")[0] + "\\n");\nconsole.log(${JSON.stringify(JSON.stringify({ type: "result", is_error: false, structured_output: aucun }))});\n`,
	);
	chmodSync(join(bin, "claude"), 0o755);
	const inherited = Object.fromEntries(Object.entries(process.env).filter(([nom]) => !nom.startsWith("CYCLE_495_")));
	return {
		root,
		env: { ...inherited, PATH: bin, CYCLE_495_DIR: racine, NO_COLOR: "1" },
		sessions: () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []),
	};
}

function auto(b: { root: string; env: NodeJS.ProcessEnv }) {
	return spawnSync(NODE, [MAIN, "e01s05", "auto"], { cwd: b.root, env: b.env, encoding: "utf8", timeout: 60_000 });
}

describe("the end of an epic driven story by story", () => {
	it("verser en auto la dernière story d'une epic lance la correction des défauts moyens, verser une autre story ne la lance pas", () => {
		const derniere = banc('      - { id: e01s04, status: "versée", title: "greet greets" }\n');
		const r = auto(derniere);
		assert.equal(r.status, 0, r.stderr);
		assert.match(readFileSync(join(derniere.root, "specs", "plan.yaml"), "utf8"), /id: e01s05, status: "versée"/);
		assert.equal(derniere.sessions().length, 1, "one session chooses the defect to repair");
		assert.match(derniere.sessions()[0] ?? "", /^Correction d'un défaut du registre/);
		assert.match(r.stdout, /gravité medium ou plus/);

		const autre = banc('      - { id: e01s06, status: "à faire", title: "greet whispers" }\n');
		const s = auto(autre);
		assert.equal(s.status, 0, s.stderr);
		assert.match(readFileSync(join(autre.root, "specs", "plan.yaml"), "utf8"), /id: e01s05, status: "versée"/);
		assert.deepEqual(autre.sessions(), [], "no phase of repairs after a story that is not the last of its epic");
	});
});
