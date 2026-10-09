/**
 * What the Node technology says of an adopted architecture map whose folders hold no source dependency-cruiser
 * reads: it proposes no verification, with why, and a copy that already carries the analysers gets no
 * architecture control, whose positive witness would read nothing.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { NODE_MTS_MAP, NODE_MTS_SOURCES } from "../helpers/node-architecture-survey.ts";
import { outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const REFS = [{ requirement_id: "ARC-01", revision: 1 }];
const UNCRUISED = "dependency-cruiser 18.5.0 reads none of the sources of its folders";

/** A package whose every source is a .mts module, with what `extra` adds. */
function mtsPackage(cleanups: string[], extra: Record<string, string> = {}): string {
	const root = outputDir("node-architecture-offer-", cleanups);
	writeFiles(root, {
		"package.json": `${JSON.stringify({ name: "users", version: "1.0.0", type: "module" })}\n`,
		...NODE_MTS_SOURCES,
		...extra,
	});
	return root;
}

describe("the Node technology verifies no map whose folders hold no source dependency-cruiser reads", () => {
	const cleanups = removedAfterEach();

	it("sur un paquet dont toutes les sources sont en .mts, la vérification de la carte n'est pas proposée, avec la raison", () => {
		const offer = STACKS_OF_495.recognise(
			mtsPackage(cleanups),
			REFS,
			process.execPath,
			[],
			NODE_MTS_MAP,
		).architecture_verification;
		assert.equal(offer?.kind, "not_proposed");
		assert.match(offer?.kind === "not_proposed" ? offer.note : "", new RegExp(UNCRUISED));
	});

	it("une copie de ce paquet qui porte déjà dependency-cruiser et swc n'a pas de contrôle d'architecture, et l'angle mort dit pourquoi", () => {
		const installed = (name: string, version: string) => ({
			[`node_modules/${name}/package.json`]: `${JSON.stringify({ name, version })}\n`,
		});
		const copy = mtsPackage(cleanups, {
			...installed("dependency-cruiser", "18.5.0"),
			...installed("@swc/core", "1.16.13"),
		});
		const detection = STACKS_OF_495.recognise(copy, REFS, process.execPath, [], NODE_MTS_MAP);
		assert.deepEqual(
			detection.controls.filter((c) => c.control_id === "architecture"),
			[],
		);
		assert.ok(
			detection.capability_missing.some((m) => m.includes(UNCRUISED)),
			detection.capability_missing.join("\n"),
		);
	});
});
