/**
 * What the coordinator of a review round decides without a model: which findings of the two
 * reviewers hold the gate, which go to the response, which go to the registry, and whether a round
 * may follow. Two rounds at most; what the second leaves goes to the registry, except a promise the
 * code does not keep and a bypass of the security section, which the owner decides.
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
	/** The guarantee of the story's security section this finding shows a path around. */
	contournement?: string;
}

export interface Rapport {
	verdict: "pass" | "fail";
	constats: Constat[];
	/** The bypasses the previous response claims fixed that this reviewer replayed on the head and found closed. */
	fermes?: string[];
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
					contournement: { type: "string" },
				},
				required: ["id", "scenario", "categorie", "placement", "constat"],
			},
		},
		fermes: { type: "array", items: { type: "string" } },
		resume: { type: "string" },
	},
	required: ["verdict", "constats", "resume"],
} as const;

export const TOURS_MAX = 2;

/** A finding that shows a path around a guarantee of the security section. */
export function contourne(c: Constat): boolean {
	return c.contournement !== undefined;
}

/** A finding the branch owns and that holds the gate, or a bypass, whatever its location or category. */
export function retientLaPorte(c: Constat): boolean {
	return contourne(c) || (c.placement !== "anterieur" && c.categorie !== "a_peser");
}

export interface Tri {
	/** Findings the response must fix in this round: gate-holding ones, and suggestions to weigh. */
	aTraiter: Constat[];
	/** Earlier defects, to register without fixing; never a bypass. */
	anterieurs: Constat[];
	porte: "pass" | "fail";
}

export function trier(rapports: Rapport[]): Tri {
	const constats = rapports.flatMap((r) => r.constats);
	const anterieurs = constats.filter((c) => c.placement === "anterieur" && !contourne(c));
	const aTraiter = constats.filter((c) => c.placement !== "anterieur" || contourne(c));
	return { aTraiter, anterieurs, porte: aTraiter.some(retientLaPorte) ? "fail" : "pass" };
}

/** What the response of a round answers for one finding. */
export interface Reponse {
	id: string;
	action: "corrige" | "registre" | "conteste";
	commit?: string;
	motif: string;
}

export const SCHEMA_REPONSE = {
	type: "object",
	properties: {
		status: { type: "string", enum: ["fini", "bloque"] },
		reponses: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					action: { type: "string", enum: ["corrige", "registre", "conteste"] },
					commit: { type: "string" },
					motif: { type: "string" },
				},
				required: ["id", "action", "motif"],
			},
		},
		resume: { type: "string" },
	},
	required: ["status", "reponses", "resume"],
} as const;

/** Git's shortest default abbreviation of a commit: a shorter one, down to the empty string, may match a commit it does not name. */
const ABREVIATION_MIN = 7;

/**
 * The bypasses a round's response leaves open: each one it does not answer `corrige` with a commit
 * among `commits`, those it made. They hold the gate of the next round as they stand, so whatever
 * the response classes them, a bypass is fixed on the branch or put to the owner. One it answers
 * `corrige` is replayed by the next round's reviewers (`nonFermes`).
 */
export function contournementsLaisses(aTraiter: Constat[], reponses: Reponse[], commits: string[]): Constat[] {
	const corrige = (c: Constat): boolean =>
		reponses.some(({ id, action, commit }) => {
			if (id !== c.id || action !== "corrige" || commit === undefined || commit.length < ABREVIATION_MIN) return false;
			return commits.some((sha) => sha.startsWith(commit));
		});
	return aTraiter.filter((c) => contourne(c) && !corrige(c));
}

/**
 * The bypasses a response claims fixed that the next round does not find closed: a commit proves
 * nothing of what it fixes, so each stays open until every reviewer of that round replays its path
 * on the head and lists it under `fermes`.
 */
function nonFermes(rejoues: Constat[], rapports: Rapport[]): Constat[] {
	return rejoues.filter((c) => !rapports.every((r) => (r.fermes ?? []).includes(c.id)));
}

/**
 * What the previous round leaves open in this one, as a report that holds its gate: the bypasses its
 * response left (`laisses`), and those it claims fixed (`rejoues`) that the reviewers of this round do
 * not all find closed.
 */
export function ouvertsDuTourPrecedent(laisses: Constat[], rejoues: Constat[], rapports: Rapport[]): Rapport[] {
	const ouverts = [...laisses, ...nonFermes(rejoues, rapports)];
	if (ouverts.length === 0) return [];
	return [
		{
			verdict: "fail",
			constats: ouverts,
			resume: "Contournements que la réponse du tour précédent n'a pas corrigés, ou que ce tour ne trouve pas fermés.",
		},
	];
}

/**
 * After the last round, what still holds the gate: a promise the code does not keep, or a bypass of
 * the security section, goes to the owner; a bypass never goes to the registry.
 */
export function apresDernierTour(rapports: Rapport[]): { proprietaire: Constat[]; registre: Constat[] } {
	const { aTraiter, anterieurs } = trier(rapports);
	const auProprietaire = (c: Constat): boolean => c.categorie === "bloquant" || contourne(c);
	return {
		proprietaire: aTraiter.filter(auProprietaire),
		registre: [...aTraiter.filter((c) => !auProprietaire(c)), ...anterieurs],
	};
}
