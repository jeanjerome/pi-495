/**
 * A survey of the quality of a Maven project that does not configure PMD: the owner is asked whether
 * to adopt the quality referential the Maven adapter proposes, with one fact per rule. Adopted, the
 * plugin is declared in a copy and resolved with the network open for that step alone, the referential
 * is frozen with the date of the decision and the survey measures the requirement with PMD and CPD.
 * Left aside, or when the resolution fails, the requirement is a blind spot with its reason.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import type { TestHarness } from "../helpers/harness-fixture.ts";
import {
	answer,
	GRADER,
	latestSurvey,
	lineOf,
	PMD_DECLARED_BY_PROJECT,
	qualityProject,
	surveyed,
	treeDigest,
} from "../helpers/quality-survey.ts";

async function frozenProtocol(t: TestHarness, changeId: string): Promise<Protocol> {
	const state = t.ledger.loadChange(changeId)!.state;
	assert.equal(state.gates.G2?.verdict, "PASS", state.gates.G2?.reasons.join("; ") ?? state.stop_detail ?? "");
	return (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
}

describe("a survey of quality proposes the referential of the Maven adapter", () => {
	it("un état des lieux de la qualité d'un projet Maven sans PMD demande l'adoption du référentiel avec un fait par règle et deux issues", async () => {
		const { t, maven, changeId, first } = await surveyed(qualityProject());
		assert.equal(first.stopped_because, "decision_required", first.steps.join(" | "));
		const pending = t.harness.pendingDecisions(changeId);
		assert.equal(pending.length, 1, pending.map((d) => d.interaction).join(", "));
		const asked = pending[0]!;
		assert.match(asked.question, /référentiel de qualité/);
		assert.match(asked.question, /Maven/);
		assert.deepEqual(
			asked.options.map((o) => o.id),
			["adopt_referential", "leave_blind_spot"],
			"two ways out: adopt it, or leave the requirement a blind spot",
		);
		for (const [nature, rule, threshold] of [
			["complexity", "CyclomaticComplexity", "10"],
			["complexity", "CognitiveComplexity", "15"],
			["dead_code", "UnusedPrivateMethod", "any occurrence"],
			["dead_code", "UnusedPrivateField", "any occurrence"],
			["dead_code", "UnusedLocalVariable", "any occurrence"],
			["duplication", "CPD", "100"],
		] as const) {
			const fact = asked.facts.find((f) => f.includes(` ${rule} `) || f.includes(` ${rule},`));
			assert.ok(fact, `a fact names ${rule}: ${asked.facts.join(" | ")}`);
			for (const part of [nature, threshold, "PMD 7.17.0", "2026-10-03"])
				assert.ok(fact.includes(part), `${rule}: ${part} in ${fact}`);
			assert.match(fact, /(docs\.pmd-code\.org|maven\.apache\.org)\/\S+/, `${rule}: its documentation page`);
		}
		const adopt = asked.options.find((o) => o.id === "adopt_referential")!;
		const said = `${adopt.label} ${adopt.effect}`;
		assert.ok(said.includes("maven-pmd-plugin 3.28.0"), said);
		assert.match(said, /copie du POM/);
		assert.match(said, /réseau ouvert pour cette seule étape/);
		assert.match(said, /rien n'est écrit dans le projet/);
		assert.equal(maven.resolutions(), 0, "nothing is resolved before the owner adopts");
	});

	it("l'adoption gèle le référentiel avec la date de la décision et le survey mesure l'exigence par pmd et cpd en FAIL avec un constat par violation, sans changer le digest du projet", async () => {
		const project = qualityProject();
		const before = treeDigest(project);
		// The owner answers just before midnight and the protocol is frozen the next day.
		let at = Date.parse("2026-10-03T23:59:00.000Z");
		const clock = {
			now: () => {
				at += 1;
				return new Date(at).toISOString();
			},
		};
		const { t, maven, changeId } = await surveyed(project, { clock });
		answer(t, changeId, "adopt_referential");
		at = Date.parse("2026-10-04T00:00:01.000Z");
		const after = await t.harness.advance(changeId, { max_steps: 40 });
		assert.equal(after.stopped_because, "decision_required", after.steps.join(" | "));

		const resolutions = maven.runs.filter((r) => r.command.some((part) => part.endsWith(":resolve-plugins")));
		assert.equal(resolutions.length, 1, "the plugin is resolved once");
		assert.deepEqual(
			maven.runs.filter((r) => r.network !== "denied").map((r) => r.command.join(" ")),
			resolutions.map((r) => r.command.join(" ")),
			"the network is open for the resolution and for nothing else",
		);

		const protocol = await frozenProtocol(t, changeId);
		const adoption = t.ledger
			.loadChange(changeId)!
			.state.human_decisions.find((d) => d.option_id === "adopt_referential");
		assert.ok(adoption, "the adoption is recorded");
		const referential = protocol.quality_referential;
		assert.ok(referential, "the frozen protocol carries the referential");
		assert.equal(referential.adopted_on, adoption.recorded_at.slice(0, 10), "with the date of the decision");
		assert.deepEqual(
			referential.rules.map((r) => [r.rule_id, r.control_id]),
			[
				["CyclomaticComplexity", "pmd"],
				["CognitiveComplexity", "pmd"],
				["UnusedPrivateMethod", "pmd"],
				["UnusedPrivateField", "pmd"],
				["UnusedLocalVariable", "pmd"],
				["CPD", "cpd"],
			],
			"each rule with its oracle",
		);
		for (const rule of referential.rules) {
			assert.ok(rule.threshold.length > 0 && rule.source.length > 0, rule.rule_id);
		}
		for (const id of ["pmd", "cpd"]) {
			assert.ok(
				protocol.controls.some((c) => c.control_id === id),
				`${id} is frozen`,
			);
			assert.equal(
				protocol.qualifications[id]?.qualified,
				true,
				`${id}: ${protocol.qualifications[id]?.notes.join("; ")}`,
			);
		}

		const survey = await latestSurvey(t, changeId);
		const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
		assert.ok(quality);
		assert.deepEqual(
			quality.measures.map((m) => [m.control_id, m.verdict]).sort(),
			[
				["cpd", "FAIL"],
				["pmd", "FAIL"],
			],
			`the requirement is measured by pmd and cpd: ${quality.blind_spot}`,
		);
		const findings = (id: string) => survey.controls.find((c) => c.control_id === id)?.findings ?? [];
		for (const [rule, line] of [
			["CyclomaticComplexity", lineOf("int grade(")],
			["UnusedPrivateMethod", lineOf("int never(")],
		] as const)
			assert.ok(
				findings("pmd").some(
					(f) => f.path === GRADER && f.message.includes(rule) && f.message.includes(`${GRADER}:${line}`),
				),
				`${rule} at ${GRADER}:${line}: ${findings("pmd")
					.map((f) => f.message)
					.join(" | ")}`,
			);
		const [duplication, ...more] = findings("cpd");
		assert.equal(more.length, 0, "one finding per duplication");
		for (const place of ["src/main/java/io/h495/DupA.java:", "src/main/java/io/h495/DupB.java:"])
			assert.ok(duplication?.message.includes(place), `${place} in ${duplication?.message}`);

		assert.equal(treeDigest(project), before, "the project tree is as it was");
	});

	it("laisser l'exigence en angle mort ne lance aucune résolution et le survey dit que le référentiel n'a pas été adopté", async () => {
		const { t, maven, changeId } = await surveyed(qualityProject());
		answer(t, changeId, "leave_blind_spot");
		await t.harness.advance(changeId, { max_steps: 40 });
		const survey = await latestSurvey(t, changeId);
		const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
		assert.match(quality?.blind_spot ?? "", /quality referential was not adopted/);
		assert.deepEqual(quality?.measures, []);
		assert.equal(maven.resolutions(), 0, "no Maven resolution is run");
		assert.ok(
			maven.runs.every((r) => r.network === "denied"),
			"the network does not open",
		);
		const protocol = await frozenProtocol(t, changeId);
		assert.equal(protocol.quality_referential, undefined);
		assert.ok(!protocol.controls.some((c) => c.control_id === "pmd" || c.control_id === "cpd"));
	});

	it("une résolution qui échoue n'adopte rien et le survey rend la raison de Maven", async () => {
		const { t, changeId } = await surveyed(qualityProject(), { mode: "fails" });
		answer(t, changeId, "adopt_referential");
		await t.harness.advance(changeId, { max_steps: 40 });
		const protocol = await frozenProtocol(t, changeId);
		assert.equal(protocol.quality_referential, undefined, "nothing is adopted");
		assert.ok(
			!protocol.controls.some((c) => c.control_id === "pmd" || c.control_id === "cpd"),
			"no pmd nor cpd control is declared",
		);
		const survey = await latestSurvey(t, changeId);
		const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
		assert.match(quality?.blind_spot ?? "", /403 Forbidden/, "the reason Maven gave");
	});

	it("un projet qui configure déjà PMD ne reçoit aucune proposition et le survey dit que le projet configure PMD lui-même", async () => {
		const project = qualityProject(PMD_DECLARED_BY_PROJECT);
		const before = treeDigest(project);
		const { t, maven, changeId } = await surveyed(project);
		assert.ok(
			t.harness.pendingDecisions(changeId).every((d) => !d.options.some((o) => o.id === "adopt_referential")),
			"no referential is proposed",
		);
		const survey = await latestSurvey(t, changeId);
		const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
		assert.match(quality?.blind_spot ?? "", /configures PMD itself/);
		assert.equal(maven.resolutions(), 0);
		assert.equal(treeDigest(project), before, "no POM is written");
	});
});
