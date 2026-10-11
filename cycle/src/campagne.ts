/**
 * A reference campaign: a real Pi loads the built extension, a real Anthropic model changes a copy of
 * one of the reference targets under `cycle/campagnes/`, and the dossier it leaves is read back to say
 * whether 495 qualified, ran and read every control it declared (`verdict-campagne.ts`).
 *
 * Usage: `npm run campagne -- <npm|maven> [--thinking <level>] [--model <provider/id>] [--extension <path>]`.
 * `--extension` loads one more Pi extension beside 495, such as the provider the model comes from.
 *
 * The campaign lives under `~/.495/campagnes/<target>-<timestamp>/`: `cible/` is the copy a change is
 * made in, `dossier/` is 495's data directory. The first needs the network once, to install what the
 * target declares; the checks themselves run with it closed, as in any campaign.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PiRpcClient } from "../../test/helpers/rpc-client.ts";
import { conduire, repondeur } from "./pilote-pi.ts";
import { jugerCampagne, lireEtat, lirePreuves } from "./verdict-campagne.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MODELE_PAR_DEFAUT = "anthropic/claude-sonnet-5-5";

interface Cible {
	objectif: string;
	/** Run in the copy before the change, with the network open. */
	preparation: string[][];
	/** What the target's tools read from the environment, computed when the campaign starts. */
	env: () => Record<string, string>;
}

const CIBLES: Record<string, Cible> = {
	npm: {
		objectif:
			"add lastFit(busy, minutes) beside firstFit: it returns the latest free slot of at least that many minutes in the day, or undefined when none fits",
		preparation: [["npm", "ci"]],
		env: () => ({}),
	},
	maven: {
		objectif: "refuse updating a user to a name already taken by another user, as create already does",
		// Fills ~/.m2 with every plugin the controls resolve offline: tests, JaCoCo and PIT.
		preparation: [
			["mvn", "-B", "-q", "test", "org.pitest:pitest-maven:mutationCoverage"],
			["rm", "-rf", "target"],
		],
		// macOS names its JDK 21 through java_home; elsewhere Maven finds the JDK on PATH.
		env: (): Record<string, string> =>
			process.platform === "darwin"
				? { JAVA_HOME: execFileSync("/usr/libexec/java_home", ["-v", "21"], { encoding: "utf8" }).trim() }
				: {},
	},
};

function option(args: string[], nom: string, parDefaut: string): string {
	const i = args.indexOf(nom);
	return i === -1 ? parDefaut : (args[i + 1] ?? parDefaut);
}

function horodatage(): string {
	return new Date()
		.toISOString()
		.replace(/\.\d+Z$/, "")
		.replace(/[-:]/g, "");
}

function executer(commande: string[], cwd: string, env: Record<string, string>): void {
	const [programme, ...arguments_] = commande;
	execFileSync(programme!, arguments_, { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
}

/** A fresh git repository of one commit, which is what a target must be before 495 starts on it. */
function preparerCible(technologie: string, cible: Cible, dossierCible: string): void {
	cpSync(join(RACINE, "cycle", "campagnes", technologie), dossierCible, { recursive: true });
	const git = (...arguments_: string[]) =>
		executer(
			["git", "-c", "user.name=campagne", "-c", "user.email=campagne@localhost", ...arguments_],
			dossierCible,
			{},
		);
	git("init", "-q", "-b", "main");
	git("add", "-A");
	git("commit", "-q", "-m", "initial");
	for (const commande of cible.preparation) executer(commande, dossierCible, cible.env());
}

async function main(): Promise<number> {
	const args = process.argv.slice(2);
	const technologie = args[0] ?? "";
	const cible = CIBLES[technologie];
	if (!cible) {
		console.error(
			`usage: npm run campagne -- <${Object.keys(CIBLES).join("|")}> [--thinking <level>] [--model <id>] [--extension <path>]`,
		);
		return 2;
	}
	execFileSync("npm", ["run", "build"], { cwd: RACINE, stdio: "inherit" });
	const campagne = join(homedir(), ".495", "campagnes", `${technologie}-${horodatage()}`);
	const [dossierCible, dossier] = [join(campagne, "cible"), join(campagne, "dossier")];
	mkdirSync(dossier, { recursive: true });
	preparerCible(technologie, cible, dossierCible);
	writeFileSync(
		join(dossier, "config.json"),
		JSON.stringify({
			policy: {
				policy_id: "campagne-reference",
				revision: 1,
				budgets: { intervention_ms: 3_600_000, increment_ms: 21_600_000 },
				adoption: { mandate: "human" },
			},
		}),
	);
	const extension = join(RACINE, "dist", "extension", "index.js");
	if (!existsSync(extension)) throw new Error(`no build at ${extension}`);
	console.log(`campaign ${campagne}`);

	const client = new PiRpcClient({
		bin: "pi",
		args: [
			"-ne",
			"--mode",
			"rpc",
			"--no-session",
			"--model",
			option(args, "--model", MODELE_PAR_DEFAUT),
			"--thinking",
			option(args, "--thinking", "high"),
			"-e",
			extension,
			...(args.includes("--extension") ? ["-e", option(args, "--extension", "")] : []),
		],
		cwd: dossierCible,
		env: {
			...process.env,
			...cible.env(),
			HARNESS495_DATA_DIR: dossier,
			HARNESS495_RPC_HUMAN_ACTOR: "campagne",
			HARNESS495_HUMAN_ACCEPTANCE: "1",
		},
		// An owner who adopts the mandate and accepts the candidate, and refuses to guess anything else.
		respond: repondeur(["adopt", "accept"]),
	});
	try {
		await conduire(client, dossier, cible.objectif);
	} finally {
		await client.close();
	}

	const verdict = jugerCampagne(lireEtat(dossier), lirePreuves(dossier));
	for (const constat of verdict.constats) console.log(`  ${constat}`);
	for (const defaut of verdict.defauts) console.log(`DEFECT ${defaut}`);
	console.log(verdict.defauts.length === 0 ? "reference campaign: no defect of the harness" : `dossier: ${dossier}`);
	return verdict.defauts.length === 0 ? 0 : 1;
}

process.exitCode = await main();
