/**
 * The owner asks for another architecture map with a remark: a new read-only intervention receives the
 * previous map and the remark, and a new decision presents the map it proposes with the same three ways out.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import {
	answerMap,
	DOMAIN_MAP,
	DOMAIN_MODULES,
	DOMAIN_SOURCES,
	mavenReactor,
	surveyedArchitecture,
} from "../helpers/architecture-survey.ts";

const REMARK = "admin est en couches, pas en oignon";

/** The second proposal: the part `infrastructure` in layers. */
const SECOND_MAP: ArchitectureMap = {
	...DOMAIN_MAP,
	parts: DOMAIN_MAP.parts.map((p) => (p.name === "infrastructure" ? { ...p, style: "layered" } : p)),
};

describe("the owner asks for another architecture map with a remark", () => {
	it("demander une nouvelle proposition avec la remarque admin est en couches, pas en oignon ouvre une seconde intervention dont le contexte porte la remarque, et une nouvelle décision présente sa carte avec les trois issues", async () => {
		const project = mavenReactor(DOMAIN_MODULES, DOMAIN_SOURCES);
		const { t, agent, changeId } = await surveyedArchitecture(project, [DOMAIN_MAP, SECOND_MAP]);
		const [first] = t.harness.pendingDecisions(changeId);
		assert.ok(first, "the first map is presented");
		answerMap(t, changeId, "propose_map_again", REMARK);
		const after = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(
			agent.mapMandates.length,
			2,
			`a second intervention proposes a map: ${after.stopped_because}, ${after.steps.join(" | ")}`,
		);
		const second = agent.mapMandates[1]!;
		assert.deepEqual(second.tools, ["read", "ls", "find", "grep"], "it is read-only");
		assert.ok(second.prompt.includes(REMARK), `its context carries the remark: ${second.prompt}`);
		assert.ok(
			second.prompt.includes('"style": "onion"') && second.prompt.includes("io.demo.infra"),
			"its context carries the previous map",
		);

		const pending = t.harness.pendingDecisions(changeId);
		assert.equal(pending.length, 1, pending.map((d) => d.interaction).join(", "));
		const asked = pending[0]!;
		assert.notEqual(asked.decision_id, first.decision_id, "a new decision");
		assert.deepEqual(
			asked.options.map((o) => o.id),
			["adopt_map", "propose_map_again", "leave_blind_spot"],
		);
		assert.ok(
			asked.facts.some((f) => f.startsWith("architecture part infrastructure:") && f.includes("style layered")),
			`it presents the new map: ${asked.facts.join(" | ")}`,
		);
	});
});
