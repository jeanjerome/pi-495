import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { exploreManifest, formalToolingMissing } from "../helpers/check-formal.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";

const MODEL = join(import.meta.dirname, "..", "..", "specs", "formal", "change-lifecycle");

/** Each probe says an outcome is unreachable: the counterexample TLC finds to it is a path that reaches it. */
const PROBES = [
	{ manifest: "reach-acceptance.manifest.json", property: "AcceptanceIsUnreachable" },
	{ manifest: "reach-refusal.manifest.json", property: "RefusalIsUnreachable" },
	{ manifest: "reach-human-wait.manifest.json", property: "HumanWaitIsUnreachable" },
	{ manifest: "reach-stop.manifest.json", property: "StopIsUnreachable" },
];

let store: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	store = outputDir("change-model-", cleanups);
});

describe("the exploration of the change-lifecycle model", { skip: formalToolingMissing }, () => {
	it("the adopted model terminates and the accepted, refused and human-wait outcomes are reachable", async () => {
		const adopted = await exploreManifest(join(MODEL, "manifest.json"), store);
		assert.equal(adopted.report?.outcome, "completed", adopted.output);
		assert.equal(adopted.report?.pass, true);
		const required = (
			JSON.parse(readFileSync(join(MODEL, "manifest.json"), "utf8")) as { required_properties: string[] }
		).required_properties;
		for (const name of required)
			assert.ok(
				adopted.report?.result?.properties.some((p) => p.name === name && p.verified),
				`${name} is verified on the whole state space`,
			);
		for (const probe of PROBES) {
			const { report, output } = await exploreManifest(join(MODEL, probe.manifest), store);
			assert.equal(report?.outcome, "counterexample", `${probe.manifest}: ${output}`);
			assert.equal(report?.result?.counterexample?.property, probe.property, `${probe.manifest} reaches its outcome`);
		}
	});

	it("once humans are assumed to respond, every behaviour ends accepted or stopped", async () => {
		const { report, output } = await exploreManifest(join(MODEL, "humans-respond.manifest.json"), store);
		assert.equal(report?.outcome, "completed", output);
		assert.deepEqual(report?.result?.properties, [{ name: "Settles", kind: "temporal", verified: true }]);
	});

	it("each human wait may never end when the humans answer only the other one, and the humans' assumption alone settles nothing", async () => {
		for (const half of [
			{ manifest: "kernel-and-resume.manifest.json", wait: "decision_required" },
			{ manifest: "kernel-and-answer.manifest.json", wait: "paused" },
		]) {
			const { report, output } = await exploreManifest(join(MODEL, half.manifest), store);
			assert.equal(report?.outcome, "counterexample", `${half.manifest}: ${output}`);
			assert.deepEqual(
				report?.result?.properties.map((p) => p.name),
				["Settles"],
			);
			const lastState = report?.result?.counterexample?.trace.findLast((s) => s.state !== "")?.state;
			assert.match(lastState ?? "", new RegExp(`status = "${half.wait}"`), `${half.manifest} ends in ${half.wait}`);
		}
		const humansAlone = await exploreManifest(join(MODEL, "humans-alone.manifest.json"), store);
		assert.equal(humansAlone.report?.outcome, "counterexample", humansAlone.output);
		assert.deepEqual(
			humansAlone.report?.result?.properties.map((p) => p.name),
			["Settles"],
		);
	});

	it("the exploration declares the finite domain it covers", async () => {
		const { report, output } = await exploreManifest(join(MODEL, "manifest.json"), store);
		assert.deepEqual(
			report?.result?.bounds,
			{ Controls: "{k1, k2}", MaxAttempts: "2", MaxRevisions: "2", MaxInterruptions: "1" },
			output,
		);
	});
});
