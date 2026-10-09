/**
 * V2 — the request of the change of each step of a migration carries the target the owner chose, the four texts of
 * the transition of the step, then each violated rule it removes with its count at the survey: the owner's words,
 * which the model reads, and the measured objective of the step (ARC-03). Maven and ArchUnit are fakes, the readers
 * are the real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ADJUST } from "../helpers/architecture-recommendation.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { specReport } from "../helpers/harness-fixture.ts";
import {
	acceptedSurvey,
	APP_TO_INFRA,
	E1_TRANSITION,
	E2_TRANSITION,
	migration,
	UNMAPPED_SOURCE,
} from "../helpers/migration.ts";
import { integrated } from "../helpers/program-fixture.ts";

const TARGET = `Target: A2 (adjust) — ${ADJUST.description}`;

/** The lines of the transition of a step, in the order the request gives them. */
const transitionLines = (transition: typeof E1_TRANSITION) => [
	`Transition contract: ${transition.contract}`,
	`Coexistence boundary: ${transition.coexistence}`,
	`Compatibility strategy: ${transition.compatibility}`,
	`Rollback: ${transition.rollback}`,
];

/** Each of `expected` is a line of `request`, in this order. */
function inOrder(request: readonly string[], expected: readonly string[]): void {
	let last = -1;
	for (const line of expected) {
		const at = request.indexOf(line);
		assert.ok(at >= 0, `the request carries « ${line} »:\n${request.join("\n")}`);
		assert.ok(at > last, `« ${line} » comes after the lines before it:\n${request.join("\n")}`);
		last = at;
	}
}

describe("the request of each step of a migration carries the target and its transition", () => {
	it("la demande du changement de E1 porte A2 comme cible avec sa nature et sa description, puis le contrat de transition, la frontière de coexistence, la stratégie de compatibilité et le retour arrière de E1", async () => {
		const { t, changeId, project } = await acceptedSurvey();
		const { change } = await t.harness.adopt({
			project_path: project,
			trajectory: migration(changeId),
			actor: HUMAN,
			language: "en",
		});

		const request = (await t.harness.artifacts.read<string>(change.request)).split("\n");
		inOrder(request, ["Add the port of payment", TARGET, ...transitionLines(E1_TRANSITION)]);
		assert.ok(!request.some((l) => l.includes(APP_TO_INFRA)), "E1 removes no violated rule");
		assert.ok(!request.some((l) => l.includes(UNMAPPED_SOURCE)), "a tolerated rule is not E1's to remove");
	});

	it("E1 intégré, la demande du changement de E2 porte la même cible, les quatre textes de E2 et l'écart part app may not depend on part infra avec ses 2 violations à l'état des lieux", async () => {
		const { t, changeId, project } = await acceptedSurvey("A2", { integration: true });
		const { program, change } = await t.harness.adopt({
			project_path: project,
			trajectory: migration(changeId),
			actor: HUMAN,
			language: "en",
		});
		// The steps are candidates: the model specifies a behaviour, not the architecture question of the survey.
		t.agent.scripts.set("specify", { steps: [{ kind: "complete", output: specReport() }] });
		await integrated(t, change.change_id, "E1");

		const e2 = await t.harness.startNext({ program_id: program.program_id, actor: HUMAN, language: "en" });
		const request = (await t.harness.artifacts.read<string>(e2.change.request)).split("\n");
		inOrder(request, [
			"Move app behind the port",
			TARGET,
			...transitionLines(E2_TRANSITION),
			`- ${APP_TO_INFRA}: 2 violations at the survey`,
		]);
		assert.ok(!request.some((l) => l.includes(UNMAPPED_SOURCE)), "a tolerated rule is not E2's to remove");
	});
});
