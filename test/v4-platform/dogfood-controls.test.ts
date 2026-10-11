/**
 * pi-495 driving a change of pi-495 judges the candidate by every control `npm run check` chains, not only by the
 * suite its technology detects: the controls the stable controller declares run on the candidate under the sandbox
 * of the platform, and G5 requires each of them.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadConfig } from "../../src/extension/config.ts";
import { DOMAIN_IMPORTING_AN_ADAPTER, runOnPi495Shape } from "../helpers/dogfood.ts";
import { NO_QUALIFIED_SANDBOX, removedAfterEach } from "../helpers/fixtures.ts";

removedAfterEach();

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
