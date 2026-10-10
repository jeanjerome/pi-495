/**
 * The two reference campaigns of `cycle/campagnes/`, which the tool plays itself at the head of a branch that
 * touches what 495 executes — a technology, a control or the executor — before the acceptance session (`D-89`).
 * The paths that decide it are written here and nowhere else.
 */
import type { Controle } from "./controls.ts";
import type { Evenement } from "./journal.ts";

/** The source paths a change of which requires the reference campaigns. */
const CHEMINS_EXECUTES = [
	"src/application/stacks/",
	"src/adapters/stacks/",
	"src/adapters/execution/",
	"src/adapters/sandbox/",
	"src/domain/gates/",
];

export const CAMPAGNES = ["npm", "maven"] as const;

/** Whether a branch that changes `fichiers` requires the reference campaigns. */
export function campagnesExigees(fichiers: string[]): boolean {
	return fichiers.some((f) => CHEMINS_EXECUTES.some((chemin) => f.startsWith(chemin)));
}

/** The command that plays the reference campaign of `technologie`. */
export function commandeDeCampagne(technologie: string): string[] {
	return ["npm", "run", "campagne", "--", technologie];
}

/**
 * The control that plays the campaign of `technologie` with `commande`. The campaign opens the network to install
 * what its target declares and to reach its model; the checks 495 runs inside it keep their own policy.
 */
export function controleDeCampagne(technologie: string, commande: string[]): Controle {
	return { id: idDeCampagne(technologie), commande, reseau: "allowed", timeout_ms: 3_600_000 };
}

function idDeCampagne(technologie: string): string {
	return `campagne-${technologie}`;
}

/**
 * The first campaign the acceptance run of `evenements` does not show green at `tete`, named with what is wrong with
 * it, or `null` when both are: only a campaign the tool played, at that revision, counts.
 */
export function campagneEnCause(evenements: Evenement[], tete: string): string | null {
	for (const technologie of CAMPAGNES) {
		const jouee = evenements.findLast((e) => e.genre === "controle" && e.controle === idDeCampagne(technologie));
		const aLaTete = `à la tête ${tete.slice(0, 7)}`;
		if (!jouee) return `la campagne ${technologie} n'a pas été jouée ${aLaTete}`;
		if (jouee.revision !== tete)
			return `la campagne ${technologie} a été jouée à ${String(jouee.revision).slice(0, 7)}, pas ${aLaTete}`;
		if (jouee.verdict !== "PASS") return `la campagne ${technologie} est ${String(jouee.verdict)} ${aLaTete}`;
	}
	return null;
}
