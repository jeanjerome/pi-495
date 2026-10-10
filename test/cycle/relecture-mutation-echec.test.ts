import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { chmodSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CALC, CALC_TEST, depotACalcul, premierTour } from "../helpers/relecture-mutation.ts";
import { gitCmd } from "../helpers/fixtures.ts";

const CLAMP = "\nexport function clamp(n: number): number {\n\treturn n > 10 ? 10 : n;\n}\n";

/** The test of `clamp` the branch commits. */
const testDeClamp = (attendu: number): string =>
	`${CALC_TEST.replace("{ add }", "{ add, clamp }")}\ntest("clamp clamps", () => {\n\tassert.equal(clamp(20), ${attendu});\n});\n`;

/** Runs `corps` with the environment variable `nom` set to `valeur`, then restores it. */
async function avecReglage<T>(nom: string, valeur: string, corps: () => Promise<T>): Promise<T> {
	const avant = process.env[nom];
	process.env[nom] = valeur;
	try {
		return await corps();
	} finally {
		if (avant === undefined) delete process.env[nom];
		else process.env[nom] = avant;
	}
}

describe("a mutation that cannot complete before the first review round", () => {
	it("quand la mutation échoue, le tour a lieu et l'invite dit qu'elle n'a pas abouti et pourquoi", async () => {
		// The test the task names fails on the branch as it stands: Stryker stops at its initial run, before any mutant.
		const { issue, invites } = await premierTour(depotACalcul(), {
			"src/calc.ts": `${CALC}${CLAMP}`,
			"test/calc.test.ts": testDeClamp(20),
		});
		assert.deepEqual(issue, { statut: "fini" }, "the round takes place");
		for (const [r, texte] of Object.entries(invites)) {
			assert.match(texte, /La mutation n'a pas abouti/, `${r}: the prompt says the mutation did not complete`);
			assert.match(texte, /failed tests in the initial test run/, `${r}: the prompt says why`);
			assert.doesNotMatch(texte, /`src\/calc\.ts:\d+`/, `${r}: the prompt lists no surviving mutant`);
		}
	});

	it("quand la mutation dépasse son budget de temps, le tour a lieu et l'invite dit qu'elle n'a pas abouti et pourquoi", async () => {
		const { issue, invites } = await avecReglage("CYCLE_495_MUTATION_MIN", "0.001", () =>
			premierTour(depotACalcul(), { "src/calc.ts": `${CALC}${CLAMP}`, "test/calc.test.ts": testDeClamp(10) }),
		);
		assert.deepEqual(issue, { statut: "fini" }, "the round takes place");
		for (const [r, texte] of Object.entries(invites)) {
			assert.match(texte, /La mutation n'a pas abouti/, `${r}: the prompt says the mutation did not complete`);
			assert.match(texte, /budget/, `${r}: the prompt says it ran past its time budget`);
			assert.doesNotMatch(texte, /`src\/calc\.ts:\d+`/, `${r}: the prompt lists no surviving mutant`);
		}
	});

	it("quand la mutation ne peut pas être lancée, le tour a lieu et l'invite dit qu'elle n'a pas abouti et pourquoi", async () => {
		const root = depotACalcul();
		// A hook that refuses the first detached tree the round opens, the mutation's, and lets the reviewers' open.
		const crochets = join(root, ".git", "crochets");
		const { issue, invites } = await premierTour(
			root,
			{ "src/calc.ts": `${CALC}${CLAMP}`, "test/calc.test.ts": testDeClamp(10) },
			() => {
				mkdirSync(crochets);
				const marque = join(crochets, "passe");
				writeFileSync(
					join(crochets, "post-checkout"),
					`#!/bin/sh\n[ -e '${marque}' ] && exit 0\ntouch '${marque}'\necho 'arbre refusé par le crochet' >&2\nexit 1\n`,
				);
				chmodSync(join(crochets, "post-checkout"), 0o755);
				gitCmd(root, ["config", "core.hooksPath", crochets]);
			},
		);
		// The tree the hook refused stays registered: it goes with the repository.
		for (const l of gitCmd(root, ["worktree", "list", "--porcelain"]).split("\n"))
			if (l.startsWith("worktree ") && l !== `worktree ${realpathSync(root)}`)
				rmSync(l.slice(9), { recursive: true, force: true });
		assert.deepEqual(issue, { statut: "fini" }, "the round takes place");
		for (const [r, texte] of Object.entries(invites)) {
			assert.match(texte, /La mutation n'a pas abouti/, `${r}: the prompt says the mutation did not complete`);
			assert.match(texte, /arbre refusé par le crochet/, `${r}: the prompt says why`);
			assert.doesNotMatch(texte, /`src\/calc\.ts:\d+`/, `${r}: the prompt lists no surviving mutant`);
		}
	});
});
