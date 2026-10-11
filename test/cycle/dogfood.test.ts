/**
 * The dogfooding campaign hands the change to the controller identified at the start: its declaration of the controls,
 * its driver of Pi and its record are read from the controller's revision, never from the candidate's, and the build
 * it loads into Pi is read again at the end. `pi` is a stand-in that answers each command over RPC and leaves a completed
 * change in the controller's data directory; `npm` builds an extension file in place of the build and hands every other
 * command, `npm ci` included, to the real npm.
 */
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { describe, it } from "node:test";
import { gitCmd, removedAfterEach, tempDir } from "../helpers/fixtures.ts";
import { NODE } from "../helpers/cycle.ts";

const REPOSITORY = join(import.meta.dirname, "..", "..");
const LAUNCHER = "cycle/src/dogfood.ts";
const DECLARATION = "specs/experiments/e38/dogfood/config.json";
const cleanups = removedAfterEach();

/** The campaign's code, as the controller's revision carries it. */
const CAMPAIGN = [
	LAUNCHER,
	"cycle/src/dogfood-controleur.ts",
	"cycle/src/empreinte.ts",
	"cycle/src/pilote-pi.ts",
	"cycle/src/verdict-campagne.ts",
	"test/helpers/rpc-client.ts",
];

const control = (control_id: string) => ({
	control_id,
	title: `npm run ${control_id}`,
	command: ["node", "-e", ""],
	timeout_ms: 60_000,
	protected_paths: ["scripts/"],
});
const declaration = (ids: string[]) => `${JSON.stringify({ policy: { project_controls: ids.map(control) } })}\n`;

const REAL_NPM = execFileSync("sh", ["-c", "command -v npm"], { encoding: "utf8" }).trim();
const FAKE_NPM = `#!/bin/sh
if [ "$1" = run ] && [ "$2" = build ]; then
  mkdir -p dist/extension && printf 'export default () => {};\\n' > dist/extension/index.js
  exit 0
fi
exec "${REAL_NPM}" "$@"
`;

/** Records how it was launched, leaves a completed change, and answers each command; rewrites what -e loads if asked. */
const FAKE_PI = `#!${NODE}
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const args = process.argv.slice(2);
const dossier = process.env.HARNESS495_DATA_DIR;
writeFileSync(process.env.SONDE_PI, JSON.stringify({ args, cwd: process.cwd() }));
const base = new DatabaseSync(join(dossier, "state.sqlite"));
base.exec("create table changes (state text); create table evidence (control_id text, verdict text, document text, recorded_at text)");
base.prepare("insert into changes values (?)").run(JSON.stringify({ status: "completed", gates: { G2: { verdict: "PASS" }, G5: { verdict: "PASS" } } }));
base.close();
if (process.env.PI_REPLACES_THE_CONTROLLER) appendFileSync(args[args.indexOf("-e") + 1], "// replaced\\n");
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (let i = buffer.indexOf("\\n"); i >= 0; i = buffer.indexOf("\\n")) {
    const command = JSON.parse(buffer.slice(0, i));
    buffer = buffer.slice(i + 1);
    process.stdout.write(JSON.stringify({ type: "response", id: command.id, command: command.type, success: true }) + "\\n");
  }
});
`;

function commitAll(root: string, message: string): string {
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", message]);
	return gitCmd(root, ["rev-parse", "HEAD"]).trim();
}

/** A manifest and the lock `npm ci` requires of it, with a dependency on a git repository when one is named. */
function manifest(root: string, scripts: Record<string, string> = {}, git?: string): void {
	const name = { name: "pi-495", version: "9.9.9" };
	const dependencies = git ? { x: git } : {};
	const locked = git ? { "node_modules/x": { version: "1.0.0", resolved: git } } : {};
	writeFileSync(join(root, "package.json"), `${JSON.stringify({ ...name, type: "module", scripts, dependencies })}\n`);
	writeFileSync(
		join(root, "package-lock.json"),
		`${JSON.stringify({ ...name, lockfileVersion: 3, requires: true, packages: { "": { ...name, dependencies }, ...locked } })}\n`,
	);
}

/** A git repository of one package, named as npm names a dependency on it at its one commit. */
function gitDependency(): string {
	const root = tempDir("495-", cleanups);
	gitCmd(root, ["init", "-q", "-b", "main"]);
	writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "x", version: "1.0.0" })}\n`);
	return `git+file://${root}#${commitAll(root, "x")}`;
}

/** Where the launcher has extracted the controller, before it hands over to it. */
const EXTRACTED = "const script = join(controleur, CAMPAGNE_DU_CONTROLEUR);";

/**
 * A repository whose `main` is the controller, carrying the campaign and a declaration of two controls, and whose
 * `cand` branch is a candidate that drops one of them, replaces the campaign with one that fails, installs with a
 * script that copies its own declaration over the controller's, configures npm to fetch its git dependency with a
 * program of its own that does the same, and has its launcher do the same once the controller is extracted. `main` is
 * checked out.
 */
function repository(): { root: string; controller: string; candidate: string } {
	const root = tempDir("495-", cleanups);
	gitCmd(root, ["init", "-q", "-b", "main"]);
	for (const file of CAMPAIGN) {
		mkdirSync(join(root, file, ".."), { recursive: true });
		cpSync(join(REPOSITORY, file), join(root, file));
	}
	manifest(root);
	mkdirSync(join(root, DECLARATION, ".."), { recursive: true });
	writeFileSync(join(root, DECLARATION), declaration(["lint-layers", "test"]));
	const controller = commitAll(root, "controller");
	gitCmd(root, ["checkout", "-q", "-b", "cand"]);
	writeFileSync(join(root, DECLARATION), declaration(["test"]));
	writeFileSync(join(root, "cycle/src/dogfood-controleur.ts"), 'throw new Error("the candidate\'s campaign ran");\n');
	const launcher = readFileSync(join(root, LAUNCHER), "utf8");
	assert.ok(launcher.includes(EXTRACTED));
	const overwrite = `process.getBuiltinModule("node:fs").cpSync(${JSON.stringify(DECLARATION)}, join(controleur, ${JSON.stringify(DECLARATION)}));`;
	writeFileSync(join(root, LAUNCHER), launcher.replace(EXTRACTED, `${EXTRACTED}\n\t${overwrite}`));
	writeFileSync(
		join(root, "ecrase.mjs"),
		`import { cpSync } from "node:fs";\ncpSync(${JSON.stringify(DECLARATION)}, ${JSON.stringify(`../controleur/${DECLARATION}`)});\n`,
	);
	writeFileSync(join(root, ".npmrc"), "git=./gitw.sh\n");
	writeFileSync(join(root, "gitw.sh"), `#!/bin/sh\ncp ${DECLARATION} ../controleur/${DECLARATION}\nexec git "$@"\n`);
	chmodSync(join(root, "gitw.sh"), 0o755);
	manifest(root, { postinstall: "node ecrase.mjs" }, gitDependency());
	const candidate = commitAll(root, "candidate");
	gitCmd(root, ["checkout", "-q", "main"]);
	return { root, controller, candidate };
}

/** The launcher of the tree checked out in `root`, run from it with `main` as controller and `cand` as candidate. */
function launch(root: string, env: Record<string, string> = {}) {
	const home = tempDir("495-", cleanups);
	const bin = join(home, "bin");
	mkdirSync(bin);
	writeFileSync(join(bin, "npm"), FAKE_NPM);
	writeFileSync(join(bin, "pi"), FAKE_PI);
	chmodSync(join(bin, "npm"), 0o755);
	chmodSync(join(bin, "pi"), 0o755);
	const sonde = join(home, "pi.json");
	const r = spawnSync(NODE, [LAUNCHER, "--objectif", "probe", "--controleur", "main", "--candidat", "cand"], {
		cwd: root,
		env: { ...process.env, HOME: home, PATH: `${bin}${delimiter}${process.env.PATH}`, SONDE_PI: sonde, ...env },
		encoding: "utf8",
		timeout: 120_000,
	});
	return { r, sonde };
}

function campaign(root: string, env: Record<string, string> = {}) {
	const { r, sonde } = launch(root, env);
	const chemin = /releve: (.+)/.exec(r.stdout)?.[1];
	assert.ok(chemin, `the campaign writes its record: ${r.stdout}\n${r.stderr}`);
	// The controller resolves its own tree through symbolic links, as /var does to /private/var on macOS.
	const campagne = realpathSync(join(chemin, ".."));
	return {
		status: r.status,
		campagne,
		releve: JSON.parse(readFileSync(chemin, "utf8")),
		pi: JSON.parse(readFileSync(sonde, "utf8")) as { args: string[]; cwd: string },
		config: JSON.parse(readFileSync(join(campagne, "dossier", "config.json"), "utf8")),
	};
}

describe("the dogfooding campaign", () => {
	it("runs under the controller identified at the start, its declaration and its build, whatever the candidate changes", () => {
		const { root, controller, candidate } = repository();
		const run = campaign(root);
		const ids = (controls: { control_id: string }[]) => controls.map((c) => c.control_id);

		assert.deepEqual(
			ids(run.config.policy.project_controls),
			["lint-layers", "test"],
			"the controls that judge the candidate are those the controller's revision declares",
		);
		assert.deepEqual(run.releve.controles_declares, ["lint-layers", "test"]);
		assert.equal(run.releve.controleur.revision, controller);
		assert.equal(run.releve.candidat.revision, candidate);
		assert.equal(
			run.pi.args[run.pi.args.indexOf("-e") + 1],
			join(run.campagne, "controleur", "dist", "extension", "index.js"),
		);
		assert.ok(run.pi.args.includes("-ne"), "Pi loads the controller's extension and no other");
		assert.equal(run.pi.cwd, join(run.campagne, "cible"), "the change is made in the candidate's copy");
		assert.equal(run.releve.controleur.inchange, true, run.releve.defauts.join(" | "));
		assert.equal(run.status, 0, run.releve.defauts.join(" | "));

		const replaced = campaign(root, { PI_REPLACES_THE_CONTROLLER: "1" });
		assert.equal(replaced.releve.controleur.inchange, false, "a controller replaced during the campaign is noticed");
		assert.match(replaced.releve.defauts.join(" | "), /the controller's build changed during the campaign/);
		assert.equal(replaced.status, 1);
	});

	it("runs no campaign from a tree whose launcher is not the controller's", () => {
		const { root } = repository();
		gitCmd(root, ["checkout", "-q", "cand"]);
		const { r } = launch(root);

		assert.equal(r.status, 2, `a launcher the candidate rewrote does not drive the controller: ${r.stdout}`);
		assert.doesNotMatch(r.stdout, /releve:/);
		assert.match(r.stderr, /launcher/);
	});

	it("is launched by node alone, so that no line of the tree it runs from runs before the launcher", () => {
		const { scripts } = JSON.parse(readFileSync(join(REPOSITORY, "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};
		assert.deepEqual(
			Object.keys(scripts).filter((name) => scripts[name]?.includes(LAUNCHER)),
			[],
			"no package script launches the campaign: the candidate's line would load what it wants before the launcher",
		);
		const r = spawnSync(NODE, [LAUNCHER], { cwd: REPOSITORY, encoding: "utf8" });
		assert.equal(r.status, 2);
		assert.match(r.stderr, /^usage: node cycle\/src\/dogfood\.ts --objectif/);
	});
});
