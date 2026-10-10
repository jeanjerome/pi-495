import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { conduirePas } from "../../cycle/src/cycle.ts";
import { fausseCampagne, recetteSur } from "../helpers/recette-campagnes.ts";

function entree(id: string, titre: string, severite: string): string {
	return `  - bug_id: ${id}\n    date: "2026-10-10"\n    title: "${titre}"\n    severity: ${severite}\n    status: open\n`;
}

describe("the owner sees the severity of the defects of the branch before agreeing", () => {
	it("la question de la recette nomme chaque défaut que la branche inscrit au registre, avec sa gravité", async () => {
		const { ctx, issue } = await recetteSur(
			{
				"specs/bugs/registry.yaml": `bugs:\n${entree("BUG-2026-10-10T100000", "the report line reads as a measure", "medium")}${entree("BUG-2026-10-10T110000", "a log line is doubled", "low")}`,
			},
			fausseCampagne().commande,
		);
		for (const question of [
			issue.statut === "proprietaire" ? issue.question : "",
			// The question asked again, once the acceptance run is prepared and the owner has not answered.
			(await conduirePas(ctx, "recette")).statut === "proprietaire"
				? ctx.journal.dernier("proprietaire", "recette")?.detail
				: "",
		]) {
			assert.match(String(question), /BUG-2026-10-10T100000 \(medium\)/);
			assert.match(String(question), /BUG-2026-10-10T110000 \(low\)/);
		}
	});
});
