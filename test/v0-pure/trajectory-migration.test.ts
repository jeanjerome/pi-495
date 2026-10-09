/**
 * V0 — the document of a migration: each step carries its transition contract, its coexistence boundary, its
 * compatibility strategy and its rollback, may name the rules of the map it removes, and the document may tolerate
 * a rule by an exception with its owner and its due date. A step that lacks one of the four texts is refused.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readTrajectory } from "../../src/application/trajectory.ts";
import { APP_TO_INFRA, E1_TRANSITION, E2_TRANSITION, EXCEPTION, lacking, migration } from "../helpers/migration.ts";

describe("the document of a migration carries the transition of each step", () => {
	it("un document de migration dont chaque étape porte son contrat de transition, sa frontière de coexistence, sa stratégie de compatibilité et son retour arrière est lu avec ces quatre textes pour E1 et E2, la règle que E2 supprime et l'exception avec son propriétaire et son échéance", () => {
		const read = readTrajectory(migration("chg_survey"));
		assert.deepEqual(
			read.increments.map((i) => [i.increment_id, i.transition, i.removes]),
			[
				["E1", E1_TRANSITION, []],
				["E2", E2_TRANSITION, [APP_TO_INFRA]],
			],
		);
		assert.deepEqual(read.migration, { change_id: "chg_survey", scope_decisions: [], exceptions: [EXCEPTION] });
		assert.equal(read.baseline, null, "a migration cites no survey of the quality referential");
	});

	it("un document de migration dont E2 n'a pas de retour arrière, ou dont E1 n'a pas de contrat de transition, est refusé avec un message qui nomme l'étape et ce qui lui manque", () => {
		assert.throws(
			() => readTrajectory(migration("chg_survey", { e2: { transition: lacking(E2_TRANSITION, "rollback") } })),
			(error: Error) => {
				assert.match(error.message, /increment E2 has no rollback/);
				assert.ok(!error.message.includes("E1"), `only E2 lacks a text: ${error.message}`);
				return true;
			},
		);
		assert.throws(
			() => readTrajectory(migration("chg_survey", { e1: { transition: lacking(E1_TRANSITION, "contract") } })),
			/increment E1 has no transition contract/,
		);
		assert.throws(
			() =>
				readTrajectory(
					migration("chg_survey", {
						e1: { transition: lacking(E1_TRANSITION, "contract", "coexistence", "compatibility") },
					}),
				),
			/increment E1 has no transition contract, no coexistence boundary, no compatibility strategy/,
		);
		const document = migration("chg_survey");
		const { transition: _transition, ...bare } = document.increments[0]!;
		assert.throws(
			() => readTrajectory({ ...document, increments: [bare, document.increments[1]] }),
			/increment E1 has no transition contract, no coexistence boundary, no compatibility strategy, no rollback/,
		);
	});
});
