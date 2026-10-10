import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildDecisionRequest, type ContestedCase } from "../../src/application/decisions.ts";

/** The question of the IH-04 asked on the contested case R1 "greet greets", as the owner reads it in `language`. */
function questionOn(language: "fr" | "en", contested: ContestedCase): string {
	return buildDecisionRequest({
		decision_id: "dec_1",
		change_id: "chg_1",
		interaction: "IH-04",
		subject: { kind: "artifact", id: "prep_0001", revision: 1, digest: "sha256:00" },
		language,
		facts: [],
		recommendation: null,
		contested,
		requested_at: "2026-10-10T12:00:00.000Z",
	}).question;
}

const KEEP = { fr: /« garder »/, en: /"keep"/ } as const;

describe("the IH-04 asked on a contested frozen case", () => {
	for (const language of ["fr", "en"] as const) {
		it(`recalls in ${language} the owner's answer keep when the owner kept the case, and only then`, () => {
			const kept = questionOn(language, { requirement_id: "R1", case_name: "R1 greet greets", kept: true });
			assert.match(kept, /R1 greet greets/, "the question names the case");
			assert.match(kept, KEEP[language], "the question recalls the answer keep");
			const contested = questionOn(language, { requirement_id: "R1", case_name: "R1 greet greets" });
			assert.doesNotMatch(contested, KEEP[language], "a case never kept recalls no answer");
		});
	}
});
