import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Runner } from "../helpers/change-fixture.ts";

describe("the next action G2 announces", () => {
	it("G2 d'un état des lieux qui passe annonce verify, et G2 d'un changement à candidat annonce design_change", () => {
		const surveyed = new Runner().create({ deliverable: "state" }).g0().g1().g2();
		assert.equal(surveyed.s.gates.G2?.verdict, "PASS", surveyed.s.gates.G2?.reasons.join("; "));
		assert.equal(surveyed.s.gates.G2?.next_action, "verify", "the survey of the project announces verification");

		const candidate = new Runner().create({ deliverable: "candidate" }).g0().g1().g2();
		assert.equal(candidate.s.gates.G2?.verdict, "PASS", candidate.s.gates.G2?.reasons.join("; "));
		assert.equal(candidate.s.gates.G2?.next_action, "design_change", "a candidate change announces its design");
	});
});
