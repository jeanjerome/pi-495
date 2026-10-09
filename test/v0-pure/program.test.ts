import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
	applyProgram,
	decideProgram,
	eligibleIncrements,
	dependentsOf,
	findCycle,
	replayProgram,
	type BaselineGap,
	type GlobalRequirement,
	type IncrementSpec,
	type MigrationGap,
	type ProgramState,
} from "../../src/domain/program/program.ts";
import type { CodeAuthorship } from "../../src/domain/survey.ts";
import { KERNEL, HUMAN, ref, tick } from "../helpers/change-fixture.ts";
import { APP_TO_INFRA, EXCEPTION, PART_CYCLE, UNMAPPED_SOURCE } from "../helpers/migration.ts";

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
		gaps: [],
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
			global_requirements: [],
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
			global_requirements: [],
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
			global_requirements: [],
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
			global_requirements: [],
			reason: "init",
		});
		p.run({ type: "increment.bind", at: tick(), actor: KERNEL, increment_id: "A", change_id: "chg_a" });
		p.run({ type: "increment.result", at: tick(), actor: KERNEL, increment_id: "A", status: "accepted", note: null });
		p.fail(
			{
				type: "trajectory.adopt",
				at: tick(),
				actor: HUMAN,
				increments: [inc("B")],
				milestones: [],
				global_requirements: [],
				reason: "drop A",
			},
			"PRECONDITION_FAILED",
		);
		p.run({
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [inc("A"), inc("B", ["A"]), inc("D", ["A"])],
			milestones: [],
			global_requirements: [],
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
				global_requirements: [],
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
			global_requirements: [],
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
			global_requirements: [],
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

describe("exigences globales d'une trajectoire (PRG-03)", () => {
	const trajectory = (global_requirements: GlobalRequirement[], milestoneGlobals: string[] = []) => ({
		type: "trajectory.adopt" as const,
		at: tick(),
		actor: HUMAN,
		increments: [inc("A"), inc("B", ["A"], { requirement_ids: ["R1"] }), inc("C", ["A"], { requirement_ids: ["R1"] })],
		milestones: [
			{
				milestone_id: "M1",
				title: "final",
				increment_ids: ["A", "B", "C"],
				global_requirement_ids: milestoneGlobals,
				final: true,
			},
		],
		global_requirements,
		reason: "init",
	});
	it("une trajectoire qui déclare une exigence globale R2 affectée ni à un incrément, ni à une vérification de jalon, ni à une décision de périmètre est refusée en nommant R2", () => {
		const p = new P().create();
		const d = decideProgram(
			p.state,
			trajectory([
				{ requirement_id: "R1", scope_decision: null },
				{ requirement_id: "R2", scope_decision: null },
			]),
		);
		assert.equal(d.ok, false, "a trajectory declaring R2 assigned to nothing is refused");
		if (!d.ok) {
			assert.equal(d.error.code, "PRECONDITION_FAILED");
			assert.match(
				d.error.message,
				/global requirement R2 is assigned neither to an increment, nor to a milestone verification, nor to a scope decision/,
			);
			assert.doesNotMatch(d.error.message, /R1/);
		}
		assert.equal(p.state?.trajectory_revision, 0);
	});
	it("une exigence globale écartée par une décision de périmètre avec sa raison, ou vérifiée par un jalon, est adoptée et l'événement d'adoption la porte avec sa décision", () => {
		const p = new P().create();
		const globals = [
			{ requirement_id: "R1", scope_decision: null },
			{ requirement_id: "R2", scope_decision: { reason: "the legacy export is retired with the next release" } },
			{ requirement_id: "R3", scope_decision: null },
		];
		p.run(trajectory(globals, ["R3"]));
		const adopted = p.events.find((e) => e.type === "trajectory.adopted");
		assert.ok(adopted && adopted.type === "trajectory.adopted");
		assert.deepEqual(adopted.global_requirements, globals);
		assert.deepEqual(adopted.milestones[0]!.global_requirement_ids, ["R3"]);
		assert.deepEqual(p.state!.global_requirements, globals);
		const blank = new P().create();
		const d = decideProgram(blank.state, trajectory([{ requirement_id: "R2", scope_decision: { reason: "  " } }]));
		assert.equal(d.ok, false, "a scope decision without its reason does not set R2 aside");
		if (!d.ok) assert.match(d.error.message, /R2/);
	});
});

describe("écarts de l'état des lieux d'une trajectoire (QLT-03)", () => {
	const THRESHOLDS: Record<string, string> = {
		CyclomaticComplexity: "a method's cyclomatic complexity is at most 10",
		UnusedPrivateMethod: "no private method is left uncalled",
	};
	const gap = (rule_id: string, module: string, over: Partial<BaselineGap> = {}): BaselineGap => ({
		rule_id,
		threshold: THRESHOLDS[rule_id] ?? rule_id,
		module,
		authorship: "proprietary",
		violations: 1,
		scope_decision: null,
		...over,
	});
	const key = (rule_id: string, module: string) => ({ rule_id, module, authorship: "proprietary" as const });
	const surveyed = [
		gap("CyclomaticComplexity", "domain"),
		gap("UnusedPrivateMethod", "domain"),
		gap("CyclomaticComplexity", "infrastructure"),
	];
	const baseline = (gaps: BaselineGap[]) => ({
		change_id: "chg_survey",
		reference_digest: `sha256:${"b".repeat(64)}`,
		gaps,
	});
	const A = inc("A", [], {
		kind: "remediation",
		gaps: [key("CyclomaticComplexity", "domain"), key("UnusedPrivateMethod", "domain")],
	});
	const B = inc("B", ["A"], { kind: "remediation", gaps: [key("CyclomaticComplexity", "infrastructure")] });
	const standards = (increments: IncrementSpec[], gaps: BaselineGap[] = surveyed) => ({
		type: "trajectory.adopt" as const,
		at: tick(),
		actor: HUMAN,
		increments,
		milestones: [
			{
				milestone_id: "M1",
				title: "standards",
				increment_ids: increments.map((i) => i.increment_id),
				global_requirement_ids: [],
				final: true,
			},
		],
		global_requirements: [],
		baseline: baseline(gaps),
		reason: "init",
	});
	it("une trajectoire dont l'état des lieux porte CyclomaticComplexity dans infrastructure, qu'aucun incrément ne supprime et qu'aucune décision de périmètre n'écarte, est refusée en nommant la règle, le module, le périmètre et son nombre de violations", () => {
		const p = new P().create();
		const d = decideProgram(p.state, standards([A]));
		assert.equal(d.ok, false, "a gap of the survey that nothing takes on refuses the adoption");
		if (!d.ok) {
			assert.equal(d.error.code, "PRECONDITION_FAILED");
			assert.match(
				d.error.message,
				/gap CyclomaticComplexity in infrastructure \(proprietary code, 1 violation\) is removed by no increment and set aside by no scope decision/,
			);
			assert.doesNotMatch(d.error.message, /in domain/);
		}
		assert.equal(p.state?.trajectory_revision, 0);
	});
	it("un incrément qui supprime CPD dans domain, que l'état des lieux ne porte pas, est refusé en nommant l'incrément et l'écart", () => {
		const p = new P().create();
		const withCpd = { ...A, gaps: [...A.gaps, key("CPD", "domain")] };
		const d = decideProgram(p.state, standards([withCpd, B]));
		assert.equal(d.ok, false, "an increment cannot remove a gap the survey does not carry");
		if (!d.ok) {
			assert.equal(d.error.code, "UNKNOWN_REFERENCE");
			assert.match(
				d.error.message,
				/increment A removes CPD in domain \(proprietary code\), a gap the cited survey does not carry/,
			);
		}
		assert.equal(p.state?.trajectory_revision, 0);
	});
	it("une trajectoire dont chaque écart est supprimé par un incrément ou écarté avec sa raison est adoptée, et l'événement d'adoption porte l'état des lieux cité, ses écarts et leurs décisions", () => {
		const p = new P().create();
		const gaps = [
			...surveyed,
			gap("CyclomaticComplexity", "domain", {
				authorship: "generated",
				scope_decision: { reason: "the generated mappers are rewritten by their generator on every build" },
			}),
		];
		p.run(standards([A, B], gaps));
		const adopted = p.events.find((e) => e.type === "trajectory.adopted");
		assert.ok(adopted && adopted.type === "trajectory.adopted");
		assert.deepEqual(adopted.baseline, baseline(gaps));
		assert.deepEqual(
			adopted.increments.map((i) => i.gaps),
			[A.gaps, B.gaps],
		);
		assert.deepEqual(p.state!.baseline, baseline(gaps));
		assert.deepEqual(replayProgram(p.events), p.state);
		const blank = new P().create();
		const unreasoned = gaps.map((g) => (g.authorship === "generated" ? { ...g, scope_decision: { reason: " " } } : g));
		const d = decideProgram(blank.state, standards([A, B], unreasoned));
		assert.equal(d.ok, false, "a scope decision without its reason sets no gap aside");
		if (!d.ok) assert.match(d.error.message, /gap CyclomaticComplexity in domain \(generated code, 1 violation\)/);
	});
	it("A et B intégrés, le jalon final d'une trajectoire adoptée sur un état des lieux est INDETERMINATE, nomme chacun des trois écarts comme non mesuré sur le projet intégré, et le programme n'est pas clos", () => {
		const p = new P().create();
		const setAside = gap("CyclomaticComplexity", "domain", {
			authorship: "generated",
			scope_decision: { reason: "the generated mappers are rewritten by their generator on every build" },
		});
		p.run(standards([A, B], [...surveyed, setAside]));
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
			p.run({
				type: "milestone.evaluate",
				at: tick(),
				actor: KERNEL,
				milestone_id: "M1",
				global_verdicts: {},
				integrated_digest: `sha256:${"a".repeat(64)}`,
			});
		}
		const final = p.state!.milestone_evaluations.at(-1)!;
		assert.equal(final.verdict, "INDETERMINATE", "the final milestone is not passed on the closures of its increments");
		assert.deepEqual(final.satisfied, ["increment:A", "increment:B"]);
		assert.deepEqual(final.indeterminate, [
			"gap:CyclomaticComplexity in domain (proprietary code): not measured on the integrated project",
			"gap:UnusedPrivateMethod in domain (proprietary code): not measured on the integrated project",
			"gap:CyclomaticComplexity in infrastructure (proprietary code): not measured on the integrated project",
		]);
		assert.equal(p.state!.closed, false);
		assert.equal(
			p.events.some((e) => e.type === "program.closed"),
			false,
		);
	});
	const integrate = (p: P, ids: string[]) => {
		for (const id of ids) {
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
	};
	const measured = (
		rule_id: string,
		module: string,
		violations: number,
		authorship: CodeAuthorship = "proprietary",
	) => ({
		rule_id,
		module,
		authorship,
		violations,
	});
	const measureBy = (gaps: ReturnType<typeof measured>[], at = tick()) => ({
		type: "milestone.evaluate" as const,
		at,
		actor: HUMAN,
		milestone_id: "M1",
		global_verdicts: {},
		integrated_digest: `sha256:${"a".repeat(64)}`,
		measure: {
			change_id: "chg_integrated",
			gaps,
			perimeter: { rules: [], modules: ["domain", "infrastructure"], unmeasured: [] },
		},
	});
	const generatedSetAside = gap("CyclomaticComplexity", "domain", {
		authorship: "generated",
		scope_decision: { reason: "the generated mappers are rewritten by their generator on every build" },
	});
	it("A et B intégrés, une mesure qui ne compte plus aucun des trois écarts rend le jalon final PASS, nomme chacun supprimé avec son compte de départ et zéro, et clôt le programme", () => {
		const p = new P().create();
		const domainComplexity = gap("CyclomaticComplexity", "domain", { violations: 3 });
		p.run(standards([A, B], [domainComplexity, ...surveyed.slice(1), generatedSetAside]));
		integrate(p, ["A", "B"]);
		p.run(measureBy([measured("CyclomaticComplexity", "domain", 1, "generated")]));
		const final = p.state!.milestone_evaluations.at(-1)!;
		assert.equal(final.verdict, "PASS", "a measure that counts none of the three gaps passes the final milestone");
		assert.equal(final.measure?.change_id, "chg_integrated");
		assert.deepEqual(final.measure?.gaps, [
			{ ...key("CyclomaticComplexity", "domain"), outcome: "removed", surveyed: 3, measured: 0 },
			{ ...key("UnusedPrivateMethod", "domain"), outcome: "removed", surveyed: 1, measured: 0 },
			{ ...key("CyclomaticComplexity", "infrastructure"), outcome: "removed", surveyed: 1, measured: 0 },
			{
				...key("CyclomaticComplexity", "domain"),
				authorship: "generated",
				outcome: "set_aside",
				surveyed: 1,
				measured: 1,
			},
		]);
		assert.deepEqual(final.indeterminate, []);
		assert.equal(p.state!.closed, true);
		assert.equal(p.events.at(-1)?.type, "program.closed");
		assert.deepEqual(replayProgram(p.events), p.state);
	});
	it("une mesure qui compte encore CyclomaticComplexity 1 dans infrastructure rend le jalon FAIL en le nommant restant avec ses deux comptes, sans clôture", () => {
		const p = new P().create();
		p.run(standards([A, B]));
		integrate(p, ["A", "B"]);
		p.run(measureBy([measured("CyclomaticComplexity", "infrastructure", 1)]));
		const final = p.state!.milestone_evaluations.at(-1)!;
		assert.equal(final.verdict, "FAIL", "a gap the integrated project still counts fails the milestone");
		assert.deepEqual(final.measure?.gaps, [
			{ ...key("CyclomaticComplexity", "domain"), outcome: "removed", surveyed: 1, measured: 0 },
			{ ...key("UnusedPrivateMethod", "domain"), outcome: "removed", surveyed: 1, measured: 0 },
			{ ...key("CyclomaticComplexity", "infrastructure"), outcome: "remaining", surveyed: 1, measured: 1 },
		]);
		assert.equal(p.state!.closed, false);
		assert.equal(
			p.events.some((e) => e.type === "program.closed"),
			false,
		);
	});
	it("une mesure qui compte UnusedPrivateField dans infrastructure, absent de l'état des lieux de départ, rend le jalon FAIL en le nommant apparu", () => {
		const p = new P().create();
		p.run(standards([A, B]));
		integrate(p, ["A", "B"]);
		p.run(measureBy([measured("UnusedPrivateField", "infrastructure", 1)]));
		const final = p.state!.milestone_evaluations.at(-1)!;
		assert.equal(final.verdict, "FAIL", "a gap the starting survey did not carry fails the milestone");
		assert.deepEqual(final.measure?.gaps.at(-1), {
			...key("UnusedPrivateField", "infrastructure"),
			outcome: "appeared",
			surveyed: 0,
			measured: 1,
		});
		assert.deepEqual(
			final.measure?.gaps.slice(0, 3).map((g) => g.outcome),
			["removed", "removed", "removed"],
		);
		assert.equal(p.state!.closed, false);
	});
	const exception = {
		owner: "équipe infrastructure",
		due: "2027-03-31",
		reason: "the message broker client is replaced with the next platform release",
	};
	const excepted = (over: Partial<typeof exception> = {}) => [
		...surveyed.slice(0, 2),
		gap("CyclomaticComplexity", "infrastructure", { exception: { ...exception, ...over } }),
	];
	const adoptedUnderException = () => {
		const p = new P().create();
		p.run(standards([A], excepted()));
		integrate(p, ["A"]);
		return p;
	};
	it("une trajectoire dont l'écart CyclomaticComplexity dans infrastructure porte une exception avec propriétaire et échéance à venir est adoptée, et l'événement d'adoption porte l'exception ; sans propriétaire, ou échue à la date de l'adoption, elle est refusée en nommant l'écart et ce qui manque", () => {
		const p = new P().create();
		const d = decideProgram(p.state, standards([A], excepted()));
		assert.ok(d.ok, d.ok ? "" : d.error.message);
		const adopted = d.events.find((e) => e.type === "trajectory.adopted");
		assert.ok(adopted && adopted.type === "trajectory.adopted");
		assert.deepEqual(adopted.baseline?.gaps.at(-1)?.exception, exception);
		const refusals: [Partial<typeof exception>, RegExp][] = [
			[{ owner: " " }, /exception on gap CyclomaticComplexity in infrastructure \(proprietary code\) has no owner/],
			[{ due: "" }, /exception on gap CyclomaticComplexity in infrastructure \(proprietary code\) has no due date/],
			[
				{ due: "2026-09-01" },
				/exception on gap CyclomaticComplexity in infrastructure \(proprietary code\) expired on 2026-09-01, before the adoption/,
			],
		];
		for (const [over, message] of refusals) {
			const blank = new P().create();
			const refused = decideProgram(blank.state, standards([A], excepted(over)));
			assert.equal(refused.ok, false, `an exception ${JSON.stringify(over)} is refused`);
			if (!refused.ok) {
				assert.equal(refused.error.code, "PRECONDITION_FAILED");
				assert.match(refused.error.message, message);
			}
			assert.equal(blank.state?.trajectory_revision, 0);
		}
	});
	it("mesuré avant l'échéance, l'écart sous exception laisse le jalon PASS et l'évaluation le nomme toléré ; mesuré après, le jalon est FAIL et nomme l'exception échue avec son propriétaire", () => {
		const before = adoptedUnderException();
		before.run(measureBy([measured("CyclomaticComplexity", "infrastructure", 1)], "2026-12-01T09:00:00.000Z"));
		const tolerated = before.state!.milestone_evaluations.at(-1)!;
		assert.equal(tolerated.verdict, "PASS", "a gap under a current exception does not fail the milestone");
		assert.deepEqual(tolerated.measure?.gaps.at(-1), {
			...key("CyclomaticComplexity", "infrastructure"),
			outcome: "tolerated",
			surveyed: 1,
			measured: 1,
			exception: { ...exception, standing: "current" },
		});
		assert.equal(before.state!.closed, true);
		const after = adoptedUnderException();
		after.run(measureBy([measured("CyclomaticComplexity", "infrastructure", 1)], "2027-04-01T09:00:00.000Z"));
		const expired = after.state!.milestone_evaluations.at(-1)!;
		assert.equal(expired.verdict, "FAIL", "an expired exception excuses its gap no longer");
		assert.deepEqual(expired.measure?.gaps.at(-1), {
			...key("CyclomaticComplexity", "infrastructure"),
			outcome: "remaining",
			surveyed: 1,
			measured: 1,
			exception: { ...exception, standing: "expired" },
		});
		assert.equal(after.state!.closed, false);
	});
	it("une exception dont l'échéance tombe le jour de l'adoption est adoptée : son échéance n'est pas encore passée", () => {
		const p = new P().create();
		const adoption = standards([A]);
		const d = decideProgram(p.state, { ...adoption, baseline: baseline(excepted({ due: adoption.at.slice(0, 10) })) });
		assert.ok(d.ok, d.ok ? "" : d.error.message);
	});
	it("mesuré le jour de son échéance, l'écart sous exception est encore toléré et le jalon PASS", () => {
		const p = adoptedUnderException();
		p.run(measureBy([measured("CyclomaticComplexity", "infrastructure", 1)], "2027-03-31T23:00:00.000Z"));
		const final = p.state!.milestone_evaluations.at(-1)!;
		assert.equal(final.verdict, "PASS", "an exception still excuses its gap on its due date");
		assert.deepEqual(final.measure?.gaps.at(-1)?.exception, { ...exception, standing: "current" });
	});
	it("mesuré à zéro, l'écart d'une exception fait nommer l'exception retirée", () => {
		const p = adoptedUnderException();
		p.run(measureBy([], "2026-12-01T09:00:00.000Z"));
		const final = p.state!.milestone_evaluations.at(-1)!;
		assert.equal(final.verdict, "PASS");
		assert.deepEqual(final.measure?.gaps.at(-1), {
			...key("CyclomaticComplexity", "infrastructure"),
			outcome: "removed",
			surveyed: 1,
			measured: 0,
			exception: { ...exception, standing: "withdrawn" },
		});
	});
	it("une trajectoire qui ne cite aucun état des lieux et dont l'incrément A supprime CPD dans domain est refusée en nommant l'incrément et l'écart, sans événement d'adoption", () => {
		const p = new P().create();
		const { baseline: _cited, ...withoutSurvey } = standards([inc("A", [], { gaps: [key("CPD", "domain")] })]);
		const d = decideProgram(p.state, withoutSurvey);
		assert.equal(d.ok, false, "an increment cannot remove a gap when the trajectory cites no survey");
		if (!d.ok) {
			assert.equal(d.error.code, "UNKNOWN_REFERENCE");
			assert.match(
				d.error.message,
				/increment A removes CPD in domain \(proprietary code\), a gap no cited survey carries/,
			);
		}
		assert.equal(p.state?.trajectory_revision, 0);
	});
});

describe("jalon d'une migration mesuré sur le projet intégré (ARC-05)", () => {
	const exception = { owner: EXCEPTION.owner, due: EXCEPTION.due, reason: EXCEPTION.reason };
	const E1 = inc("E1");
	const E2 = inc("E2", ["E1"], { removes: [APP_TO_INFRA] });
	const STARTING_GAPS = [
		{ rule_id: UNMAPPED_SOURCE, violations: 1, scope_decision: null, exception },
		{ rule_id: APP_TO_INFRA, violations: 2, scope_decision: null },
	];
	const migrating = (gaps: MigrationGap[] = STARTING_GAPS) => {
		const p = new P().create();
		p.run({
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [E1, E2],
			milestones: [
				{
					milestone_id: "M1",
					title: "Migration",
					increment_ids: ["E1", "E2"],
					global_requirement_ids: [],
					final: true,
				},
			],
			global_requirements: [],
			migration: {
				change_id: "chg_survey",
				reference_digest: `sha256:${"b".repeat(64)}`,
				target: { alternative_id: "A2", nature: "adjust", description: "put the payment behind a port" },
				gaps,
			},
			reason: "init",
		});
		for (const id of ["E1", "E2"]) {
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
		return p;
	};
	const map = {
		parts: ["domain", "app", "infra"],
		tool: "the rules of the adopted architecture map, checked by ArchUnit",
		unseen: [{ en: "a dependency through reflection", fr: "une dépendance par réflexion" }],
	};
	const measureBy = (rules: { rule_id: string; violations: number }[], at: string) => ({
		type: "milestone.evaluate" as const,
		at,
		actor: HUMAN,
		milestone_id: "M1",
		global_verdicts: {},
		integrated_digest: `sha256:${"a".repeat(64)}`,
		map_measure: { change_id: "chg_integrated", rules, map },
	});
	const ON_DECEMBER_FIRST = "2026-12-01T09:00:00.000Z";
	it("E1 et E2 intégrés, une mesure qui compte part app may not depend on part infra 0 et every main source belongs to a part 1 le 2026-12-01 rend le jalon final de la migration PASS, nomme la première supprimée avec 2 et 0, la seconde tolérée par son exception, et clôt le programme", () => {
		const p = migrating();
		p.run(measureBy([{ rule_id: UNMAPPED_SOURCE, violations: 1 }], ON_DECEMBER_FIRST));
		const final = p.state!.milestone_evaluations.at(-1)!;
		assert.equal(final.verdict, "PASS", "a measure that no longer counts the removed rule passes the final milestone");
		assert.equal(final.map_measure?.change_id, "chg_integrated");
		assert.deepEqual(final.map_measure?.rules, [
			{
				rule_id: UNMAPPED_SOURCE,
				outcome: "tolerated",
				surveyed: 1,
				measured: 1,
				exception: { ...exception, standing: "current" },
			},
			{ rule_id: APP_TO_INFRA, outcome: "removed", surveyed: 2, measured: 0 },
		]);
		assert.deepEqual(final.map_measure?.map, map);
		assert.deepEqual(final.indeterminate, []);
		assert.equal(p.state!.closed, true);
		assert.equal(p.events.at(-1)?.type, "program.closed");
		assert.deepEqual(replayProgram(p.events), p.state);
	});
	it("une mesure qui compte encore part app may not depend on part infra 1 rend le jalon FAIL en la nommant restante avec 2 et 1, sans clôture", () => {
		const p = migrating();
		p.run(
			measureBy(
				[
					{ rule_id: UNMAPPED_SOURCE, violations: 1 },
					{ rule_id: APP_TO_INFRA, violations: 1 },
				],
				ON_DECEMBER_FIRST,
			),
		);
		const final = p.state!.milestone_evaluations.at(-1)!;
		assert.equal(final.verdict, "FAIL", "an old dependency that subsists fails the end of the migration");
		assert.deepEqual(final.map_measure?.rules.at(-1), {
			rule_id: APP_TO_INFRA,
			outcome: "remaining",
			surveyed: 2,
			measured: 1,
		});
		assert.equal(p.state!.closed, false);
		assert.equal(
			p.events.some((e) => e.type === "program.closed"),
			false,
		);
	});
	it("une mesure qui compte no cycle between the parts 1 rend le jalon FAIL en la nommant apparue", () => {
		const p = migrating();
		p.run(measureBy([{ rule_id: PART_CYCLE, violations: 1 }], ON_DECEMBER_FIRST));
		const final = p.state!.milestone_evaluations.at(-1)!;
		assert.equal(final.verdict, "FAIL", "a rule the starting survey did not find broken fails the milestone");
		assert.deepEqual(final.map_measure?.rules.at(-1), {
			rule_id: PART_CYCLE,
			outcome: "appeared",
			surveyed: 0,
			measured: 1,
		});
		assert.equal(p.state!.closed, false);
	});
	it("la même mesure le 2027-01-04 rend le jalon FAIL et nomme l'exception échue avec son propriétaire ; une mesure qui ne compte plus aucune violation nomme l'exception retirée", () => {
		const late = migrating();
		late.run(measureBy([{ rule_id: UNMAPPED_SOURCE, violations: 1 }], "2027-01-04T09:00:00.000Z"));
		const expired = late.state!.milestone_evaluations.at(-1)!;
		assert.equal(expired.verdict, "FAIL", "an expired exception excuses its rule no longer");
		assert.deepEqual(expired.map_measure?.rules[0], {
			rule_id: UNMAPPED_SOURCE,
			outcome: "remaining",
			surveyed: 1,
			measured: 1,
			exception: { ...exception, standing: "expired" },
		});
		assert.equal(late.state!.closed, false);
		const clean = migrating();
		clean.run(measureBy([], ON_DECEMBER_FIRST));
		const conforming = clean.state!.milestone_evaluations.at(-1)!;
		assert.equal(conforming.verdict, "PASS");
		assert.deepEqual(conforming.map_measure?.rules[0], {
			rule_id: UNMAPPED_SOURCE,
			outcome: "removed",
			surveyed: 1,
			measured: 0,
			exception: { ...exception, standing: "withdrawn" },
		});
		assert.equal(clean.state!.closed, true);
	});
	it("une règle écartée par une décision de périmètre que la mesure compte encore n'entre pas dans le verdict, mais le projet n'est pas conforme à la carte", () => {
		const p = migrating([
			{ rule_id: UNMAPPED_SOURCE, violations: 1, scope_decision: { reason: "the generated sources stay outside" } },
			{ rule_id: APP_TO_INFRA, violations: 2, scope_decision: null },
		]);
		p.run(measureBy([{ rule_id: UNMAPPED_SOURCE, violations: 1 }], ON_DECEMBER_FIRST));
		const final = p.state!.milestone_evaluations.at(-1)!;
		assert.equal(final.verdict, "PASS", "a rule set aside stays out of the verdict");
		assert.deepEqual(final.map_measure?.rules, [
			{ rule_id: UNMAPPED_SOURCE, outcome: "set_aside", surveyed: 1, measured: 1 },
			{ rule_id: APP_TO_INFRA, outcome: "removed", surveyed: 2, measured: 0 },
		]);
		assert.equal(
			final.map_measure?.conforms,
			false,
			"a rule still broken keeps the project from conforming to the map",
		);
		assert.equal(p.state!.closed, true);
	});
});
