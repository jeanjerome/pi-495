import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
	applyProgram,
	decideProgram,
	eligibleIncrements,
	dependentsOf,
	findCycle,
	replayProgram,
	type IncrementSpec,
	type ProgramState,
} from "../../src/domain/program/program.ts";
import { KERNEL, HUMAN, ref, tick } from "../helpers/change-fixture.ts";

function inc(id: string, depends_on: string[] = [], over: Partial<IncrementSpec> = {}): IncrementSpec {
	return {
		increment_id: id,
		title: id,
		kind: "functional",
		value: id,
		depends_on,
		required_capabilities: [],
		requirement_ids: [`REQ-${id}`],
		closure_criterion: "accepted",
		...over,
	};
}

class P {
	state: ProgramState | null = null;
	events: Parameters<typeof applyProgram>[1][] = [];
	run(c: Parameters<typeof decideProgram>[1]) {
		const d = decideProgram(this.state, c);
		if (!d.ok) throw new Error(`${d.error.code}: ${d.error.message}`);
		for (const e of d.events) {
			this.state = applyProgram(this.state, e);
			this.events.push(e);
		}
		return this.state!;
	}
	fail(c: Parameters<typeof decideProgram>[1], code: string) {
		const d = decideProgram(this.state, c);
		assert.equal(d.ok, false);
		if (!d.ok) assert.equal(d.error.code, code, d.error.message);
	}
	create() {
		this.run({
			type: "program.create",
			at: tick(),
			actor: HUMAN,
			program_id: "prg_1",
			project_path: "/tmp/p",
			objective: ref("obj", "app"),
			title: "App",
		});
		return this;
	}
}

describe("program DAG (SA-006, SA-007, RM-006, RM-009)", () => {
	it("refuses a cyclic trajectory and locates the cycle", () => {
		const p = new P().create();
		const d = decideProgram(p.state, {
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [inc("A", ["B"]), inc("B", ["C"]), inc("C", ["A"])],
			milestones: [],
			reason: "init",
		});
		assert.equal(d.ok, false);
		if (!d.ok) {
			assert.equal(d.error.code, "CYCLE_DETECTED");
			assert.match(d.error.message, /A -> B -> C -> A/);
		}
		assert.equal(p.state?.increments.length, 0);
		assert.deepEqual(findCycle([inc("A"), inc("B", ["A"])]), null);
	});
	it("keeps independent increments eligible while a blocked increment blocks only its descendants", () => {
		const p = new P().create();
		p.run({
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [
				inc("socle", [], { kind: "preparatory" }),
				inc("A", ["socle"]),
				inc("B", ["socle"]),
				inc("C", ["A"]),
			],
			milestones: [],
			reason: "init",
		});
		assert.deepEqual(
			eligibleIncrements(p.state!).map((i) => i.increment_id),
			["socle"],
		);
		p.run({ type: "increment.bind", at: tick(), actor: KERNEL, increment_id: "socle", change_id: "chg_s" });
		p.fail(
			{ type: "increment.bind", at: tick(), actor: KERNEL, increment_id: "A", change_id: "chg_a" },
			"PRECONDITION_FAILED",
		);
		p.run({
			type: "increment.result",
			at: tick(),
			actor: KERNEL,
			increment_id: "socle",
			status: "integrated",
			note: null,
		});
		assert.deepEqual(
			eligibleIncrements(p.state!).map((i) => i.increment_id),
			["A", "B"],
		);
		p.run({ type: "increment.bind", at: tick(), actor: KERNEL, increment_id: "A", change_id: "chg_a" });
		p.run({
			type: "increment.result",
			at: tick(),
			actor: KERNEL,
			increment_id: "A",
			status: "blocked",
			note: "attempts_exhausted",
		});
		assert.deepEqual(
			eligibleIncrements(p.state!).map((i) => i.increment_id),
			["B"],
		);
		assert.deepEqual(dependentsOf(p.state!, "A"), ["C"]);
		assert.equal(p.state!.increments.find((i) => i.increment_id === "C")?.status, "planned");
	});
	it("P0 runs one producing increment at a time", () => {
		const p = new P().create();
		p.run({
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [inc("A"), inc("B")],
			milestones: [],
			reason: "init",
		});
		p.run({ type: "increment.bind", at: tick(), actor: KERNEL, increment_id: "A", change_id: "chg_a" });
		p.fail(
			{ type: "increment.bind", at: tick(), actor: KERNEL, increment_id: "B", change_id: "chg_b" },
			"OPERATION_ACTIVE",
		);
	});
	it("an accepted increment cannot vanish from a revised trajectory; revision keeps statuses (PRG-04)", () => {
		const p = new P().create();
		p.run({
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [inc("A"), inc("B", ["A"])],
			milestones: [],
			reason: "init",
		});
		p.run({ type: "increment.bind", at: tick(), actor: KERNEL, increment_id: "A", change_id: "chg_a" });
		p.run({ type: "increment.result", at: tick(), actor: KERNEL, increment_id: "A", status: "accepted", note: null });
		p.fail(
			{ type: "trajectory.adopt", at: tick(), actor: HUMAN, increments: [inc("B")], milestones: [], reason: "drop A" },
			"PRECONDITION_FAILED",
		);
		p.run({
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [inc("A"), inc("B", ["A"]), inc("D", ["A"])],
			milestones: [],
			reason: "add D",
		});
		assert.equal(p.state!.trajectory_revision, 2);
		assert.equal(p.state!.increments.find((i) => i.increment_id === "A")?.status, "accepted");
		assert.deepEqual(
			eligibleIncrements(p.state!).map((i) => i.increment_id),
			["B", "D"],
		);
		assert.deepEqual(replayProgram(p.events), p.state);
	});
	it("an agent cannot write the program", () => {
		const p = new P().create();
		p.fail(
			{
				type: "trajectory.adopt",
				at: tick(),
				actor: { ...HUMAN, actor_type: "agent", origin: "model_output" },
				increments: [inc("A")],
				milestones: [],
				reason: "x",
			},
			"POLICY_DENIED",
		);
	});
});

describe("milestones (SA-038, RM-007, RM-008, PRG-05)", () => {
	it("accepted increments with an unverified global requirement do not accept the program", () => {
		const p = new P().create();
		p.run({
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [inc("A"), inc("B")],
			milestones: [
				{
					milestone_id: "M1",
					title: "release",
					increment_ids: ["A", "B"],
					global_requirement_ids: ["PERF-1"],
					final: true,
				},
			],
			reason: "init",
		});
		for (const id of ["A", "B"]) {
			p.run({ type: "increment.bind", at: tick(), actor: KERNEL, increment_id: id, change_id: `chg_${id}` });
			p.run({
				type: "increment.result",
				at: tick(),
				actor: KERNEL,
				increment_id: id,
				status: "integrated",
				note: null,
			});
		}
		p.run({
			type: "milestone.evaluate",
			at: tick(),
			actor: KERNEL,
			milestone_id: "M1",
			global_verdicts: {},
			integrated_digest: `sha256:${"a".repeat(64)}`,
		});
		const ev = p.state!.milestone_evaluations[0]!;
		assert.equal(ev.verdict, "INDETERMINATE");
		assert.deepEqual(ev.indeterminate, ["global:PERF-1:NOT_RUN"]);
		assert.equal(p.state!.closed, false);
		p.run({
			type: "milestone.evaluate",
			at: tick(),
			actor: KERNEL,
			milestone_id: "M1",
			global_verdicts: { "PERF-1": "PASS" },
			integrated_digest: `sha256:${"a".repeat(64)}`,
		});
		assert.equal(p.state!.milestone_evaluations[1]!.verdict, "PASS");
		assert.equal(p.state!.closed, true);
	});
	it("a failing global control gives FAIL even if all increments are green", () => {
		const p = new P().create();
		p.run({
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [inc("A")],
			milestones: [
				{ milestone_id: "M1", title: "m", increment_ids: ["A"], global_requirement_ids: ["E2E"], final: false },
			],
			reason: "init",
		});
		p.run({ type: "increment.bind", at: tick(), actor: KERNEL, increment_id: "A", change_id: "c" });
		p.run({ type: "increment.result", at: tick(), actor: KERNEL, increment_id: "A", status: "accepted", note: null });
		p.run({
			type: "milestone.evaluate",
			at: tick(),
			actor: KERNEL,
			milestone_id: "M1",
			global_verdicts: { E2E: "FAIL" },
			integrated_digest: `sha256:${"a".repeat(64)}`,
		});
		assert.equal(p.state!.milestone_evaluations[0]!.verdict, "FAIL");
	});
});
