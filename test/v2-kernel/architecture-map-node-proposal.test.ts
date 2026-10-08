/**
 * A survey of the architecture of an npm package: a read-only intervention proposes a map of the folders of
 * its sources, and the owner is asked whether to adopt it, with one fact per part giving its folders, its
 * style, the role of each of them and the places in the reference that support them, and the folders of the
 * sources no part covers.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ArchitectureHint, ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
import type { TestHarness } from "../helpers/harness-fixture.ts";
import {
	NODE_DOMAIN_MAP,
	NODE_DOMAIN_SOURCES,
	nodePackage,
	nodeSurveyedArchitecture,
} from "../helpers/node-architecture-survey.ts";

const OPTIONS = ["adopt_map", "propose_map_again", "leave_blind_spot"];

/** What the survey said of the architecture requirement, when the change got that far. */
async function surveyedRequirement(t: TestHarness, changeId: string): Promise<string> {
	const state = t.ledger.loadChange(changeId)!.state;
	const survey = await t.harness.artifacts.latest<Survey>(state, "survey");
	return survey?.content.requirements.find((r) => r.requirement_id === "ARC-01")?.blind_spot ?? "no survey";
}

const placed = (hints: readonly ArchitectureHint[]) => hints.map((h) => `${h.path}:${h.line}`);

/** The fact the decision gives of the part `name` of `map`, with its folders, its style, each role and each hint. */
function partFact(facts: readonly string[], map: ArchitectureMap, name: string): void {
	const part = map.parts.find((p) => p.name === name)!;
	const fact = facts.find((f) => f.startsWith(`architecture part ${name}:`));
	assert.ok(fact, `a fact gives the part ${name}: ${facts.join(" | ")}`);
	for (const said of [
		`perimeter ${part.perimeter.join(", ")}`,
		`style ${part.style}`,
		...placed(part.hints),
		...part.roles.flatMap((r) => [`${r.package} ${r.role}`, ...placed(r.hints)]),
	])
		assert.ok(fact.includes(said), `${name}: ${said} in ${fact}`);
}

/** The decision about the map the survey of the package of the story asks, with why none is asked when it is not. */
async function askedMap() {
	const { t, agent, changeId, stopped_because } = await nodeSurveyedArchitecture(nodePackage(NODE_DOMAIN_SOURCES), [
		NODE_DOMAIN_MAP,
	]);
	const pending = t.harness.pendingDecisions(changeId);
	const asked = pending.find((d) => d.interaction === "IH-04");
	assert.ok(
		asked,
		`the owner is asked to adopt the proposed map; asked instead: ${pending.map((d) => d.interaction).join(", ") || "nothing"} (${stopped_because}); the survey says of ARC-01: ${await surveyedRequirement(t, changeId)}`,
	);
	return { asked, pending, agent };
}

describe("a survey of the architecture of an npm package proposes a map of its source folders to the owner", () => {
	it("l'état des lieux de l'architecture d'un paquet npm demande au propriétaire d'adopter la carte proposée, avec trois issues et un fait par partie qui donne ses dossiers, son style, le rôle de chacun et ses indices à leur fichier et à leur ligne", async () => {
		const { asked, pending, agent } = await askedMap();
		assert.equal(pending.length, 1, "nothing else is asked before the map is settled");
		assert.deepEqual(
			asked.options.map((o) => o.id),
			OPTIONS,
			"three ways out: adopt it, ask for another proposal with a remark, or leave the requirement a blind spot",
		);
		assert.equal(agent.mapMandates.length, 1, "one intervention proposes the map");
		assert.deepEqual(agent.mapMandates[0]!.tools, ["read", "ls", "find", "grep"], "the intervention reads only");
		partFact(asked.facts, NODE_DOMAIN_MAP, "domain");
		partFact(asked.facts, NODE_DOMAIN_MAP, "adapters");
	});

	it("le dossier src/legacy qu'aucune partie ne couvre est nommé sans partie, et ni test ni node_modules ne le sont", async () => {
		const { asked } = await askedMap();
		const unassigned = asked.facts.find((f) => f.includes("without a part"));
		assert.ok(unassigned, `a fact names the folders without a part: ${asked.facts.join(" | ")}`);
		assert.deepEqual(unassigned.slice(unassigned.indexOf(": ") + 2).split(", "), ["src/legacy"], unassigned);
		for (const fact of asked.facts) {
			assert.doesNotMatch(fact, /(^|[\s,:])test(\/|,|$)/, `no fact names the tests: ${fact}`);
			assert.doesNotMatch(fact, /node_modules/, `no fact names the installed packages: ${fact}`);
		}
	});
});
