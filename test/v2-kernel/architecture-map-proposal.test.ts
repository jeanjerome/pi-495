/**
 * A survey of the architecture of a Maven reactor: a read-only intervention proposes a map of the
 * architecture, and the owner is asked whether to adopt it, with one fact per part giving its perimeter,
 * its style, the role of each of its packages and the places in the reference that support them, and one
 * fact per relation the map permits between parts.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ArchitectureHint, ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import { buildDecisionRequest } from "../../src/application/decisions.ts";
import type { Survey } from "../../src/domain/survey.ts";
import {
	DOMAIN_MAP,
	DOMAIN_MODULES,
	DOMAIN_SOURCES,
	javaSource,
	mavenReactor,
	surveyedArchitecture,
} from "../helpers/architecture-survey.ts";
import type { TestHarness } from "../helpers/harness-fixture.ts";

const OPTIONS = ["adopt_map", "propose_map_again", "leave_blind_spot"];

/** What the survey said of the architecture requirement, when the change got that far: the red of a survey that asks nothing. */
async function surveyedRequirement(t: TestHarness, changeId: string): Promise<string> {
	const state = t.ledger.loadChange(changeId)!.state;
	const survey = await t.harness.artifacts.latest<Survey>(state, "survey");
	return survey?.content.requirements.find((r) => r.requirement_id === "ARC-01")?.blind_spot ?? "no survey";
}

const placed = (hints: readonly ArchitectureHint[]) => hints.map((h) => `${h.path}:${h.line}`);

/** The fact the decision gives of the part `name` of `map`. */
function partFact(facts: readonly string[], map: ArchitectureMap, name: string): string {
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
	return fact;
}

/** The fact the decision gives of the relation from `from` to `to` of `map`. */
function relationFact(facts: readonly string[], map: ArchitectureMap, from: string, to: string): string {
	const relation = map.relations.find((r) => r.from === from && r.to === to)!;
	const fact = facts.find((f) => f.startsWith(`architecture relation: ${from} may depend on ${to}`));
	assert.ok(fact, `a fact permits ${from} to depend on ${to}: ${facts.join(" | ")}`);
	for (const said of placed(relation.hints)) assert.ok(fact.includes(said), `${from} -> ${to}: ${said} in ${fact}`);
	return fact;
}

const MIXED_SOURCES: Record<string, string> = Object.fromEntries([
	javaSource("orders", "io.demo.orders.domain", "Order"),
	javaSource("orders", "io.demo.orders.adapter", "OrderStore"),
	javaSource("admin", "io.demo.admin.web", "AdminPage"),
	javaSource("admin", "io.demo.admin.persistence", "AdminDao"),
	javaSource("shared", "io.demo.shared", "Money"),
]);

const at = (path: string, line: number, says: string): ArchitectureHint => ({ path, line, says });

/** `orders` in onion, `admin` in layers and `shared` simple, the first two allowed to depend on the third alone. */
const MIXED_MAP: ArchitectureMap = {
	parts: [
		{
			name: "orders",
			perimeter: ["orders"],
			style: "onion",
			roles: [
				{
					package: "io.demo.orders.domain",
					role: "domain model",
					hints: [at("orders/src/main/java/io/demo/orders/domain/Order.java", 3, "the order")],
				},
				{
					package: "io.demo.orders.adapter",
					role: "adapters",
					hints: [at("orders/src/main/java/io/demo/orders/adapter/OrderStore.java", 3, "stores orders")],
				},
			],
			hints: [at("orders/pom.xml", 5, "the orders module")],
		},
		{
			name: "admin",
			perimeter: ["admin"],
			style: "layered",
			roles: [
				{
					package: "io.demo.admin.web",
					role: "presentation layer",
					hints: [at("admin/src/main/java/io/demo/admin/web/AdminPage.java", 3, "a page")],
				},
				{
					package: "io.demo.admin.persistence",
					role: "persistence layer",
					hints: [at("admin/src/main/java/io/demo/admin/persistence/AdminDao.java", 3, "a DAO")],
				},
			],
			hints: [at("admin/pom.xml", 5, "the admin module")],
		},
		{
			name: "shared",
			perimeter: ["shared"],
			style: "simple",
			roles: [
				{
					package: "io.demo.shared",
					role: "shared kernel",
					hints: [at("shared/src/main/java/io/demo/shared/Money.java", 3, "a value")],
				},
			],
			hints: [at("shared/pom.xml", 5, "the shared module")],
		},
	],
	relations: [
		{ from: "orders", to: "shared", hints: [at("orders/pom.xml", 6, "orders depends on shared")] },
		{ from: "admin", to: "shared", hints: [at("admin/pom.xml", 6, "admin depends on shared")] },
	],
};

describe("a survey of the architecture of a Maven reactor proposes a map to the owner", () => {
	it("l'état des lieux de l'architecture d'un réacteur Maven demande au propriétaire d'adopter la carte proposée, avec trois issues et un fait par partie qui donne son périmètre, son style, ses rôles et ses indices à leur fichier et à leur ligne", async () => {
		const project = mavenReactor(DOMAIN_MODULES, DOMAIN_SOURCES);
		const { t, agent, changeId, stopped_because, steps } = await surveyedArchitecture(project, [DOMAIN_MAP]);
		const pending = t.harness.pendingDecisions(changeId);
		const asked = pending.find((d) => d.interaction === "IH-04");
		assert.ok(
			asked,
			`the owner is asked to adopt the proposed map; asked instead: ${pending.map((d) => d.interaction).join(", ") || "nothing"} (${stopped_because}); the survey says of ARC-01: ${await surveyedRequirement(t, changeId)}; ${steps.join(" | ")}`,
		);
		assert.equal(pending.length, 1, "nothing else is asked before the map is settled");
		assert.deepEqual(
			asked.options.map((o) => o.id),
			OPTIONS,
			"three ways out: adopt it, ask for another proposal with a remark, or leave the requirement a blind spot",
		);
		assert.match(asked.question, /carte d'architecture/);
		assert.equal(asked.allow_free_text, true, "the remark is written beside the answer");

		assert.equal(agent.mapMandates.length, 1, "one intervention proposes the map");
		const [mandate] = agent.mapMandates;
		assert.deepEqual(
			mandate!.tools,
			["read", "ls", "find", "grep"],
			"the intervention has the read-only tools of the specification",
		);

		partFact(asked.facts, DOMAIN_MAP, "domain");
		partFact(asked.facts, DOMAIN_MAP, "infrastructure");
		relationFact(asked.facts, DOMAIN_MAP, "infrastructure", "domain");
	});

	it("la décision sur une carte de trois parties aux styles oignon, couches et simple donne chaque partie avec son style et les deux relations permises vers shared", async () => {
		const project = mavenReactor({ orders: ["shared"], admin: ["shared"], shared: [] }, MIXED_SOURCES);
		const { t, changeId, stopped_because } = await surveyedArchitecture(project, [MIXED_MAP]);
		const asked = t.harness.pendingDecisions(changeId).find((d) => d.interaction === "IH-04");
		assert.ok(
			asked,
			`the owner is asked to adopt the proposed map (${stopped_because}); the survey says of ARC-01: ${await surveyedRequirement(t, changeId)}`,
		);
		assert.match(partFact(asked.facts, MIXED_MAP, "orders"), /style onion/);
		assert.match(partFact(asked.facts, MIXED_MAP, "admin"), /style layered/);
		assert.match(partFact(asked.facts, MIXED_MAP, "shared"), /style simple/);
		relationFact(asked.facts, MIXED_MAP, "orders", "shared");
		relationFact(asked.facts, MIXED_MAP, "admin", "shared");
		assert.equal(
			asked.facts.filter((f) => f.startsWith("architecture relation:")).length,
			2,
			"orders and admin may not depend on each other",
		);
	});

	it("la décision qui propose la carte offre les trois mêmes issues en anglais et en français", () => {
		for (const [language, question] of [
			["en", /architecture map/],
			["fr", /carte d'architecture/],
		] as const) {
			const asked = buildDecisionRequest({
				decision_id: "dec_1",
				change_id: "chg_1",
				interaction: "IH-04",
				subject: { kind: "artifact", id: "art_1", revision: 1, digest: "sha256:00" },
				language,
				facts: [],
				recommendation: null,
				arg: "ARC-01",
				architecture_map: true,
				requested_at: "2026-10-08T12:00:00.000Z",
			});
			assert.match(asked.question, question, language);
			assert.deepEqual(
				asked.options.map((o) => o.id),
				OPTIONS,
				`${language}: the options the answer to the map is read by`,
			);
		}
	});
});
