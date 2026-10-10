import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { CALC_TEST, depotACalcul, premierTour } from "../helpers/relecture-mutation.ts";

describe("a branch that introduces no line of code before the first review round", () => {
	it("une branche qui ne change que des tests et des stories ne lance aucune mutation et l'invite dit qu'aucune ligne n'était à muter", async () => {
		const { ctx, issue, invites } = await premierTour(depotACalcul(), {
			"test/calc.test.ts": `${CALC_TEST}\ntest("add adds negatives", () => {\n\tassert.equal(add(-1, -2), -3);\n});\n`,
			"test/helpers/nombres.ts": "export const DEUX = 2;\n",
			"specs/stories/e01/e01s06-add-negatives.md": "# add negatives\n",
			"README.md": "# calc\n",
		});
		assert.deepEqual(issue, { statut: "fini" });
		const mutations = ctx.journal.lire().filter((e) => e.genre === "controle" && e.controle === "mutation");
		assert.deepEqual(mutations, [], "no mutation runs");
		for (const [r, texte] of Object.entries(invites))
			assert.match(texte, /Aucune ligne n'était à muter/, `${r}: the prompt says no line was to be mutated`);
	});
});
