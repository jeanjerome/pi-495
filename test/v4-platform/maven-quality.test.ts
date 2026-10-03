/**
 * PMD and CPD on a real Maven project, through the generic runner and the platform sandbox: each is
 * qualified by its own witnesses although the project already violates the referential, and the pass
 * on the reference reports the project's violations where they sit.
 */
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { editedFile } from "../../src/application/complement.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import { detectStack } from "../../src/application/target.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { ENV, EXECUTOR } from "../helpers/change-fixture.ts";
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

		// The copy where the controls run declares the plugin; the project itself is never written.
		const reference = join(root, "reference");
		cpSync(project, reference, { recursive: true });
		writeFileSync(join(reference, "pom.xml"), editedFile(project, edit) ?? "");
		// The resolution of the plugin, the one step that may open the network, runs once outside the sandbox.
		execFileSync("mvn", ["-B", "-q", "org.apache.maven.plugins:maven-dependency-plugin:3.11.0:resolve-plugins"], {
			cwd: reference,
			stdio: "ignore",
			timeout: 10 * 60_000,
		});

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

		const sandbox = selectSandbox({ allow_unconfined: process.platform !== "darwin" });
		const runner = new GenericControlRunner(sandbox.backend, new CasObjectStore(join(root, "objects")));
		const widen = (c: ControlDefinition): ControlDefinition => ({
			...c,
			env_allowlist: [...c.env_allowlist, "M2_HOME", "MAVEN_HOME", "JAVA_TOOL_OPTIONS", "USER"],
		});
		const base = {
			protocol: { protocol_id: "p", revision: 1, content_digest: digestValue("p") },
			candidate: {
				candidate_id: "c",
				manifest_digest: digestValue("c"),
				base_digest: digestValue("b"),
				workspace_id: "w",
			},
			subject: { kind: "fixture" as const, id: "f", revision: 1, digest: digestValue("f") },
			environment: { environment_id: "e", digest: ENV, profile_id: "verify" },
			requirement_refs: [],
			producer: EXECUTOR,
		};

		for (const control of [pmd, cpd]) {
			const own = detection.own_negative_witness[control.control_id];
			assert.ok(own, `${control.control_id} has a negative witness of its own`);
			const positive = join(root, `${control.control_id}-positive`);
			const negative = join(root, `${control.control_id}-negative`);
			for (const workspace of [positive, negative]) {
				cpSync(reference, workspace, { recursive: true });
				writeFiles(workspace, detection.positive_witness);
			}
			writeFiles(negative, own);
			const q = await qualifyControl(
				runner,
				widen(control),
				{
					positive_path: positive,
					negative_path: negative,
					positive_files: detection.positive_witness,
					negative_files: { ...detection.positive_witness, ...own },
				},
				base,
			);
			assert.deepEqual(
				[q.positive, q.negative, q.incident, q.qualified],
				["PASS", "FAIL", "INDETERMINATE", true],
				`${control.control_id}: ${JSON.stringify(q.notes)}`,
			);
		}

		const onReference = async (control: ControlDefinition) =>
			(await runner.runControl({ ...base, control: widen(control), workspace_path: reference })).evidence;
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
