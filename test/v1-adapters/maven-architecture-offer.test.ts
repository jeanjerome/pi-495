/**
 * What the Maven technology says when it cannot verify an adopted architecture map: a host POM that does not
 * take the declaration of ArchUnit without ambiguity is named, and a copy that declares ArchUnit for a map
 * whose packages each sit in a module of their own gets no architecture control, with why.
 */
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import {
	DOMAIN_MAP,
	DOMAIN_MODULES,
	DOMAIN_SOURCES,
	javaSource,
	mavenReactor,
} from "../helpers/architecture-survey.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const REFS = [{ requirement_id: "ARC-01", revision: 1 }];

/** Two parts, `core` and `app`, each the one package of its module; `app` may depend on `core`. */
const SPLIT_MAP: ArchitectureMap = {
	parts: [
		{
			name: "core",
			perimeter: ["core"],
			style: "simple",
			roles: [{ package: "io.demo.core", role: "kernel", hints: [] }],
			hints: [],
		},
		{
			name: "app",
			perimeter: ["app"],
			style: "simple",
			roles: [{ package: "io.demo.app", role: "entry", hints: [] }],
			hints: [],
		},
	],
	relations: [{ from: "app", to: "core", hints: [] }],
};

describe("the Maven technology says why an adopted map is not verified", () => {
	it("a host POM with two profiles sections is named as unable to receive the declaration of ArchUnit without ambiguity", () => {
		const project = mavenReactor(DOMAIN_MODULES, DOMAIN_SOURCES);
		const host = join(project, "infrastructure/pom.xml");
		writeFileSync(
			host,
			readFileSync(host, "utf8").replace("</project>", "  <profiles></profiles>\n  <profiles></profiles>\n</project>"),
		);
		const offer = STACKS_OF_495.recognise(project, REFS, process.execPath, [], DOMAIN_MAP).architecture_verification;
		assert.deepEqual(offer, {
			kind: "not_proposed",
			note: "infrastructure/pom.xml cannot receive the declaration of ArchUnit without ambiguity",
		});
	});

	it("the declaration of ArchUnit adds to the test classpath of the host no module it already reaches through another, whose classes its main sources compile against", () => {
		const project = mavenReactor(
			{ domain: [], infrastructure: ["domain"], app: ["infrastructure"] },
			Object.fromEntries([
				javaSource("domain", "io.demo.domain", "User"),
				javaSource("infrastructure", "io.demo.infra", "Store"),
				javaSource("app", "io.demo.app", "Main"),
			]),
		);
		const map: ArchitectureMap = {
			parts: [
				["domain", "io.demo.domain"],
				["infrastructure", "io.demo.infra"],
				["app", "io.demo.app"],
			].map(([name, pkg]) => ({
				name: name!,
				perimeter: [name!],
				style: "simple" as const,
				roles: [{ package: pkg!, role: name!, hints: [] }],
				hints: [],
			})),
			relations: [],
		};
		const offer = STACKS_OF_495.recognise(project, REFS, process.execPath, [], map).architecture_verification;
		assert.ok(offer?.kind === "proposed" && offer.recommendation.edit, JSON.stringify(offer));
		const { path, wanted } = offer.recommendation.edit;
		assert.equal(path, "app/pom.xml", "the rules run in app, which no module depends on");
		assert.doesNotMatch(
			wanted,
			/<artifactId>domain<\/artifactId>/,
			"a test dependency on domain would hide from the main sources of app the domain infrastructure brings at compile time",
		);
	});

	it("a copy that declares ArchUnit for a map whose packages each sit in a module of their own gets no architecture control, and the structure says no forbidden dependency can be written as a witness", () => {
		const project = mavenReactor(
			{ core: [], app: ["core"] },
			Object.fromEntries([javaSource("core", "io.demo.core", "Kernel"), javaSource("app", "io.demo.app", "Entry")]),
		);
		const offer = STACKS_OF_495.recognise(project, REFS, process.execPath, [], SPLIT_MAP).architecture_verification;
		assert.ok(offer?.kind === "proposed" && offer.recommendation.edit, JSON.stringify(offer));
		const { path, current, wanted } = offer.recommendation.edit;
		writeFileSync(join(project, path), readFileSync(join(project, path), "utf8").replace(current, wanted));

		const detection = STACKS_OF_495.recognise(project, REFS, process.execPath, [], SPLIT_MAP);
		assert.deepEqual(
			detection.controls.filter((c) => c.control_id === "architecture"),
			[],
			"no architecture control without a witness",
		);
		assert.ok(
			detection.capability_missing.some((s) =>
				s.includes(
					"the adopted architecture map is not verified: no module declares two of its packages, so no dependency it forbids can be written as a witness",
				),
			),
			detection.capability_missing.join(" | "),
		);
	});
});
