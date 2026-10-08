/**
 * The files the witnesses of a control are judged by: the shared positive witness, or the reference alone for a
 * control whose defect the shared one carries, and the negative files, its own on top of the positive ones when it
 * has its own.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { type ControlWitnesses, witnessFilesOf } from "../../src/application/qualification.ts";

const WITNESSES: ControlWitnesses = {
	positive: { "src/Witness.java": "passes" },
	negative: { "src/Witness.java": "fails" },
	own_negative: {
		architecture: { "src/Forbidden.java": "crosses a boundary" },
		dependencies: { "src/Undeclared.java": "uses an undeclared library" },
	},
	reference_positive: ["dependencies"],
};

describe("the files the witnesses of a control are judged by", () => {
	it("a control with no witness of its own is judged by the shared positive witness and the shared negative one on top of it", () => {
		assert.deepEqual(witnessFilesOf(WITNESSES, "tests"), {
			positive: { "src/Witness.java": "passes" },
			negative: { "src/Witness.java": "fails" },
			own: false,
		});
	});

	it("a control with a negative witness of its own is judged by it on top of the shared positive witness", () => {
		assert.deepEqual(witnessFilesOf(WITNESSES, "architecture"), {
			positive: { "src/Witness.java": "passes" },
			negative: { "src/Witness.java": "passes", "src/Forbidden.java": "crosses a boundary" },
			own: true,
		});
	});

	it("a control whose positive witness is the reference alone is judged by its own negative witness on the reference, without the shared positive one", () => {
		assert.deepEqual(witnessFilesOf(WITNESSES, "dependencies"), {
			positive: {},
			negative: { "src/Undeclared.java": "uses an undeclared library" },
			own: true,
		});
	});

	it("witnesses that name no control as proved by the reference alone judge each by the shared positive witness", () => {
		const { reference_positive: _none, ...shared } = WITNESSES;
		assert.deepEqual(witnessFilesOf(shared, "dependencies").positive, { "src/Witness.java": "passes" });
	});
});
