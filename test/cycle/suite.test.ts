import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Journal } from "../../cycle/src/journal.ts";
import { lirePlan } from "../../cycle/src/plan.ts";
import { defautsOuverts } from "../../cycle/src/registre.ts";
import { corrigerDefauts, suite } from "../../cycle/src/suite.ts";
import { gitCmd, tempDir, removedAfterEach } from "../helpers/fixtures.ts";
import { COMMIT, depot, fauxClaude } from "../helpers/cycle.ts";

const cleanups = removedAfterEach();

const PLAN = (stories: string) => `epics:
  - id: e01
    title: "Greet"
    status: à faire
    prete: oui
    stories:
${stories}

  - id: e02
    title: "Not ready"
    status: à faire

communication: specs/communication
`;

const LANDED = '      - { id: e01s05, status: "versée", title: "greet shouts" }';
const PENDING = '      - { id: e01s05, status: "à faire", title: "greet shouts" }';

/** A repository on main with the story file and a plan whose first epic the owner marked ready. */
function depotSuite(stories: string): string {
	const root = depot();
	writeFileSync(join(root, "specs", "plan.yaml"), PLAN(stories));
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", "docs: the plan lists the ready epic"]);
	return root;
}

function options(root: string, claude: string, appels: string[], code = 0) {
	return {
		root,
		racine: tempDir("495-", cleanups),
		cible: "main",
		claude: fauxClaude(claude),
		deroulerStory: async (id: string) => {
			appels.push(id);
			return code;
		},
	};
}

const PAS_DE_SESSION = "export default () => { throw new Error('no session expected'); };";
const COMPLETE = `export default () => ({ status: "complete", story_id: "", message: "", resume: "delivered" });`;

const sujets = (root: string, n: number) =>
	gitCmd(root, ["log", "--format=%s", `-${n}`])
		.trim()
		.split("\n");

describe("the run of the ready epics", () => {
	it("drives the pending story of the ready epic, marks it landed, and leaves an epic not marked ready alone", async () => {
		const root = depotSuite(PENDING);
		const appels: string[] = [];
		assert.equal(await suite(options(root, COMPLETE, appels)), 0);
		assert.deepEqual(appels, ["e01s05"]);
		assert.deepEqual(
			lirePlan(root).map((e) => [e.id, e.statut, e.stories.map((s) => s.statut)]),
			[
				["e01", "versé", ["versée"]],
				["e02", "à faire", []],
			],
		);
		assert.deepEqual(sujets(root, 2), ["docs: the plan marks e01 landed", "docs: the plan marks e01s05 landed"]);
	});

	it("has the next story written when the plan lists none pending, commits it, and drives it", async () => {
		const root = depotSuite(LANDED);
		const ecrit = `${COMMIT}
import { existsSync, readFileSync } from "node:fs";
export default (invite, cwd) => {
  const file = cwd + "/specs/stories/e01/e01s06-greet-shouts-twice.md";
  if (existsSync(file)) return { status: "complete", story_id: "", message: "", resume: "delivered" };
  const story = readFileSync(cwd + "/specs/stories/e01/e01s05-greet-shouts.md", "utf8").replace(/e01s05/g, "e01s06");
  const plan = readFileSync(cwd + "/specs/plan.yaml", "utf8").replace(${JSON.stringify(LANDED)}, ${JSON.stringify(`${LANDED}\n      - { id: e01s06, status: "à faire", title: "greet shouts twice" }`)});
  writeFileSync(file, story);
  writeFileSync(cwd + "/specs/plan.yaml", plan);
  return { status: "ecrite", story_id: "e01s06", message: "docs: the plan lists e01s06, where greet shouts twice", resume: "written" };
};`;
		const appels: string[] = [];
		assert.equal(await suite(options(root, ecrit, appels)), 0);
		assert.deepEqual(appels, ["e01s06"]);
		assert.equal(existsSync(join(root, "specs", "stories", "e01", "e01s06-greet-shouts-twice.md")), true);
		assert.deepEqual(sujets(root, 3), [
			"docs: the plan marks e01 landed",
			"docs: the plan marks e01s06 landed",
			"docs: the plan lists e01s06, where greet shouts twice",
		]);
	});

	it("stops with the code of a story that blocks, and leaves the plan as it was", async () => {
		const root = depotSuite(PENDING);
		const appels: string[] = [];
		assert.equal(await suite(options(root, PAS_DE_SESSION, appels, 1)), 1);
		assert.deepEqual(appels, ["e01s05"]);
		assert.equal(lirePlan(root)[0]?.stories[0]?.statut, "à faire");
	});

	it("stops, naming the epic, when the drafting session says it cannot write a story without the owner", async () => {
		const root = depotSuite(LANDED);
		const bloque = `export default () => ({ status: "bloque", story_id: "", message: "", resume: "two behaviours are defensible" });`;
		const appels: string[] = [];
		const messages: string[] = [];
		assert.equal(await suite({ ...options(root, bloque, appels), annonce: (t) => messages.push(t) }), 1);
		assert.deepEqual(appels, []);
		assert.match(messages.join("\n"), /e01 is not ready to run unattended: two behaviours are defensible/);
	});

	it("stops when the drafting session modifies a file beyond the story and the plan", async () => {
		const root = depotSuite(LANDED);
		const derive = `${COMMIT}
export default (invite, cwd) => {
  writeFileSync(cwd + "/src/greet.js", "// changed\\n");
  return { status: "ecrite", story_id: "e01s06", message: "docs: x", resume: "x" };
};`;
		const messages: string[] = [];
		assert.equal(await suite({ ...options(root, derive, []), annonce: (t) => messages.push(t) }), 1);
		assert.match(messages.join("\n"), /modified files beyond the story and the plan: src\/greet\.js/);
	});

	it("does not start from a branch other than main, or from a modified tree", async () => {
		const root = depotSuite(PENDING);
		const appels: string[] = [];
		gitCmd(root, ["checkout", "-q", "-b", "other"]);
		assert.equal(await suite(options(root, PAS_DE_SESSION, appels)), 1);
		gitCmd(root, ["checkout", "-q", "main"]);
		mkdirSync(join(root, "specs", "stories"), { recursive: true });
		writeFileSync(join(root, "src", "greet.js"), "// dirty\n");
		assert.equal(await suite(options(root, PAS_DE_SESSION, appels)), 1);
		assert.deepEqual(appels, []);
	});

	it("finishes at once when no epic is marked ready", async () => {
		const root = depotSuite(PENDING);
		writeFileSync(
			join(root, "specs", "plan.yaml"),
			readFileSync(join(root, "specs", "plan.yaml"), "utf8").replace("    prete: oui\n", ""),
		);
		gitCmd(root, ["add", "-A"]);
		gitCmd(root, ["commit", "-q", "-m", "docs: no epic is ready"]);
		const appels: string[] = [];
		assert.equal(await suite(options(root, PAS_DE_SESSION, appels)), 0);
		assert.deepEqual(appels, []);
	});
});

const REGISTRE = `bugs:
  - bug_id: BUG-2026-09-10T100000
    date: "2026-09-10"
    title: "A medium defect"
    severity: medium
    status: open
  - bug_id: BUG-2026-09-11T100000
    date: "2026-09-11"
    title: "A defect the owner must decide"
    severity: medium
    status: open
  - bug_id: BUG-2026-09-12T100000
    date: "2026-09-12"
    title: "A low defect"
    severity: low
    status: open
`;

const PLAN_CORRECTIFS = `epics:
  - id: e28
    title: "Correctifs"
    status: à faire
    stories: []

communication: specs/communication
`;

function depotCorrectifs(): string {
	const root = depot();
	writeFileSync(join(root, "specs", "plan.yaml"), PLAN_CORRECTIFS);
	mkdirSync(join(root, "specs", "bugs"), { recursive: true });
	writeFileSync(join(root, "specs", "bugs", "registry.yaml"), REGISTRE);
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", "docs: the plan and the registry list the defects"]);
	return root;
}

/** The session that writes the correction story of the defect it chooses, and sets one aside. */
const CHOISIT = `${COMMIT}
import { existsSync, readFileSync } from "node:fs";
export default (invite, cwd) => {
  const dir = cwd + "/specs/stories/e28";
  const file = dir + "/e28s01-fix-the-medium-defect.md";
  if (existsSync(file)) return { status: "aucun", story_id: "", bug_id: "", message: "", resume: "none left", a_decider: [{ bug_id: "BUG-2026-09-11T100000", raison: "two behaviours are defensible" }] };
  const story = readFileSync(cwd + "/specs/stories/e01/e01s05-greet-shouts.md", "utf8")
    .replace(/e01s05/g, "e28s01").replace("Epic : e01", "Epic : e28")
    .replace("Whoever calls greet is shouted at.", "Corrige BUG-2026-09-10T100000 : whoever calls greet is shouted at.");
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, story);
  writeFileSync(cwd + "/specs/plan.yaml", readFileSync(cwd + "/specs/plan.yaml", "utf8").replace("stories: []", 'stories:\\n      - { id: e28s01, status: "à faire", title: "fix the medium defect" }'));
  return { status: "ecrite", story_id: "e28s01", bug_id: "BUG-2026-09-10T100000", message: "docs: the story e28s01 repairs the medium defect", resume: "written", a_decider: [{ bug_id: "BUG-2026-09-11T100000", raison: "two behaviours are defensible" }] };
};`;

/** A story that lands: what the tool reads afterwards is the commit the landing wrote to its journal. */
function atterrit(racine: string, appels: string[]) {
	return async (id: string) => {
		appels.push(id);
		new Journal(id, racine).inscrire("versement", "verse", { commit: "abcdef1234567890", message: "fix", branche: id });
		return 0;
	};
}

describe("the defects between the epics of a run", () => {
	it("repairs the medium defects when an epic lands and the low ones when the run ends, and names what is left to the owner", async () => {
		const root = depotSuite(PENDING);
		mkdirSync(join(root, "specs", "bugs"), { recursive: true });
		writeFileSync(join(root, "specs", "bugs", "registry.yaml"), REGISTRE);
		writeFileSync(
			join(root, "specs", "plan.yaml"),
			readFileSync(join(root, "specs", "plan.yaml"), "utf8").replace(
				"communication:",
				'  - id: e28\n    title: "Correctifs"\n    status: à faire\n    stories: []\n\ncommunication:',
			),
		);
		gitCmd(root, ["add", "-A"]);
		gitCmd(root, ["commit", "-q", "-m", "docs: the plan and the registry list the defects"]);
		const journal = join(tempDir("495-", cleanups), "sessions.log");
		const modele = `import { appendFileSync } from "node:fs";
export default (invite) => {
  appendFileSync(${JSON.stringify(journal)}, invite.slice(0, 12) + "|" + (invite.match(/gravité au moins \`(\\w+)\`/)?.[1] ?? "") + "\\n");
  if (invite.startsWith("Rédaction")) return { status: "complete", story_id: "", message: "", resume: "delivered" };
  return { status: "aucun", story_id: "", bug_id: "", message: "", resume: "x", a_decider: [{ bug_id: "BUG-2026-09-11T100000", raison: "product choice" }] };
};`;
		const messages: string[] = [];
		const appels: string[] = [];
		assert.equal(await suite({ ...options(root, modele, appels), annonce: (t) => messages.push(t) }), 0);
		assert.deepEqual(appels, ["e01s05"]);
		assert.deepEqual(readFileSync(journal, "utf8").trim().split("\n"), [
			"Rédaction de|",
			"Correction d|medium",
			"Correction d|low",
		]);
		const fin = messages.join("\n");
		assert.equal((fin.match(/BUG-2026-09-11T100000 : product choice/g) ?? []).length, 1, "named once, at the end");
	});
});

describe("the repair of the registry's defects", () => {
	it("writes the story of the first defect that needs no decision, drives it, and marks the defect fixed at its landing", async () => {
		const root = depotCorrectifs();
		const appels: string[] = [];
		const o = options(root, CHOISIT, appels);
		const r = await corrigerDefauts({ ...o, deroulerStory: atterrit(o.racine, appels) }, "medium", "test");
		assert.equal(r.code, 0);
		assert.deepEqual(appels, ["e28s01"]);
		assert.deepEqual(r.aDecider, [{ bug_id: "BUG-2026-09-11T100000", raison: "two behaviours are defensible" }]);
		assert.deepEqual(
			defautsOuverts(root, "low").map((d) => d.id),
			["BUG-2026-09-11T100000", "BUG-2026-09-12T100000"],
		);
		assert.match(
			readFileSync(join(root, "specs", "bugs", "registry-fixed.yaml"), "utf8"),
			/status: fixed\n {4}fixed_in: abcdef1/,
		);
		assert.equal(lirePlan(root).find((e) => e.id === "e28")?.stories[0]?.statut, "versée");
		assert.deepEqual(sujets(root, 2), [
			"docs: the plan marks e28s01 landed and the registry marks its defect fixed",
			"docs: the story e28s01 repairs the medium defect",
		]);
	});

	it("names the defects it sets aside and repairs none when every one needs the owner", async () => {
		const root = depotCorrectifs();
		const aucun = `export default () => ({ status: "aucun", story_id: "", bug_id: "", message: "", resume: "x", a_decider: [{ bug_id: "BUG-2026-09-10T100000", raison: "product choice" }] });`;
		const appels: string[] = [];
		const r = await corrigerDefauts(options(root, aucun, appels), "medium", "test");
		assert.deepEqual(r, { code: 0, aDecider: [{ bug_id: "BUG-2026-09-10T100000", raison: "product choice" }] });
		assert.deepEqual(appels, []);
	});

	it("stops when the session leaves a story that cites no open defect", async () => {
		const root = depotCorrectifs();
		const faux = CHOISIT.replace("Corrige BUG-2026-09-10T100000", "Corrige BUG-2026-01-01T000000");
		const messages: string[] = [];
		const r = await corrigerDefauts({ ...options(root, faux, []), annonce: (t) => messages.push(t) }, "medium", "test");
		assert.equal(r.code, 1);
		assert.match(messages.join("\n"), /n'a pas laissé une story lisible qui cite un défaut ouvert/);
	});

	it("resumes a correction story an earlier run left pending before asking any session", async () => {
		const root = depotCorrectifs();
		const appels: string[] = [];
		const o = options(root, CHOISIT, appels);
		const premier = await corrigerDefauts({ ...o, deroulerStory: async () => 1 }, "medium", "test");
		assert.equal(premier.code, 1);
		const journal = join(tempDir("495-", cleanups), "sessions.log");
		const aucun = `import { appendFileSync } from "node:fs";
export default (invite) => {
  appendFileSync(${JSON.stringify(journal)}, "session\\n");
  return { status: "aucun", story_id: "", bug_id: "", message: "", resume: "x", a_decider: [] };
};`;
		const sessionsAuMoment: boolean[] = [];
		const r = await corrigerDefauts(
			{
				...o,
				claude: fauxClaude(aucun),
				deroulerStory: async (id) => {
					sessionsAuMoment.push(existsSync(journal));
					return atterrit(o.racine, appels)(id);
				},
			},
			"medium",
			"test",
		);
		assert.equal(r.code, 0);
		assert.deepEqual(sessionsAuMoment, [false], "the pending story is driven before any session is asked");
		assert.equal(existsSync(journal), true, "the session is asked afterwards, for the defects left");
		assert.match(readFileSync(join(root, "specs", "bugs", "registry-fixed.yaml"), "utf8"), /fixed_in: abcdef1/);
	});

	it("hands back after the ceiling of one phase", async () => {
		const root = depotCorrectifs();
		process.env.CYCLE_495_DEFAUTS_MAX = "0";
		try {
			const appels: string[] = [];
			const r = await corrigerDefauts(options(root, PAS_DE_SESSION, appels), "low", "test");
			assert.deepEqual(r, { code: 0, aDecider: [] });
			assert.deepEqual(appels, []);
		} finally {
			delete process.env.CYCLE_495_DEFAUTS_MAX;
		}
	});
});
