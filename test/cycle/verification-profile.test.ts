import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { diagnostiquer } from "../../cycle/src/verification-contract.ts";

const SCENARIO = "Le message de refus nomme le chemin fautif";
const STORY = { id: "e01s05", scenarios: [SCENARIO], taches: [{ numero: 1 }] };
const COMPAGNON = "specs/stories/e01/e01s05-x.verification.json";
const ORACLE = { tache: 1, cas: "test/v0-pure/refus.test.ts", assertion: "le message nomme ../ws2/r.txt" };

const ECARTES = [
	{ moyen: "proprietes", retenu: false, raison: "une seule entrée fautive à montrer" },
	{ moyen: "modele-d-etats", retenu: false, raison: "aucun état : une correction de texte" },
	{ moyen: "preuve-lean", retenu: false, raison: "aucune règle de décision" },
];

function diagnostic(promesse: Record<string, unknown>) {
	const compagnon = {
		version: 1,
		story: "e01s05",
		promesses: [
			{
				id: "P1",
				scenario: SCENARIO,
				categorie: "nouveau-comportement",
				observation: "le message de refus",
				oracles: [ORACLE],
				dependances: [],
				interactions: [],
				moyens: [{ moyen: "exemples", retenu: true, raison: "un cas montre le message" }, ...ECARTES],
				...promesse,
			},
		],
	};
	return diagnostiquer(JSON.stringify(compagnon), COMPAGNON, STORY);
}

describe("the means a companion selects for a promise", () => {
	it("une simple correction n’exige aucun outil formel et un modèle choisi sans propriété est incomplet", () => {
		const simple = diagnostic({});
		const p = simple.promesses[0];
		assert.deepEqual(
			p?.moyens?.map((m) => [m.moyen, m.retenu, m.raison]),
			[
				["exemples", true, "un cas montre le message"],
				["proprietes", false, "une seule entrée fautive à montrer"],
				["modele-d-etats", false, "aucun état : une correction de texte"],
				["preuve-lean", false, "aucune règle de décision"],
			],
		);
		assert.deepEqual(p?.manques, []);
		assert.equal(simple.prete, true);

		const modele = diagnostic({
			moyens: [
				{ moyen: "exemples", retenu: true },
				{ moyen: "modele-d-etats", retenu: true, raison: "révision et reprise s'entrelacent" },
				ECARTES[0],
				ECARTES[2],
			],
		});
		assert.match(modele.promesses[0]?.manques.join("\n") ?? "", /modele-d-etats retenu sans propriété.*attendu/);
		assert.equal(modele.promesses[0]?.prete, false);
		assert.equal(modele.prete, false);
	});

	it("asks every means to be selected or set aside with its reason, and at least one selected", () => {
		const d = diagnostic({
			moyens: [
				{ moyen: "exemples", retenu: false },
				{ moyen: "proprietes", retenu: false, raison: "rien ne varie" },
			],
		});
		const manques = d.promesses[0]?.manques.join("\n") ?? "";
		assert.match(manques, /exemples écarté sans raison.*attendu/);
		assert.match(manques, /modele-d-etats ni retenu ni écarté.*attendu/);
		assert.match(manques, /preuve-lean ni retenu ni écarté.*attendu/);
		assert.match(manques, /aucun moyen retenu/);
		assert.equal(d.prete, false);
	});

	it("carries the declared interactions as declared, and refuses an unknown kind or an unknown means", () => {
		const d = diagnostic({
			interactions: [
				{ genre: "revision", description: "une règle révisée après une preuve" },
				{ genre: "reprise", description: "le cycle reprend après un arrêt" },
				{ genre: "ordre-des-evenements", description: "deux réponses arrivent dans l'autre ordre" },
				{ genre: "effet-externe", description: "un commit est écrit" },
			],
		});
		assert.deepEqual(
			d.promesses[0]?.interactions?.map((i) => i.genre),
			["revision", "reprise", "ordre-des-evenements", "effet-externe"],
		);
		assert.equal(d.prete, true);

		const inconnus = diagnostic({
			interactions: [{ genre: "concurrence", description: "x" }],
			moyens: [{ moyen: "exemples", retenu: true }, { moyen: "tla", retenu: true }, ...ECARTES],
		});
		const erreurs = inconnus.erreurs.join("\n");
		assert.match(erreurs, /promesses\[0\]\.interactions\[0\]\.genre: .*concurrence.*attendu.*revision/);
		assert.match(erreurs, /promesses\[0\]\.moyens\[1\]\.moyen: .*tla.*attendu.*modele-d-etats/);
		assert.equal(inconnus.prete, false);
	});
});
