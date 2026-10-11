/**
 * The prepared suite of a pi-495-shaped target under the stable controller: the suite its technology detects runs the
 * whole tree, where some tests launch a sandbox of their own and the whole run outlasts the delay of the control.
 * Confined, without a nested sandbox, the prepared suite is judged on the reference within that delay because the
 * controller's profile names the test files the suite runs — a profile the candidate never writes.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ProjectControlDeclaration } from "../../src/contracts/v1/config.ts";
import { recipe } from "../helpers/acceptance-recipe.ts";
import { runOnPi495Shape, ShortensTheSuiteDelay } from "../helpers/dogfood.ts";
import { NO_QUALIFIED_SANDBOX, removedAfterEach } from "../helpers/fixtures.ts";

removedAfterEach();

const CONTROLLER = join(import.meta.dirname, "..", "..", "specs", "experiments", "e38", "dogfood", "config.json");
const { policy } = JSON.parse(readFileSync(CONTROLLER, "utf8")) as {
	policy: { project_controls: ProjectControlDeclaration[]; suite_paths: string[] };
};
const LAYERS = policy.project_controls.find((c) => c.control_id === "lint-layers")!;

/** The delay the bench grants the suite: the ten minutes of the control, cut so the bench runs in seconds. */
const SUITE_DELAY_MS = 20_000;

/**
 * The generations of pi-495 in miniature: a pure one that passes confined, and a kernel one whose tests launch a
 * sandbox of their own and run past any delay.
 */
const GENERATIONS = {
	"test/v0-pure/greet.test.ts":
		'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { greet } from "../../src/greet.js";\ntest("greet greets", () => { assert.equal(greet("x"), "Hello, x"); });\n',
	"test/v2-kernel/sandbox.test.js":
		'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { spawnSync } from "node:child_process";\nconst nested = process.platform === "darwin" ? ["sandbox-exec", ["-p", "(version 1)(allow default)", "/usr/bin/true"]] : ["bwrap", ["--ro-bind", "/", "/", "true"]];\ntest("a sandbox of its own runs", () => { assert.equal(spawnSync(...nested).status, 0); });\n',
	"test/v2-kernel/campaign.test.js":
		'import { test } from "node:test";\ntest("a campaign that outlasts the delay", () => new Promise(() => { setInterval(() => {}, 1000); }));\n',
};

describe("the prepared suite of pi-495 under its stable controller", {
	skip: NO_QUALIFIED_SANDBOX && "no sandbox backend qualifies on this machine",
}, () => {
	it("sur une cible façonnée comme pi-495, dont des tests lancent eux-mêmes un bac à sable et dont la suite entière dépasse le délai du contrôle, la suite préparée est jugée PASS ou FAIL sur la référence, jamais INDETERMINATE par un dépassement de délai, et G2 fige le protocole", async () => {
		const { t, change_id, state, steps } = await runOnPi495Shape(
			{},
			{
				project_controls: [LAYERS],
				acceptance_recipe: recipe(["node", "recipe.js", "{candidate}"]),
				budgets: { max_attempts: 1 },
				suite_paths: policy.suite_paths,
			},
			{ reference: GENERATIONS, controls: (real) => new ShortensTheSuiteDelay(real, SUITE_DELAY_MS) },
		);
		const preparations = t.ledger
			.listArtifacts(change_id, "preparation")
			.filter((a) => a.ref.artifact_id.startsWith("prep_"));
		assert.ok(preparations.length > 0, steps.join(" | "));
		for (const prep of preparations) {
			const record = JSON.parse(new TextDecoder().decode((await t.objects.get(prep.object))!)) as {
				on_reference: string;
				notes: string[];
			};
			assert.doesNotMatch(
				record.notes.join(" | "),
				/prepared suite is not loadable or produced no test: timeout/,
				"the prepared suite is judged within the delay of its control",
			);
			assert.ok(["PASS", "FAIL"].includes(record.on_reference), `judged ${record.on_reference} on the reference`);
		}
		assert.equal(state.gates.G2?.verdict, "PASS", `G2 freezes the protocol: ${steps.join(" | ")}`);
		assert.ok(state.protocol, "the protocol is frozen");
		assert.notEqual(state.candidate, null, "a candidate is produced under the frozen protocol");
	});
});
