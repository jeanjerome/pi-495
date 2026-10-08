/**
 * The architecture map a model proposes is checked against the reference before the owner sees it: a
 * package it names has to be declared by a main source, and each hint has to point at a line of a file of
 * the reference. A map that holds is presented with the packages no part covers; one that does not is not
 * presented, and the survey names the requirement a blind spot with what is missing.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
import {
	DOMAIN_MAP,
	DOMAIN_MODULES,
	DOMAIN_SOURCES,
	javaSource,
	mavenReactor,
	surveyedArchitecture,
} from "../helpers/architecture-survey.ts";

/** `DOMAIN_MAP` with its part `domain` changed by `change`. */
function withDomain(
	change: (part: ArchitectureMap["parts"][number]) => ArchitectureMap["parts"][number],
): ArchitectureMap {
	return { ...DOMAIN_MAP, parts: DOMAIN_MAP.parts.map((p) => (p.name === "domain" ? change(p) : p)) };
}

/** The survey of the reactor of the story when the model proposes `map`: what is asked, and what the survey says of ARC-01. */
async function surveyedWith(map: ArchitectureMap, extra: Record<string, string> = {}) {
	const project = mavenReactor(DOMAIN_MODULES, { ...DOMAIN_SOURCES, ...extra });
	const { t, changeId } = await surveyedArchitecture(project, [map]);
	const asked = t.harness.pendingDecisions(changeId);
	const state = t.ledger.loadChange(changeId)!.state;
	const survey = await t.harness.artifacts.latest<Survey>(state, "survey");
	const architecture = survey?.content.requirements.find((r) => r.requirement_id === "ARC-01");
	return { asked, architecture };
}

describe("the architecture map is checked against the reference before it is presented", () => {
	it("une carte qui ne couvre pas io.demo.domain.legacy est présentée avec ce paquet nommé sans partie", async () => {
		const [path, source] = javaSource("domain", "io.demo.domain.legacy", "OldUser");
		const { asked } = await surveyedWith(DOMAIN_MAP, { [path]: source });
		const map = asked.find((d) => d.interaction === "IH-04");
		assert.ok(map, "the map that holds is presented");
		const unassigned = map.facts.find((f) => f.startsWith("architecture packages without a part:"));
		assert.ok(unassigned, `a fact names the packages no part covers: ${map.facts.join(" | ")}`);
		assert.match(unassigned, /io\.demo\.domain\.legacy/);
		assert.doesNotMatch(unassigned, /io\.demo\.domain\.user/, "a package a part covers is not named");
	});

	it("une carte qui donne un rôle à io.demo.domain.billing, absent des sources, n'est pas présentée et le survey nomme l'exigence comme angle mort en désignant ce paquet", async () => {
		const map = withDomain((part) => ({
			...part,
			roles: [
				...part.roles,
				{
					package: "io.demo.domain.billing",
					role: "domain services",
					hints: [{ path: "domain/pom.xml", line: 5, says: "a billing service" }],
				},
			],
		}));
		const { asked, architecture } = await surveyedWith(map);
		assert.deepEqual(
			asked.filter((d) => d.interaction === "IH-04").map((d) => d.facts.join(" | ")),
			[],
			"no decision is asked about a map that does not hold",
		);
		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.match(architecture.blind_spot ?? "", /io\.demo\.domain\.billing/, "the reason names the absent package");
		assert.deepEqual(architecture.measures, []);
	});

	it("une carte dont un indice cite une ligne au-delà de la fin de son fichier n'est pas présentée et le survey nomme l'indice introuvable", async () => {
		// One line past the end of a file of three, whose last line a hint of `DOMAIN_MAP` cites and which holds.
		const user = "domain/src/main/java/io/demo/domain/user/User.java";
		const map = withDomain((part) => ({
			...part,
			roles: part.roles.map((r) =>
				r.package === "io.demo.domain.user" ? { ...r, hints: [{ path: user, line: 4, says: "an entity" }] } : r,
			),
		}));
		const { asked, architecture } = await surveyedWith(map);
		assert.deepEqual(
			asked.filter((d) => d.interaction === "IH-04").map((d) => d.facts.join(" | ")),
			[],
			"no decision is asked about a map that does not hold",
		);
		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.match(
			architecture.blind_spot ?? "",
			new RegExp(`${user}:4 is past the end of its file, which has 3 lines`),
			"the reason names the hint not found",
		);
	});

	it("une carte dont l'indice d'une relation cite une ligne au-delà de la fin de son fichier n'est pas présentée et le survey nomme l'indice introuvable", async () => {
		const map: ArchitectureMap = {
			...DOMAIN_MAP,
			relations: DOMAIN_MAP.relations.map((r) => ({
				...r,
				hints: [{ path: "infrastructure/pom.xml", line: 99, says: "the module depends on domain" }],
			})),
		};
		const { asked, architecture } = await surveyedWith(map);
		assert.deepEqual(
			asked.filter((d) => d.interaction === "IH-04").map((d) => d.facts.join(" | ")),
			[],
			"no decision is asked about a map that does not hold",
		);
		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.match(
			architecture.blind_spot ?? "",
			/infrastructure\/pom\.xml:99 is past the end of its file/,
			"the reason names the hint of the relation not found",
		);
	});

	it("une carte dont un indice cite un fichier que la référence ne porte pas n'est pas présentée et le survey nomme l'indice introuvable", async () => {
		const absent = "domain/src/main/java/io/demo/domain/user/Account.java";
		const map = withDomain((part) => ({ ...part, hints: [{ path: absent, line: 1, says: "an account" }] }));
		const { asked, architecture } = await surveyedWith(map);
		assert.deepEqual(
			asked.filter((d) => d.interaction === "IH-04").map((d) => d.facts.join(" | ")),
			[],
			"no decision is asked about a map that does not hold",
		);
		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.match(
			architecture.blind_spot ?? "",
			new RegExp(`${absent}:1 names no file of the reference`),
			"the reason names the hint not found",
		);
	});
});
