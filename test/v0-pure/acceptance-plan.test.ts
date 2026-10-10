import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Runner, KERNEL, protocol, ref, tick } from "../helpers/change-fixture.ts";
import type { AcceptanceRecipe, ControlDefinition, Protocol } from "../../src/contracts/v1/protocol.ts";

const RECIPE: AcceptanceRecipe = {
	journey: "greet a name through the command line of the built package",
	preconditions: ["the package is built"],
	entry: "node bin/greet.js Ada",
	observations: [{ observation_id: "O1", requirement_id: "R1", expected: "the output reads HELLO ADA" }],
	negative_control: {
		requirement_id: "R1",
		deprived_of: "a private copy where shout returns its argument unchanged",
		expected: "the output reads Hello Ada and the observation O1 fails",
	},
	negative_not_applicable: null,
	simulations: [],
	not_exercised: ["the interactive prompt"],
	external_data: [],
};

function recipeControl(recipe: AcceptanceRecipe): ControlDefinition {
	return {
		control_id: "recipe",
		version: "1",
		title: "acceptance run",
		command: ["node", "recipe.js", "{candidate}"],
		cwd: ".",
		env_allowlist: ["PATH"],
		env: {},
		timeout_ms: 60000,
		parser: "acceptance-recipe",
		report_path: "recipe-report.json",
		structure_rules: [],
		provides: [],
		requires: [],
		scope_argument: null,
		network: "denied",
		writable_paths: ["recipe-report.json"],
		requirement_refs: [{ requirement_id: "R1", revision: 1 }],
		protected: true,
		protected_paths: [],
		acceptance_recipe: recipe,
	};
}

function planned(
	recipe: AcceptanceRecipe,
	missions: Record<string, string> = { promises: "promise to code to assertion", security: "trust boundaries" },
): Protocol {
	const base = protocol({ required_reviews: ["promises", "security"] });
	return {
		...base,
		controls: [...base.controls, recipeControl(recipe)],
		acceptance: {
			review_missions: Object.entries(missions).map(([role, mission]) => ({ role, mission })),
			recipe_control_id: "recipe",
		},
	};
}

function g2(p: Protocol) {
	const r = new Runner({
		required_reviews: ["promises", "security"],
		review_missions: { promises: "promise to code to assertion", security: "trust boundaries" },
		acceptance_recipe: {
			...RECIPE,
			command: ["node", "recipe.js", "{candidate}"],
			report_path: "recipe-report.json",
			timeout_ms: 60000,
		},
	})
		.create()
		.g0()
		.g1();
	r.run({ type: "gate.evaluate", gate: "G2", at: tick(), actor: KERNEL, protocol_ref: ref("p", p), protocol: p });
	return r.s.gates.G2!;
}

describe("the review and the acceptance run are declared before the protocol is frozen", () => {
	it("une recette obligatoire sans observation ni témoin négatif applicable est incomplète", () => {
		const incomplete = g2(planned({ ...RECIPE, observations: [], negative_control: null }));
		assert.equal(incomplete.verdict, "FAIL", "a required acceptance run with nothing to observe is not frozen");
		assert.match(incomplete.reasons.join(" | "), /acceptance recipe recipe names no observation/);
		assert.match(incomplete.reasons.join(" | "), /acceptance recipe recipe has no negative control/);

		const justified = g2(
			planned({ ...RECIPE, negative_control: null, negative_not_applicable: "the journey only reads a file" }),
		);
		assert.equal(justified.verdict, "PASS", "a negative control stated not applicable, with its reason, is kept");

		const unscheduled = g2({
			...planned(RECIPE),
			acceptance: { review_missions: planned(RECIPE).acceptance!.review_missions, recipe_control_id: null },
		});
		assert.equal(unscheduled.verdict, "FAIL");
		assert.match(
			unscheduled.reasons.join(" | "),
			/policy requires an acceptance recipe which the protocol does not schedule/,
		);

		const sameMission = g2(planned(RECIPE, { promises: "read the diff", security: "read the diff" }));
		assert.equal(sameMission.verdict, "FAIL", "two required reviews are not given the same mission");
		assert.match(sameMission.reasons.join(" | "), /reviews promises and security share the mission/);

		const withoutMission = g2(planned(RECIPE, { promises: "promise to code to assertion" }));
		assert.match(withoutMission.reasons.join(" | "), /required review security has no mission/);

		assert.equal(g2(planned(RECIPE)).verdict, "PASS", "a complete plan is frozen");
	});
});
