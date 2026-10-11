import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { repondeur } from "../../cycle/src/pilote-pi.ts";

const OPTIONS = ["later — decide later", "integrate — merge into main", "accept — accept the candidate"];

describe("the owner a campaign plays", () => {
	it("chooses the first option offered among those the campaign names, confirms, and cancels anything else", () => {
		const dogfood = repondeur(["adopt", "accept", "integrate"]);
		assert.deepEqual(dogfood({ method: "select", title: "G5", options: OPTIONS }), {
			value: "integrate — merge into main",
		});
		assert.deepEqual(dogfood({ method: "confirm" }), { confirmed: true });
		assert.deepEqual(dogfood({ method: "input" }), { cancelled: true });

		const reference = repondeur(["adopt", "accept"]);
		assert.deepEqual(reference({ method: "select", options: OPTIONS }), { value: "accept — accept the candidate" });
		assert.deepEqual(
			reference({ method: "select", options: ["integrate — merge into main"] }),
			{ cancelled: true },
			"an option the campaign does not name is never chosen",
		);
		assert.deepEqual(
			reference({ method: "select", options: ["acceptable — a prefix is not an option id"] }),
			{ cancelled: true },
			"an option id is matched whole",
		);
	});
});
