/**
 * V2 — the milestone of a migration is judged on the accepted survey of the integrated project, under the map of the
 * survey the migration starts from: the harness reads the violations of the map in the dossier of the cited survey,
 * never in a document, and refuses a change that does not measure the integrated project under the same map (ARC-05).
 * Maven and ArchUnit are fakes, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { canonicalize } from "../../src/contracts/canonical.ts";
import type { ArchitectureMap, Protocol } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
import { ORDER_SERVICE, RECOMMENDATION_MODULES } from "../helpers/architecture-recommendation.ts";
import { ARCHITECTURE_QUESTION, ARCHITECTURE_SPEC, answerMap, mavenReactor } from "../helpers/architecture-survey.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import {
	acceptedSurvey,
	APP_TO_INFRA,
	EXCEPTION,
	MIGRATION_SOURCES,
	migration,
	UNMAPPED_SOURCE,
} from "../helpers/migration.ts";
import { integrate, integrated, programOf } from "../helpers/program-fixture.ts";

/** OrderService once E2 moved it behind the port of payment: app no longer calls infra. */
const BEHIND_THE_PORT = "package io.demo.app;\n\npublic class OrderService {\n}\n";

/** Scripts the producer to write `files`, then integrates the change. */
async function integratedWriting(t: TestHarness, changeId: string, files: Record<string, string>) {
	t.agent.scripts.set("implement", {
		steps: [
			...Object.entries(files).map(([path, content]) => ({ kind: "write" as const, path, content })),
			{
				kind: "complete",
				output: { summary: "done", changed_paths: Object.keys(files), tests_claimed: true, notes: [] },
			},
		],
	});
	return integrate(t, changeId);
}

/**
 * A survey of the architecture of `project` as it stands, where the owner gives `mapAnswer` to the map the model
 * proposes, then `acceptance` to the survey. With `aside`, the survey is taken with an untracked file of that name in
 * the tree, removed afterwards: two surveys of one dossier on identical trees collide on the key of their verification.
 */
async function surveyNow(
	t: TestHarness,
	project: string,
	{
		acceptance = "accept",
		mapAnswer = "adopt_map",
		aside,
	}: { acceptance?: "accept" | "refuse"; mapAnswer?: "adopt_map" | "leave_blind_spot"; aside?: string } = {},
) {
	t.agent.scripts.set("specify", { steps: [{ kind: "complete", output: ARCHITECTURE_SPEC }] });
	if (aside) writeFileSync(join(project, aside), `${aside}\n`);
	const { change } = await t.harness.start({
		project_path: project,
		request_text: ARCHITECTURE_QUESTION,
		actor: HUMAN,
		language: "en",
		deliverable: "state",
	});
	const changeId = change.change_id;
	const proposed = await t.harness.advance(changeId, { max_steps: 40 });
	assert.equal(t.harness.pendingDecisions(changeId)[0]?.interaction, "IH-04", proposed.steps.join(" | "));
	answerMap(t, changeId, mapAnswer);
	await t.harness.advance(changeId, { max_steps: 60 });
	if (t.harness.pendingDecisions(changeId)[0]?.interaction === "IH-05") {
		answerMap(t, changeId, "A2");
		await t.harness.advance(changeId, { max_steps: 40 });
	}
	assert.equal(t.harness.pendingDecisions(changeId)[0]?.interaction, "IH-10", "the survey goes to its acceptance");
	answerMap(t, changeId, acceptance);
	assert.equal(t.ledger.loadChange(changeId)!.state.phase, "closed", "the survey is closed");
	if (aside) rmSync(join(project, aside));
	// The changes of the steps are candidates: the model specifies a behaviour, not the architecture question.
	t.agent.scripts.set("specify", { steps: [{ kind: "complete", output: specReport() }] });
	return changeId;
}

/**
 * The migration of the reactor adopted on its accepted survey, E1 then E2 integrated, E2 moving OrderService behind
 * the port; `between` runs once E1 is integrated.
 */
async function migrated(between: (t: TestHarness, project: string) => Promise<void> = async () => {}) {
	const { t, changeId: start, project } = await acceptedSurvey("A2", { integration: true });
	const { program, change } = await t.harness.adopt({
		project_path: project,
		trajectory: migration(start),
		actor: HUMAN,
		language: "en",
	});
	t.agent.scripts.set("specify", { steps: [{ kind: "complete", output: specReport() }] });
	await integrated(t, change.change_id, "E1");
	await between(t, project);
	const e2 = await t.harness.startNext({ program_id: program.program_id, actor: HUMAN, language: "en" });
	await integratedWriting(t, e2.change.change_id, { [ORDER_SERVICE]: BEHIND_THE_PORT });
	return { t, project, start, program_id: program.program_id, e2: e2.change.change_id };
}

/** Rewrites, in the dossier of `changeId`, the latest artifact of `kind` as `edit` makes it; gives back the undo. */
async function rewrite<T>(t: TestHarness, changeId: string, kind: "protocol" | "survey", edit: (content: T) => T) {
	const { ref, content } = (await t.harness.artifacts.latest<T>(t.ledger.loadChange(changeId)!.state, kind))!;
	const serve = async (served: T) => {
		const object = await t.objects.put(new TextEncoder().encode(canonicalize(served)), "application/json");
		t.ledger.db
			.prepare("UPDATE artifacts SET content_digest = ?, size_bytes = ? WHERE artifact_id = ? AND revision = ?")
			.run(object.digest, object.size_bytes, ref.artifact_id, ref.revision);
	};
	await serve(edit(content));
	return () => serve(content);
}

/** The map of `protocol` as `edit` makes it. */
const remapped =
	(edit: (map: ArchitectureMap) => ArchitectureMap) =>
	(protocol: Protocol): Protocol => ({
		...protocol,
		architecture_map: { ...protocol.architecture_map!, map: edit(protocol.architecture_map!.map) },
	});

/** The parts of `map`, the part `name` as `edit` makes it. */
const reparted = (map: ArchitectureMap, name: string, edit: (part: ArchitectureMap["parts"][number]) => object) => ({
	...map,
	parts: map.parts.map((p) => (p.name === name ? { ...p, ...edit(p) } : p)),
});

describe("the milestone of a migration is measured on the survey of the integrated project", () => {
	it("E1 et E2 intégrés, mesurer la migration avec l'état des lieux accepté du projet intégré, sous la même carte, qui compte part app may not depend on part infra 0 et every main source belongs to a part 1, inscrit une évaluation du jalon final PASS qui cite cet état des lieux et clôt le programme", async () => {
		const { t, project, program_id } = await migrated();
		const measured = await surveyNow(t, project);

		const program = await t.harness.measure({ program_id, change_id: measured, actor: HUMAN });
		const evaluation = program.milestone_evaluations.at(-1);
		assert.equal(evaluation?.verdict, "PASS", JSON.stringify(evaluation));
		assert.equal(
			evaluation?.map_measure?.change_id,
			measured,
			"the evaluation cites the survey of the integrated project",
		);
		assert.deepEqual(
			evaluation?.map_measure?.rules.map((r) => [r.rule_id, r.outcome, r.surveyed, r.measured, r.exception?.owner]),
			[
				[UNMAPPED_SOURCE, "tolerated", 1, 1, EXCEPTION.owner],
				[APP_TO_INFRA, "removed", 2, 0, undefined],
			],
		);
		assert.deepEqual(evaluation?.map_measure?.map.parts, ["domain", "infra", "app"], "the parts of the adopted map");
		assert.equal(
			evaluation?.map_measure?.map.tool,
			"the rules of the adopted architecture map, checked by ArchUnit; the links a configuration file or a string of the code establishes by naming a class in full, against the adopted map",
			"the controls that verify the map",
		);
		const cited = await t.harness.artifacts.latest<Protocol>(t.ledger.loadChange(measured)!.state, "protocol");
		const unseen = cited?.content.architecture_map?.unseen ?? [];
		assert.equal(unseen.length, 10, "the survey names ten points its verification does not see");
		assert.deepEqual(
			evaluation?.map_measure?.map.unseen,
			unseen,
			"what the verification does not see, from the survey",
		);
		assert.equal(program.closed, true, "the program is closed");
		assert.equal(programOf(t, program_id).closed, true, "the ledger records the program closed");
	});

	it("un changement à candidat, un état des lieux refusé, d'un autre projet, pris sur un arbre sans l'intégration de E2, dont la carte est en angle mort, dont le contrôle d'architecture n'a rien mesuré, ou dont la carte diffère par une partie, son périmètre, son style, le rôle d'un paquet ou une relation, est refusé avec un message qui nomme le changement et la raison, sans évaluation inscrite", async () => {
		let beforeE2 = "";
		const { t, project, start, program_id, e2 } = await migrated(async (t, project) => {
			beforeE2 = await surveyNow(t, project);
		});
		const measured = await surveyNow(t, project);
		const refusedSurvey = await surveyNow(t, project, { acceptance: "refuse", aside: "refused.txt" });
		const blind = await surveyNow(t, project, { mapAnswer: "leave_blind_spot", aside: "blind.txt" });
		const elsewhere = (
			await t.harness.start({
				project_path: mavenReactor(RECOMMENDATION_MODULES, MIGRATION_SOURCES),
				request_text: ARCHITECTURE_QUESTION,
				actor: HUMAN,
				language: "en",
				deliverable: "state",
			})
		).change.change_id;
		const evaluations = programOf(t, program_id).milestone_evaluations.length;

		const refusedWith = async (changeId: string, reason: string) => {
			await assert.rejects(t.harness.measure({ program_id, change_id: changeId, actor: HUMAN }), (error: Error) => {
				assert.ok(
					error.message.includes(`the measure cites change ${changeId}, which does not measure the integrated project`),
					`the refusal names the change: ${error.message}`,
				);
				assert.ok(error.message.includes(reason), `the refusal says « ${reason} »: ${error.message}`);
				return true;
			});
			const state = programOf(t, program_id);
			assert.equal(state.milestone_evaluations.length, evaluations, `no evaluation is recorded for ${reason}`);
			assert.equal(state.closed, false, "the program is not closed");
		};
		await refusedWith(e2, "it delivers a candidate, not a survey of the project");
		await refusedWith(refusedSurvey, "the owner did not accept its survey");
		await refusedWith(elsewhere, "it surveyed another project");
		await refusedWith(beforeE2, "it was taken on a tree that does not carry the latest integration of the program");
		await refusedWith(blind, "its survey adopted no architecture map");

		const unmeasured = await rewrite<Survey>(t, measured, "survey", (survey) => ({
			...survey,
			controls: survey.controls.map((c) =>
				c.control_id === "architecture"
					? { ...c, verdict: null, findings: [], blind_spot: "blind spot: the control is not qualified" }
					: c,
			),
		}));
		await refusedWith(measured, "its control architecture measured nothing of the reference");
		await unmeasured();

		const differences: [string, (map: ArchitectureMap) => ArchitectureMap][] = [
			[
				"part payment is in the map of only one of the two surveys",
				(map) => ({ ...map, parts: [...map.parts, { ...map.parts[0]!, name: "payment", perimeter: ["payment"] }] }),
			],
			[
				"part app covers app, legacy instead of app",
				(map) => reparted(map, "app", () => ({ perimeter: ["app", "legacy"] })),
			],
			["part app is in the style onion instead of simple", (map) => reparted(map, "app", () => ({ style: "onion" }))],
			[
				"package io.demo.app of part app has the role adapters instead of application",
				(map) => reparted(map, "app", (p) => ({ roles: p.roles.map((r) => ({ ...r, role: "adapters" })) })),
			],
			[
				"package io.demo.app.legacy is in part app in the map of only one of the two surveys",
				(map) =>
					reparted(map, "app", (p) => ({ roles: [...p.roles, { ...p.roles[0]!, package: "io.demo.app.legacy" }] })),
			],
			[
				"package io.demo.app of part app is called by io.demo.infra instead of nothing",
				(map) => reparted(map, "app", (p) => ({ roles: p.roles.map((r) => ({ ...r, called_by: ["io.demo.infra"] })) })),
			],
			[
				"part app may depend on infra in the map of only one of the two surveys",
				(map) => ({ ...map, relations: [...map.relations, { from: "app", to: "infra", hints: [] }] }),
			],
		];
		for (const [difference, edit] of differences) {
			const restore = await rewrite<Protocol>(t, measured, "protocol", remapped(edit));
			await refusedWith(measured, `its map differs from that of the starting survey ${start}: ${difference}`);
			await restore();
		}
		const hinted = await rewrite<Protocol>(
			t,
			measured,
			"protocol",
			remapped((map) => ({ ...map, parts: map.parts.map((p) => ({ ...p, hints: [] })) })),
		);
		const program = await t.harness.measure({ program_id, change_id: measured, actor: HUMAN });
		assert.equal(
			program.milestone_evaluations.at(-1)?.verdict,
			"PASS",
			"a map whose hints alone differ is the same map",
		);
		await hinted();
	});
});
