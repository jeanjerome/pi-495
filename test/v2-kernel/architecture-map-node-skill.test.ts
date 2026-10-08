/**
 * The intervention that proposes the architecture map of an npm package receives the identification skill
 * 495 bundles, and the skill says how to read a Node project: what to read of it, the signs of each style
 * and of its data, cross-cutting concerns and deployment there, and that this part is written by 495.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	NODE_DOMAIN_MAP,
	NODE_DOMAIN_SOURCES,
	nodePackage,
	nodeSurveyedArchitecture,
} from "../helpers/node-architecture-survey.ts";

/** The lines of the section of `text` whose heading is `heading`, up to the next heading of any level. */
function section(text: string, heading: string): string[] {
	const lines = text.split("\n");
	const start = lines.indexOf(heading);
	assert.ok(start >= 0, `the skill has a section ${heading}`);
	const end = lines.findIndex((line, i) => i > start && line.startsWith("#"));
	return lines.slice(start + 1, end < 0 ? undefined : end);
}

/** What `lines` say of a Node project: the bullet that starts with "In a Node project". */
function nodeBullet(lines: readonly string[], heading: string): string {
	const start = lines.findIndex((line) => line.startsWith("- In a Node project"));
	assert.ok(start >= 0, `${heading} says how it shows in a Node project: ${lines.join("\n")}`);
	const end = lines.findIndex((line, i) => i > start && !line.startsWith("  "));
	return lines.slice(start, end < 0 ? undefined : end).join(" ");
}

describe("the identification skill says how to read a Node project", () => {
	it("la skill d'identification nomme, pour une cible Node, package.json, les déclarations import et require, les dossiers des sources et les alias de tsconfig.json, les signes des styles layered, onion, simple et other dans un projet Node et ceux de ses données, de ses préoccupations transverses et de son déploiement, et sa provenance dit que cette part est écrite par 495", async () => {
		const { agent } = await nodeSurveyedArchitecture(nodePackage(NODE_DOMAIN_SOURCES), [NODE_DOMAIN_MAP]);
		const [mandate] = agent.mapMandates;
		assert.ok(mandate, "an intervention proposes the map");
		assert.equal(mandate.skills.length, 1, "the intervention receives the skill of 495");
		const text = readFileSync(mandate.skills[0]!, "utf8");

		const description = text.split("\n").find((line) => line.startsWith("description: ")) ?? "";
		assert.match(description, /Node/, `the description does not keep the skill to Maven: ${description}`);

		const toRead = section(text, "### In a Node project").join("\n");
		for (const read of ["`package.json`", "`import`", "`require`", "folders of the sources", "`tsconfig.json`"])
			assert.ok(toRead.includes(read), `what to read of a Node project names ${read}: ${toRead}`);
		assert.match(toRead, /alias/, `the aliases of tsconfig.json are read: ${toRead}`);

		for (const heading of [
			"### `layered`",
			"### `onion`",
			"### `simple`",
			"### `other`",
			"### Data",
			"### Cross-cutting concerns",
			"### Deployment",
		]) {
			const said = nodeBullet(section(text, heading), heading);
			assert.ok(
				said.length > "- In a Node project: ".length + 20,
				`${heading} gives its signs in a Node project: ${said}`,
			);
		}

		const provenance = section(text, "## Provenance").join(" ");
		assert.match(
			provenance,
			/Node[^.]*written by 495[^.]*neither source covers Node/,
			`the provenance says the part on Node is written by 495, neither source covering Node: ${provenance}`,
		);
	});
});
