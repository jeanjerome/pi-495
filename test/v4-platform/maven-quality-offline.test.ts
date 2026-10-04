/**
 * PMD and CPD on a Maven project whose local repository held nothing before the adoption: the
 * resolution the adoption runs, with the network open, fetches everything the goals of the plugin
 * load, so both controls are qualified by their witnesses with the network closed on that repository
 * alone.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { DEFAULT_WORKSPACE_POLICY, GitWorkspace } from "../../src/adapters/workspace/git-workspace.ts";
import { editedFile } from "../../src/application/complement.ts";
import { askedLocalRepository, resolveInCopy, runInstall } from "../../src/application/installation.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import { detectStack } from "../../src/application/target.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { invocationBase } from "../helpers/execution-fixture.ts";
import { outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";

const mavenAvailable = spawnSync("mvn", ["-v"], { stdio: "ignore" }).status === 0;

const REFS = [{ requirement_id: "QLT-01", revision: 1 }];

/** A one-module project with no dependency: what it compiles comes from the plugins alone. */
const PROJECT = {
	"pom.xml": `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.h495</groupId>
  <artifactId>offline</artifactId>
  <version>1.0.0</version>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.2.5</version>
      </plugin>
    </plugins>
  </build>
</project>
`,
	"src/main/java/io/h495/Greeter.java":
		'package io.h495;\n\npublic final class Greeter {\n    private Greeter() {}\n\n    public static String greet(String name) {\n        return "Hello, " + name;\n    }\n}\n',
};

describe("PMD and CPD offline on a local Maven repository the adoption alone filled", {
	skip: !mavenAvailable && "mvn is not on PATH",
}, () => {
	const cleanups = removedAfterEach();
	it("sur un dépôt local de Maven vide que seule l'adoption du référentiel PMD a rempli, la résolution est resolved, pmd et cpd sont qualifiés par leurs témoins le réseau fermé, et aucune note ne nomme le skin de site", async () => {
		const root = outputDir("maven-quality-offline-", cleanups);
		const repository = join(root, "m2");
		mkdirSync(repository);
		const project = join(root, "project");
		writeFiles(project, PROJECT);
		const offer = detectStack(project, REFS).quality_referential;
		assert.equal(offer?.kind, "proposed");
		if (offer?.kind !== "proposed") return;
		const recommendation = offer.recommendations[0];
		assert.ok(recommendation?.edit && recommendation.install, "the recommendation declares and resolves the plugin");

		// Maven reads MAVEN_ARGS from the environment each step passes on, the adoption's and the controls' alike.
		const previous = process.env.MAVEN_ARGS;
		process.env.MAVEN_ARGS = `-Dmaven.repo.local=${repository}`;
		try {
			const sandbox = selectSandbox({ allow_unconfined: process.platform !== "darwin" });
			const workspace = new GitWorkspace(join(root, "workspaces"));
			const snapshot = await workspace.captureReference(project, DEFAULT_WORKSPACE_POLICY);
			const resolution = await resolveInCopy(
				{
					workspace,
					workspacePolicy: DEFAULT_WORKSPACE_POLICY,
					install: (copyPath, command, outside) => runInstall(sandbox.backend, copyPath, command, outside),
					localRepository: async (copyPath) => {
						const announced = await askedLocalRepository(sandbox.backend, copyPath);
						return "path" in announced ? announced.path : null;
					},
				},
				snapshot,
				recommendation.install,
				recommendation.edit,
			);
			assert.equal(resolution.kind, "resolved", resolution.kind === "failed" ? resolution.reason : "");

			const reference = join(root, "reference");
			cpSync(project, reference, { recursive: true });
			writeFileSync(join(reference, "pom.xml"), editedFile(project, recommendation.edit) ?? "");
			const detection = detectStack(reference, REFS);
			const runner = new GenericControlRunner(sandbox.backend, new CasObjectStore(join(root, "objects")));
			for (const id of ["pmd", "cpd"]) {
				const control = detection.controls.find((c) => c.control_id === id);
				const own = detection.own_negative_witness[id];
				assert.ok(control && own, `the copy that declares the plugin gets ${id} and its own negative witness`);
				assert.equal(control.network, "denied", `${id} runs with the network closed`);
				const positive = join(root, `${id}-positive`);
				const negative = join(root, `${id}-negative`);
				for (const workspacePath of [positive, negative]) {
					cpSync(reference, workspacePath, { recursive: true });
					writeFiles(workspacePath, detection.positive_witness);
				}
				writeFiles(negative, own);
				const withRepository: ControlDefinition = {
					...control,
					env_allowlist: [...control.env_allowlist, "MAVEN_ARGS"],
				};
				const q = await qualifyControl(
					runner,
					withRepository,
					{
						positive_path: positive,
						negative_path: negative,
						positive_files: detection.positive_witness,
						negative_files: { ...detection.positive_witness, ...own },
					},
					invocationBase(),
				);
				assert.deepEqual(
					[q.positive, q.negative, q.qualified],
					["PASS", "FAIL", true],
					`${id}: ${JSON.stringify(q.notes)}`,
				);
				assert.ok(
					q.notes.every((note) => !/skin/i.test(note)),
					`no note of ${id} names the site skin: ${JSON.stringify(q.notes)}`,
				);
			}
		} finally {
			if (previous === undefined) delete process.env.MAVEN_ARGS;
			else process.env.MAVEN_ARGS = previous;
		}
	});
});
