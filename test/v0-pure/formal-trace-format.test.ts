/**
 * The format of the traces the kernel replays from specs/formal/change-lifecycle: an abstract action is
 * translated only through the closed mapping to kernel commands, and a trace names the property it protects.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	ACTION_MAPPING,
	TRACE_FORMAT,
	fromCounterexample,
	loadTrace,
	observeKernel,
} from "../support/formal-traces.ts";
import { Runner, candidate, tick, KERNEL } from "../helpers/change-fixture.ts";

const MODEL = "specs/formal/change-lifecycle";
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const counterexample = (name: string) => readJson(`${MODEL}/counterexamples/${name}.json`);

function validTrace(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		format: TRACE_FORMAT,
		name: "launch-only",
		kind: "valid",
		property: "FreshAcceptance",
		source: "test",
		human_acceptance: false,
		steps: [
			{
				step: 2,
				action: "Launch",
				args: { control: "k1" },
				expect: { phase: "verifying", status: "ready", outcome: "pending", attempt: 1, evidence: [] },
			},
		],
		...over,
	};
}

describe("formal trace format", () => {
	it("une action inconnue et une trace dépourvue de propriété sont refusées", () => {
		const unknown = validTrace({ steps: [{ step: 2, action: "Teleport", args: {}, expect: null }] });
		assert.throws(() => loadTrace(unknown), /Teleport/, "an action absent from the mapping is refused, naming it");
		const { property: _, ...propertyless } = validTrace();
		assert.throws(() => loadTrace(propertyless), /property/, "a trace without a property is refused");
		assert.throws(
			() => loadTrace(validTrace({ property: "Progress" })),
			/Progress/,
			"a liveness property is no trace's",
		);

		const tlc = counterexample("stale-proof") as { trace: { action: string }[] };
		const renamed = { ...tlc, trace: tlc.trace.map((s, i) => (i === 3 ? { ...s, action: "Teleport" } : s)) };
		let loaded: unknown = null;
		assert.throws(
			() => {
				loaded = fromCounterexample(renamed, "stale-proof.json");
			},
			/step 4: action Teleport has no translation to kernel commands/,
			"a counterexample with an untranslatable action is not skipped",
		);
		assert.equal(loaded, null, "no trace, hence no conformance result, comes out of it");
	});

	it("refuses a trace of another format version", () => {
		assert.throws(() => loadTrace(validTrace({ format: 2 })), /format 2.*1/);
	});

	it("refuses an adverse action in a valid trace, and an adverse trace without one", () => {
		const step = { step: 2, action: "ResumeAdoptingRuns", args: {}, expect: null };
		assert.throws(() => loadTrace(validTrace({ steps: [step] })), /ResumeAdoptingRuns.*adverse/);
		assert.throws(() => loadTrace(validTrace({ kind: "adverse" })), /no adverse action/);
	});

	it("maps exactly the actions of the model to the kernel command its manifest names, and the mutants' faults", () => {
		const manifest = readJson(`${MODEL}/manifest.json`) as { actions: Record<string, { command: string }> };
		const adopted = Object.entries(ACTION_MAPPING).filter(([, m]) => !m.adverse);
		assert.deepEqual(adopted.map(([a]) => a).sort(), Object.keys(manifest.actions).sort());
		for (const [action, mapping] of adopted) {
			const issued: readonly string[] = mapping.commands;
			assert.ok(
				issued.includes(manifest.actions[action]!.command),
				`${action} issues ${manifest.actions[action]!.command}`,
			);
		}
		const faults = ["stale-proof", "accept-exhausted", "forged-acceptance"].flatMap((n) =>
			(counterexample(n) as { trace: { action: string }[] }).trace
				.map((s) => s.action)
				.filter((a) => a !== "Initial predicate" && !(a in manifest.actions)),
		);
		const adverse = Object.entries(ACTION_MAPPING).filter(([, m]) => m.adverse);
		assert.deepEqual(adverse.map(([a]) => a).sort(), [...new Set(faults)].sort());
	});

	it("reads the archived stale-proof counterexample as the late-evidence sequence, expectations stopping at the fault", () => {
		const trace = fromCounterexample(counterexample("stale-proof"), "stale-proof.json");
		assert.equal(trace.format, TRACE_FORMAT);
		assert.equal(trace.kind, "adverse");
		assert.equal(trace.property, "FreshAcceptance");
		assert.equal(trace.human_acceptance, false);
		assert.deepEqual(
			trace.steps.map((s) => s.action),
			[
				"Launch",
				"Launch",
				"ReviseProtocol",
				"Requalify",
				"StartAttempt",
				"Freeze",
				"Pause",
				"ResumeAdoptingRuns",
				"Deliver",
				"Deliver",
				"Complete",
				"EvaluateG5",
			],
		);
		assert.deepEqual(trace.steps[0]?.args, { control: "k1" });
		assert.deepEqual(trace.steps[5]?.args, { cand: 1 });
		assert.deepEqual(trace.steps[8]?.args, { control: "k1", cand: 1, ran: 1, verdict: "PASS" });
		assert.deepEqual(trace.steps[2]?.expect, {
			phase: "qualification",
			status: "ready",
			outcome: "pending",
			attempt: 1,
			evidence: [],
		});
		assert.deepEqual(trace.steps[6]?.expect, {
			phase: "verifying",
			status: "paused",
			outcome: "pending",
			attempt: 2,
			evidence: [],
		});
		assert.ok(
			trace.steps.slice(7).every((s) => s.expect === null),
			"the kernel is not asked to reproduce the mutant's state",
		);
	});

	it("observes the kernel as the model does: a running verification and a completed change read as ready", () => {
		const r = new Runner();
		const c = candidate("c1");
		r.toImplementing().implement().freeze(c);
		r.run({ type: "verification.start", at: tick(), actor: KERNEL, operation_id: "op", idempotency_key: "k" });
		assert.equal(r.s.status, "running");
		assert.deepEqual(observeKernel(r.s), {
			phase: "verifying",
			status: "ready",
			outcome: "pending",
			attempt: 1,
			evidence: [],
		});
		r.run({ type: "verification.complete", at: tick(), actor: KERNEL, operation_id: "op" });
		assert.equal(observeKernel(r.s).phase, "deciding");
	});
});
