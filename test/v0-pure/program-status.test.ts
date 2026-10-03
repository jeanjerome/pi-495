import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { statusView } from "../../src/application/views.ts";
import {
	applyProgram,
	decideProgram,
	type IncrementSpec,
	type ProgramCommand,
	type ProgramState,
} from "../../src/domain/program/program.ts";
import { formatStatus } from "../../src/presentation/structured/text.ts";
import { HUMAN, KERNEL, ref, tick } from "../helpers/change-fixture.ts";

const DIGEST = `sha256:${"a".repeat(64)}`;

function increment(id: string, title: string, depends_on: string[] = []): IncrementSpec {
	return {
		increment_id: id,
		title,
		kind: "functional",
		value: `${title} value`,
		depends_on,
		required_capabilities: [],
		requirement_ids: [],
		closure_criterion: `${title} is integrated`,
	};
}

function run(state: ProgramState | null, command: ProgramCommand): ProgramState {
	const d = decideProgram(state, command);
	if (!d.ok) throw new Error(`${d.error.code}: ${d.error.message}`);
	let s = state;
	for (const e of d.events) s = applyProgram(s, e);
	return s!;
}

/** The program of three increments, A the common base, B and C on A, under one final milestone. */
function programOfThree(): ProgramState {
	let p = run(null, {
		type: "program.create",
		at: tick(),
		actor: HUMAN,
		program_id: "prg_1",
		project_path: "/tmp/p",
		objective: ref("obj", "app"),
		title: "App",
	});
	p = run(p, {
		type: "trajectory.adopt",
		at: tick(),
		actor: HUMAN,
		increments: [increment("A", "Socle"), increment("B", "Export", ["A"]), increment("C", "Import", ["A"])],
		milestones: [
			{ milestone_id: "M1", title: "Release", increment_ids: ["A", "B", "C"], global_requirement_ids: [], final: true },
		],
		global_requirements: [],
		reason: "init",
	});
	return p;
}

function integrate(p: ProgramState, id: string): ProgramState {
	p = run(p, { type: "increment.bind", at: tick(), actor: KERNEL, increment_id: id, change_id: `chg_${id}` });
	p = run(p, {
		type: "increment.result",
		at: tick(),
		actor: KERNEL,
		increment_id: id,
		status: "integrated",
		note: null,
	});
	return run(p, {
		type: "milestone.evaluate",
		at: tick(),
		actor: KERNEL,
		milestone_id: "M1",
		global_verdicts: {},
		integrated_digest: DIGEST,
	});
}

describe("statut d'un programme", () => {
	it("le statut d'un programme dont le jalon est évalué NOT_RUN liste A intégré, B et C prêts, et le jalon NOT_RUN avec B et C restants, en français et en anglais", () => {
		const view = statusView(integrate(programOfThree(), "A"), null);
		assert.deepEqual(
			view.program?.increments.map((i) => [i.increment_id, i.status]),
			[
				["A", "integrated"],
				["B", "ready"],
				["C", "ready"],
			],
		);
		assert.deepEqual(view.program?.milestones, [
			{
				milestone_id: "M1",
				title: "Release",
				final: true,
				evaluation: {
					verdict: "NOT_RUN",
					satisfied: ["increment:A"],
					remaining: ["increment:B", "increment:C"],
					indeterminate: [],
					integrated_digest: DIGEST,
				},
			},
		]);
		assert.equal(view.program?.closed, false);
		const fr = formatStatus(view, "fr").split("\n");
		assert.ok(fr.includes("  Incrément A (Socle): intégré"), fr.join("\n"));
		assert.ok(fr.includes("  Incrément B (Export): prêt"), fr.join("\n"));
		assert.ok(fr.includes("  Incrément C (Import): prêt"), fr.join("\n"));
		assert.ok(fr.includes("  Jalon M1 (Release): NOT_RUN — reste: increment:B, increment:C"), fr.join("\n"));
		const en = formatStatus(view, "en").split("\n");
		assert.ok(en.includes("  Increment A (Socle): integrated"), en.join("\n"));
		assert.ok(en.includes("  Increment B (Export): ready"), en.join("\n"));
		assert.ok(en.includes("  Milestone M1 (Release): NOT_RUN — remaining: increment:B, increment:C"), en.join("\n"));
	});
	it("le statut d'un programme sans évaluation dit le jalon sans évaluation", () => {
		const view = statusView(programOfThree(), null);
		assert.equal(view.program?.milestones?.[0]?.evaluation, null);
		assert.ok(formatStatus(view, "fr").split("\n").includes("  Jalon M1 (Release): sans évaluation"));
		assert.ok(formatStatus(view, "en").split("\n").includes("  Milestone M1 (Release): not evaluated"));
	});
	it("le statut d'un programme dont le jalon final est PASS dit le programme clos", () => {
		let p = programOfThree();
		for (const id of ["A", "B", "C"]) p = integrate(p, id);
		const view = statusView(p, null);
		assert.equal(view.program?.milestones?.[0]?.evaluation?.verdict, "PASS");
		assert.equal(view.program?.closed, true);
		const fr = formatStatus(view, "fr").split("\n");
		assert.ok(fr.includes("Programme: App (prg_1) — /tmp/p — clos"), fr.join("\n"));
		assert.ok(fr.includes("  Jalon M1 (Release): PASS"), fr.join("\n"));
		const en = formatStatus(view, "en").split("\n");
		assert.ok(en.includes("Program: App (prg_1) — /tmp/p — closed"), en.join("\n"));
		assert.ok(en.includes("  Milestone M1 (Release): PASS"), en.join("\n"));
	});
});
