import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { FrozenProtocol } from "../../src/domain/change/state.ts";
import { evaluateG5 } from "../../src/domain/gates/g5.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";
import { DIVERGENT, counterPackage, tlcStandIn, runCounterChange } from "../helpers/formal-control.ts";
import { reopenHarness } from "../helpers/harness-fixture.ts";

const FORMAL = "formal-model";

describe("G5 tells the proof on the model apart from the tests that tie it to the program", () => {
	it("TLC seul ne satisfait pas une obligation programme et un paquet révisé invalide ses anciens résultats", async () => {
		const tool = tlcStandIn();
		const pkg = counterPackage(tool);
		const policy = { ...DEFAULT_POLICY, formal_control: pkg };

		const linked = await runCounterChange(pkg);
		assert.equal(linked.state.outcome, "accepted", `model and replay green: ${linked.steps.join(" | ")}`);
		const unlinked = await runCounterChange(pkg, { replay: false });
		const exploredAlone = unlinked.state.evidence.filter((e) => e.control_id === FORMAL && e.valid).at(-1);
		assert.equal(exploredAlone?.verdict, "PASS", "the exploration of the model completed on the candidate");
		assert.notEqual(unlinked.state.outcome, "accepted", "TLC alone does not satisfy an obligation on the program");
		assert.notEqual(unlinked.state.gates.G5?.verdict, "PASS");
		assert.ok(unlinked.state.gates.G5?.indeterminate_requirements.includes("R1"), "R1 is not satisfied");
		assert.match(
			unlinked.state.gates.G5?.reasons.join(" | ") ?? "",
			/requirement R1: the model alone does not keep it — correspondence unit did not observe passing R1 replays the traces of Compteur/,
		);

		const diverging = await runCounterChange(pkg, { implementation: DIVERGENT });
		const explored = diverging.state.evidence.filter((e) => e.control_id === FORMAL && e.valid).at(-1);
		assert.equal(explored?.verdict, "PASS", "the model is green while the program diverges from it");
		assert.notEqual(diverging.state.outcome, "accepted", "a green model does not accept a program that diverges");
		assert.ok(diverging.state.gates.G5?.fail_requirements.includes("R1"), "R1 fails on the diverging program");
		const resumed = reopenHarness(diverging.t, { policy: { formal_control: pkg } });
		await resumed.harness.advance(diverging.state.change_id, { max_steps: 10 });
		const after = resumed.ledger.loadChange(diverging.state.change_id)!.state;
		assert.notEqual(after.outcome, "accepted", "a resumed change still refuses the green model of a diverging program");

		const candidate = linked.state.candidate!;
		const frozen = linked.state.protocol!;
		assert.ok(
			frozen.obligations.every((o) => !o.control_ids.includes(FORMAL)),
			"no obligation counts the exploration of the model among the controls that keep it",
		);
		assert.equal(evaluateG5(linked.state, frozen, candidate, policy).verdict, "PASS", "the exact package accepts");
		const revised = counterPackage(tool, { budget: { ...pkg.budget, workers: 2 } });
		const stale = evaluateG5(linked.state, frozen, candidate, { ...policy, formal_control: revised });
		assert.notEqual(stale.verdict, "PASS", "a revised package makes the frozen one inapplicable");
		assert.match(stale.reasons.join(" | "), /the policy adopts another formal package than the one frozen/);
		const refrozen: FrozenProtocol = {
			...frozen,
			formal: { ...frozen.formal!, package_digest: `sha256:${"2".repeat(64)}` },
		};
		const old = evaluateG5(linked.state, refrozen, candidate, { ...policy, formal_control: null });
		assert.notEqual(old.verdict, "PASS", "the results of the former package do not stand for the new one");
		assert.match(old.reasons.join(" | "), /the model of formal package sha256:2{64} was not explored on the candidate/);

		const report = await linked.t.harness.report(linked.state.change_id);
		assert.match(
			report.residual_risks.map((r) => r.statement).join(" | "),
			/the exploration of spec\/Compteur\.tla proves Borne on the model under its bounds .*not the program.*R1 rests on unit: R1 replays the traces of Compteur/,
			"the report shows the limit of the guarantee",
		);
	});

	it("an exploration of the candidate ending on a counterexample fails the program obligation and one left indeterminate does not keep it", async () => {
		const pkg = counterPackage(tlcStandIn());
		const policy = { ...DEFAULT_POLICY, formal_control: pkg };
		const { state } = await runCounterChange(pkg);
		const exploredAs = (verdict: "FAIL" | "INDETERMINATE") => ({
			...state,
			evidence: state.evidence.map((e) => (e.control_id === FORMAL ? { ...e, verdict } : e)),
		});

		const counterexample = evaluateG5(exploredAs("FAIL"), state.protocol!, state.candidate!, policy);
		assert.ok(counterexample.failed_requirements.includes("R1"), "a counterexample of the model fails R1");
		assert.match(
			counterexample.reasons.join(" | "),
			/requirement R1: the model alone does not keep it — the exploration of spec\/Compteur\.tla gave FAIL/,
		);

		const undetermined = evaluateG5(exploredAs("INDETERMINATE"), state.protocol!, state.candidate!, policy);
		assert.notEqual(undetermined.verdict, "PASS", "an exploration that proves nothing does not accept");
		assert.ok(undetermined.indeterminate_requirements.includes("R1"), "R1 is not kept on an undetermined model");
		assert.equal(undetermined.failed_requirements.includes("R1"), false, "an undetermined model fails nothing");
	});
});
