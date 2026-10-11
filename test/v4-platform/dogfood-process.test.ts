/**
 * The dogfooding campaign of pi-495 at the scale of its witnesses: the stable controller, configured as
 * `specs/experiments/e38/dogfood/config.json` declares it, drives changes of a pi-495-shaped target under the sandbox
 * of the platform. Each witness carries one fault the new process must stop — a test tied to no requirement, a stale
 * proof, a missing acceptance run, a layer violation — and must stop it where it is announced; the conformant
 * candidate is integrated under the controller and the controls identified when the campaign started.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ProjectControlDeclaration } from "../../src/contracts/v1/config.ts";
import { evaluateG5 } from "../../src/domain/gates/g5.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";
import { recipe } from "../helpers/acceptance-recipe.ts";
import { tuiOrigin } from "../helpers/change-fixture.ts";
import { DOMAIN_IMPORTING_AN_ADAPTER, runOnPi495Shape } from "../helpers/dogfood.ts";
import { NO_QUALIFIED_SANDBOX, removedAfterEach, SHOUT_TEST } from "../helpers/fixtures.ts";
import type { PolicyOverride } from "../helpers/harness-fixture.ts";

removedAfterEach();

const CONTROLLER = join(import.meta.dirname, "..", "..", "specs", "experiments", "e38", "dogfood", "config.json");
const declared = JSON.parse(readFileSync(CONTROLLER, "utf8")).policy.project_controls as ProjectControlDeclaration[];
const LAYERS = declared.find((c) => c.control_id === "lint-layers")!;
const RECIPE = recipe(["node", "recipe.js", "{candidate}"]);

/** The campaign's policy: the controller's layer control, the acceptance run, one attempt per change. */
const campaign = (over: PolicyOverride = {}): PolicyOverride => ({
	project_controls: [LAYERS],
	acceptance_recipe: RECIPE,
	budgets: { max_attempts: 1 },
	...over,
});

const CONFORMANT = {};

describe("the dogfooding campaign of pi-495 under its stable controller", {
	skip: NO_QUALIFIED_SANDBOX && "no sandbox backend qualifies on this machine",
}, () => {
	it("les quatre témoins bloquent au point attendu et le candidat conforme est intégré sous le contrôleur initial", async () => {
		// A test tied to no requirement: its cases name none, so no prepared test can judge R1, the owner is asked what
		// to do at the qualification, and the protocol is never frozen — the change stops before any code is written.
		const untied = await runOnPi495Shape(CONFORMANT, campaign(), {
			preparedTest: SHOUT_TEST.replace("R1 shout", "shout").replace("R2 greet", "greet"),
		});
		const asked = untied.t.requested.at(-1);
		assert.equal(asked?.interaction, "IH-04", untied.steps.join(" | "));
		assert.match(asked?.question ?? "", /R1/, "the owner is told which requirement no test can judge");
		assert.equal(untied.state.gates.G2, undefined, "a test tied to no requirement does not freeze the protocol");
		assert.equal(untied.state.candidate, null, "it stops before any candidate is produced");

		// A layer violation: the unit tests pass, the declared layer control refuses the candidate at G5.
		const layered = await runOnPi495Shape({ "src/domain/rule.ts": DOMAIN_IMPORTING_AN_ADAPTER }, campaign());
		assert.equal(layered.state.gates.G4?.verdict, "PASS", layered.steps.join(" | "));
		assert.equal(layered.state.gates.G5?.verdict, "FAIL", "the layer violation stops the candidate at G5");
		assert.notEqual(layered.state.outcome, "accepted");

		// A missing acceptance run: the recipe writes no report, so nothing stands for it at G5.
		const unrun = await runOnPi495Shape(
			CONFORMANT,
			campaign({ acceptance_recipe: { ...RECIPE, command: ["node", "-e", ""] } }),
		);
		assert.equal(unrun.state.gates.G4?.verdict, "PASS", unrun.steps.join(" | "));
		assert.notEqual(unrun.state.gates.G5?.verdict, "PASS", "a missing acceptance run stops the candidate at G5");
		assert.match(unrun.state.gates.G5?.reasons.join(" | ") ?? "", /acceptance recipe/);
		assert.notEqual(unrun.state.outcome, "accepted");

		// The conformant candidate: accepted at G5, integrated once the owner authorizes it.
		const conformant = await runOnPi495Shape(CONFORMANT, campaign({ integration_enabled: true }), {
			integration: true,
		});
		const { t, change_id, state } = conformant;
		assert.equal(state.gates.G5?.verdict, "PASS", conformant.steps.join(" | "));
		const question = t.requested.at(-1)!;
		assert.equal(question.interaction, "IH-11", "integration waits for the owner");
		t.harness.answerDecision(
			change_id,
			{
				decision_id: question.decision_id,
				option_id: "integrate",
				free_text: null,
				reason: null,
				subject_revision: question.subject.revision,
				scope: null,
				expires_at: null,
			},
			tuiOrigin(),
		);
		const done = await t.harness.advance(change_id, { max_steps: 10 });
		const integrated = t.ledger.loadChange(change_id)!.state;
		assert.equal(integrated.outcome, "integrated", done.steps.join(" | "));

		// Under the initial controller: the protocol froze the controller's environment and its declared control as
		// identified when the campaign started, and every proof G5 retained ran under both.
		const protocol = integrated.protocol!;
		assert.equal(protocol.environment_digest, integrated.environment_digest);
		assert.deepEqual(protocol.project_control_ids, ["lint-layers"]);
		const candidate = integrated.candidate!;
		const policy = { ...DEFAULT_POLICY, project_controls: [LAYERS], acceptance_recipe: RECIPE };
		assert.equal(evaluateG5(integrated, protocol, candidate, policy).verdict, "PASS");
		// The controls frozen with the protocol stay those G5 requires, whatever the policy declares afterwards: one
		// declared after the freeze is not required, one dropped after it still is.
		const LINT = declared.find((c) => c.control_id === "lint-code")!;
		const added = { ...policy, project_controls: [LAYERS, LINT] };
		assert.equal(evaluateG5(integrated, protocol, candidate, added).verdict, "PASS", "a control added later");
		const unrunLayers = integrated.evidence.filter((e) => e.control_id !== "lint-layers");
		const dropped = evaluateG5({ ...integrated, evidence: unrunLayers }, protocol, candidate, {
			...policy,
			project_controls: [],
		});
		assert.ok(dropped.missing.includes("project:lint-layers"), "a control dropped after the freeze is still required");

		// A stale proof: the layer control's run on another candidate, or under another controller, stands for nothing.
		for (const [why, stale] of [
			["other candidate", { subject_digest: `sha256:${"1".repeat(64)}` }],
			["other environment", { environment_digest: `sha256:${"2".repeat(64)}` }],
		] as const) {
			const evidence = integrated.evidence.map((e) => (e.control_id === "lint-layers" ? { ...e, ...stale } : e));
			const g5 = evaluateG5({ ...integrated, evidence }, protocol, candidate, policy);
			assert.notEqual(g5.verdict, "PASS", `a proof of the layer control from an ${why} is stale`);
			assert.ok(g5.missing.includes("project:lint-layers"), g5.missing.join(", "));
		}
	});
});
