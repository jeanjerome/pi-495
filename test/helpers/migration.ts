/**
 * The trajectory document of a migration as the owner writes it: it cites the accepted survey whose owner chose a
 * target, E1 adds the port of payment, E2, on E1, removes the rule app breaks by calling the infrastructure, each with
 * its transition, and an exception tolerates the source that belongs to no part, under one final milestone.
 */
import { strict as assert } from "node:assert";
import type { ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import {
	RECOMMENDATION,
	RECOMMENDATION_MAP,
	RECOMMENDATION_SOURCES,
	type RecommendedOptions,
	recommended,
} from "./architecture-recommendation.ts";
import { answerMap } from "./architecture-survey.ts";
import { increment } from "./trajectory.ts";

export const APP_TO_INFRA = "part app may not depend on part infra";
export const UNMAPPED_SOURCE = "every main source belongs to a part";
export const PART_CYCLE = "no cycle between the parts";

export const E1_TRANSITION = {
	contract: "OrderService garde ses méthodes publiques",
	coexistence: "le port de paiement existe à côté des appels directs de app vers infra",
	compatibility: "CardPayment reste appelable directement tant que E2 n'est pas intégrée",
	rollback: "retirer le port de paiement, que rien n'appelle encore",
};

export const E2_TRANSITION = {
	contract: "le port de paiement garde sa signature",
	coexistence: "app passe par le port, infra garde CardPayment derrière son adaptateur",
	compatibility: "aucun appelant extérieur à app ne voit le changement",
	rollback: "rétablir les deux appels directs de OrderService vers infra",
};

export const EXCEPTION = {
	rule_id: UNMAPPED_SOURCE,
	owner: "équipe paiement",
	due: "2026-12-31",
	reason: "la source hors carte disparaît avec le module historique",
};

/** The document of the migration from the survey `changeId`, which `over` amends. */
export function migration(
	changeId: string,
	over: {
		e1?: Record<string, unknown>;
		e2?: Record<string, unknown>;
		migration?: Record<string, unknown>;
	} = {},
) {
	return {
		title: "Put the payment behind a port",
		migration: { change_id: changeId, exceptions: [EXCEPTION], ...over.migration },
		increments: [
			{ ...increment("E1", "Add the port of payment"), transition: E1_TRANSITION, ...over.e1 },
			{
				...increment("E2", "Move app behind the port", ["E1"]),
				removes: [APP_TO_INFRA],
				transition: E2_TRANSITION,
				...over.e2,
			},
		],
		milestones: [
			{ milestone_id: "M1", title: "Migration", increment_ids: ["E1", "E2"], global_requirement_ids: [], final: true },
		],
		global_requirements: [],
	};
}

/** `transition` without the texts named by `without`. */
export function lacking<T extends Record<string, string>>(transition: T, ...without: (keyof T)[]): Partial<T> {
	return Object.fromEntries(Object.entries(transition).filter(([k]) => !without.includes(k))) as Partial<T>;
}

/** The map of the reactor whose infrastructure part is named infra. */
export const MIGRATION_MAP: ArchitectureMap = {
	parts: RECOMMENDATION_MAP.parts.map((p) => (p.name === "infrastructure" ? { ...p, name: "infra" } : p)),
	relations: RECOMMENDATION_MAP.relations.map((r) => (r.from === "infrastructure" ? { ...r, from: "infra" } : r)),
};

/** A source of app whose package no part covers: the one violation of the rule every main source belongs to a part. */
export const MIGRATION_SOURCES: Record<string, string> = {
	...RECOMMENDATION_SOURCES,
	"app/src/main/java/io/demo/app/legacy/LegacyClock.java":
		"package io.demo.app.legacy;\n\npublic class LegacyClock {}\n",
};

/**
 * The survey of the reactor, the model proposing `recommendation`, whose owner answered it with `choice` when it was
 * presented, then accepted the survey.
 */
export async function acceptedSurvey(
	choice = "A2",
	{ recommendation = RECOMMENDATION, ...options }: RecommendedOptions & { recommendation?: unknown } = {},
) {
	const surveyed = await recommended([recommendation], MIGRATION_SOURCES, "en", { map: MIGRATION_MAP, ...options });
	const { t, changeId } = surveyed;
	if (t.harness.pendingDecisions(changeId)[0]?.interaction === "IH-05") {
		answerMap(t, changeId, choice);
		await t.harness.advance(changeId, { max_steps: 40 });
	}
	assert.equal(t.harness.pendingDecisions(changeId)[0]?.interaction, "IH-10", "the survey goes to its acceptance");
	answerMap(t, changeId, "accept");
	const state = t.ledger.loadChange(changeId)!.state;
	assert.equal(state.outcome, "accepted", `the survey is accepted: ${state.phase}`);
	return surveyed;
}
