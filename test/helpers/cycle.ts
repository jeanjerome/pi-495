import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Controle, executeurNonConfine } from "../../cycle/src/controls.ts";
import type { Contexte } from "../../cycle/src/cycle.ts";
import { Journal } from "../../cycle/src/journal.ts";
import { lireStory } from "../../cycle/src/story.ts";
import { fixtureTs, gitCmd, tempDir, removedAfterEach } from "../helpers/fixtures.ts";

export const NODE = process.execPath;

const cleanups = removedAfterEach();

export const STORY = `# greet shouts

Story : e01s05
Epic : e01
Statut : à faire

## 1. Ce que le lecteur gagne

Whoever calls greet is shouted at.

## 2. Promesses

Scenario: greet shouts
  Given a name
  When greet is called
  Then the greeting is upper case

## 3. Sécurité

Sans objet : nothing sensitive.

## 4. Tâches

### Tâche 1 — greet shouts

greet returns its greeting upper-cased.

- Vérifie : \`${NODE} --test test/shout.test.js\`
- Tient : \`test/shout.test.js\`, « the greeting is upper case »
- Rouge : greet returns the greeting as written

## 5. Hors périmètre

Nothing.
`;

export const SHOUT_TEST =
	'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { shout } from "../src/greet.js";\n\ntest("greet shouts", () => {\n  assert.equal(shout("x"), "HELLO, X");\n});\n';
export const SHOUT_CODE =
	"export function greet(name) {\n  return `Hello, ${name}`;\n}\nexport function shout(name) {\n  return greet(name).toUpperCase();\n}\n";
/** A test that already passes at its test-only commit: not a red. */
export const PASSING_TEST =
	'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { greet } from "../src/greet.js";\n\ntest("greet greets", () => {\n  assert.equal(greet("x"), "Hello, x");\n});\n';

/** A repository on main whose one commit holds what `prepare` wrote, with a clean tree. */
export function depotDe(prepare: (root: string) => void): string {
	const root = tempDir("495-", cleanups);
	prepare(root);
	gitCmd(root, ["init", "-q", "-b", "main"]);
	gitCmd(root, ["config", "commit.gpgsign", "false"]);
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", "chore: base"]);
	return root;
}

/** A repository with the fixture project on main, the story committed, and a clean tree. */
export function depot(): string {
	return depotDe((root) => {
		fixtureTs(root);
		mkdirSync(join(root, "specs", "stories", "e01"), { recursive: true });
		writeFileSync(join(root, "specs", "stories", "e01", "e01s05-greet-shouts.md"), STORY);
	});
}

/**
 * A stand-in for `claude -p`: it loads the module `FAUX_REPONSES` names, whose default export
 * receives the prompt and the working directory, may act on the repository, and returns the
 * structured output. Like the real `claude`, it treats a leading `/skill` line as a command and
 * hands the module only the text that follows it.
 */
export function fauxClaude(reponses: string): string {
	const dir = tempDir("495-", cleanups);
	const module = join(dir, "reponses.mjs");
	writeFileSync(module, reponses);
	const path = join(dir, "claude");
	writeFileSync(
		path,
		`#!/usr/bin/env node\nconst args = process.argv.slice(2);\nconst invite = args[args.indexOf("-p") + 1].replace(/^\\/[\\w-]+\\n+/, "");\nconst { default: repondre } = await import(${JSON.stringify(module)});\nconst sortie = await repondre(invite, process.cwd());\nprocess.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: 1, duration_ms: 10, total_cost_usd: 0.01, session_id: "s", result: "ok", structured_output: sortie }) + "\\n");\n`,
	);
	chmodSync(path, 0o755);
	return path;
}

export const COMMIT = `
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
export function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" } }).trim(); }
export function commit(cwd, files, message) { for (const [rel, content] of Object.entries(files)) { mkdirSync(join(cwd, rel, ".."), { recursive: true }); writeFileSync(join(cwd, rel), content); } git(cwd, ["add", "-A"]); git(cwd, ["commit", "-q", "-m", message]); }
`;

export function contexte(root: string, claude: string): Contexte {
	const racine = tempDir("495-", cleanups);
	return {
		root,
		story: lireStory("e01s05", root),
		journal: new Journal("e01s05", racine),
		executeur: executeurNonConfine(racine),
		cible: "main",
		preflight: { id: "preflight", commande: [NODE, "--test"], reseau: "denied", timeout_ms: 60_000 },
		claude,
	};
}

const ORACLE = { tache: 1, cas: "test/shout.test.js", assertion: "the greeting is upper case" };

/** The companion of the test story: its one scenario, held by task 1, with the means `moyens` declares. */
export function compagnon(moyens: unknown[], oracles: unknown[] = [ORACLE]): string {
	return `${JSON.stringify(
		{
			version: 1,
			story: "e01s05",
			promesses: [
				{
					id: "P1",
					scenario: "greet shouts",
					categorie: "nouveau-comportement",
					observation: "the greeting upper-cased",
					oracles,
					dependances: [],
					interactions: [],
					moyens,
				},
			],
		},
		null,
		1,
	)}\n`;
}

/** A selection that keeps example tests alone, each other means set aside with its reason. */
export const EXEMPLES_SEULS = [
	{ moyen: "exemples", retenu: true, raison: "one case shows the greeting" },
	{ moyen: "proprietes", retenu: false, raison: "one input is enough" },
	{ moyen: "modele-d-etats", retenu: false, raison: "no state" },
	{ moyen: "preuve-lean", retenu: false, raison: "no decision rule" },
];

/** A selection that keeps a state model, explored through the manifest `manifeste`. */
export function modeleRetenu(manifeste: string): unknown[] {
	return [
		{ moyen: "exemples", retenu: true, raison: "one case shows the greeting" },
		{ moyen: "proprietes", retenu: false, raison: "one input is enough" },
		{ moyen: "modele-d-etats", retenu: true, proprietes: ["Shouted"], manifestes: [manifeste] },
		{ moyen: "preuve-lean", retenu: false, raison: "no decision rule" },
	];
}

/** Where the test story's model lives, and the manifest that pins it. */
export const MANIFESTE = "specs/formal/greet/manifest.json";

export const MODELE = "---- MODULE Greet ----\nVARIABLE shouted\nInit == shouted = FALSE\n====\n";

/** The model files of the test story: a module, its configuration, and the manifest pinning both. */
export function fichiersDuModele(modele = MODELE): Record<string, string> {
	return {
		"specs/formal/greet/Greet.tla": modele,
		"specs/formal/greet/Greet.cfg": "INIT Init\nINVARIANT Shouted\n",
		[MANIFESTE]: JSON.stringify({ model: "Greet.tla", config: "Greet.cfg", required_properties: ["Shouted"] }),
	};
}

/** A repository with the fixture project, the story, its companion and `fichiers`, on main. */
export function depotAvecCompagnon(texte: string, fichiers: Record<string, string> = {}): string {
	return depotDe((root) => {
		fixtureTs(root);
		mkdirSync(join(root, "specs", "stories", "e01"), { recursive: true });
		writeFileSync(join(root, "specs", "stories", "e01", "e01s05-greet-shouts.md"), STORY);
		writeFileSync(join(root, "specs", "stories", "e01", "e01s05-greet-shouts.verification.json"), texte);
		for (const [rel, contenu] of Object.entries(fichiers)) {
			mkdirSync(join(root, rel, ".."), { recursive: true });
			writeFileSync(join(root, rel), contenu);
		}
	});
}

/** The counterexample a stand-in for TLC prints, as `scripts/check-formal.ts` lays it out. */
export const CONTRE_EXEMPLE =
	"Greet.tla with Greet.cfg: counterexample — not PASS\n  Invariant Shouted is violated.\ncounterexample to Shouted:\n  1: <Initial predicate>\n     shouted = FALSE\n";

/**
 * A stand-in for `scripts/check-formal.ts`: each run appends the manifest it was given to a log, prints
 * `sortie` and exits with `code`, whose meaning is the script's — 0 completed, 1 counterexample, 2
 * inconclusive, 3 error.
 */
export function fausseExploration(
	code: number,
	sortie: string,
): { exploration: (manifeste: string) => Controle; lancements: () => string[] } {
	const dir = tempDir("495-", cleanups);
	const log = join(dir, "lancements.log");
	const script = join(dir, "check-formal.mjs");
	writeFileSync(
		script,
		`import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(log)}, process.argv[2] + "\\n");\nprocess.stdout.write(${JSON.stringify(sortie)});\nprocess.exit(${code});\n`,
	);
	return {
		exploration: (manifeste) => ({
			id: `exploration-${manifeste}`,
			commande: [NODE, script, manifeste],
			reseau: "denied",
			timeout_ms: 60_000,
		}),
		lancements: () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []),
	};
}
