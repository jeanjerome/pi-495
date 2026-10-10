/**
 * The explorations of a preparation are costly and their models change rarely: a later preparation of the same model,
 * tool and checker cites the earlier exploration instead of running it again, and the journal says what ran, for how
 * long, what was cited and why anything ran. Reuse changes no verdict: the same corpus examined with and without it
 * blocks and passes the same stories on the same outcomes.
 */
import { strict as assert } from "node:assert";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { describe, it } from "node:test";
import type { Controle, Preuve } from "../../cycle/src/controls.ts";
import { identiteDExploration } from "../../cycle/src/explorations.ts";
import { Journal } from "../../cycle/src/journal.ts";
import { preparer } from "../../cycle/src/preparation.ts";
import { lireStory } from "../../cycle/src/story.ts";
import { gitCmd, removedAfterEach, tempDir } from "../helpers/fixtures.ts";
import { CONTRE_EXEMPLE, MANIFESTE, NODE, compagnon, depotAvecCompagnon, fichiersDuModele } from "../helpers/cycle.ts";

const cleanups = removedAfterEach();

/** A second model of the test story, whose exploration ends on a counterexample. */
const BORNE = "specs/formal/borne/manifest.json";
const FICHIERS = {
	...fichiersDuModele(),
	"specs/formal/borne/Borne.tla": "---- MODULE Borne ----\nEXTENDS Naturals\nVARIABLE x\nInit == x = 0\n====\n",
	"specs/formal/borne/Borne.cfg": "INIT Init\nINVARIANT Borne\n",
	[BORNE]: JSON.stringify({ model: "Borne.tla", config: "Borne.cfg", required_properties: ["Borne"] }),
};
/** What `scripts/check-formal.ts` prints of a completed exploration, down to the modules TLC reports it processed. */
const COMPLETED = "Greet.tla with Greet.cfg: completed — PASS for the model under its bounds\nmodules: Greet\n";
/**
 * What the stand-in for `scripts/check-formal.ts` answers for each manifest: its exit status, its output and the
 * duration its runner measured, 40 ms unless it says it measured none.
 */
type Issue = [number, string, (number | null)?];
const ISSUES: Record<string, Issue> = { [MANIFESTE]: [0, COMPLETED], [BORNE]: [1, CONTRE_EXEMPLE] };

function modeles(manifestes: string[]): unknown[] {
	return [
		{ moyen: "exemples", retenu: true, raison: "one case shows the greeting" },
		{ moyen: "proprietes", retenu: false, raison: "one input is enough" },
		{ moyen: "modele-d-etats", retenu: true, proprietes: ["Shouted"], manifestes },
		{ moyen: "preuve-lean", retenu: false, raison: "no decision rule" },
	];
}

/** The exploration of a manifest, by a stand-in whose Java is the running node, a tool identified by its path. */
function exploration(manifeste: string): Controle {
	return {
		id: `exploration-${manifeste}`,
		commande: [NODE, "check-formal.ts", manifeste, "--java", NODE],
		reseau: "denied",
		timeout_ms: 60_000,
	};
}

interface Resultat {
	manifeste: string;
	issue: string;
	trace: { digest: string } | null;
	duree_ms: number | null;
	recherche_ms: number;
	reutilise: { story: string } | null;
	motif: string | null;
}

/**
 * Examines the preparation of the same story under each of `stories`, one journal each beside the others, with reuse
 * on or off, through a stand-in that records every exploration it is asked to run.
 */
async function examinerCorpus(
	root: string,
	stories: string[],
	reutiliser: boolean,
	issues: Record<string, Issue> = ISSUES,
	racine = tempDir("495-", cleanups),
) {
	const lancements: string[] = [];
	const verdicts: { verte: boolean; issues: string[][] }[] = [];
	const resultats: Resultat[][] = [];
	const comptes: string[] = [];
	for (const id of stories) {
		const journal = new Journal(id, racine);
		const outillage = {
			root,
			story: lireStory("e01s05", root),
			exploration,
			reutiliser,
			lancer: async (c: Controle): Promise<Preuve> => {
				const manifeste = c.commande[2] ?? "";
				lancements.push(manifeste);
				const [code, sortie, duree = 40] = issues[manifeste] ?? [3, "error\n"];
				const ref = await journal.objets.putText(sortie);
				const debut = Date.now();
				return {
					controle: c.id,
					commande: c.commande,
					revision: "head",
					verdict: code === 0 ? "PASS" : "FAIL",
					started_at: new Date(debut).toISOString(),
					ended_at: new Date(debut + 25).toISOString(),
					facts: { exit_code: code, duration_ms: duree },
					echecs: [],
					artifacts: [{ name: "stdout", ref }],
					sandbox: "unconfined",
				};
			},
			lire: async (digest: string) => {
				const octets = await journal.objets.get(digest);
				return octets ? new TextDecoder().decode(octets) : null;
			},
		};
		const preparation = await preparer(outillage, journal);
		const e = journal.dernier("preparation");
		const r = (e?.resultats ?? []) as Resultat[];
		verdicts.push({ verte: preparation.verte, issues: r.map((x) => [x.manifeste, x.issue]) });
		resultats.push(r);
		comptes.push(preparation.verte ? preparation.resume : preparation.motif);
	}
	return { lancements, verdicts, resultats, comptes, racine };
}

describe("the explorations of a preparation are reused across stories without changing a verdict", () => {
	it("activer la réutilisation ne change aucun verdict du corpus et réduit les appels effectivement observés", async () => {
		const root = depotAvecCompagnon(compagnon(modeles([MANIFESTE, BORNE])), FICHIERS);
		const stories = ["e01s05", "e01s06", "e01s07"];
		const sans = await examinerCorpus(root, stories, false);
		const avec = await examinerCorpus(root, stories, true);

		assert.deepEqual(avec.verdicts, sans.verdicts, "reuse changes no verdict of the corpus");
		assert.equal(sans.lancements.length, 6, "without reuse every preparation explores both models");
		assert.equal(avec.lancements.length, 2, "with reuse the models are explored once, by the first preparation");

		const [premier, ...suivants] = avec.resultats;
		for (const r of premier ?? []) {
			assert.equal(r.reutilise, null, `${r.manifeste} ran`);
			assert.equal(r.duree_ms, 40, "the journal keeps the duration the exploration really ran");
			assert.match(r.motif ?? "", /aucune exploration antérieure/, "the journal says why it ran");
		}
		const cites = suivants.flat();
		assert.equal(cites.length, 4);
		for (const r of cites) {
			assert.equal(r.reutilise?.story, "e01s05", `${r.manifeste} cites the exploration of the first preparation`);
			assert.equal(r.duree_ms, null, "a citation claims no execution");
			assert.equal(r.motif, null);
			assert.equal(typeof r.recherche_ms, "number", "the journal keeps the time the lookup took");
			const original = premier?.find((p) => p.manifeste === r.manifeste);
			assert.equal(r.trace?.digest, original?.trace?.digest, "the citation points at the original output");
		}
		for (const r of sans.resultats.flat()) assert.equal(r.reutilise, null, "reuse turned off cites nothing");
	});

	it("an altered output, an inconclusive exploration or a changed model is explored again, with the reason", async () => {
		const root = depotAvecCompagnon(compagnon(modeles([MANIFESTE, BORNE])), FICHIERS);
		const premier = await examinerCorpus(root, ["e01s05"], true);
		const trace = premier.resultats[0]?.find((r) => r.manifeste === MANIFESTE)?.trace?.digest ?? "";
		const objet = new Journal("e01s05", premier.racine).objets.pathFor(trace);
		chmodSync(objet, 0o644);
		writeFileSync(objet, "an output nobody produced\n");
		const altere = await examinerCorpus(root, ["e01s06"], true, ISSUES, premier.racine);
		assert.deepEqual(altere.lancements, [MANIFESTE], "the altered output is explored again, the intact one cited");
		assert.match(altere.resultats[0]?.[0]?.motif ?? "", /altérée/);

		const indetermine: Record<string, Issue> = { ...ISSUES, [MANIFESTE]: [2, "inconclusive\n"] };
		const racine = tempDir("495-", cleanups);
		await examinerCorpus(root, ["e01s05"], true, indetermine, racine);
		const ensuite = await examinerCorpus(root, ["e01s06"], true, indetermine, racine);
		assert.deepEqual(ensuite.lancements, [MANIFESTE], "an inconclusive exploration is never cited");
		assert.match(ensuite.resultats[0]?.[0]?.motif ?? "", /aucune exploration antérieure concluante/);

		writeFileSync(`${root}/specs/formal/borne/Borne.tla`, "---- MODULE Borne ----\nVARIABLE x\n====\n");
		const change = await examinerCorpus(root, ["e01s07"], true, ISSUES, premier.racine);
		assert.ok(change.lancements.includes(BORNE), "a changed model is explored again");
		const borne = change.resultats[0]?.find((r) => r.manifeste === BORNE);
		assert.match(borne?.motif ?? "", /aucune exploration antérieure concluante/, "the journal says why it ran");
	});

	it("a module TLC reports it processed that the reading of the imports missed forbids citing its exploration", async () => {
		const masque = "specs/formal/masque/manifest.json";
		const cache = "specs/formal/masque/Cache.tla";
		const fichiers = {
			// The import sits between the delimiters of a comment inside strings: the reading of the imports drops it,
			// TLC reads it.
			"specs/formal/masque/Masque.tla":
				'---- MODULE Masque ----\nS == "(*"\nI == INSTANCE Cache\nT == "*)"\nVARIABLE x\nInit == x = 0\nInv == I!Ok\n====\n',
			"specs/formal/masque/Masque.cfg": "INIT Init\nINVARIANT Inv\n",
			[masque]: JSON.stringify({ model: "Masque.tla", config: "Masque.cfg", required_properties: ["Inv"] }),
			[cache]: "---- MODULE Cache ----\nOk == TRUE\n====\n",
		};
		const sortie =
			"Masque.tla with Masque.cfg: completed — PASS for the model under its bounds\nmodules: Cache, Masque\n";
		const issues: Record<string, Issue> = { [masque]: [0, sortie] };
		const root = depotAvecCompagnon(compagnon(modeles([masque])), fichiers);
		const premier = await examinerCorpus(root, ["e01s05"], true, issues);
		assert.deepEqual(premier.lancements, [masque]);

		writeFileSync(join(root, cache), "---- MODULE Cache ----\nOk == FALSE\n====\n");
		const ensuite = await examinerCorpus(root, ["e01s06"], true, issues, premier.racine);
		assert.deepEqual(
			ensuite.lancements,
			[masque],
			"a module TLC read outside the identity has the model explored again",
		);
		assert.equal(ensuite.resultats[0]?.[0]?.reutilise, null, "nothing cites the exploration of the former Cache");
		assert.match(ensuite.resultats[0]?.[0]?.motif ?? "", /Cache/, "the journal names the module the identity missed");
	});

	it("the account a green preparation gives the red-green names the story whose exploration it cites", async () => {
		const root = depotAvecCompagnon(compagnon(modeles([MANIFESTE])), FICHIERS);
		const corpus = await examinerCorpus(root, ["e01s05", "e01s06"], true);
		assert.doesNotMatch(corpus.comptes[0] ?? "", /réutilisée/, "the first preparation ran its exploration");
		assert.match(corpus.comptes[1] ?? "", /: completed, sortie sha256:\w+, exploration de e01s05 réutilisée/);
	});

	it("an exploration whose runner measured no duration keeps the span between its start and its end", async () => {
		const root = depotAvecCompagnon(compagnon(modeles([MANIFESTE])), FICHIERS);
		const corpus = await examinerCorpus(root, ["e01s05"], true, { [MANIFESTE]: [0, COMPLETED, null] });
		assert.equal(corpus.resultats[0]?.[0]?.duree_ms, 25);
	});

	it("a checker that differs from HEAD forbids citing an exploration, and the journal says so", async () => {
		const root = depotAvecCompagnon(compagnon(modeles([MANIFESTE, BORNE])), FICHIERS);
		const premier = await examinerCorpus(root, ["e01s05"], true);
		mkdirSync(join(root, "scripts"), { recursive: true });
		writeFileSync(join(root, "scripts", "check-formal.ts"), "// a checker nobody committed\n");
		const ensuite = await examinerCorpus(root, ["e01s06"], true, ISSUES, premier.racine);
		assert.deepEqual(ensuite.lancements, [MANIFESTE, BORNE], "both models are explored again");
		for (const r of ensuite.resultats[0] ?? []) assert.match(r.motif ?? "", /différent de HEAD/);
	});
});

/** The identity of `controle` on the manifest of the test story, or the inputs that keep it from having one. */
async function identite(root: string, controle: Controle, env: NodeJS.ProcessEnv): Promise<string> {
	const id = await identiteDExploration(root, MANIFESTE, controle, env);
	assert.ok("identite" in id, `the exploration is identified: ${"non_identifiees" in id ? id.non_identifiees : ""}`);
	return id.identite;
}

/** Runs `run` with the process reporting `property` as `value`: another Node or another platform. */
async function sous<T>(property: "version" | "platform", value: string, run: () => Promise<T>): Promise<T> {
	const was = Object.getOwnPropertyDescriptor(process, property);
	Object.defineProperty(process, property, { ...was, value });
	try {
		return await run();
	} finally {
		if (was) Object.defineProperty(process, property, was);
	}
}

describe("the identity of an exploration changes with everything it reads, and is withheld for what nobody identifies", () => {
	it("a property, the jar, the Java, a variable, the command, Node or the platform changing changes the identity", async () => {
		const root = depotAvecCompagnon(compagnon(modeles([MANIFESTE])), FICHIERS);
		const outils = tempDir("495-tool-", cleanups);
		const java = join(outils, "java");
		const jar = join(outils, "tla2tools.jar");
		writeFileSync(java, "java 21\n");
		writeFileSync(jar, "tla2tools 1.7.4\n");
		const controle: Controle = {
			id: "exploration",
			commande: [NODE, "check-formal.ts", MANIFESTE, "--java", java, "--jar", jar],
			reseau: "denied",
			timeout_ms: 60_000,
		};
		const env = { PATH: outils, HOME: "/home/owner", TMPDIR: "/tmp", LANG: "C", JAVA_HOME: "/opt/jdk-21" };
		const base = await identite(root, controle, env);
		assert.equal(await identite(root, controle, { ...env }), base, "the same reads keep the identity");

		const differe = async (raison: string, autre: () => Promise<string>) =>
			assert.notEqual(await autre(), base, raison);
		await differe("another JAVA_HOME", () => identite(root, controle, { ...env, JAVA_HOME: "/opt/jdk-17" }));
		const commande = { ...controle, commande: [...controle.commande, "--store", "/tmp/store"] };
		await differe("another command", () => identite(root, commande, env));
		await differe("another Node", () => sous("version", "v0.0.0", () => identite(root, controle, env)));
		await differe("another platform", () => sous("platform", "plan9", () => identite(root, controle, env)));
		writeFileSync(jar, "tla2tools 1.8.0\n");
		await differe("another jar at the same path", () => identite(root, controle, env));
		writeFileSync(jar, "tla2tools 1.7.4\n");
		writeFileSync(java, "java 17\n");
		await differe("another Java at the same path", () => identite(root, controle, env));
		writeFileSync(java, "java 21\n");
		assert.equal(await identite(root, controle, env), base, "the tools as they were give the identity back");
		const manifeste = JSON.stringify({ model: "Greet.tla", config: "Greet.cfg", required_properties: ["Loud"] });
		writeFileSync(join(root, MANIFESTE), manifeste);
		await differe("another required property", () => identite(root, controle, env));
	});

	it("a change committed to the checker, the script or the code of 495 it loads, changes the identity", async () => {
		const root = depotAvecCompagnon(compagnon(modeles([MANIFESTE])), FICHIERS);
		const controle = exploration(MANIFESTE);
		const env = { PATH: "" };
		const commettre = (fichier: string, contenu: string) => {
			mkdirSync(join(root, fichier, ".."), { recursive: true });
			writeFileSync(join(root, fichier), contenu);
			gitCmd(root, ["add", "-A"]);
			gitCmd(root, ["commit", "-q", "-m", `chore: ${fichier}`]);
		};
		const base = await identite(root, controle, env);
		commettre("scripts/check-formal.ts", "// another checker\n");
		const script = await identite(root, controle, env);
		assert.notEqual(script, base, "another committed check-formal.ts");
		commettre("src/formal-reader.ts", "// another reading of TLC\n");
		assert.notEqual(await identite(root, controle, env), script, "another committed file under src");
	});

	it("a Java named without a path is the one PATH finds, identified by its bytes so that its exploration is cited", async () => {
		const root = depotAvecCompagnon(compagnon(modeles([MANIFESTE])), FICHIERS);
		const outils = tempDir("495-tool-", cleanups);
		const java = join(outils, "java");
		writeFileSync(java, "java 21\n");
		const controle: Controle = {
			id: "exploration",
			commande: [NODE, "check-formal.ts", MANIFESTE],
			reseau: "denied",
			timeout_ms: 60_000,
		};
		const env = { PATH: [tempDir("495-path-", cleanups), outils].join(delimiter) };
		const base = await identite(root, controle, env);
		assert.equal(await identite(root, controle, env), base, "the same Java on PATH keeps the identity it is cited by");
		writeFileSync(java, "java 17\n");
		assert.notEqual(await identite(root, controle, env), base, "another Java at the place PATH finds it");
	});

	it("a jar or a Java not found, or a module found nowhere, leaves the exploration without an identity", async () => {
		const root = depotAvecCompagnon(compagnon(modeles([MANIFESTE])), FICHIERS);
		const env = { PATH: tempDir("495-path-", cleanups) };
		const sans = (commande: string[]) =>
			identiteDExploration(root, MANIFESTE, { id: "x", commande, reseau: "denied", timeout_ms: 60_000 }, env);

		const jar = join(root, "absent.jar");
		const sansJar = await sans([NODE, "check-formal.ts", MANIFESTE, "--java", NODE, "--jar", jar]);
		assert.deepEqual(sansJar, { non_identifiees: [jar] }, "a jar not found is not identified");
		const sansJava = await sans([NODE, "check-formal.ts", MANIFESTE]);
		assert.deepEqual(sansJava, { non_identifiees: ["java"] }, "a Java found nowhere on PATH is not identified");

		const greet = "specs/formal/greet/Greet.tla";
		writeFileSync(join(root, greet), "---- MODULE Greet ----\nEXTENDS Inconnu\n====\n");
		const sansModule = await sans([NODE, "check-formal.ts", MANIFESTE, "--java", NODE]);
		assert.deepEqual(sansModule, { non_identifiees: ["specs/formal/greet/Inconnu.tla"] });
	});
});
