/**
 * The architecture map says what the style of each part asks: in a part in onion, each package has one
 * of the four rings, a port belonging to the ring that declares it; in a part in layers, each layer names
 * the layers that may call it. The intervention that proposes the map and the identification skill ask for
 * it, and a map that does not say it is not presented: the survey names the requirement a blind spot,
 * designating the part and what it misses.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { ArchitectureHint, ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
import {
	DOMAIN_MAP,
	DOMAIN_MODULES,
	DOMAIN_SOURCES,
	javaSource,
	mavenReactor,
	surveyedArchitecture,
} from "../helpers/architecture-survey.ts";

const at = (path: string, line: number, says: string): ArchitectureHint => ({ path, line, says });

const MIXED_SOURCES: Record<string, string> = Object.fromEntries([
	javaSource("orders", "io.demo.orders.model", "Order"),
	javaSource("orders", "io.demo.orders.store", "OrderStore"),
	javaSource("admin", "io.demo.admin.web", "AdminPage"),
	javaSource("admin", "io.demo.admin.service", "AdminService"),
	javaSource("admin", "io.demo.admin.data", "AdminDao"),
]);

/** `orders` in onion and `admin` in the layers `web`, `service` and `data`, each layer naming the layers that may call it. */
const MIXED_MAP: ArchitectureMap = {
	parts: [
		{
			name: "orders",
			perimeter: ["orders"],
			style: "onion",
			roles: [
				{
					package: "io.demo.orders.model",
					role: "domain model",
					hints: [at("orders/src/main/java/io/demo/orders/model/Order.java", 3, "the order")],
				},
				{
					package: "io.demo.orders.store",
					role: "adapter persistence",
					hints: [at("orders/src/main/java/io/demo/orders/store/OrderStore.java", 3, "stores orders")],
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
					role: "web",
					called_by: [],
					hints: [at("admin/src/main/java/io/demo/admin/web/AdminPage.java", 3, "a page")],
				},
				{
					package: "io.demo.admin.service",
					role: "service",
					called_by: ["web"],
					hints: [at("admin/src/main/java/io/demo/admin/service/AdminService.java", 3, "a service")],
				},
				{
					package: "io.demo.admin.data",
					role: "data",
					called_by: ["service"],
					hints: [at("admin/src/main/java/io/demo/admin/data/AdminDao.java", 3, "a DAO")],
				},
			],
			hints: [at("admin/pom.xml", 5, "the admin module")],
		},
	],
	relations: [],
};

/** `MIXED_MAP` with the role of the package `pkg` changed by `change`. */
function withRole(
	pkg: string,
	change: (
		role: ArchitectureMap["parts"][number]["roles"][number],
	) => ArchitectureMap["parts"][number]["roles"][number],
): ArchitectureMap {
	return {
		...MIXED_MAP,
		parts: MIXED_MAP.parts.map((p) => ({ ...p, roles: p.roles.map((r) => (r.package === pkg ? change(r) : r)) })),
	};
}

/** The survey of the mixed reactor when the model proposes `map`: what is asked, and what the survey says of ARC-01. */
async function surveyedWith(map: ArchitectureMap) {
	const project = mavenReactor({ orders: [], admin: [] }, MIXED_SOURCES);
	const { t, changeId, stopped_because } = await surveyedArchitecture(project, [map]);
	const asked = t.harness.pendingDecisions(changeId).filter((d) => d.interaction === "IH-04");
	const state = t.ledger.loadChange(changeId)!.state;
	const survey = await t.harness.artifacts.latest<Survey>(state, "survey");
	const architecture = survey?.content.requirements.find((r) => r.requirement_id === "ARC-01");
	return { asked, architecture, stopped_because };
}

describe("the roles of a part of the architecture map follow its style", () => {
	it("la consigne de l'intervention qui propose la carte nomme les quatre anneaux de l'oignon et demande, pour chaque couche, les couches qui peuvent l'appeler", async () => {
		const project = mavenReactor(DOMAIN_MODULES, DOMAIN_SOURCES);
		const { agent } = await surveyedArchitecture(project, [DOMAIN_MAP]);
		const [mandate] = agent.mapMandates;
		assert.ok(mandate, "an intervention proposes the map");
		const skill = readFileSync(mandate.skills[0]!, "utf8");
		for (const [where, text] of [
			["the instruction of the intervention", `${mandate.system_prompt}\n${mandate.prompt}`],
			["the identification skill", skill],
		] as const) {
			for (const ring of ['"domain model"', '"domain services"', '"application services"', '"adapter '])
				assert.ok(text.includes(ring), `${where} names the ring ${ring} of the onion`);
			assert.match(text, /port belongs to the ring that declares it/, `${where} places a port in its ring`);
			assert.match(
				text,
				/"called_by"`?(?: lists)? the layers of the part\s+that may call that layer/,
				`${where} asks, for each layer, the layers that may call it`,
			);
		}
	});

	it("une carte dont la partie en oignon orders donne au paquet io.demo.orders.model le rôle the heart of things n'est pas présentée et le survey désigne la partie et le rôle", async () => {
		const bad = withRole("io.demo.orders.model", (r) => ({ ...r, role: "the heart of things" }));
		const map = { ...bad, parts: bad.parts.filter((p) => p.name === "orders") };
		const { asked, architecture, stopped_because } = await surveyedWith(map);
		assert.deepEqual(
			asked.map((d) => d.facts.join(" | ")),
			[],
			`no decision is asked about a map whose roles do not follow the style (${stopped_because})`,
		);
		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.match(
			architecture.blind_spot ?? "",
			/part orders: package io\.demo\.orders\.model has the role "the heart of things", which is no ring of an onion/,
			"the reason designates the part and the role",
		);
		assert.deepEqual(architecture.measures, []);
	});

	it("une carte dont la partie en couches admin ne dit pas quelles couches peuvent appeler data n'est pas présentée et le survey désigne la couche", async () => {
		const map: ArchitectureMap = {
			...MIXED_MAP,
			parts: MIXED_MAP.parts.map((p) =>
				p.name === "admin" ? { ...p, roles: p.roles.map(({ called_by: _, ...r }) => r) } : p,
			),
		};
		const { asked, architecture, stopped_because } = await surveyedWith(map);
		assert.deepEqual(
			asked.map((d) => d.facts.join(" | ")),
			[],
			`no decision is asked about a map whose layers do not say who may call them (${stopped_because})`,
		);
		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.match(
			architecture.blind_spot ?? "",
			/part admin: layer data does not say which layers may call it/,
			"the reason designates the part and the layer",
		);
		assert.deepEqual(architecture.measures, []);
	});

	it("la décision sur une carte dont admin est en couches donne, pour chaque couche, les couches qui peuvent l'appeler", async () => {
		const { asked, architecture } = await surveyedWith(MIXED_MAP);
		const [decision] = asked;
		assert.ok(decision, `the map is presented; the survey says of ARC-01: ${architecture?.blind_spot ?? "no survey"}`);
		const fact = decision.facts.find((f) => f.startsWith("architecture part admin:"));
		assert.ok(fact, `a fact gives the part admin: ${decision.facts.join(" | ")}`);
		for (const said of [
			"io.demo.admin.web web, called by no layer",
			"io.demo.admin.service service, called by web",
			"io.demo.admin.data data, called by service",
		])
			assert.ok(fact.includes(said), `« ${said} » in ${fact}`);
	});
});
