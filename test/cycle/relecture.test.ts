import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { apresDernierTour, retientLaPorte, trier, type Constat, type Rapport } from "../../cycle/src/relecture.ts";

const c = (id: string, categorie: Constat["categorie"], placement: Constat["placement"]): Constat => ({
	id,
	scenario: "s",
	categorie,
	placement,
	constat: id,
});

describe("the sorting of a review round", () => {
	it("holds the gate on a blocking or to-fix finding the branch owns, never on a suggestion or an earlier defect", () => {
		assert.equal(retientLaPorte(c("a", "bloquant", "introduit")), true);
		assert.equal(retientLaPorte(c("b", "a_corriger", "rendu_atteignable")), true);
		assert.equal(retientLaPorte(c("c", "a_peser", "introduit")), false);
		assert.equal(retientLaPorte(c("d", "bloquant", "anterieur")), false);
	});

	it("sends the branch's findings to the response and the earlier ones to the registry, from both reviewers", () => {
		const a: Rapport = {
			verdict: "fail",
			constats: [c("A1-1", "a_corriger", "introduit"), c("A1-2", "bloquant", "anterieur")],
			resume: "",
		};
		const b: Rapport = { verdict: "pass", constats: [c("B1-1", "a_peser", "rendu_atteignable")], resume: "" };
		const tri = trier([a, b]);
		assert.deepEqual(
			tri.aTraiter.map((x) => x.id),
			["A1-1", "B1-1"],
		);
		assert.deepEqual(
			tri.anterieurs.map((x) => x.id),
			["A1-2"],
		);
		assert.equal(tri.porte, "fail");
		assert.equal(trier([b]).porte, "pass");
	});

	it("after the last round, hands a promise the code does not keep to the owner and everything else to the registry", () => {
		const fin = apresDernierTour([
			{
				verdict: "fail",
				constats: [c("A2-1", "bloquant", "introduit"), c("A2-2", "a_corriger", "introduit")],
				resume: "",
			},
			{
				verdict: "fail",
				constats: [c("B2-1", "a_peser", "introduit"), c("B2-2", "a_corriger", "anterieur")],
				resume: "",
			},
		]);
		assert.deepEqual(
			fin.proprietaire.map((x) => x.id),
			["A2-1"],
		);
		assert.deepEqual(
			fin.registre.map((x) => x.id),
			["A2-2", "B2-1", "B2-2"],
		);
	});
});
