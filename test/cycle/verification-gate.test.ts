import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { conduirePas } from "../../cycle/src/cycle.ts";
import {
	COMMIT,
	CONTRE_EXEMPLE,
	EXEMPLES_SEULS,
	MANIFESTE,
	SHOUT_CODE,
	SHOUT_TEST,
	compagnon,
	contexte,
	depotAvecCompagnon,
	fauxClaude,
	fausseExploration,
	fichiersDuModele,
	modeleRetenu,
} from "../helpers/cycle.ts";

/** A red-green session that does the work: the test, its red, then the code. */
const ROUGE_VERT = `${COMMIT}
export default (invite, cwd) => {
  commit(cwd, { "test/shout.test.js": ${JSON.stringify(SHOUT_TEST)} }, "test: greet shouts");
  commit(cwd, { "src/greet.js": ${JSON.stringify(SHOUT_CODE)} }, "feat: greet shouts");
  return { status: "fini", taches: [{ numero: 1 }], resume: "done" };
};`;

describe("the preparation the conductor checks before the red-green", () => {
	it("une préparation incomplète empêche le lancement de la session rouge-vert", async () => {
		const root = depotAvecCompagnon(compagnon(EXEMPLES_SEULS, []));
		const formel = fausseExploration(0, "");
		const ctx = { ...contexte(root, fauxClaude(ROUGE_VERT)), exploration: formel.exploration };
		await conduirePas(ctx, "story");
		const issue = await conduirePas(ctx, "rouge-vert");
		const sessions = ctx.journal.lire().filter((e) => e.genre === "session");
		assert.deepEqual(sessions, [], "no red-green session is launched on an incomplete preparation");
		assert.equal(issue.statut, "bloque");
		const motif = issue.statut === "bloque" ? issue.motif : "";
		assert.match(motif, /préparation/);
		assert.match(motif, /« greet shouts » : sans oracle/);
		assert.equal(ctx.journal.prochainPas(), "rouge-vert");
	});

	it("un contre-exemple bloque avant toute implémentation et la trace est proposée à la préparation", async () => {
		const root = depotAvecCompagnon(compagnon(modeleRetenu(MANIFESTE)), fichiersDuModele());
		const formel = fausseExploration(1, CONTRE_EXEMPLE);
		const ctx = { ...contexte(root, fauxClaude(ROUGE_VERT)), exploration: formel.exploration };
		await conduirePas(ctx, "story");
		const issue = await conduirePas(ctx, "rouge-vert");
		assert.deepEqual(formel.lancements(), [MANIFESTE]);
		assert.deepEqual(
			ctx.journal.lire().filter((e) => e.genre === "session"),
			[],
			"no red-green session is launched when a required property is violated",
		);
		assert.equal(issue.statut, "bloque");
		const motif = issue.statut === "bloque" ? issue.motif : "";
		assert.match(motif, /counterexample to Shouted/);
		const exploration = ctx.journal
			.lire()
			.find((e) => e.genre === "controle" && e.controle === `exploration-${MANIFESTE}`);
		const trace = (exploration?.artifacts as { ref: { digest: string } }[] | undefined)?.[0]?.ref.digest ?? "";
		assert.ok(trace.startsWith("sha256:") && motif.includes(trace), `the trace ${trace} is named in: ${motif}`);
		assert.match(motif, /revient à la préparation/);
	});

	it("le blocage cite les états du contre-exemple après un long en-tête de TLC", async () => {
		const entete = Array.from({ length: 15 }, (_, i) => `header line ${i + 1}`).join("\n");
		const sortie = `Greet.tla with Greet.cfg: counterexample — not PASS\n${entete}\ncounterexample to Shouted:\n  1: <Initial predicate>\n     shouted = FALSE\n`;
		const root = depotAvecCompagnon(compagnon(modeleRetenu(MANIFESTE)), fichiersDuModele());
		const formel = fausseExploration(1, sortie);
		const ctx = { ...contexte(root, fauxClaude(ROUGE_VERT)), exploration: formel.exploration };
		await conduirePas(ctx, "story");
		const issue = await conduirePas(ctx, "rouge-vert");
		const motif = issue.statut === "bloque" ? issue.motif : "";
		assert.match(motif, /counterexample — not PASS/);
		assert.match(motif, /counterexample to Shouted:\n.*1: <Initial predicate>\n.*shouted = FALSE/);
		assert.match(motif, /15 ligne\(s\) de plus dans la trace/);
	});

	it("un modèle d'états retenu sans manifeste et une preuve Lean retenue bloquent comme exploration indéterminée, sans session", async () => {
		const moyens = [
			{ moyen: "exemples", retenu: true, raison: "one case shows the greeting" },
			{ moyen: "proprietes", retenu: false, raison: "one input is enough" },
			{ moyen: "modele-d-etats", retenu: true, proprietes: ["Shouted"] },
			{ moyen: "preuve-lean", retenu: true, proprietes: ["greet is idempotent"] },
		];
		const root = depotAvecCompagnon(compagnon(moyens));
		const formel = fausseExploration(0, "");
		const ctx = { ...contexte(root, fauxClaude(ROUGE_VERT)), exploration: formel.exploration };
		await conduirePas(ctx, "story");
		const issue = await conduirePas(ctx, "rouge-vert");
		assert.deepEqual(formel.lancements(), []);
		assert.deepEqual(
			ctx.journal.lire().filter((e) => e.genre === "session"),
			[],
		);
		const motif = issue.statut === "bloque" ? issue.motif : "";
		assert.match(motif, /exploration indéterminée/);
		assert.match(motif, /« greet shouts » : modèle d'états retenu sans manifeste/);
		assert.match(motif, /« greet shouts » : preuve Lean retenue, et le cycle n'a pas de contrôle Lean/);
	});

	it("une exploration qui reste inconclusive bloque avant toute session et cite sa trace", async () => {
		const root = depotAvecCompagnon(compagnon(modeleRetenu(MANIFESTE)), fichiersDuModele());
		const formel = fausseExploration(2, "Greet.tla with Greet.cfg: inconclusive — not PASS\n  budget exhausted\n");
		const ctx = { ...contexte(root, fauxClaude(ROUGE_VERT)), exploration: formel.exploration };
		await conduirePas(ctx, "story");
		const issue = await conduirePas(ctx, "rouge-vert");
		assert.deepEqual(
			ctx.journal.lire().filter((e) => e.genre === "session"),
			[],
		);
		const motif = issue.statut === "bloque" ? issue.motif : "";
		assert.match(motif, new RegExp(`- ${MANIFESTE} : inconclusive, trace sha256:[0-9a-f]{64}`));
		assert.match(motif, /budget exhausted/);
	});

	it("une story simple poursuit les étapes existantes sans lancer TLC ni Lean", async () => {
		const root = depotAvecCompagnon(compagnon(EXEMPLES_SEULS));
		const formel = fausseExploration(0, "");
		const ctx = { ...contexte(root, fauxClaude(ROUGE_VERT)), exploration: formel.exploration };
		await conduirePas(ctx, "story");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		assert.deepEqual(formel.lancements(), []);
		assert.equal(ctx.journal.lire().filter((e) => e.genre === "session").length, 1);
		assert.equal(ctx.journal.prochainPas(), "autocontrole");
	});

	it("un modèle d'états écarté n'est pas exploré, même quand il nomme encore son manifeste", async () => {
		const ecarte = EXEMPLES_SEULS.map((m) =>
			m.moyen === "modele-d-etats" ? { ...m, proprietes: ["Shouted"], manifestes: [MANIFESTE] } : m,
		);
		const root = depotAvecCompagnon(compagnon(ecarte), fichiersDuModele());
		const formel = fausseExploration(1, CONTRE_EXEMPLE);
		const ctx = { ...contexte(root, fauxClaude(ROUGE_VERT)), exploration: formel.exploration };
		await conduirePas(ctx, "story");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		assert.deepEqual(formel.lancements(), [], "a set-aside model is not explored");
		assert.equal(ctx.journal.lire().filter((e) => e.genre === "session").length, 1);
	});

	it("le conducteur explore le modèle par le scripts/check-formal.ts du dépôt quand rien ne le remplace", async () => {
		// The repository's own exploration script, here one that reports a counterexample on the manifest it is given.
		const script =
			"process.stdout.write(`Greet.tla with Greet.cfg: counterexample — not PASS\\ncounterexample to Shouted: explored ${process.argv[2]}\\n`);\nprocess.exit(1);\n";
		const root = depotAvecCompagnon(compagnon(modeleRetenu(MANIFESTE)), {
			...fichiersDuModele(),
			"scripts/check-formal.ts": script,
		});
		const ctx = contexte(root, fauxClaude(ROUGE_VERT));
		await conduirePas(ctx, "story");
		const issue = await conduirePas(ctx, "rouge-vert");
		assert.equal(issue.statut, "bloque");
		assert.match(
			issue.statut === "bloque" ? issue.motif : "",
			new RegExp(`counterexample to Shouted: explored ${MANIFESTE}`),
		);
		assert.deepEqual(
			ctx.journal.lire().filter((e) => e.genre === "session"),
			[],
		);
	});
});
