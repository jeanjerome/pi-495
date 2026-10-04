import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { Executeur } from "../../cycle/src/controls.ts";
import { assertionsPerdues, lireReprises, marquerReprise, nombreDeTests, reprendre } from "../../cycle/src/reprise.ts";
import { gitCmd, tempDir, removedAfterEach } from "../helpers/fixtures.ts";
import { COMMIT, NODE, depot, fauxClaude } from "../helpers/cycle.ts";

const LISTE = `# Les reprises

Une introduction.

## R01 — greet is written once

Statut : à faire

- Où : src/greet.js
- Reprise : name the greeting.

## R02 — the greeting has a constant

Statut : à faire

- Où : src/greet.js
- Reprise : hoist the greeting into a constant.
`;

/** The fixture's test of greet, with its assertion loosened. */
const LOOSE_TEST =
	'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { greet } from "../src/greet.js";\n\ntest("greet", () => {\n  assert.ok(greet("x"));\n});\n';

const aNettoyer = removedAfterEach();

/** A repository on main whose list carries two refactorings, and the options of a run over it. */
function depotReprises(reponses: string) {
	const root = depot();
	writeFileSync(join(root, "specs", "reprises.md"), LISTE);
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", "docs: the refactoring list"]);
	const racine = tempDir("495-", aNettoyer);
	const annonces: string[] = [];
	return {
		root,
		annonces,
		options: {
			root,
			racine,
			cible: "main",
			executeur: new Executeur(new UnconfinedSandbox(), new CasObjectStore(join(racine, "objects"))),
			preflight: { id: "preflight", commande: [NODE, "--test"], reseau: "denied" as const, timeout_ms: 60_000 },
			build: { id: "build", commande: [NODE, "-e", ""], reseau: "denied" as const, timeout_ms: 60_000 },
			claude: fauxClaude(reponses),
			annonce: (texte: string) => annonces.push(texte),
		},
	};
}

const sujets = (root: string, n: number) =>
	gitCmd(root, ["log", "--format=%s", `-${n}`])
		.trim()
		.split("\n");
const statuts = (root: string) => lireReprises(root).map((r) => [r.id, r.statut]);

/** The session of a refactoring commits a change that keeps greet's behaviour; the review finds it constant. */
const CONSTANT = `${COMMIT}
export default (invite, cwd) => {
  if (invite.includes("Relecture d'une reprise")) return { verdict: "constant", constats: [], resume: "constant" };
  const id = /reprise à comportement constant, (R\\d+)/.exec(invite)[1];
  commit(cwd, { "src/greet.js": "const GREETING = \\"Hello\\";\\nexport function greet(name) {\\n  return \`\${GREETING}, \${name}\`;\\n}\\n// " + id + "\\n" }, "refactor: work in progress");
  return { status: "faite", message: "refactor: greet reads its greeting from a constant (" + id + ")", raison: "", resume: "done" };
};`;

describe("the list of refactorings", () => {
	it("reads each section's id, title and status, and marks one without touching the others", () => {
		const root = tempDir("495-", aNettoyer);
		writeFileSync(join(root, "reprises.md"), LISTE);
		const chemin = join(root, "reprises.md");
		assert.deepEqual(
			lireReprises(root, chemin).map((r) => [r.id, r.titre, r.statut]),
			[
				["R01", "greet is written once", "à faire"],
				["R02", "the greeting has a constant", "à faire"],
			],
		);
		marquerReprise(root, "R02", "écartée — the code already does it", chemin);
		assert.deepEqual(
			lireReprises(root, chemin).map((r) => r.statut),
			["à faire", "écartée — the code already does it"],
		);
		assert.match(lireReprises(root, chemin)[1]!.corps, /hoist the greeting into a constant/);
	});
});

describe("what a refactoring may do to the tests", () => {
	it("accepts an assertion moved to another file, and names one that is rewritten or removed", () => {
		const deplacee = [
			"diff --git a/test/a.test.ts b/test/a.test.ts",
			"--- a/test/a.test.ts",
			"+++ b/test/a.test.ts",
			'-\tassert.equal(greet("x"), "Hello, x");',
			"diff --git a/test/b.test.ts b/test/b.test.ts",
			"+++ b/test/b.test.ts",
			'+    assert.equal(greet("x"), "Hello, x");',
		].join("\n");
		assert.deepEqual(assertionsPerdues(deplacee), []);
		const reecrite = [
			"--- a/test/a.test.ts",
			"+++ b/test/a.test.ts",
			'-\tassert.equal(greet("x"), "Hello, x");',
			'+\tassert.equal(greet("y"), "Hello, y");',
		].join("\n");
		assert.deepEqual(assertionsPerdues(reecrite), ['assert.equal(greet("x"), "Hello, x");']);
	});

	it("reads the number of tests from the last summary of a node:test run, spec or TAP", () => {
		assert.equal(nombreDeTests("ℹ tests 3\nℹ pass 3\nℹ tests 866\n"), 866);
		assert.equal(nombreDeTests("# tests 12\n# pass 12\n"), 12);
		assert.equal(nombreDeTests("no summary"), null);
	});
});

describe("a run of refactorings", () => {
	it("lands each refactoring the review finds constant as one commit on main that marks it landed", async () => {
		const { root, options } = depotReprises(CONSTANT);
		assert.equal(await reprendre(options), 0);
		assert.equal(gitCmd(root, ["branch", "--show-current"]).trim(), "main");
		assert.deepEqual(sujets(root, 3), [
			"refactor: greet reads its greeting from a constant (R02)",
			"refactor: greet reads its greeting from a constant (R01)",
			"docs: the refactoring list",
		]);
		assert.deepEqual(statuts(root), [
			["R01", "versée"],
			["R02", "versée"],
		]);
		assert.equal(gitCmd(root, ["status", "--porcelain"]).trim(), "");
	});

	it("marks a refactoring the session sets aside, with its reason, and goes on to the next", async () => {
		const { root, options } = depotReprises(`${COMMIT}
export default (invite, cwd) => {
  if (invite.includes("Relecture d'une reprise")) return { verdict: "constant", constats: [], resume: "constant" };
  if (invite.includes("R01")) return { status: "ecartee", message: "", raison: "it would change what greet returns", resume: "set aside" };
  commit(cwd, { "src/greet.js": "export function greet(name) {\\n  return \`Hello, \${name}\`;\\n}\\n// R02\\n" }, "refactor: wip");
  return { status: "faite", message: "refactor: greet carries its reference", raison: "", resume: "done" };
};`);
		assert.equal(await reprendre(options), 0);
		assert.deepEqual(statuts(root), [
			["R01", "écartée — it would change what greet returns"],
			["R02", "versée"],
		]);
		assert.deepEqual(sujets(root, 2), [
			"refactor: greet carries its reference",
			"docs: the refactoring list sets R01 aside",
		]);
	});

	it("stops, leaving main and the list untouched, when the review sees a behaviour change", async () => {
		const { root, options, annonces } = depotReprises(`${COMMIT}
export default (invite, cwd) => {
  if (invite.includes("Relecture d'une reprise"))
    return { verdict: "change", constats: [{ fichier: "src/greet.js", constat: "greet now shouts" }], resume: "change" };
  commit(cwd, { "src/greet.js": "export function greet(name) {\\n  return \`Hello, \${name}\`;\\n}\\n// changed\\n" }, "refactor: wip");
  return { status: "faite", message: "refactor: greet is tidied", raison: "", resume: "done" };
};`);
		const avant = gitCmd(root, ["rev-parse", "main"]).trim();
		assert.equal(await reprendre(options), 1);
		assert.equal(gitCmd(root, ["rev-parse", "main"]).trim(), avant);
		assert.deepEqual(statuts(root), [
			["R01", "à faire"],
			["R02", "à faire"],
		]);
		assert.ok(
			annonces.some((a) => a.includes("greet now shouts")),
			annonces.join("\n"),
		);
	});

	it("stops before the review when an assertion of the tests is rewritten", async () => {
		const { root, options, annonces } = depotReprises(`${COMMIT}
export default (invite, cwd) => {
  if (invite.includes("Relecture d'une reprise")) throw new Error("no review expected");
  commit(cwd, { "test/greet.test.js": ${JSON.stringify(LOOSE_TEST)} }, "test: wip");
  return { status: "faite", message: "test: greet is checked loosely", raison: "", resume: "done" };
};`);
		const avant = gitCmd(root, ["rev-parse", "main"]).trim();
		assert.equal(await reprendre(options), 1);
		assert.equal(gitCmd(root, ["rev-parse", "main"]).trim(), avant);
		assert.ok(
			annonces.some((a) => a.includes('assert.equal(greet("x"), "Hello, x");')),
			annonces.join("\n"),
		);
	});
});

/** Runs the list and asserts the run stops with code 1, leaves main where it was, and announces `texte`. */
async function arreteSur(d: ReturnType<typeof depotReprises>, texte: string): Promise<void> {
	const avant = gitCmd(d.root, ["rev-parse", "main"]).trim();
	assert.equal(await reprendre(d.options), 1);
	assert.equal(gitCmd(d.root, ["rev-parse", "main"]).trim(), avant);
	assert.ok(d.annonces.includes(`⛔ ${texte}`), d.annonces.join("\n"));
}

/** A session that must never run: the run stops before it. */
const AUCUNE_SESSION = `export default () => { throw new Error("no session expected"); };`;

describe("what the tool refuses without believing the session", () => {
	it("stops when the session leaves the tree modified", async () => {
		await arreteSur(
			depotReprises(`
import { writeFileSync } from "node:fs";
import { join } from "node:path";
export default (invite, cwd) => {
  if (invite.includes("Relecture d'une reprise")) throw new Error("no review expected");
  writeFileSync(join(cwd, "src/greet.js"), "export function greet(name) {\\n  return \`Hello, \${name}\`;\\n}\\n// uncommitted\\n");
  return { status: "faite", message: "refactor: greet is tidied", raison: "", resume: "done" };
};`),
			"R01: the session left the tree modified",
		);
	});

	it("stops when the session sets a refactoring aside on a branch that carries commits", async () => {
		await arreteSur(
			depotReprises(`${COMMIT}
export default (invite, cwd) => {
  if (invite.includes("Relecture d'une reprise")) throw new Error("no review expected");
  commit(cwd, { "src/greet.js": "export function greet(name) {\\n  return \`Hello, \${name}\`;\\n}\\n// R01\\n" }, "refactor: wip");
  return { status: "ecartee", message: "", raison: "it would change what greet returns", resume: "set aside" };
};`),
			"R01: set aside, but the branch carries commits",
		);
	});

	it("stops when the commit message is not of the cycle's form", async () => {
		await arreteSur(
			depotReprises(`${COMMIT}
export default (invite, cwd) => {
  if (invite.includes("Relecture d'une reprise")) throw new Error("no review expected");
  commit(cwd, { "src/greet.js": "export function greet(name) {\\n  return \`Hello, \${name}\`;\\n}\\n// R01\\n" }, "refactor: wip");
  return { status: "faite", message: "greet is tidied", raison: "", resume: "done" };
};`),
			"R01: the commit message is not one line of the cycle's form: greet is tidied",
		);
	});

	it("stops when the session commits nothing", async () => {
		await arreteSur(
			depotReprises(`
export default (invite) => {
  if (invite.includes("Relecture d'une reprise")) throw new Error("no review expected");
  return { status: "faite", message: "refactor: greet is tidied", raison: "", resume: "done" };
};`),
			"R01: the session committed nothing",
		);
	});

	it("stops when the session modifies the list of refactorings", async () => {
		await arreteSur(
			depotReprises(`${COMMIT}
export default (invite, cwd) => {
  if (invite.includes("Relecture d'une reprise")) throw new Error("no review expected");
  commit(cwd, { "specs/reprises.md": "# Les reprises\\n" }, "docs: wip");
  return { status: "faite", message: "docs: the list is shorter", raison: "", resume: "done" };
};`),
			"R01: the session modified specs/reprises.md, which the tool writes",
		);
	});

	it("stops when Preflight runs fewer tests than before the refactoring", async () => {
		const d = depotReprises(`${COMMIT}
export default (invite, cwd) => {
  if (invite.includes("Relecture d'une reprise")) throw new Error("no review expected");
  git(cwd, ["rm", "-q", "src/greet.check.test.js"]);
  git(cwd, ["commit", "-q", "-m", "refactor: wip"]);
  return { status: "faite", message: "refactor: greet loses a check", raison: "", resume: "done" };
};`);
		writeFileSync(
			join(d.root, "src", "greet.check.test.js"),
			'import { test } from "node:test";\nimport { greet } from "./greet.js";\n\ntest("greet is a function", () => {\n  if (typeof greet !== "function") throw new Error("greet");\n});\n',
		);
		gitCmd(d.root, ["add", "-A"]);
		gitCmd(d.root, ["commit", "-q", "-m", "test: a check outside test/"]);
		await arreteSur(d, "R01: Preflight ran 1 tests, 2 before");
	});

	it("stops before any session when the run does not start from main", async () => {
		const d = depotReprises(AUCUNE_SESSION);
		gitCmd(d.root, ["checkout", "-q", "-b", "ailleurs"]);
		await arreteSur(d, "the run starts from main, not ailleurs");
	});

	it("stops before any session when the run starts from a modified tree", async () => {
		const d = depotReprises(AUCUNE_SESSION);
		writeFileSync(join(d.root, "README.md"), "# modified\n");
		await arreteSur(d, "the run starts from a clean tree: files are modified");
	});

	it("hands back after as many refactorings as its ceiling, leaving the next to do", async () => {
		const { root, options, annonces } = depotReprises(CONSTANT);
		assert.equal(await reprendre({ ...options, max: 1 }), 0);
		assert.deepEqual(sujets(root, 2), [
			"refactor: greet reads its greeting from a constant (R01)",
			"docs: the refactoring list",
		]);
		assert.deepEqual(statuts(root), [
			["R01", "versée"],
			["R02", "à faire"],
		]);
		assert.ok(
			annonces.includes("1 reprise(s) traitées : la course rend la main (CYCLE_495_REPRISES_MAX)"),
			annonces.join("\n"),
		);
	});
});
