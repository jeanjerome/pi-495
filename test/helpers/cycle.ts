import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { Executeur } from "../../cycle/src/controls.ts";
import type { Contexte } from "../../cycle/src/cycle.ts";
import { Journal } from "../../cycle/src/journal.ts";
import { lireStory } from "../../cycle/src/story.ts";
import { fixtureTs, gitCmd, tempDir } from "../helpers/fixtures.ts";

export const NODE = process.execPath;

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

/** A repository with the fixture project on main, the story committed, and a clean tree. */
export function depot(): string {
	const root = tempDir();
	fixtureTs(root);
	mkdirSync(join(root, "specs", "stories", "e01"), { recursive: true });
	writeFileSync(join(root, "specs", "stories", "e01", "e01s05-greet-shouts.md"), STORY);
	gitCmd(root, ["init", "-q", "-b", "main"]);
	gitCmd(root, ["config", "commit.gpgsign", "false"]);
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", "chore: base"]);
	return root;
}

/**
 * A stand-in for `claude -p`: it loads the module `FAUX_REPONSES` names, whose default export
 * receives the prompt and the working directory, may act on the repository, and returns the
 * structured output. Like the real `claude`, it treats a leading `/skill` line as a command and
 * hands the module only the text that follows it.
 */
export function fauxClaude(reponses: string): string {
	const dir = tempDir();
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
	const racine = tempDir();
	return {
		root,
		story: lireStory("e01s05", root),
		journal: new Journal("e01s05", racine),
		executeur: new Executeur(new UnconfinedSandbox(), new CasObjectStore(join(racine, "objects"))),
		cible: "main",
		preflight: { id: "preflight", commande: [NODE, "--test"], reseau: "denied", timeout_ms: 60_000 },
		claude,
	};
}
