/**
 * pi-495 driving a change of pi-495 judges the candidate by every control `npm run check` chains, not only by the
 * suite its technology detects: the controls the stable controller declares run on the candidate under the sandbox
 * of the platform, and G5 requires each of them.
 */
import { strict as assert } from "node:assert";
import { existsSync, globSync, readFileSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { describe, it } from "node:test";
import { loadConfig } from "../../src/extension/config.ts";
import { DOMAIN_IMPORTING_AN_ADAPTER, runOnPi495Shape } from "../helpers/dogfood.ts";
import { NO_QUALIFIED_SANDBOX, outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const cleanups = removedAfterEach();

const REPOSITORY = join(import.meta.dirname, "..", "..");
/** The data directory of the stable controller: its `config.json` declares the controls of this repository. */
const CONTROLLER = join(REPOSITORY, "specs", "experiments", "e38", "dogfood");

/** The layer control of this repository, as the stable controller declares it. */
const LAYERS = {
	control_id: "lint-layers",
	title: "npm run lint:layers",
	command: ["node", "scripts/check-layers.ts"],
	timeout_ms: 60_000,
	protected_paths: ["scripts/"],
};

describe("the stable controller judges a change of pi-495 by the controls of npm run check", {
	skip: NO_QUALIFIED_SANDBOX && "no sandbox backend qualifies on this machine",
}, () => {
	it("un échec du contrôle de couches bloque la story même si les tests unitaires passent", async () => {
		const { state } = await runOnPi495Shape(
			{ "src/domain/rule.ts": DOMAIN_IMPORTING_AN_ADAPTER },
			{ project_controls: [LAYERS], budgets: { max_attempts: 1 } },
		);
		const candidate = state.candidate!.manifest_digest;
		const onCandidate = state.evidence.filter((e) => e.valid && e.subject_digest === candidate);
		assert.equal(onCandidate.findLast((e) => e.control_id === "unit")?.verdict, "PASS", "the unit tests pass");
		assert.notEqual(state.outcome, "accepted", "a layer violation blocks the story even though the unit tests pass");
		assert.equal(state.gates.G5?.verdict, "FAIL", JSON.stringify(state.gates.G5));
		assert.equal(onCandidate.findLast((e) => e.control_id === LAYERS.control_id)?.verdict, "FAIL");
		assert.match(state.gates.G5?.reasons.join(" | ") ?? "", /lint-layers/);
	});

	it("a producer that rewrites the layer script beside a layer violation is refused, the script being protected", async () => {
		const declared = loadConfig(CONTROLLER, {}).config.policy.project_controls ?? [];
		const layers = declared.find((c) => c.control_id === LAYERS.control_id);
		assert.ok(layers, "the stable controller declares the layer control");
		const { state } = await runOnPi495Shape(
			{ "src/domain/rule.ts": DOMAIN_IMPORTING_AN_ADAPTER, "scripts/check-layers.ts": "process.exit(0);\n" },
			{ project_controls: [layers], budgets: { max_attempts: 1 } },
		);
		assert.equal(state.gates.G4?.verdict, "FAIL", "the rewritten layer script does not stand as the control");
		assert.match(state.gates.G4?.reasons.join(" | ") ?? "", /protected path altered by the producer: scripts\//);
		assert.notEqual(state.outcome, "accepted");
	});

	it("the stable controller declares every control npm run check chains, the suite included", () => {
		const { scripts } = JSON.parse(readFileSync(join(REPOSITORY, "package.json"), "utf8"));
		const chained = String(scripts.check)
			.split("&&")
			.map((s) => s.trim().replace(/^npm run /, ""));
		const declared = loadConfig(CONTROLLER, {}).config.policy.project_controls ?? [];
		for (const name of chained) {
			const control = declared.find((c) => c.control_id === name.replace(":", "-"));
			assert.ok(control, `npm run ${name} is declared to the stable controller`);
			assert.match(control.title, new RegExp(`npm run ${name}\\b`), `${control.control_id} says which script it runs`);
		}
		assert.deepEqual(
			declared.find((c) => c.control_id === "lint-layers")?.command,
			LAYERS.command,
			"the layer control is the script npm run lint:layers runs",
		);
	});
});

describe("the stable controller's configuration of the suite of pi-495", () => {
	it("chaque fichier de test que npm run test lance est lancé par test, confiné, ou par test-sandbox, hors confinement, et par un seul des deux ; test-sandbox nomme ses fichiers un par un et il est le seul contrôle déclaré hors confinement ; tous deux protègent la configuration que ce test lit", () => {
		const declared = loadConfig(CONTROLLER, {}).config.policy.project_controls ?? [];
		assert.deepEqual(
			declared.filter((c) => c.unconfined === true).map((c) => c.control_id),
			["test-sandbox"],
			"test-sandbox is the only declared control outside confinement",
		);
		const filesOf = (id: string) => {
			const command = declared.find((c) => c.control_id === id)?.command ?? [];
			assert.deepEqual(command.slice(0, 2), ["node", "--test"], `${id} runs node --test`);
			return command.slice(2);
		};
		for (const id of ["test", "test-sandbox"])
			assert.ok(
				declared.find((c) => c.control_id === id)?.protected_paths.includes("specs/experiments/e38/dogfood/"),
				`${id} protects the configuration this test reads, which a producer would otherwise rewrite to match its files`,
			);
		const confined = filesOf("test");
		const unconfined = filesOf("test-sandbox");
		assert.ok(unconfined.length > 0, "test-sandbox runs some files");
		for (const file of unconfined) {
			assert.doesNotMatch(file, /[*?[\]{}()!]/, `test-sandbox names ${file} one by one, never by a pattern`);
			assert.ok(existsSync(join(REPOSITORY, file)), `${file} exists`);
		}
		const { scripts } = JSON.parse(readFileSync(join(REPOSITORY, "package.json"), "utf8"));
		const suite = /'([^']+)'/.exec(String(scripts.test))?.[1];
		assert.ok(suite, `npm run test names its files by a pattern: ${scripts.test}`);
		const files = globSync(suite, { cwd: REPOSITORY });
		assert.ok(files.length > 0, `npm run test runs ${suite}`);
		const judged = files.map((file) => {
			const by = [
				...(confined.some((pattern) => matchesGlob(file, pattern)) ? ["test"] : []),
				...(unconfined.includes(file) ? ["test-sandbox"] : []),
			];
			return `${file}: ${by.join(", ") || "none"}`;
		});
		assert.deepEqual(
			judged.filter((line) => !/: test(-sandbox)?$/.test(line)),
			[],
			"every file of the suite is run by exactly one of test and test-sandbox",
		);
	});

	it("la configuration du dogfooding donne test-output/ au contrôle unit, et chaque fichier de test que la technologie Node écrit comme témoin d'une suite node --test correspond à un motif de suite_paths", () => {
		const { policy } = loadConfig(CONTROLLER, {}).config;
		assert.deepEqual(policy.writable_paths?.unit, ["test-output/"], "unit may write test-output/");
		const suitePaths = policy.suite_paths ?? [];
		const { scripts } = JSON.parse(readFileSync(join(REPOSITORY, "package.json"), "utf8"));
		const target = join(outputDir("dogfood-witnesses-", cleanups), "pi-495");
		writeFiles(target, {
			"package.json": JSON.stringify({ name: "pi-495", type: "module", scripts: { test: scripts.test } }),
			"tsconfig.json": "{}\n",
			"node_modules/@stryker-mutator/core/package.json": '{"name":"@stryker-mutator/core","version":"10.0.0"}',
			"node_modules/typescript/package.json": '{"name":"typescript","version":"7.0.2"}',
		});
		const detection = STACKS_OF_495.recognise(target, [], process.execPath, [], undefined, suitePaths);
		assert.ok(
			detection.controls.some((c) => c.control_id === "mutation"),
			`the target that installed Stryker gets the mutation control: ${detection.capability_missing.join("; ")}`,
		);
		const { isTestFile } = STACKS_OF_495.testLayoutOf(target);
		const witnesses = [
			detection.positive_witness,
			detection.negative_witness,
			...Object.values(detection.own_negative_witness),
		].flatMap((files) => Object.keys(files).filter(isTestFile));
		assert.ok(witnesses.length > 0, "the technology writes test files as witnesses");
		assert.deepEqual(
			witnesses.filter((path) => !suitePaths.some((pattern) => matchesGlob(path, pattern))),
			[],
			`every witness test runs under the bound ${JSON.stringify(suitePaths)}`,
		);
	});
});
