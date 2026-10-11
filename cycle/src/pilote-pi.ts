/**
 * A change driven through a real Pi over RPC the way an owner would drive it: `/495 start`, then `/495 resume` until
 * the change can go no further, each decision dialog answered with the options the campaign names and nothing else.
 * The reference campaigns and the dogfooding campaign drive their change this way.
 */
import type { PiRpcClient } from "../../test/helpers/rpc-client.ts";
import { type EtatLu, lireEtat } from "./verdict-campagne.ts";

const RELANCES_MAX = 10;
const DELAI_COMMANDE_MS = 60 * 60_000;

/** Whether the change can go no further without a human or a new attempt. */
function termine(etat: EtatLu): boolean {
	return etat.statut === "completed" || etat.statut === "blocked" || etat.statut === "cancelled";
}

export async function conduire(client: PiRpcClient, dossier: string, objectif: string): Promise<void> {
	const commandes = [`/495 start ${objectif}`, ...Array.from({ length: RELANCES_MAX }, () => "/495 resume")];
	for (const [i, commande] of commandes.entries()) {
		if (i > 0 && termine(lireEtat(dossier))) return;
		console.log(`> ${commande}`);
		client.send({ id: `commande-${i}`, type: "prompt", message: commande });
		await client.waitFor((e) => e.type === "response" && e.id === `commande-${i}`, DELAI_COMMANDE_MS);
	}
}

/**
 * Answers a decision dialog with the first option it offers whose id is one of `reponses`, and refuses to guess
 * otherwise.
 */
export function repondeur(
	reponses: string[],
): (demande: { method?: string; title?: string; options?: unknown }) => Record<string, unknown> | null {
	return (demande) => {
		if (demande.method === "confirm") return { confirmed: true };
		if (demande.method !== "select") return { cancelled: true };
		const options = (demande.options ?? []) as string[];
		const choisie = options.find((o) => reponses.some((id) => o.startsWith(`${id} — `)));
		console.log(`dialog "${demande.title ?? ""}" -> ${choisie ?? "later"}`);
		return choisie ? { value: choisie } : { cancelled: true };
	};
}
