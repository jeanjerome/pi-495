import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	lirePlan,
	marquerEpic,
	marquerStory,
	marquerStoryListee,
	prochaineEpic,
	prochaineStory,
} from "../../cycle/src/plan.ts";
import { tempDir, removedAfterEach } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

const PLAN = `contraintes:
  - "une contrainte"

epics:
  - id: e01
    title: "Premier"
    status: versé
    stories:
      - { id: e01s01, status: "versée", title: "Une story" }

  - id: e02
    title: "Deuxième"
    status: à faire
    prete: oui
    objet: >
      Un texte replié qui contient status: à faire et prete: oui sans que ce soit un champ.
    stories:
      - { id: e02s01, status: "versée", title: "Première \\"guillemets\\" story" }
      - { id: e02s02, status: "à faire", title: "Seconde story" }

  - id: e03
    title: "Troisième"
    status: à faire

  - id: e04
    title: "Quatrième"
    status: à faire
    prete: oui

communication: specs/communication
`;

function racine(): string {
	const root = tempDir("495-", cleanups);
	mkdirSync(join(root, "specs"), { recursive: true });
	writeFileSync(join(root, "specs", "plan.yaml"), PLAN);
	return root;
}

describe("the plan as the cycle reads it", () => {
	it("reads each epic with its status, whether the owner marked it ready, and the stories it lists", () => {
		const plan = lirePlan(racine());
		assert.deepEqual(
			plan.map((e) => [e.id, e.statut, e.prete, e.stories.map((s) => `${s.id}:${s.statut}`)]),
			[
				["e01", "versé", false, ["e01s01:versée"]],
				["e02", "à faire", true, ["e02s01:versée", "e02s02:à faire"]],
				["e03", "à faire", false, []],
				["e04", "à faire", true, []],
			],
		);
	});

	it("picks the first ready epic that is not landed, and its first story not landed", () => {
		const plan = lirePlan(racine());
		const epic = prochaineEpic(plan);
		assert.equal(epic?.id, "e02");
		assert.equal(prochaineStory(epic!)?.id, "e02s02");
		assert.equal(prochaineStory(plan[3]!), null);
		assert.equal(prochaineEpic(plan.filter((e) => e.id === "e03" || e.id === "e01")), null);
	});

	it("marks a story landed and an epic landed, and touches no other line", () => {
		const root = racine();
		marquerStory(root, "e02s02", "versée");
		marquerEpic(root, "e02", "versé");
		const apres = readFileSync(join(root, "specs", "plan.yaml"), "utf8");
		assert.equal(
			apres,
			PLAN.replace('{ id: e02s02, status: "à faire"', '{ id: e02s02, status: "versée"').replace(
				'title: "Deuxième"\n    status: à faire',
				'title: "Deuxième"\n    status: versé',
			),
		);
		assert.deepEqual(
			lirePlan(root).map((e) => [e.id, e.statut]),
			[
				["e01", "versé"],
				["e02", "versé"],
				["e03", "à faire"],
				["e04", "à faire"],
			],
		);
	});

	it("refuses to update a story or an epic the plan does not list", () => {
		const root = racine();
		assert.throws(() => marquerStory(root, "e09s01", "versée"), /line to update was not found/);
		assert.throws(() => marquerEpic(root, "e09", "versé"), /line to update was not found/);
	});

	it("marks a landed story only when the plan lists it as pending", () => {
		const root = racine();
		assert.equal(marquerStoryListee(root, "e02s02"), true);
		assert.equal(lirePlan(root)[1]!.stories[1]!.statut, "versée");
		assert.equal(marquerStoryListee(root, "e02s02"), false);
		assert.equal(marquerStoryListee(root, "e09s01"), false);
	});
});
