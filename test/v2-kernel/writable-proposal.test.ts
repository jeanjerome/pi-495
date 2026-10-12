/**
 * A refused preparation whose suite writes in a disposable copy has the IH-04 that follows the refused preparations
 * offer the owner the directories of the copy it wrote there, for the control of the suite.
 */
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { makeHarness, specReport, type TestHarness, trackedProject } from "../helpers/harness-fixture.ts";
import { fixtureTsWithoutTests, outputDir, removedAfterEach, SHOUT_IMPL, SHOUT_TEST } from "../helpers/fixtures.ts";
import { HUMAN, tuiOrigin } from "../helpers/change-fixture.ts";
import type { DecisionRequest } from "../../src/contracts/v1/decision.ts";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";

const cleanups = removedAfterEach();

const spec = specReport({
	objective: "add shout(name) returning the greeting in upper case",
	requirements: [
		{
			requirement_id: "R1",
			statement: "shout(name) returns greet(name) upper-cased",
			mandatory: true,
			criterion: "unit test on shout passes",
			category: "functional",
			satisfied_by_reference: false,
		},
	],
	design: { summary: "add shout next to greet", components: ["greet"], interfaces: ["shout(name)"], risks: [] },
});

/**
 * A suite that passes on the reference, its case writing `written` in its copy and trying to write `outside`, a path
 * outside the copy: it detects nothing, so each preparation that writes it is refused.
 */
function passingTest(written: readonly string[], outside: readonly string[]): string {
	const writes = [...written.map((p) => ({ p, mkdir: true })), ...outside.map((p) => ({ p, mkdir: false }))]
		.map(
			({ p, mkdir }) =>
				`  try { ${mkdir ? `mkdirSync(dirname(${JSON.stringify(p)}), { recursive: true }); ` : ""}writeFileSync(${JSON.stringify(p)}, "1"); } catch {}\n`,
		)
		.join("");
	return `import { test } from "node:test";\nimport { mkdirSync, writeFileSync } from "node:fs";\nimport { dirname } from "node:path";\n\ntest("R1 shout", () => {\n${writes}});\n`;
}

function refusedPreparation(written: readonly string[], outside: readonly string[]) {
	return {
		steps: [
			{ kind: "write" as const, path: "test/shout.test.js", content: passingTest(written, outside) },
			{
				kind: "complete" as const,
				output: { summary: "done", changed_paths: ["test/shout.test.js"], tests_claimed: false, notes: [] },
			},
		],
	};
}

/** A path outside the copy the suite tries to write, such as a cache of the tool, in a directory of the test's own. */
function outsidePath(): string {
	return join(outputDir("495-outside-", cleanups), "cache", "entry");
}

/** A preparation that writes a suite whose case of R1 fails by assertion on the reference: it is adopted. */
const adoptedPreparation = {
	steps: [
		{ kind: "write" as const, path: "test/shout.test.js", content: SHOUT_TEST },
		{
			kind: "complete" as const,
			output: { summary: "done", changed_paths: ["test/shout.test.js"], tests_claimed: false, notes: [] },
		},
	],
};

const implementation = {
	steps: [
		{ kind: "write" as const, path: "src/greet.js", content: SHOUT_IMPL },
		{
			kind: "complete" as const,
			output: { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: false, notes: [] },
		},
	],
};

function harnessWriting(written: readonly string[], outside: readonly string[], root?: string): TestHarness {
	return makeHarness({
		defaultScript: { steps: [{ kind: "complete", output: spec }] },
		scripts: { prepare: refusedPreparation(written, outside), implement: implementation },
		...(root === undefined ? {} : { root, policy: CONTROLLER_POLICY }),
	});
}

/** The settings the controller's configuration carries, among them a directory it already gives the control. */
const CONTROLLER_POLICY = {
	policy_id: "owner-policy",
	suite_paths: ["test/**/*.test.js"],
	writable_paths: { unit: ["coverage/"] },
};

/** A data directory whose `config.json` carries other settings than the directories it gives, and its text. */
function controllerConfiguration(): { root: string; text: string } {
	const root = outputDir("writable-grant-", cleanups);
	const text = `${JSON.stringify({ policy: CONTROLLER_POLICY, language: "en" }, null, 2)}\n`;
	writeFileSync(join(root, "config.json"), text);
	return { root, text };
}

/** The owner's answer to the IH-04 the change waits on. */
function answer(t: TestHarness, changeId: string, asked: DecisionRequest, optionId: string): void {
	const answered = t.harness.answerDecision(
		changeId,
		{
			decision_id: asked.decision_id,
			option_id: optionId,
			free_text: null,
			reason: null,
			subject_revision: asked.subject.revision,
			scope: null,
			expires_at: null,
		},
		tuiOrigin(),
	);
	assert.equal(answered.error, null, answered.error?.message);
}

/** The controls of every protocol the change froze. */
async function frozenControls(t: TestHarness, changeId: string): Promise<Protocol["controls"]> {
	const protocols = await Promise.all(
		t.ledger
			.listArtifacts(changeId, "protocol")
			.map(async (a) => JSON.parse(new TextDecoder().decode((await t.objects.get(a.object))!)) as Protocol),
	);
	return protocols.flatMap((p) => p.controls);
}

/** Starts a change and conducts it to the IH-04 asked once the preparations 495 spends by itself were refused. */
async function questionAsked(t: TestHarness): Promise<{ changeId: string; change: DecisionRequest }> {
	const { change } = await t.harness.start({
		project_path: trackedProject(fixtureTsWithoutTests),
		request_text: "add shout",
		actor: HUMAN,
	});
	const result = await t.harness.advance(change.change_id, { max_steps: 40 });
	assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
	const pending = t.harness.pendingDecisions(change.change_id);
	assert.deepEqual(
		pending.map((d) => d.interaction),
		["IH-04"],
	);
	return { changeId: change.change_id, change: pending[0]! };
}

describe("the directories of the copy a refused suite wrote on a disposable copy are offered to the owner", () => {
	it("après des préparations refusées dont la suite crée test-output/run/a et tente d'écrire hors de la copie, la question IH-04 offre grant_writable pour test-output/ au contrôle unit avec les chemins relevés et rien pour le chemin hors de la copie ; quand la suite n'écrit rien, elle ne l'offre pas", async () => {
		const outside = outsidePath();
		const { change: asked } = await questionAsked(harnessWriting(["test-output/run/a"], [outside]));
		const grants = asked.options.filter((o) => o.id === "grant_writable");
		assert.equal(grants.length, 1, `options offered: ${asked.options.map((o) => o.id).join(", ")}`);
		assert.deepEqual(asked.grant_writable, { control_id: "unit", directories: ["test-output/"] });
		const grant = grants[0]!;
		assert.ok(grant.label.includes("unit") && grant.label.includes("test-output/"), grant.label);
		assert.ok(grant.effect.includes("test-output/run/a"), grant.effect);
		assert.ok(
			asked.options.every((o) => !`${o.label} ${o.effect}`.includes("495-outside")),
			"nothing is offered for the path outside the copy",
		);

		const { change: silent } = await questionAsked(harnessWriting([], []));
		assert.ok(
			silent.options.every((o) => o.id !== "grant_writable"),
			`options offered: ${silent.options.map((o) => o.id).join(", ")}`,
		);
		assert.equal(silent.grant_writable, undefined);
	});

	it("la réponse grant_writable écrit test-output/ sous policy.writable_paths.unit dans config.json en gardant suite_paths et le nom de la politique, accorde une préparation de plus, et le contrôle unit figé porte test-output/ ; la réponse préparer laisse config.json inchangé et aucun contrôle figé ne porte test-output/", async () => {
		const granting = controllerConfiguration();
		const t = harnessWriting(["test-output/run/a"], [outsidePath()], granting.root);
		const { changeId, change: asked } = await questionAsked(t);
		answer(t, changeId, asked, "grant_writable");
		assert.deepEqual(JSON.parse(readFileSync(join(granting.root, "config.json"), "utf8")), {
			policy: { ...CONTROLLER_POLICY, writable_paths: { unit: ["coverage/", "test-output/"] } },
			language: "en",
		});
		t.agent.scripts.set("prepare", adoptedPreparation);
		const granted = await t.harness.advance(changeId, { max_steps: 40 });
		const state = t.ledger.loadChange(changeId)!.state;
		assert.equal(
			state.interventions.filter((i) => i.role === "prepare").length,
			3,
			`one more preparation is granted: ${granted.steps.join(" | ")}`,
		);
		assert.equal(state.gates.G2?.verdict, "PASS", granted.steps.join(" | "));
		const unit = (await frozenControls(t, changeId)).filter((c) => c.control_id === "unit");
		assert.ok(
			unit.length > 0 &&
				unit.every((c) => c.writable_paths.includes("test-output/") && c.writable_paths.includes("coverage/")),
			JSON.stringify(unit),
		);

		const declining = controllerConfiguration();
		const u = harnessWriting(["test-output/run/a"], [outsidePath()], declining.root);
		const other = await questionAsked(u);
		answer(u, other.changeId, other.change, "prepare");
		u.agent.scripts.set("prepare", adoptedPreparation);
		const prepared = await u.harness.advance(other.changeId, { max_steps: 40 });
		assert.equal(readFileSync(join(declining.root, "config.json"), "utf8"), declining.text);
		assert.equal(u.ledger.loadChange(other.changeId)!.state.gates.G2?.verdict, "PASS", prepared.steps.join(" | "));
		const frozen = await frozenControls(u, other.changeId);
		assert.ok(frozen.length > 0, "a protocol is frozen");
		assert.ok(
			frozen.every((c) => !c.writable_paths.includes("test-output/")),
			JSON.stringify(frozen.map((c) => [c.control_id, c.writable_paths])),
		);
	});
});
