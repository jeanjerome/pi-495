/**
 * The dogfooding campaign as the controller runs it, from its own tree. `cycle/src/dogfood.ts` extracts the controller at
 * the revision it names and runs this script there, so that what judges the candidate — the controls
 * `specs/experiments/e38/dogfood/config.json` declares, the extension loaded into Pi, the driver that answers its
 * dialogs, the reading of the dossier and the record — is the code of the revision the record identifies, never the
 * candidate's. The controller builds itself, loads its own `dist/` and reads the identity of that build again at the
 * end; nothing the candidate builds replaces it. The candidate is never promoted by the campaign: a candidate becomes
 * a controller only once it is qualified and the owner gives the mandate.
 *
 * Its one argument is the `Lancement`, as JSON. `releve.json`, beside the campaign's directories, identifies the two
 * versions, the tree integrated, the controls declared and the promotion decision.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PiRpcClient } from "../../test/helpers/rpc-client.ts";
import { empreinte } from "./empreinte.ts";
import { mener, repondeur } from "./pilote-pi.ts";

/** The controller's tree: this script runs from the extraction of the controller's revision. */
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DECLARATION = join(RACINE, "specs", "experiments", "e38", "dogfood", "config.json");

/** What the launcher extracted and what the campaign is asked to do. */
export interface Lancement {
	/** The campaign's directory; the controller's data directory and the record go there. */
	campagne: string;
	revision_controleur: string;
	revision_candidat: string;
	/** The candidate's copy, a repository of one commit, `depart`, where the change is made. */
	cible: string;
	depart: string;
	objectif: string;
	modele: string;
	reflexion: string;
}

/**
 * The time the change may take in all. One `/495 resume` runs the attempts of a candidate one after the other, each
 * with the whole suite and the mutation of pi-495, so the driver waits for it as long as this budget lets the change
 * run.
 */
const BUDGET_INCREMENT_MS = 21_600_000;

/** What the campaign states of the candidate: it is integrated in the copy, never put in the controller's place. */
const PROMOTION =
	"non promu : un candidat ne devient contrôleur qu'une fois qualifié — Preflight verte et les deux campagnes de référence à sa révision — et sur le mandat du propriétaire ; la campagne ne met jamais le contrôleur à jour";

async function main(): Promise<number> {
	const lancement = JSON.parse(process.argv[2] ?? "") as Lancement;
	const { campagne, cible } = lancement;
	const dossier = join(campagne, "dossier");

	execFileSync("npm", ["run", "build"], { cwd: RACINE, stdio: ["ignore", "inherit", "inherit"] });
	const version = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8")).version as string;
	const avant = empreinte(join(RACINE, "dist"));

	mkdirSync(dossier, { recursive: true });
	const declaration = JSON.parse(readFileSync(DECLARATION, "utf8")) as { policy: Record<string, unknown> };
	writeFileSync(
		join(dossier, "config.json"),
		JSON.stringify({
			policy: {
				...declaration.policy,
				revision: 1,
				budgets: { intervention_ms: 3_600_000, increment_ms: BUDGET_INCREMENT_MS },
				adoption: { mandate: "human" },
				integration_enabled: true,
			},
		}),
	);

	const client = new PiRpcClient({
		bin: "pi",
		args: [
			"-ne",
			"--mode",
			"rpc",
			"--no-session",
			"--model",
			lancement.modele,
			"--thinking",
			lancement.reflexion,
			"-e",
			join(RACINE, "dist", "extension", "index.js"),
		],
		cwd: cible,
		env: {
			...process.env,
			HARNESS495_DATA_DIR: dossier,
			HARNESS495_RPC_HUMAN_ACTOR: "dogfood",
			HARNESS495_HUMAN_ACCEPTANCE: "1",
		},
		// An owner who adopts the mandate, accepts the candidate and lets it be integrated in the copy.
		respond: repondeur(["adopt", "accept", "integrate"]),
	});
	const verdict = await mener(client, dossier, lancement.objectif, BUDGET_INCREMENT_MS);

	const apres = empreinte(join(RACINE, "dist"));
	const git = (...a: string[]) => execFileSync("git", a, { cwd: cible, encoding: "utf8" }).trim();
	const integre = git("rev-parse", "HEAD");
	if (avant !== apres) verdict.defauts.push(`the controller's build changed during the campaign: ${avant} -> ${apres}`);
	const releve = {
		controleur: { revision: lancement.revision_controleur, version, build: avant, inchange: avant === apres },
		candidat: { revision: lancement.revision_candidat, depart: lancement.depart },
		arbre_integre: integre === lancement.depart ? null : { commit: integre, tree: git("rev-parse", "HEAD^{tree}") },
		controles_declares: (declaration.policy.project_controls as { control_id: string }[]).map((c) => c.control_id),
		promotion: PROMOTION,
		...verdict,
	};
	writeFileSync(join(campagne, "releve.json"), `${JSON.stringify(releve, null, 2)}\n`);
	for (const constat of verdict.constats) console.log(`  ${constat}`);
	for (const defaut of verdict.defauts) console.log(`DEFECT ${defaut}`);
	console.log(`releve: ${join(campagne, "releve.json")}`);
	return verdict.defauts.length === 0 ? 0 : 1;
}

process.exitCode = await main();
