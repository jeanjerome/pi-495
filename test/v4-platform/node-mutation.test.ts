/**
 * The mutation control of a Node target that installed Stryker 10.0.0 for real, qualified on its witnesses through
 * the generic runner and the platform sandbox: Stryker installed with npm at its exact version, without install
 * scripts, in a `node --test` target, the one step that opens the network running once outside the sandbox.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { type DetailedQualification, qualifyControlDetailed } from "../../src/application/qualification.ts";
import type { DetectedTechnology } from "../../src/application/stacks/stack.ts";
import type { EvidenceCandidate } from "../../src/contracts/v1/evidence.ts";
import { invocationBase } from "../helpers/execution-fixture.ts";
import { NO_QUALIFIED_SANDBOX, outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { READERS_OF_495, STACKS_OF_495 } from "../helpers/technologies.ts";

const REFS = [{ requirement_id: "VER-04", revision: 1 }];
const BASE = invocationBase();

/** A `node --test` target in TypeScript 7, whose `tsconfig.json` Stryker 10 would rewrite through an API TypeScript 7 no longer has. */
const TARGET: Record<string, string> = {
	"package.json": `${JSON.stringify({ name: "mutated", version: "1.0.0", type: "module", scripts: { test: "node --test" } }, null, 2)}\n`,
	"tsconfig.json": `${JSON.stringify({ compilerOptions: { strict: true, noEmit: true, allowJs: true }, include: ["src"] }, null, 2)}\n`,
};

/** Installs `packages` in `project` as an adoption installs them: each at its exact version, as a development dependency, without install scripts. */
function installed(project: string, packages: readonly string[]): void {
	execFileSync(
		"npm",
		["install", "--save-dev", "--save-exact", "--ignore-scripts", "--no-audit", "--no-fund", ...packages],
		{ cwd: project, stdio: "ignore", timeout: 10 * 60_000 },
	);
}

/** What a qualification printed, every run's standard output and error read back from the object store. */
async function outputsOf(objects: CasObjectStore, evidence: readonly EvidenceCandidate[]): Promise<string> {
	const texts: string[] = [];
	for (const run of evidence)
		for (const artifact of run.artifacts.filter((a) => a.name === "stdout" || a.name === "stderr")) {
			const bytes = await objects.get(artifact.ref);
			texts.push(bytes === null ? "" : new TextDecoder().decode(bytes));
		}
	return texts.join("\n");
}

/**
 * The mutation control `detection` declares on `reference`, qualified on its witnesses: the positive copy carries the
 * shared positive witness and `positiveExtra`, the negative one the mutation's own negative witness on top.
 */
async function qualifiedMutation(
	root: string,
	reference: string,
	detection: DetectedTechnology,
	positiveExtra: Record<string, string> = {},
): Promise<{ detailed: DetailedQualification; outputs: string; positive: string }> {
	const mutation = detection.controls.find((c) => c.control_id === "mutation");
	assert.ok(mutation, `the target that installed Stryker gets the mutation control: ${detection.capability_missing}`);
	const own = detection.own_negative_witness.mutation;
	assert.ok(own, "the mutation control has a negative witness of its own");
	const positive = join(root, "mutation-positive");
	const negative = join(root, "mutation-negative");
	for (const workspace of [positive, negative]) {
		cpSync(reference, workspace, { recursive: true });
		writeFiles(workspace, detection.positive_witness);
	}
	writeFiles(positive, positiveExtra);
	writeFiles(negative, own);
	const objects = new CasObjectStore(join(root, "objects"));
	const sandbox = selectSandbox({ allow_unconfined: NO_QUALIFIED_SANDBOX });
	const runner = new GenericControlRunner(sandbox.backend, objects, READERS_OF_495, {
		workspace_of: (workspacePath) => STACKS_OF_495.workspaceOf(workspacePath),
	});
	const detailed = await qualifyControlDetailed(
		runner,
		mutation,
		{
			positive_path: positive,
			negative_path: negative,
			positive_files: { ...detection.positive_witness, ...positiveExtra },
			negative_files: { ...detection.positive_witness, ...own },
		},
		BASE,
	);
	const { evidence } = detailed;
	return { detailed, outputs: await outputsOf(objects, [evidence.positive, evidence.negative]), positive };
}

describe("the mutation control of a Node target that installed Stryker 10.0.0", () => {
	const cleanups = removedAfterEach();
	const shared: string[] = [];
	let installedTarget = "";
	before(() => {
		const root = outputDir("node-mutation-target-");
		shared.push(root);
		installedTarget = join(root, "target");
		writeFiles(installedTarget, TARGET);
		installed(installedTarget, ["@stryker-mutator/core@10.0.0", "typescript@7.0.2"]);
	});
	after(() => {
		for (const dir of shared) rmSync(dir, { recursive: true, force: true });
	});

	it("sur une cible qui porte TypeScript 7.0.2 et un tsconfig.json, le contrôle de mutation est qualifié : témoin positif PASS, témoin négatif FAIL, et aucune sortie ne nomme parseConfigFileTextToJson", async () => {
		const root = outputDir("node-mutation-ts7-", cleanups);
		const reference = join(root, "reference");
		cpSync(installedTarget, reference, { recursive: true });
		const detection = STACKS_OF_495.recognise(reference, REFS);
		const { detailed, outputs } = await qualifiedMutation(root, reference, detection);
		const q = detailed.qualification;
		assert.deepEqual([q.positive, q.negative], ["PASS", "FAIL"], JSON.stringify(q.notes));
		assert.equal(outputs.includes("parseConfigFileTextToJson"), false, outputs.slice(-4000));
	});

	it("un test en échec dans la copie du témoin positif fait le témoin FAIL, et ne laisse aucun dossier sous .stryker-tmp dans cette copie", async () => {
		const root = outputDir("node-mutation-failing-", cleanups);
		const reference = join(root, "reference");
		cpSync(installedTarget, reference, { recursive: true });
		const detection = STACKS_OF_495.recognise(reference, REFS);
		const { detailed, positive } = await qualifiedMutation(root, reference, detection, {
			"test/broken.test.js":
				'import { strict as assert } from "node:assert";\nimport { test } from "node:test";\n\ntest("a test that fails", () => assert.fail("broken"));\n',
		});
		assert.equal(detailed.qualification.positive, "FAIL", JSON.stringify(detailed.qualification.notes));
		const temporary = join(positive, ".stryker-tmp");
		assert.deepEqual(existsSync(temporary) ? readdirSync(temporary) : [], [], "no working copy of Stryker is left");
	});

	it("sous une borne qui écarte test/nested/sandbox.test.js, en échec, le témoin positif de la mutation est PASS et la sortie de Stryker ne nomme pas test/nested/sandbox.test.js", async () => {
		const root = outputDir("node-mutation-bound-", cleanups);
		const reference = join(root, "reference");
		cpSync(installedTarget, reference, { recursive: true });
		writeFiles(reference, {
			"test/nested/sandbox.test.js":
				'import { strict as assert } from "node:assert";\nimport { test } from "node:test";\n\ntest("a test that fails confined", () => assert.fail("confined"));\n',
		});
		const detection = STACKS_OF_495.recognise(reference, REFS, process.execPath, [], undefined, [
			"test/*.test.js",
			"test/*.test.mjs",
		]);
		const { detailed, outputs } = await qualifiedMutation(root, reference, detection);
		assert.equal(detailed.qualification.positive, "PASS", JSON.stringify(detailed.qualification.notes));
		assert.equal(outputs.includes("test/nested/sandbox.test.js"), false, outputs.slice(-4000));
	});

	it("sous une borne qui ne nomme que test/*.test.js, la mutation lance quand même les tests .mjs de ses témoins : témoin positif PASS, témoin négatif FAIL", async () => {
		const root = outputDir("node-mutation-witness-bound-", cleanups);
		const reference = join(root, "reference");
		cpSync(installedTarget, reference, { recursive: true });
		const detection = STACKS_OF_495.recognise(reference, REFS, process.execPath, [], undefined, ["test/*.test.js"]);
		const { detailed } = await qualifiedMutation(root, reference, detection);
		const q = detailed.qualification;
		assert.deepEqual([q.positive, q.negative], ["PASS", "FAIL"], JSON.stringify(q.notes));
	});
});
