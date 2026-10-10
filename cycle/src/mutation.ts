/**
 * The mutation the tool runs before the first review round: Stryker on the lines the branch introduces in the
 * TypeScript sources of `src/`, `cycle/src/` and `scripts/`, with the test files the tasks' commands name, so
 * that the reviewers receive the mutants no task's test kills instead of producing them by hand (`D-89`).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { IntroducedLines } from "../../src/ports/execution.ts";
import { introducedLines } from "../../src/application/coverage.ts";
import { strykerScopeOf } from "../../src/adapters/stacks/node/mutation/stryker-reader.ts";
import type { Controle } from "./controls.ts";
import { git } from "./git.ts";
import type { Story } from "./story.ts";

/** The directories whose TypeScript sources the mutation reads; the tests live under `test/`, outside them. */
const SOURCES = ["src/", "cycle/src/", "scripts/"];
const SOURCE_TYPESCRIPT = /\.ts$/;
const FICHIER_DE_TEST = /\.test\.[cm]?[jt]sx?$/;

/** How long Stryker may run, in minutes, unless `CYCLE_495_MUTATION_MIN` says otherwise. */
const BUDGET_MIN = 30;

/**
 * The time budget of the mutation, in milliseconds, which `CYCLE_495_MUTATION_MIN` sets in minutes; the entry point
 * refuses a value that is not a number before any step runs.
 */
export function budgetMutation(): number {
	return Number(process.env.CYCLE_495_MUTATION_MIN ?? BUDGET_MIN) * 60_000;
}

/** A mutant no named test kills: Stryker saw it survive, or no named test runs its line. */
interface Survivant {
	fichier: string;
	ligne: number;
	operateur: string;
	remplacement: string;
	statut: "Survived" | "NoCoverage";
}

/**
 * The git modes of a regular file. Stryker rewrites in place the file it mutates: through a symbolic link, it would
 * rewrite the link's target, which may lie in the branch's tree.
 */
const FICHIER_ORDINAIRE = new Set(["100644", "100755"]);

/** The lines of each source the branch changes from `base` to `tete` that no line of `base` accounts for. */
function lignesIntroduites(root: string, base: string, tete: string): IntroducedLines {
	const lignes: IntroducedLines = {};
	const etats = git(root, ["diff", "--raw", "-M", `${base}...${tete}`, "--", ...SOURCES]);
	for (const ligne of etats.split("\n").filter(Boolean)) {
		const [entete = "", ...chemins] = ligne.split("\t");
		const [, mode = "", , , etat = ""] = entete.split(" ");
		const chemin = chemins.at(-1) ?? "";
		if (!FICHIER_ORDINAIRE.has(mode) || !SOURCE_TYPESCRIPT.test(chemin)) continue;
		const ancien = etat === "A" ? null : (chemins[0] ?? chemin);
		const reference = ancien === null ? "" : git(root, ["show", `${base}:${ancien}`]);
		const introduites = introducedLines(reference, git(root, ["show", `${tete}:${chemin}`]));
		if (introduites.length > 0) lignes[chemin] = introduites;
	}
	return lignes;
}

/**
 * The ranges Stryker mutates, `file:start-end`, one per run of lines the branch introduces from `base` to `tete`.
 * Every one of these sources is measured: a directory named `tests` under `src/` holds the code that reads a
 * target's tests, not a test.
 */
export function plagesIntroduites(root: string, base: string, tete: string): string[] {
	return strykerScopeOf(lignesIntroduites(root, base, tete), () => true).classes;
}

/** The test files the tasks' `Vérifie :` commands name. */
export function testsDesTaches(story: Story): string[] {
	return [...new Set(story.taches.flatMap((t) => (t.verifie ?? []).filter((a) => FICHIER_DE_TEST.test(a))))];
}

/**
 * Writes under `dossier` the Stryker configuration that mutates `plages` with `tests`, run one file at a time by
 * the TAP runner of `node --test`, and returns the control that runs it and where it leaves its JSON report.
 */
export function ecrireConfigurationStryker(
	dossier: string,
	plages: string[],
	tests: string[],
	budget_ms: number,
): { controle: Controle; rapport: string } {
	const configuration = join(dossier, "stryker.config.json");
	const rapport = join(dossier, "mutation.json");
	writeFileSync(
		configuration,
		JSON.stringify({
			mutate: plages,
			testRunner: "tap",
			tap: { testFiles: tests },
			coverageAnalysis: "perTest",
			reporters: ["json"],
			jsonReporter: { fileName: rapport },
			// The detached tree is already the copy Stryker would make, and is removed after the run; copying it
			// again makes Stryker rewrite `tsconfig.json` through an API TypeScript 7 no longer has.
			inPlace: true,
			// In place, Stryker writes only the files it changes: the mutated ones, and, unless this is off, every
			// TypeScript file of the tree, symbolic links followed, which `node --test` never type-checks anyway.
			disableTypeChecks: false,
			// Its backups stay out of the tree, where a directory of that name the branch commits could be a link.
			tempDirName: join(dossier, "stryker-tmp"),
		}),
	);
	return {
		controle: {
			id: "mutation",
			commande: [process.execPath, "node_modules/@stryker-mutator/core/bin/stryker.js", "run", configuration],
			// Stryker talks to its test processes over a socket.
			reseau: "loopback",
			timeout_ms: budget_ms,
		},
		rapport,
	};
}

interface RapportStryker {
	files: Record<
		string,
		{ mutants: { mutatorName: string; replacement?: string; location: { start: { line: number } }; status: string }[] }
	>;
}

/** The mutants of a Stryker JSON report that no test killed. */
export function survivants(texte: string): Survivant[] {
	const rapport = JSON.parse(texte) as RapportStryker;
	return Object.entries(rapport.files).flatMap(([fichier, { mutants }]) =>
		mutants
			.filter((m) => m.status === "Survived" || m.status === "NoCoverage")
			.map((m) => ({
				fichier,
				ligne: m.location.start.line,
				operateur: m.mutatorName,
				remplacement: (m.replacement ?? "").replace(/\s+/g, " ").slice(0, 80),
				statut: m.status as Survivant["statut"],
			})),
	);
}

/** What the reviewers of the first round are told of the mutation of `plages` with `tests`. */
export function texteMutation(plages: string[], tests: string[], vivants: Survivant[]): string {
	const entete = `## Mutation des lignes introduites\n\nL'outil a muté les lignes que la branche introduit (${plages.map((p) => `\`${p}\``).join(", ")}) avec les tests que les tâches nomment (${tests.map((t) => `\`${t}\``).join(", ") || "aucun"}).`;
	if (vivants.length === 0) return `${entete} Aucun mutant ne survit.\n`;
	const liste = vivants
		.map(
			(s) =>
				`- \`${s.fichier}:${s.ligne}\` ${s.operateur} → \`${s.remplacement}\`${s.statut === "NoCoverage" ? " (aucun de ces tests n'exécute la ligne)" : ""}`,
		)
		.join("\n");
	return `${entete} Aucun de ces tests n'échoue quand une de ces lignes est remplacée ainsi ; juge si le mutant laisse une promesse sans test :\n\n${liste}\n`;
}

/**
 * Why a Stryker run left no report: the incident the runner observed, past the time budget included, or the
 * errors Stryker printed, without its colours nor the time and process number that stamp each line.
 */
export function raisonDeStryker(facts: Record<string, unknown>, sortie: string): string {
	if (typeof facts.incident === "string")
		return facts.incident.startsWith("timeout")
			? `Stryker a dépassé son budget de temps (${facts.incident}, \`CYCLE_495_MUTATION_MIN\`)`
			: `Stryker s'est arrêté : ${facts.incident}`;
	const erreurs = stripVTControlCharacters(sortie)
		.split(/\r?\n/)
		.filter((l) => /\bERROR\b/.test(l))
		.map((l) => l.replace(/^\s*\d{2}:\d{2}:\d{2} \(\d+\) /, "").trim());
	return `Stryker s'est arrêté avec le code ${String(facts.exit_code)} sans écrire de rapport${erreurs.length > 0 ? ` : ${erreurs.join(" ; ")}` : ""}`;
}

/** What the reviewers of the first round are told of a mutation that could not complete. */
export function texteNonAboutie(raison: string): string {
	return `## Mutation des lignes introduites\n\nLa mutation n'a pas abouti : ${raison}. Aucun mutant survivant n'est connu : mute toi-même les lignes qui tiennent les promesses.\n`;
}

/** What the reviewers of the first round are told when the branch introduces no line of these sources. */
export const RIEN_A_MUTER = `## Mutation des lignes introduites\n\nAucune ligne n'était à muter : la branche n'introduit aucune ligne dans les sources TypeScript de ${SOURCES.map((s) => `\`${s}\``).join(", ")}, hors tests.\n`;
