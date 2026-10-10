import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Contexte, type Issue, conduirePas } from "../../cycle/src/cycle.ts";
import { NODE, STORY, contexte, depotDe, fauxClaude } from "./cycle.ts";
import { gitCmd, removedAfterEach, tempDir } from "./fixtures.ts";

const cleanups = removedAfterEach();

/** This repository's `node_modules`, which carries Stryker and its TAP runner. */
const NODE_MODULES = fileURLToPath(new URL("../../node_modules", import.meta.url));

/** The calculation module on main: `add`, whose lines a branch that adds to the file does not introduce. */
export const CALC = "export function add(a: number, b: number): number {\n\treturn a + b;\n}\n";

/** The test of `add` on main, which the story's one task names. */
export const CALC_TEST =
	'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { add } from "../src/calc.ts";\n\ntest("add adds", () => {\n\tassert.equal(add(1, 2), 3);\n});\n';

/** The test story whose one task is held by `test/calc.test.ts`, run under node:test. */
const STORY_CALC = STORY.replaceAll(`${NODE} --test test/shout.test.js`, "node --test test/calc.test.ts").replaceAll(
	"test/shout.test.js",
	"test/calc.test.ts",
);

/**
 * A repository on main with `src/calc.ts`, its test, the story naming that test and the files of `autres`, with this
 * repository's `node_modules` linked and ignored, so the review's mutation finds Stryker in the trees it detaches.
 */
export function depotACalcul(autres: Record<string, string> = {}): string {
	return depotDe((r) => {
		mkdirSync(join(r, "src"), { recursive: true });
		mkdirSync(join(r, "test"), { recursive: true });
		mkdirSync(join(r, "specs", "stories", "e01"), { recursive: true });
		writeFileSync(join(r, "package.json"), JSON.stringify({ name: "calc", version: "1.0.0", type: "module" }));
		writeFileSync(join(r, ".gitignore"), "node_modules\n");
		writeFileSync(join(r, "src", "calc.ts"), CALC);
		writeFileSync(join(r, "test", "calc.test.ts"), CALC_TEST);
		writeFileSync(join(r, "specs", "stories", "e01", "e01s05-greet-shouts.md"), STORY_CALC);
		for (const [rel, contenu] of Object.entries(autres)) {
			mkdirSync(join(r, rel, ".."), { recursive: true });
			writeFileSync(join(r, rel), contenu);
		}
		symlinkSync(NODE_MODULES, join(r, "node_modules"));
	});
}

export interface PremierTour {
	ctx: Contexte;
	issue: Issue;
	/** The prompt each reviewer received, by reviewer. */
	invites: { A: string; B: string };
}

/** What the branch commits at a path: its content, a symbolic link to `lien`, or its removal (`null`). */
export type Changement = string | { lien: string } | null;

/**
 * Opens the review of the story on `root` once its branch commits `fichiers`: the story step, the red-green and
 * the self-review taken as done, `avantRelecture` run, then the first round, whose two reviewers pass and write
 * the prompt they received, empty for one never asked.
 */
export async function premierTour(
	root: string,
	fichiers: Record<string, Changement>,
	avantRelecture: () => void = () => {},
): Promise<PremierTour> {
	const invites = tempDir("495-", cleanups);
	const claude = fauxClaude(`import { writeFileSync } from "node:fs";
export default (invite) => {
  const relecteur = /^Tu es le relecteur (A|B), tour 1/.exec(invite);
  if (!relecteur) throw new Error("unexpected prompt: " + invite.slice(0, 60));
  writeFileSync(${JSON.stringify(invites)} + "/" + relecteur[1], invite);
  return { verdict: "pass", constats: [], resume: "" };
};`);
	const ctx = contexte(root, claude);
	await conduirePas(ctx, "story");
	for (const [rel, contenu] of Object.entries(fichiers)) {
		mkdirSync(join(root, rel, ".."), { recursive: true });
		if (contenu === null) rmSync(join(root, rel));
		else if (typeof contenu === "string") writeFileSync(join(root, rel), contenu);
		else symlinkSync(contenu.lien, join(root, rel));
	}
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", "feat: the branch's change"]);
	for (const pas of ["rouge-vert", "autocontrole"] as const) ctx.journal.inscrire(pas, "fini");
	avantRelecture();
	const issue = await conduirePas(ctx, "relecture");
	// A reviewer the round never reached received no prompt.
	const lue = (r: string): string => (existsSync(join(invites, r)) ? readFileSync(join(invites, r), "utf8") : "");
	return { ctx, issue, invites: { A: lue("A"), B: lue("B") } };
}
