/**
 * The form of the argument of a recommendation, checked against the constraints of the survey: each alternative
 * named once and apart from the other options of the choice, each with a benefit, a cost, a risk and a constraint.
 * What is missing is named; the substance is the owner's to judge.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ArchitectureRecommendation } from "../../src/contracts/v1/protocol.ts";
import { checkRecommendation } from "../../src/domain/architecture-recommendation.ts";

type Alternative = ArchitectureRecommendation["alternatives"][number];

const CONSTRAINTS: ReadonlyMap<string, string> = new Map([["R1", "the domain depends on nothing"]]);

const alternative = (alternative_id: string, nature: Alternative["nature"]): Alternative => ({
	alternative_id,
	nature,
	description: `${nature} the architecture`,
	benefits: ["the map holds"],
	cost: { complexity: "a port more", migration: "two calls move" },
	risks: ["a port nothing else implements"],
	constraints: ["R1"],
});

/** A recommendation of `alternatives` whose conclusion recommends the first and cites R1. */
const of = (...alternatives: Alternative[]): ArchitectureRecommendation => ({
	alternatives,
	recommended: {
		alternative_id: alternatives[0]?.alternative_id ?? "A1",
		conclusion: "R1 asks for it",
		constraints: ["R1"],
	},
});

const missing = (recommendation: ArchitectureRecommendation): string[] => {
	const check = checkRecommendation(recommendation, CONSTRAINTS);
	return check.holds ? [] : check.missing;
};

describe("the form of the argument of a recommendation", () => {
	it("two alternatives each with a benefit, a cost, a risk and a known constraint hold", () => {
		assert.deepEqual(checkRecommendation(of(alternative("A1", "keep"), alternative("A2", "adjust")), CONSTRAINTS), {
			holds: true,
		});
	});

	it("an alternative whose benefits, cost or constraints are empty or blank is named with what it misses", () => {
		const bare = {
			...alternative("A2", "adjust"),
			benefits: [" "],
			cost: { complexity: "", migration: " " },
			constraints: [],
		};
		assert.deepEqual(missing(of(alternative("A1", "keep"), bare)), [
			"alternative A2 carries no benefit",
			"alternative A2 carries no cost",
			"alternative A2 cites no constraint",
		]);
	});

	it("an alternative with a cost in migration alone carries a cost", () => {
		const migrating = { ...alternative("A2", "adjust"), cost: { complexity: "", migration: "two calls move" } };
		assert.deepEqual(missing(of(alternative("A1", "keep"), migrating)), []);
	});

	it("no alternative at all is named as zero alternatives, with the recommended one none of them", () => {
		assert.deepEqual(missing(of()), [
			"the recommendation carries 0 alternatives, where at least two are needed",
			"the recommended alternative A1 is none of the alternatives",
		]);
	});

	it("two alternatives under one id, or an alternative named after another option of the choice, are named once each", () => {
		assert.deepEqual(
			missing(
				of(
					alternative("A1", "keep"),
					alternative("A1", "adjust"),
					alternative("A1", "transform"),
					alternative("suspend", "adjust"),
				),
			),
			[
				"the alternative id A1 names another alternative or another option of the choice",
				"the alternative id suspend names another alternative or another option of the choice",
			],
		);
		assert.deepEqual(missing(of(alternative("A1", "keep"), alternative("ask_analysis", "adjust"))), [
			"the alternative id ask_analysis names another alternative or another option of the choice",
		]);
	});
});
