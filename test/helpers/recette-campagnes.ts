import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Contexte, type Issue, conduirePas } from "../../cycle/src/cycle.ts";
import { NODE, contexte, depot, fauxClaude } from "./cycle.ts";
import { gitCmd, removedAfterEach, tempDir } from "./fixtures.ts";

const cleanups = removedAfterEach();

/** One run of a fake campaign: the technology it was given and the revision of the tree it ran in. */
interface Lancement {
	technologie: string;
	tete: string;
}

/**
 * A stand-in for `npm run campagne -- <technologie>`: each run appends its technology and the revision of the tree
 * it runs in to a log, and exits with the code `codes` gives that technology, 0 when it gives none.
 */
export function fausseCampagne(codes: Record<string, number> = {}): {
	commande: (technologie: string) => string[];
	lancements: () => Lancement[];
} {
	const dir = tempDir("495-", cleanups);
	const log = join(dir, "lancements.log");
	const script = join(dir, "campagne.mjs");
	writeFileSync(
		script,
		`import { appendFileSync } from "node:fs";\nimport { execFileSync } from "node:child_process";\nconst technologie = process.argv[2];\nconst tete = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();\nappendFileSync(${JSON.stringify(log)}, JSON.stringify({ technologie, tete }) + "\\n");\nprocess.exit((${JSON.stringify(codes)})[technologie] ?? 0);\n`,
	);
	return {
		commande: (technologie) => [NODE, script, technologie],
		lancements: () =>
			existsSync(log)
				? readFileSync(log, "utf8")
						.split("\n")
						.filter(Boolean)
						.map((l) => JSON.parse(l) as Lancement)
				: [],
	};
}

/** A Claude Code whose acceptance session finds the story ready. */
function recettePrete(): string {
	return fauxClaude(
		`export default () => ({ status: "prete", campagnes: [], ecarts: [], compte_rendu: "Ce qui est montré : …" })`,
	);
}

/** Records the red-green, the self-review and the review of the story as done. */
function prendreCommeRelue(ctx: Contexte): void {
	for (const pas of ["rouge-vert", "autocontrole", "relecture"] as const) ctx.journal.inscrire(pas, "fini");
}

/** The story's branch once it commits `fichiers`, its red-green, self-review and review taken as done. */
export async function brancheRelue(
	fichiers: Record<string, string>,
	campagne: (technologie: string) => string[],
	claude = recettePrete(),
): Promise<{ root: string; ctx: Contexte }> {
	const root = depot();
	const ctx = { ...contexte(root, claude), campagne };
	await conduirePas(ctx, "story");
	for (const [rel, contenu] of Object.entries(fichiers)) {
		mkdirSync(join(root, rel, ".."), { recursive: true });
		writeFileSync(join(root, rel), contenu);
	}
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", "feat: the branch's change"]);
	prendreCommeRelue(ctx);
	return { root, ctx };
}

/**
 * The story's branch once it moves `src/adapters/execution/runner.js`, committed on main, to `src/adapters/autre/`
 * and changes one line of it, its red-green, self-review and review taken as done.
 */
export async function brancheQuiDeplaceLExecuteur(
	campagne: (technologie: string) => string[],
): Promise<{ root: string; ctx: Contexte }> {
	const root = depot();
	mkdirSync(join(root, "src", "adapters", "execution"), { recursive: true });
	writeFileSync(
		join(root, "src", "adapters", "execution", "runner.js"),
		"export const runner = 1;\nexport const sortie = 2;\nexport const code = 3;\n",
	);
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", "feat: the executor's runner"]);
	const ctx = { ...contexte(root, recettePrete()), campagne };
	await conduirePas(ctx, "story");
	mkdirSync(join(root, "src", "adapters", "autre"), { recursive: true });
	gitCmd(root, ["mv", "src/adapters/execution/runner.js", "src/adapters/autre/runner.js"]);
	const deplace = join(root, "src", "adapters", "autre", "runner.js");
	writeFileSync(deplace, readFileSync(deplace, "utf8").replace("runner = 1", "runner = 4"));
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", "refactor: the runner moves out of the executor"]);
	prendreCommeRelue(ctx);
	return { root, ctx };
}

/** Prepares the acceptance run of the branch that commits `fichiers`. */
export async function recetteSur(
	fichiers: Record<string, string>,
	campagne: (technologie: string) => string[],
): Promise<{ root: string; ctx: Contexte; issue: Issue }> {
	const { root, ctx } = await brancheRelue(fichiers, campagne);
	return { root, ctx, issue: await conduirePas(ctx, "recette") };
}
