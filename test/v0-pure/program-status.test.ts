import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { statusView } from "../../src/application/views.ts";
import {
	applyProgram,
	decideProgram,
	type BaselineGap,
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
		gaps: [],
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
					measure: null,
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
	it("le statut d'un programme dont la trajectoire a été adoptée avec des incréments sans champ d'écarts liste chacun avec son titre et son statut, sans écart ni état des lieux", () => {
		const created = run(null, {
			type: "program.create",
			at: tick(),
			actor: HUMAN,
			program_id: "prg_1",
			project_path: "/tmp/p",
			objective: ref("obj", "app"),
			title: "App",
		});
		const decided = decideProgram(created, {
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [increment("A", "Socle"), increment("B", "Export", ["A"])],
			milestones: [
				{ milestone_id: "M1", title: "Release", increment_ids: ["A", "B"], global_requirement_ids: [], final: true },
			],
			global_requirements: [],
			reason: "init",
		});
		assert.ok(decided.ok);
		// The adoption as the journal of a dossier recorded before increments named gaps holds it.
		const recorded = JSON.parse(
			JSON.stringify(decided.events[0], (field, value) =>
				field === "gaps" || field === "baseline" ? undefined : value,
			),
		);
		assert.equal("gaps" in recorded.increments[0], false);

		const view = statusView(applyProgram(created, recorded), null);
		assert.deepEqual(
			view.program?.increments.map((i) => [i.increment_id, i.title, i.status, i.gaps]),
			[
				["A", "Socle", "ready", []],
				["B", "Export", "planned", []],
			],
		);
		assert.equal(view.program?.baseline, null);
		assert.deepEqual(view.program?.set_aside, []);
		const fr = formatStatus(view, "fr").split("\n");
		assert.ok(fr.includes("  Incrément A (Socle): prêt"), fr.join("\n"));
		assert.ok(fr.includes("  Incrément B (Export): planifié"), fr.join("\n"));
	});
});

describe("statut d'un programme de remise aux standards", () => {
	const SURVEY_DIGEST = `sha256:${"b".repeat(64)}`;
	const REASON = "the generated mappers are rewritten by their generator on every build";
	const gap = (rule_id: string, module: string, over: Partial<BaselineGap> = {}): BaselineGap => ({
		rule_id,
		threshold: `${rule_id} threshold`,
		module,
		authorship: "proprietary",
		violations: 1,
		scope_decision: null,
		...over,
	});
	const key = (rule_id: string, module: string) => ({ rule_id, module, authorship: "proprietary" as const });

	/** A and B remove the three gaps of the proprietary code; the gap of the generated code is set aside with its reason. */
	function programOfStandards(): ProgramState {
		const p = run(null, {
			type: "program.create",
			at: tick(),
			actor: HUMAN,
			program_id: "prg_2",
			project_path: "/tmp/reactor",
			objective: ref("obj", "standards"),
			title: "Standards",
		});
		return run(p, {
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [
				{
					...increment("A", "Domain"),
					gaps: [key("CyclomaticComplexity", "domain"), key("UnusedPrivateMethod", "domain")],
				},
				{ ...increment("B", "Infrastructure", ["A"]), gaps: [key("CyclomaticComplexity", "infrastructure")] },
			],
			milestones: [
				{ milestone_id: "M1", title: "Standards", increment_ids: ["A", "B"], global_requirement_ids: [], final: true },
			],
			global_requirements: [],
			baseline: {
				change_id: "chg_survey",
				reference_digest: SURVEY_DIGEST,
				gaps: [
					gap("CyclomaticComplexity", "domain", { violations: 2 }),
					gap("CyclomaticComplexity", "domain", { authorship: "generated", scope_decision: { reason: REASON } }),
					gap("CyclomaticComplexity", "infrastructure"),
					gap("UnusedPrivateMethod", "domain"),
				],
			},
			reason: "init",
		});
	}

	it("le statut d'un programme de remise aux standards nomme l'état des lieux cité, liste sous A et sous B les écarts que chacun supprime avec leur nombre à l'état des lieux, et l'écart écarté avec sa raison, en français et en anglais", () => {
		const view = statusView(programOfStandards(), null);
		assert.deepEqual(view.program?.baseline, { change_id: "chg_survey", reference_digest: SURVEY_DIGEST });
		assert.deepEqual(
			view.program?.increments.map((i) => [i.increment_id, i.gaps]),
			[
				[
					"A",
					[
						{ rule_id: "CyclomaticComplexity", module: "domain", authorship: "proprietary", violations: 2 },
						{ rule_id: "UnusedPrivateMethod", module: "domain", authorship: "proprietary", violations: 1 },
					],
				],
				[
					"B",
					[{ rule_id: "CyclomaticComplexity", module: "infrastructure", authorship: "proprietary", violations: 1 }],
				],
			],
			"each increment carries the gaps it removes with their count at the survey",
		);
		assert.deepEqual(view.program?.set_aside, [
			{ rule_id: "CyclomaticComplexity", module: "domain", authorship: "generated", violations: 1, reason: REASON },
		]);

		const fr = formatStatus(view, "fr").split("\n");
		const at = (lines: string[], line: string) => {
			const index = lines.indexOf(line);
			assert.ok(index >= 0, `${line}\n---\n${lines.join("\n")}`);
			return index;
		};
		assert.ok(
			at(fr, "  État des lieux: chg_survey, arbre sha256:bbbbbbbbbbbbbbbb") < at(fr, "  Incrément A (Domain): prêt"),
		);
		const a = at(fr, "  Incrément A (Domain): prêt");
		assert.equal(
			at(fr, "    supprime CyclomaticComplexity dans domain, code propriétaire: 2 violations à l'état des lieux"),
			a + 1,
		);
		assert.equal(
			at(fr, "    supprime UnusedPrivateMethod dans domain, code propriétaire: 1 violation à l'état des lieux"),
			a + 2,
		);
		const b = at(fr, "  Incrément B (Infrastructure): planifié");
		assert.equal(b, a + 3);
		assert.equal(
			at(
				fr,
				"    supprime CyclomaticComplexity dans infrastructure, code propriétaire: 1 violation à l'état des lieux",
			),
			b + 1,
		);
		assert.equal(
			at(fr, `  Écarté: CyclomaticComplexity dans domain, code généré: 1 violation à l'état des lieux — ${REASON}`),
			b + 2,
		);

		const en = formatStatus(view, "en").split("\n");
		assert.ok(at(en, "  Survey: chg_survey, tree sha256:bbbbbbbbbbbbbbbb") < at(en, "  Increment A (Domain): ready"));
		const ea = at(en, "  Increment A (Domain): ready");
		assert.equal(
			at(en, "    removes CyclomaticComplexity in domain, proprietary code: 2 violations at the survey"),
			ea + 1,
		);
		assert.equal(
			at(en, "    removes UnusedPrivateMethod in domain, proprietary code: 1 violation at the survey"),
			ea + 2,
		);
		const eb = at(en, "  Increment B (Infrastructure): planned");
		assert.equal(
			at(en, "    removes CyclomaticComplexity in infrastructure, proprietary code: 1 violation at the survey"),
			eb + 1,
		);
		assert.equal(
			at(en, `  Set aside: CyclomaticComplexity in domain, generated code: 1 violation at the survey — ${REASON}`),
			eb + 2,
		);
	});

	it("A et B intégrés, le statut d'un programme de remise aux standards ne le dit pas clos et écrit le jalon INDETERMINATE avec chacun des trois écarts non mesuré sur le projet intégré, en français et en anglais", () => {
		const view = statusView(integrate(integrate(programOfStandards(), "A"), "B"), null);
		assert.equal(view.program?.closed, false);
		const unmeasured = [
			"gap:CyclomaticComplexity in domain (proprietary code): not measured on the integrated project",
			"gap:CyclomaticComplexity in infrastructure (proprietary code): not measured on the integrated project",
			"gap:UnusedPrivateMethod in domain (proprietary code): not measured on the integrated project",
		].join(", ");
		const fr = formatStatus(view, "fr").split("\n");
		assert.ok(fr.includes("Programme: Standards (prg_2) — /tmp/reactor"), fr.join("\n"));
		assert.ok(fr.includes(`  Jalon M1 (Standards): INDETERMINATE — indéterminé: ${unmeasured}`), fr.join("\n"));
		const en = formatStatus(view, "en").split("\n");
		assert.ok(en.includes("Program: Standards (prg_2) — /tmp/reactor"), en.join("\n"));
		assert.ok(en.includes(`  Milestone M1 (Standards): INDETERMINATE — indeterminate: ${unmeasured}`), en.join("\n"));
	});
});

describe("statut d'un programme mesuré sur le projet intégré", () => {
	const REASON = "the generated mappers are rewritten by their generator on every build";
	const BROKER = "the message broker client is replaced with the next platform release";
	const LEGACY = "the legacy helpers are deleted with the domain rewrite";
	const gap = (rule_id: string, module: string, over: Partial<BaselineGap> = {}): BaselineGap => ({
		rule_id,
		threshold: `${rule_id} threshold`,
		module,
		authorship: "proprietary",
		violations: 1,
		scope_decision: null,
		...over,
	});
	const key = (rule_id: string, module: string) => ({ rule_id, module, authorship: "proprietary" as const });
	const PERIMETER = {
		rules: [
			{ rule_id: "CyclomaticComplexity", tool: "PMD 7.17.0" },
			{ rule_id: "UnusedPrivateMethod", tool: "PMD 7.17.0" },
		],
		modules: ["domain", "infrastructure"],
		unmeasured: [{ subject: "domain/src/test/java", reason: "test sources, which maven-pmd-plugin does not read" }],
	};

	/**
	 * A removes CyclomaticComplexity of domain; an exception tolerates UnusedPrivateMethod of domain, another
	 * CyclomaticComplexity of infrastructure; the gap of the generated code is set aside with its reason.
	 */
	function measured(
		counts: { rule_id: string; module: string; violations: number; authorship?: "generated" }[],
		at: string,
	): ProgramState {
		let p = run(null, {
			type: "program.create",
			at: tick(),
			actor: HUMAN,
			program_id: "prg_3",
			project_path: "/tmp/reactor",
			objective: ref("obj", "standards"),
			title: "Standards",
		});
		p = run(p, {
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [{ ...increment("A", "Domain"), gaps: [key("CyclomaticComplexity", "domain")] }],
			milestones: [
				{ milestone_id: "M1", title: "Standards", increment_ids: ["A"], global_requirement_ids: [], final: true },
			],
			global_requirements: [],
			baseline: {
				change_id: "chg_survey",
				reference_digest: `sha256:${"b".repeat(64)}`,
				gaps: [
					gap("CyclomaticComplexity", "domain", { violations: 2 }),
					gap("CyclomaticComplexity", "domain", { authorship: "generated", scope_decision: { reason: REASON } }),
					gap("CyclomaticComplexity", "infrastructure", {
						exception: { owner: "équipe infrastructure", due: "2027-03-31", reason: BROKER },
					}),
					gap("UnusedPrivateMethod", "domain", {
						exception: { owner: "équipe domaine", due: "2027-01-15", reason: LEGACY },
					}),
				],
			},
			reason: "init",
		});
		p = run(p, { type: "increment.bind", at: tick(), actor: KERNEL, increment_id: "A", change_id: "chg_A" });
		p = run(p, {
			type: "increment.result",
			at: tick(),
			actor: KERNEL,
			increment_id: "A",
			status: "integrated",
			note: null,
		});
		return run(p, {
			type: "milestone.evaluate",
			at,
			actor: HUMAN,
			milestone_id: "M1",
			global_verdicts: {},
			integrated_digest: DIGEST,
			measure: {
				change_id: "chg_integrated",
				gaps: counts.map((c) => ({ authorship: "proprietary" as const, ...c })),
				perimeter: PERIMETER,
			},
		});
	}
	const at = (lines: string[], line: string) => {
		const index = lines.indexOf(line);
		assert.ok(index >= 0, `${line}\n---\n${lines.join("\n")}`);
		return index;
	};

	it("le statut d'un programme dont le jalon final est PASS sur une mesure annonce la conformité dans le périmètre contrôlé, nomme chaque règle avec son outil et sa version, les modules mesurés, ce qui reste hors de la mesure, l'écart écarté avec sa raison, l'exception en cours avec son propriétaire, son échéance et sa raison, et l'exception retirée, en français et en anglais", () => {
		const p = measured(
			[
				{ rule_id: "CyclomaticComplexity", module: "infrastructure", violations: 1 },
				{ rule_id: "CyclomaticComplexity", module: "domain", violations: 1, authorship: "generated" },
			],
			"2026-12-01T09:00:00.000Z",
		);
		const view = statusView(p, null);
		assert.equal(view.program?.closed, true);
		assert.deepEqual(view.program?.milestones[0]?.evaluation?.measure?.perimeter, PERIMETER);
		assert.deepEqual(
			view.program?.exceptions.map((e) => [e.rule_id, e.module, e.owner, e.due, e.reason, e.standing]),
			[
				["CyclomaticComplexity", "infrastructure", "équipe infrastructure", "2027-03-31", BROKER, "current"],
				["UnusedPrivateMethod", "domain", "équipe domaine", "2027-01-15", LEGACY, "withdrawn"],
			],
		);

		const fr = formatStatus(view, "fr").split("\n");
		const m = at(
			fr,
			"  Jalon M1 (Standards): PASS — conforme au référentiel dans le périmètre contrôlé, sauf les écarts tolérés par une exception",
		);
		assert.deepEqual(fr.slice(m + 1, m + 12), [
			"    Mesure: chg_integrated",
			"    supprimé: CyclomaticComplexity dans domain, code propriétaire: 2 violations à l'état des lieux, 0 sur le projet intégré",
			"    toléré: CyclomaticComplexity dans infrastructure, code propriétaire: 1 violation à l'état des lieux, 1 sur le projet intégré",
			"    supprimé: UnusedPrivateMethod dans domain, code propriétaire: 1 violation à l'état des lieux, 0 sur le projet intégré",
			"    Périmètre contrôlé:",
			"      règle CyclomaticComplexity: PMD 7.17.0",
			"      règle UnusedPrivateMethod: PMD 7.17.0",
			"      modules mesurés: domain, infrastructure",
			"      hors de la mesure: domain/src/test/java — test sources, which maven-pmd-plugin does not read",
			`      hors du périmètre contrôlé: CyclomaticComplexity dans domain, code généré: 1 violation à l'état des lieux — ${REASON}`,
			`  Exception en cours: CyclomaticComplexity dans infrastructure, code propriétaire: 1 violation à l'état des lieux — équipe infrastructure, échéance 2027-03-31 — ${BROKER}`,
		]);
		at(
			fr,
			`  Exception retirée, son écart n'est plus mesuré: UnusedPrivateMethod dans domain, code propriétaire: 1 violation à l'état des lieux — équipe domaine, échéance 2027-01-15 — ${LEGACY}`,
		);

		const en = formatStatus(view, "en").split("\n");
		const e = at(
			en,
			"  Milestone M1 (Standards): PASS — conforms to the referential within the controlled perimeter, except the gaps an exception tolerates",
		);
		assert.deepEqual(en.slice(e + 1, e + 12), [
			"    Measure: chg_integrated",
			"    removed: CyclomaticComplexity in domain, proprietary code: 2 violations at the survey, 0 on the integrated project",
			"    tolerated: CyclomaticComplexity in infrastructure, proprietary code: 1 violation at the survey, 1 on the integrated project",
			"    removed: UnusedPrivateMethod in domain, proprietary code: 1 violation at the survey, 0 on the integrated project",
			"    Controlled perimeter:",
			"      rule CyclomaticComplexity: PMD 7.17.0",
			"      rule UnusedPrivateMethod: PMD 7.17.0",
			"      measured modules: domain, infrastructure",
			"      outside the measure: domain/src/test/java — test sources, which maven-pmd-plugin does not read",
			`      outside the controlled perimeter: CyclomaticComplexity in domain, generated code: 1 violation at the survey — ${REASON}`,
			`  Current exception: CyclomaticComplexity in infrastructure, proprietary code: 1 violation at the survey — équipe infrastructure, due 2027-03-31 — ${BROKER}`,
		]);
		at(
			en,
			`  Withdrawn exception, its gap is no longer measured: UnusedPrivateMethod in domain, proprietary code: 1 violation at the survey — équipe domaine, due 2027-01-15 — ${LEGACY}`,
		);
	});

	it("le statut d'un jalon FAIL sur une mesure nomme l'écart restant avec ses deux comptes et n'annonce aucune conformité", () => {
		const p = measured(
			[
				{ rule_id: "CyclomaticComplexity", module: "domain", violations: 1 },
				{ rule_id: "CyclomaticComplexity", module: "infrastructure", violations: 1 },
			],
			"2027-04-01T09:00:00.000Z",
		);
		const view = statusView(p, null);
		assert.equal(view.program?.milestones[0]?.evaluation?.verdict, "FAIL");
		assert.equal(view.program?.milestones[0]?.evaluation?.measure?.perimeter, null, "no perimeter is announced");
		const fr = formatStatus(view, "fr").split("\n");
		const m = at(fr, "  Jalon M1 (Standards): FAIL");
		assert.deepEqual(fr.slice(m + 1, m + 5), [
			"    Mesure: chg_integrated",
			"    reste: CyclomaticComplexity dans domain, code propriétaire: 2 violations à l'état des lieux, 1 sur le projet intégré",
			"    reste: CyclomaticComplexity dans infrastructure, code propriétaire: 1 violation à l'état des lieux, 1 sur le projet intégré",
			"    supprimé: UnusedPrivateMethod dans domain, code propriétaire: 1 violation à l'état des lieux, 0 sur le projet intégré",
		]);
		at(
			fr,
			`  Exception échue: CyclomaticComplexity dans infrastructure, code propriétaire: 1 violation à l'état des lieux — équipe infrastructure, échéance 2027-03-31 — ${BROKER}`,
		);
		assert.ok(!fr.some((l) => l.includes("conforme") || l.includes("Périmètre contrôlé")), fr.join("\n"));
		const en = formatStatus(view, "en").split("\n");
		at(
			en,
			"    remaining: CyclomaticComplexity in domain, proprietary code: 2 violations at the survey, 1 on the integrated project",
		);
		assert.ok(!en.some((l) => l.includes("conforms") || l.includes("Controlled perimeter")), en.join("\n"));
	});

	it("le statut d'un programme dont les écarts n'ont aucun champ d'exception liste ses écarts et son jalon INDETERMINATE, sans exception ni annonce de conformité", () => {
		let p = run(null, {
			type: "program.create",
			at: tick(),
			actor: HUMAN,
			program_id: "prg_4",
			project_path: "/tmp/reactor",
			objective: ref("obj", "standards"),
			title: "Standards",
		});
		p = run(p, {
			type: "trajectory.adopt",
			at: tick(),
			actor: HUMAN,
			increments: [{ ...increment("A", "Domain"), gaps: [key("CyclomaticComplexity", "domain")] }],
			milestones: [
				{ milestone_id: "M1", title: "Standards", increment_ids: ["A"], global_requirement_ids: [], final: true },
			],
			global_requirements: [],
			baseline: {
				change_id: "chg_survey",
				reference_digest: `sha256:${"b".repeat(64)}`,
				gaps: [gap("CyclomaticComplexity", "domain")],
			},
			reason: "init",
		});
		// The journal of a dossier recorded before exceptions: no gap carries the field.
		assert.equal("exception" in p.baseline!.gaps[0]!, false);
		p = integrate(p, "A");
		const view = statusView(p, null);
		assert.deepEqual(view.program?.exceptions, [], "a dossier without exceptions reads as one");
		assert.equal(view.program?.milestones[0]?.evaluation?.measure, null);
		const fr = formatStatus(view, "fr").split("\n");
		at(fr, "    supprime CyclomaticComplexity dans domain, code propriétaire: 1 violation à l'état des lieux");
		at(
			fr,
			"  Jalon M1 (Standards): INDETERMINATE — indéterminé: gap:CyclomaticComplexity in domain (proprietary code): not measured on the integrated project",
		);
		assert.ok(!fr.some((l) => l.includes("Exception") || l.includes("conforme")), fr.join("\n"));
	});
});
