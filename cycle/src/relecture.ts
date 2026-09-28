/**
 * What the coordinator of a review round decides without a model: which findings of the two
 * reviewers hold the gate, which go to the response, which go to the registry, and whether a round
 * may follow. Two rounds at most; what the second leaves goes to the registry, except a promise the
 * code does not keep, which the owner decides.
 */
export type Categorie = "bloquant" | "a_corriger" | "a_peser";
export type Placement = "introduit" | "rendu_atteignable" | "anterieur";

export interface Constat {
	id: string;
	scenario: string;
	categorie: Categorie;
	placement: Placement;
	fichier?: string;
	ligne?: number;
	constat: string;
	mutation?: string;
}

export interface Rapport {
	verdict: "pass" | "fail";
	constats: Constat[];
	resume: string;
}

export const SCHEMA_RAPPORT = {
	type: "object",
	properties: {
		verdict: { type: "string", enum: ["pass", "fail"] },
		constats: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					scenario: { type: "string" },
					categorie: { type: "string", enum: ["bloquant", "a_corriger", "a_peser"] },
					placement: { type: "string", enum: ["introduit", "rendu_atteignable", "anterieur"] },
					fichier: { type: "string" },
					ligne: { type: "integer" },
					constat: { type: "string" },
					mutation: { type: "string" },
				},
				required: ["id", "scenario", "categorie", "placement", "constat"],
			},
		},
		resume: { type: "string" },
	},
	required: ["verdict", "constats", "resume"],
} as const;

export const TOURS_MAX = 2;

/** A finding the branch owns and that holds the gate. */
export function retientLaPorte(c: Constat): boolean {
	return c.placement !== "anterieur" && c.categorie !== "a_peser";
}

export interface Tri {
	/** Findings the response must fix in this round: gate-holding ones, and suggestions to weigh. */
	aTraiter: Constat[];
	/** Earlier defects, to register without fixing. */
	anterieurs: Constat[];
	porte: "pass" | "fail";
}

export function trier(rapports: Rapport[]): Tri {
	const constats = rapports.flatMap((r) => r.constats);
	const anterieurs = constats.filter((c) => c.placement === "anterieur");
	const aTraiter = constats.filter((c) => c.placement !== "anterieur");
	return { aTraiter, anterieurs, porte: aTraiter.some(retientLaPorte) ? "fail" : "pass" };
}

/** After the last round, what still holds the gate: a promise the code does not keep goes to the owner. */
export function apresDernierTour(rapports: Rapport[]): { proprietaire: Constat[]; registre: Constat[] } {
	const { aTraiter, anterieurs } = trier(rapports);
	return {
		proprietaire: aTraiter.filter((c) => c.categorie === "bloquant"),
		registre: [...aTraiter.filter((c) => c.categorie !== "bloquant"), ...anterieurs],
	};
}
