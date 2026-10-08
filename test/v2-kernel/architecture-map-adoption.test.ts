/**
 * The owner's answer to the proposed architecture map: adopted, the map is frozen in the protocol with the
 * date of the decision, and the requirement stays a blind spot because no control verifies the adopted map
 * yet; left aside, no map is frozen and the survey says the proposed map was not adopted. The project is
 * not modified either way.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { fixedSources } from "../../src/application/ids.ts";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
import {
	answerMap,
	DOMAIN_MAP,
	DOMAIN_MODULES,
	DOMAIN_SOURCES,
	mavenReactor,
	surveyedArchitecture,
} from "../helpers/architecture-survey.ts";
import type { TestHarness } from "../helpers/harness-fixture.ts";
import { treeDigest } from "../helpers/quality-survey.ts";

/**
 * The survey of the reactor of the story, once the owner answered the proposed map with `optionId`; the
 * survey goes on the day after the answer, so the date of the decision is not the date the map is frozen.
 */
async function answered(optionId: string) {
	const project = mavenReactor(DOMAIN_MODULES, DOMAIN_SOURCES);
	const before = treeDigest(project);
	const time = fixedSources();
	const { t, changeId } = await surveyedArchitecture(project, [DOMAIN_MAP], time.clock);
	answerMap(t, changeId, optionId);
	time.tick(86_400_000);
	const after = await t.harness.advance(changeId, { max_steps: 40 });
	assert.equal(after.stopped_because, "decision_required", after.steps.join(" | "));
	return { t, changeId, project, before, frozenOn: time.clock.now().slice(0, 10) };
}

async function frozenProtocol(t: TestHarness, changeId: string): Promise<Protocol> {
	const state = t.ledger.loadChange(changeId)!.state;
	assert.equal(state.gates.G2?.verdict, "PASS", state.gates.G2?.reasons.join("; ") ?? state.stop_detail ?? "");
	return (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
}

async function surveyedRequirement(t: TestHarness, changeId: string) {
	const state = t.ledger.loadChange(changeId)!.state;
	const survey = await t.harness.artifacts.latest<Survey>(state, "survey");
	const architecture = survey?.content.requirements.find((r) => r.requirement_id === "ARC-01");
	assert.ok(architecture, "the survey carries the architecture requirement");
	return architecture;
}

describe("the owner's answer to the proposed architecture map", () => {
	it("l'adoption gèle la carte dans le protocole avec la date de la décision, le survey nomme l'exigence comme angle mort parce qu'aucun contrôle ne vérifie la carte adoptée, et le digest du projet est inchangé", async () => {
		const { t, changeId, project, before, frozenOn } = await answered("adopt_map");
		const protocol = await frozenProtocol(t, changeId);
		const adoption = t.ledger.loadChange(changeId)!.state.human_decisions.find((d) => d.option_id === "adopt_map");
		assert.ok(adoption, "the adoption is recorded");
		const frozen = protocol.architecture_map;
		assert.ok(frozen, "the frozen protocol carries the adopted map");
		assert.equal(frozen.adopted_on, adoption.recorded_at.slice(0, 10), "with the date of the decision");
		assert.notEqual(frozen.adopted_on, frozenOn, "the date of the decision, not the day the map is frozen");
		assert.equal(frozen.decision_id, adoption.decision_id);
		assert.deepEqual(frozen.map, DOMAIN_MAP, "the map as it was proposed");
		assert.deepEqual(frozen.unassigned_packages, []);

		const architecture = await surveyedRequirement(t, changeId);
		assert.match(
			architecture.blind_spot ?? "",
			/no control verifies the adopted architecture map yet/,
			"the survey names the requirement a blind spot, because nothing verifies the adopted map yet",
		);
		assert.equal(treeDigest(project), before, "the project tree is as it was");
	});

	it("laisser l'exigence en angle mort ne gèle aucune carte et le survey dit que la carte proposée n'a pas été adoptée", async () => {
		const { t, changeId, project, before } = await answered("leave_blind_spot");
		const protocol = await frozenProtocol(t, changeId);
		assert.equal(protocol.architecture_map, undefined, "no map is frozen");
		const architecture = await surveyedRequirement(t, changeId);
		assert.match(architecture.blind_spot ?? "", /the proposed architecture map was not adopted/);
		assert.equal(treeDigest(project), before, "the project tree is as it was");
	});
});
