/**
 * PMD and CPD on a real Maven project, through the generic runner and the platform sandbox: each is
 * qualified by its own witnesses although the project already violates the referential, and the pass
 * on the reference reports the project's violations where they sit.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { detectStack } from "../../src/application/target.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { mavenBench, mavenReference, qualifyByWitnesses, widenForMaven } from "../helpers/maven-bench.ts";
import { fixtureJava, outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { GRADER, lineOf, QUALITY_SOURCES } from "../helpers/quality-survey.ts";

const mavenAvailable = spawnSync("mvn", ["-v"], { stdio: "ignore" }).status === 0;

describe("PMD and CPD on a Maven project that already violates the referential", {
	skip: !mavenAvailable && "mvn is not on PATH",
}, () => {
	const cleanups = removedAfterEach();
	it("sur un projet Maven dont une méthode a une complexité de 11 et dont deux fichiers dupliquent un bloc, pmd et cpd sont qualifiés par leurs témoins et la passe de référence rapporte la complexité et la duplication à leur place", async () => {
		const root = outputDir("maven-quality-", cleanups);
		const project = join(root, "project");
		fixtureJava(project);
		writeFiles(project, QUALITY_SOURCES);
		const offer = detectStack(project, [{ requirement_id: "QLT-01", revision: 1 }]).quality_referential;
		assert.equal(offer?.kind, "proposed");
		if (offer?.kind !== "proposed") return;
		const edit = offer.recommendations[0]?.edit;
		assert.ok(edit, "the recommendation carries the declaration of the plugin");
		const install = offer.recommendations[0]?.install;
		assert.ok(install, "the recommendation carries the resolution of the plugin");

		const reference = mavenReference(root, project, edit, install);

		const detection = detectStack(reference, [{ requirement_id: "QLT-01", revision: 1 }]);
		const pmd = detection.controls.find((c) => c.control_id === "pmd");
		const cpd = detection.controls.find((c) => c.control_id === "cpd");
		assert.ok(
			pmd && cpd,
			`the copy that declares the plugin gets pmd and cpd: ${detection.controls.map((c) => c.control_id)}`,
		);
		for (const control of [pmd, cpd])
			assert.equal(control.network, "denied", `${control.control_id} runs with the network closed`);
		assert.deepEqual(
			[...detection.lint_control_ids].sort(),
			["cpd", "pmd"],
			"both are the quality controls of the target",
		);

		const bench = mavenBench(root);
		const { runner, base } = bench;

		for (const control of [pmd, cpd]) {
			const own = detection.own_negative_witness[control.control_id];
			assert.ok(own, `${control.control_id} has a negative witness of its own`);
			const q = await qualifyByWitnesses(bench, root, reference, control, detection.positive_witness, own);
			assert.deepEqual(
				[q.positive, q.negative, q.incident, q.qualified],
				["PASS", "FAIL", "INDETERMINATE", true],
				`${control.control_id}: ${JSON.stringify(q.notes)}`,
			);
		}

		const onReference = async (control: ControlDefinition) =>
			(await runner.runControl({ ...base, control: widenForMaven(control), workspace_path: reference })).evidence;
		const pmdPass = await onReference(pmd);
		assert.equal(pmdPass.verdict, "FAIL", pmdPass.limits.notes.join("; "));
		const located = pmdPass.findings.map((f) => `${f.rule_id} ${f.path}:${f.region?.start_line}`);
		assert.ok(located.includes(`CyclomaticComplexity ${GRADER}:${lineOf("int grade(")}`), located.join(", "));
		assert.ok(located.includes(`UnusedPrivateMethod ${GRADER}:${lineOf("int never(")}`), located.join(", "));
		const cpdPass = await onReference(cpd);
		assert.equal(cpdPass.verdict, "FAIL", cpdPass.limits.notes.join("; "));
		assert.equal(cpdPass.findings.length, 1, cpdPass.findings.map((f) => f.message).join("\n"));
		const message = cpdPass.findings[0]!.message;
		for (const place of ["src/main/java/io/h495/DupA.java:", "src/main/java/io/h495/DupB.java:"])
			assert.ok(message.includes(place), `${place} is named: ${message}`);
	});
});
