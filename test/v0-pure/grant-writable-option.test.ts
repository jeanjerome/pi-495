import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildDecisionRequest, type WritableOffer } from "../../src/application/decisions.ts";

/** The IH-04 asked after refused preparations, as the owner reads it in `language`. */
function askedAfterRefusedPreparations(language: "fr" | "en", writable: WritableOffer) {
	return buildDecisionRequest({
		decision_id: "dec_1",
		change_id: "chg_1",
		interaction: "IH-04",
		subject: { kind: "artifact", id: "prep_0002", revision: 1, digest: "sha256:00" },
		language,
		facts: [],
		recommendation: null,
		writable,
		requested_at: "2026-10-12T12:00:00.000Z",
	});
}

const OFFER: WritableOffer = {
	control_id: "unit",
	directories: ["test-output/"],
	paths: ["test-output/run/a"],
};

describe("the IH-04 option that gives the control of the prepared suite a directory of the copy", () => {
	for (const language of ["fr", "en"] as const) {
		it(`names in ${language} the control and the directory, cites the paths the suite wrote, and is marked risky`, () => {
			const asked = askedAfterRefusedPreparations(language, OFFER);
			const grant = asked.options.find((o) => o.id === "grant_writable");
			assert.ok(grant, `options offered: ${asked.options.map((o) => o.id).join(", ")}`);
			assert.ok(grant.label.includes("unit") && grant.label.includes("test-output/"), grant.label);
			assert.ok(grant.effect.includes("test-output/run/a"), grant.effect);
			assert.equal(grant.risky, true);
			assert.deepEqual(asked.grant_writable, { control_id: "unit", directories: ["test-output/"] });
		});

		it(`offers no directory in ${language} when the offer names none`, () => {
			const asked = askedAfterRefusedPreparations(language, { ...OFFER, directories: [] });
			assert.ok(asked.options.every((o) => o.id !== "grant_writable"));
			assert.equal(asked.grant_writable, undefined);
		});
	}
});
