import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CALC, CALC_TEST, depotACalcul, premierTour } from "../helpers/relecture-mutation.ts";
import { gitCmd } from "../helpers/fixtures.ts";

/** `clamp`, which the branch appends to `src/calc.ts` on lines 4 to 7. */
const CLAMP = "\nexport function clamp(n: number): number {\n\treturn n > 10 ? 10 : n;\n}\n";

/** A test of `clamp` that only clamps a large value: `n > 10` replaced by `true` still passes it. */
const CLAMP_TEST = `${CALC_TEST.replace("{ add }", "{ add, clamp }")}\ntest("clamp clamps", () => {\n\tassert.equal(clamp(20), 10);\n});\n`;

/** The module the branch adds: `clamp`, which a named test calls on a large value only, and `jamais`, which it never calls. */
const NEUF =
	"export function clamp(n: number): number {\n\treturn n > 10 ? 10 : n;\n}\n\nexport function jamais(n: number): number {\n\treturn n + 1;\n}\n";

/** The test the task names: `n > 10` replaced by `true` still passes it, and it never runs `jamais`. */
const NEUF_TEST = `${CALC_TEST.replace('import { add } from "../src/calc.ts";', 'import { add } from "../src/calc.ts";\nimport { clamp } from "../src/neuf.ts";')}\ntest("clamp clamps", () => {\n\tassert.equal(clamp(20), 10);\n});\n`;

/** A test no task names, which kills every mutant of `src/neuf.ts`: the mutation must not run it. */
const NEUF_COMPLET =
	'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { clamp, jamais } from "../src/neuf.ts";\n\ntest("clamp and jamais", () => {\n\tassert.equal(clamp(20), 10);\n\tassert.equal(clamp(10), 10);\n\tassert.equal(clamp(5), 5);\n\tassert.equal(jamais(1), 2);\n});\n';

describe("the mutation of the lines a branch introduces, before the first review round", () => {
	it("l'invite du premier tour nomme le mutant survivant d'une ligne introduite, avec son fichier, sa ligne et son remplacement, et aucune ligne hors de la branche n'est mutée", async () => {
		const root = depotACalcul();
		const { ctx, issue, invites } = await premierTour(root, {
			"src/calc.ts": `${CALC}${CLAMP}`,
			"test/calc.test.ts": CLAMP_TEST,
		});
		assert.deepEqual(issue, { statut: "fini" });
		for (const [r, texte] of Object.entries(invites)) {
			assert.match(
				texte,
				/`src\/calc\.ts:6`[^\n]*`true`/,
				`${r}: the prompt names the surviving mutant of line 6 with its replacement`,
			);
			assert.doesNotMatch(
				texte,
				/src\/calc\.ts:[123]\b/,
				`${r}: the prompt names no line the branch did not introduce`,
			);
		}
		const mutation = ctx.journal.dernier("mutation", "relecture");
		assert.ok(mutation, "the journal records the mutation");
		assert.deepEqual(mutation.tests, ["test/calc.test.ts"], "the mutation runs the tests the tasks name");
		const rapport = JSON.parse(
			new TextDecoder().decode((await ctx.journal.objets.get(mutation.rapport as string)) ?? new Uint8Array()),
		) as { files: Record<string, { mutants: { location: { start: { line: number } } }[] }> };
		const lignes = Object.entries(rapport.files).flatMap(([fichier, f]) =>
			f.mutants.map((m) => `${fichier}:${m.location.start.line}`),
		);
		assert.ok(lignes.length > 0, "the journal keeps the mutation report");
		for (const l of lignes) assert.match(l, /^src\/calc\.ts:[4-7]$/, "no line outside the branch is mutated");
	});

	it("l'invite du premier tour nomme exactement les mutants que les tests des tâches laissent vivre sur les lignes introduites des sources, fichier ajouté compris", async () => {
		const root = depotACalcul({ "src/vieux.ts": "export const VIEUX = 1;\n" });
		const { ctx, issue, invites } = await premierTour(root, {
			"src/neuf.ts": NEUF,
			"src/stacks/tests/borne.ts": "export const borne = (n: number): number => (n < 0 ? 0 : n);\n",
			"outils/hors.ts": "export const HORS = 1 + 2;\n",
			"src/vieux.ts": null,
			"test/calc.test.ts": NEUF_TEST,
			"test/neuf-complet.test.ts": NEUF_COMPLET,
		});
		assert.deepEqual(issue, { statut: "fini" }, "a source the branch adds or removes does not stop the round");
		const mutation = ctx.journal.dernier("mutation", "relecture");
		assert.ok(mutation, "the journal records the mutation");
		const rapport = JSON.parse(
			new TextDecoder().decode((await ctx.journal.objets.get(mutation.rapport as string)) ?? new Uint8Array()),
		) as {
			files: Record<
				string,
				{ mutants: { mutatorName: string; status: string; location: { start: { line: number } } }[] }
			>;
		};
		assert.deepEqual(
			Object.keys(rapport.files).sort(),
			["src/neuf.ts", "src/stacks/tests/borne.ts"],
			"the sources of src/ are mutated, a directory named tests included, and nothing outside src/, cycle/src/ and scripts/",
		);
		const mutants = Object.entries(rapport.files).flatMap(([fichier, f]) =>
			f.mutants.map((m) => ({ nom: `${fichier}:${m.location.start.line} ${m.mutatorName}`, statut: m.status })),
		);
		const statuts = new Set(mutants.map((m) => m.statut));
		assert.ok(
			statuts.has("Killed") && statuts.has("Survived") && statuts.has("NoCoverage"),
			"the example has every kind of mutant",
		);
		const vivants = mutants
			.filter((m) => m.statut === "Survived" || m.statut === "NoCoverage")
			.map((m) => m.nom)
			.sort();
		for (const [r, texte] of Object.entries(invites)) {
			const listes = [...texte.matchAll(/^- `([^`]+)` (\S+) → /gm)]
				.map(([, ou, operateur]) => `${ou} ${operateur}`)
				.sort();
			assert.deepEqual(
				listes,
				vivants,
				`${r}: the prompt names the surviving and uncovered mutants, and no killed one`,
			);
			assert.match(
				texte,
				/`src\/neuf\.ts:2` ConditionalExpression → `true`/,
				`${r}: a mutant only the tests the tasks do not name would kill survives`,
			);
		}
	});

	it("la mutation ne modifie pas l'arbre de la branche, même à travers un lien symbolique que la branche commite", async () => {
		const root = depotACalcul();
		const calc = `${CALC}${CLAMP}`;
		const temoin = join(root, "temoin");
		// The test the task names runs while Stryker holds its backups: it fails, and the mutation with it, if they
		// sit in the branch's tree, where the branch's `.stryker-tmp` points.
		const testDeLArbre = `${CLAMP_TEST.replace('"node:assert";', '"node:assert";\nimport { readdirSync } from "node:fs";')}\ntest("the branch's tree holds no backup", () => {\n\tassert.deepEqual(readdirSync(${JSON.stringify(temoin)}), [".gitkeep"]);\n});\n`;
		const { issue, invites } = await premierTour(root, {
			"src/calc.ts": calc,
			"src/lien.ts": { lien: join(root, "src", "calc.ts") },
			"temoin/.gitkeep": "",
			".stryker-tmp": { lien: temoin },
			"test/calc.test.ts": testDeLArbre,
		});
		assert.deepEqual(issue, { statut: "fini" });
		assert.equal(gitCmd(root, ["status", "--porcelain"]), "", "the branch's tree is left as committed");
		assert.equal(readFileSync(join(root, "src", "calc.ts"), "utf8"), calc, "the link's target keeps its content");
		for (const [r, texte] of Object.entries(invites)) {
			assert.match(texte, /`src\/calc\.ts:6`[^\n]*`true`/, `${r}: the mutation completes, its backups out of the tree`);
			assert.doesNotMatch(texte, /src\/lien\.ts/, `${r}: the link is not mutated`);
		}
	});
});
