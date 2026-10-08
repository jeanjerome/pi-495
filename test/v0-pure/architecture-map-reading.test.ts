/**
 * Each hint of the reading of the model is confronted with the files of the reference, as those of the map are: a
 * statement one of whose hints designates no line is set aside with that hint, and the others are kept.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ArchitectureHint, ModelReading } from "../../src/contracts/v1/protocol.ts";
import { checkReading } from "../../src/domain/architecture-map.ts";

/** A reference of a Dockerfile of 12 lines and nothing else. */
const linesOf = (path: string) => (path === "Dockerfile" ? 12 : null);

const at = (path: string, line: number): ArchitectureHint => ({ path, line, says: "what this line shows" });

/** A reading whose one deployment statement is supported by `hints`. */
const deployedBy = (...hints: ArchitectureHint[]): ModelReading => ({
	data: [],
	cross_cutting: [],
	deployment: [{ statement: "the application is delivered as an image", hints }],
});

describe("the hints of the reading of the model are confronted with the reference", () => {
	it("a statement whose hint designates the last line of its file is kept", () => {
		const check = checkReading(deployedBy(at("Dockerfile", 12)), linesOf);
		assert.equal(check.kept.deployment.length, 1);
		assert.deepEqual(check.set_aside, []);
	});

	it("a statement whose hint designates the line after the last of its file is set aside with that hint", () => {
		const check = checkReading(deployedBy(at("Dockerfile", 13)), linesOf);
		assert.deepEqual(check.kept.deployment, []);
		assert.deepEqual(check.set_aside, [
			{ concern: "deployment", statement: "the application is delivered as an image", hint: "Dockerfile:13" },
		]);
	});

	it("a statement whose hint designates a file the reference does not hold is set aside with that hint", () => {
		const check = checkReading(deployedBy(at("compose.yaml", 1)), linesOf);
		assert.deepEqual(
			check.set_aside.map((s) => s.hint),
			["compose.yaml:1"],
		);
	});

	it("a statement one of whose two hints designates no line is set aside with the hint at fault, not the other", () => {
		const check = checkReading(deployedBy(at("Dockerfile", 1), at("Dockerfile", 40)), linesOf);
		assert.deepEqual(check.kept.deployment, []);
		assert.deepEqual(
			check.set_aside.map((s) => s.hint),
			["Dockerfile:40"],
		);
	});

	it("an empty reading keeps nothing and sets nothing aside", () => {
		const check = checkReading({ data: [], cross_cutting: [], deployment: [] }, linesOf);
		assert.deepEqual(check, { kept: { data: [], cross_cutting: [], deployment: [] }, set_aside: [] });
	});
});
