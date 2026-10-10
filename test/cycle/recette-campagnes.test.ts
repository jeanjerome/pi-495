import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { campagnesExigees, commandeDeCampagne, controleDeCampagne } from "../../cycle/src/campagnes-exigees.ts";
import { conduirePas } from "../../cycle/src/cycle.ts";
import { revision } from "../../cycle/src/git.ts";
import { brancheQuiDeplaceLExecuteur, fausseCampagne, recetteSur } from "../helpers/recette-campagnes.ts";

describe("the reference campaigns the tool plays before the acceptance session", () => {
	it("une branche qui touche l'exécuteur fait jouer les deux campagnes à la tête et le journal garde leurs verdicts, une branche de documentation n'en joue aucune", async () => {
		const executeur = fausseCampagne({ maven: 1 });
		const touche = await recetteSur(
			{ "src/adapters/execution/runner.js": "export const runner = 1;\n" },
			executeur.commande,
		);
		assert.equal(touche.issue.statut, "proprietaire");
		const tete = revision(touche.root);
		assert.deepEqual(
			executeur.lancements(),
			[
				{ technologie: "npm", tete },
				{ technologie: "maven", tete },
			],
			"the tool plays both campaigns at the head of the branch",
		);
		const verdicts = touche.ctx.journal
			.lire()
			.filter((e) => e.pas === "recette" && e.genre === "controle")
			.map((e) => [e.controle, e.revision, e.verdict]);
		assert.deepEqual(verdicts, [
			["campagne-npm", tete, "PASS"],
			["campagne-maven", tete, "FAIL"],
		]);

		const documentation = fausseCampagne();
		const docs = await recetteSur(
			{
				"cycle/src/outil.ts": "export const outil = 1;\n",
				"cycle/README.md": "# cycle\n",
				"specs/stories/e01/e01s06-autre.md": "# autre\n",
			},
			documentation.commande,
		);
		assert.equal(docs.issue.statut, "proprietaire");
		assert.deepEqual(documentation.lancements(), [], "no campaign runs");
		assert.deepEqual(
			docs.ctx.journal.lire().filter((e) => e.genre === "controle" && String(e.controle).startsWith("campagne-")),
			[],
		);
	});

	it("une branche qui déplace et change un fichier de l'exécuteur hors de son chemin fait jouer les deux campagnes à la tête", async () => {
		const executeur = fausseCampagne();
		const { root, ctx } = await brancheQuiDeplaceLExecuteur(executeur.commande);
		await conduirePas(ctx, "recette");
		const tete = revision(root);
		assert.deepEqual(
			executeur.lancements(),
			[
				{ technologie: "npm", tete },
				{ technologie: "maven", tete },
			],
			"a file moved out of an executed path is a change of that path",
		);
	});

	it("une branche qui change un fichier de l'exécuteur dont le nom porte un caractère non ASCII, un guillemet ou une tabulation fait jouer les deux campagnes à la tête", async () => {
		for (const fichier of [
			"src/adapters/execution/exécuteur.js",
			'src/domain/gates/g"2.ts',
			"src/adapters/sandbox/a\tb.ts",
		]) {
			const executeur = fausseCampagne();
			const { root } = await recetteSur({ [fichier]: "export const x = 1;\n" }, executeur.commande);
			const tete = revision(root);
			assert.deepEqual(
				executeur.lancements(),
				[
					{ technologie: "npm", tete },
					{ technologie: "maven", tete },
				],
				`a change of ${JSON.stringify(fichier)} is a change of what 495 executes`,
			);
		}
	});

	it("requires the campaigns for a change under each path that 495 executes, and builds the control of a campaign from npm run campagne with the network open", () => {
		for (const fichier of [
			"src/application/stacks/registry.ts",
			"src/adapters/stacks/node/node.ts",
			"src/adapters/execution/runner.ts",
			"src/adapters/sandbox/backends.ts",
			"src/domain/gates/g2.ts",
		])
			assert.equal(campagnesExigees(["README.md", fichier]), true, fichier);
		assert.equal(campagnesExigees([]), false, "an empty branch");
		assert.equal(
			campagnesExigees([
				"src/application/stacks.ts",
				"src/adapters/git/integrator.ts",
				"test/v2-kernel/runner.test.ts",
			]),
			false,
			"neighbours of the executed paths",
		);
		assert.deepEqual(commandeDeCampagne("maven"), ["npm", "run", "campagne", "--", "maven"]);
		assert.equal(
			controleDeCampagne("npm", commandeDeCampagne("npm")).reseau,
			"allowed",
			"a campaign installs what its target declares and calls its model",
		);
	});
});
