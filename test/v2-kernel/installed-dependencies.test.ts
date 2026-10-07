import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ReferenceSnapshot } from "../../src/contracts/v1/candidate.ts";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { FakeMavenControls, FakeMavenSandbox } from "../helpers/fake-maven.ts";
import { fixtureJava, writeFiles } from "../helpers/fixtures.ts";
import { makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";

/** A Maven project, which Maven recognises first under the list of 495, that also carries a Node manifest and installed tree. */
function mavenProjectWithNodeModules(): string {
	return trackedProject((root) => {
		fixtureJava(root, true);
		writeFiles(root, {
			"package.json": JSON.stringify({ name: "front", version: "1.0.0", private: true }, null, 2),
			"node_modules/x/index.js": "module.exports = 1;\n",
		});
	});
}

describe("the installed dependencies every technology of the list declares", () => {
	it("sur un projet qui porte pom.xml, package.json et node_modules/x/index.js, sous la liste de 495, la référence du changement enregistre node_modules parmi les répertoires de dépendances installées, chaque contrôle du protocole gelé porte node_modules/ parmi ses chemins protégés, et un candidat qui ajoute node_modules/shadow.js n'est pas accepté : G4 nomme node_modules/shadow.js parmi les chemins protégés modifiés", async () => {
		const t = makeHarness({
			defaultScript: {
				steps: [
					{
						kind: "complete",
						output: specReport({
							objective: "the greeter keeps greeting",
							requirements: [
								{
									requirement_id: "R1",
									statement: "greet(name) returns Hello, name",
									mandatory: true,
									criterion: "the unit test on greet passes",
									category: "functional",
									satisfied_by_reference: true,
								},
							],
						}),
					},
				],
			},
			scripts: {
				implement: {
					steps: [
						{ kind: "write", path: "node_modules/shadow.js", content: "module.exports = 'shadow';\n" },
						{
							kind: "complete",
							output: { summary: "done", changed_paths: ["node_modules/shadow.js"], tests_claimed: true, notes: [] },
						},
					],
				},
			},
			backend: (real) => new FakeMavenSandbox(real, "resolves"),
			controls: (real) => new FakeMavenControls(real),
		});
		const { change } = await t.harness.start({
			project_path: mavenProjectWithNodeModules(),
			request_text: "keep the greeter",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;

		const reference = (await t.harness.artifacts.latest<ReferenceSnapshot>(state, "reference"))!.content;
		assert.deepEqual(reference.installed_dependencies, ["node_modules"]);

		const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
		assert.ok(protocol.controls.length > 0, result.steps.join(" | "));
		for (const control of protocol.controls)
			assert.ok(
				control.protected_paths.includes("node_modules/"),
				`${control.control_id}: ${control.protected_paths.join(", ")}`,
			);

		assert.notEqual(result.view.change!.outcome, "accepted", result.steps.join(" | "));
		const g4 = t.ledger
			.readChangeEvents(change.change_id)
			.flatMap((e) => (e.event.type === "gate.decided" && e.event.decision.gate === "G4" ? [e.event.decision] : []));
		assert.ok(
			g4.some(
				(decision) =>
					decision.verdict === "FAIL" &&
					decision.reasons.includes("protected path altered by the producer: node_modules/shadow.js"),
			),
			`${result.steps.join(" | ")} | ${JSON.stringify(g4)}`,
		);
	});
});
