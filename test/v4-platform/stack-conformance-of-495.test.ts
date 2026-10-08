/**
 * The two technologies of 495 judged by the conformance test whoever writes a technology runs, under the sandbox
 * of the platform: Node on a project whose suite runs under `node --test` with its coverage, Maven on a project
 * whose suite runs under Surefire with JaCoCo, and on one that declares PIT, offline on the local repository of the
 * Maven bench.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { MAVEN_PLUGIN } from "../../src/adapters/stacks/maven/maven.ts";
import { NODE_PLUGIN } from "../../src/adapters/stacks/node/node.ts";
import { buildUnlessPresent } from "../helpers/built-package.ts";
import {
	fixtureJava,
	fixtureTs,
	NO_QUALIFIED_SANDBOX,
	outputDir,
	removedAfterEach,
	writeFiles,
} from "../helpers/fixtures.ts";
import { primeLocalRepository } from "../helpers/maven-bench.ts";

const mavenAvailable = spawnSync("mvn", ["-v"], { stdio: "ignore" }).status === 0;

async function published() {
	buildUnlessPresent("dist/stack.js");
	return (await import("pi-495/stack")).stackConformance;
}

describe("the technologies of 495 pass the conformance test", {
	skip: NO_QUALIFIED_SANDBOX && "no sandbox backend qualifies on this machine",
}, () => {
	const cleanups = removedAfterEach();

	it("given a Node project whose suite passes under node --test with its coverage, stackConformance judges the node technology on it and the report carries no finding", async () => {
		const project = join(outputDir("conformance-node-", cleanups), "project");
		fixtureTs(project);
		writeFiles(project, {
			"package.json": JSON.stringify({
				name: "f-ts",
				version: "1.0.0",
				type: "module",
				scripts: { test: "node --test --experimental-test-coverage" },
			}),
		});
		const report = await (await published())(NODE_PLUGIN, { projects: [project] });
		assert.deepEqual(report.findings, [], JSON.stringify(report.projects, null, 1));
		assert.deepEqual(
			report.projects[0]?.controls.map((c) => c.control_id),
			["unit", "coverage"],
			"the suite and its coverage are judged",
		);
	});

	it("given a Maven project whose suite passes under Surefire with JaCoCo, stackConformance judges the maven technology on it offline and the report carries no finding", {
		skip: !mavenAvailable && "mvn is not on PATH",
	}, async () => {
		const root = outputDir("conformance-maven-", cleanups);
		const project = join(root, "project");
		fixtureJava(project, true);
		primeLocalRepository(root, project);
		const report = await (await published())(MAVEN_PLUGIN, { projects: [project] });
		assert.deepEqual(report.findings, [], JSON.stringify(report.projects, null, 1));
		assert.deepEqual(
			report.projects[0]?.controls.map((c) => c.control_id),
			["maven-test", "coverage", "structure"],
			"the suite, its coverage and the structure are judged",
		);
	});

	it("given a Maven project whose suite passes and which declares PIT, stackConformance judges the maven technology on it offline, the report carries no finding and names pitest-xml INDETERMINATE on an absent report and on a report past the read bound", {
		skip: !mavenAvailable && "mvn is not on PATH",
	}, async () => {
		const root = outputDir("conformance-maven-pit-", cleanups);
		const project = join(root, "project");
		fixtureJava(project, false, true);
		primeLocalRepository(root, project, [
			"test",
			"org.pitest:pitest-maven:mutationCoverage",
			"-DfailWhenNoMutations=false",
		]);
		const report = await (await published())(MAVEN_PLUGIN, { projects: [project] });
		assert.deepEqual(report.findings, [], JSON.stringify(report.projects, null, 1));
		const pit = report.projects[0]?.readers.find((r) => r.reader_id === "pitest-xml");
		assert.deepEqual([pit?.control_id, pit?.absent, pit?.oversized], ["mutation", "INDETERMINATE", "INDETERMINATE"]);
	});
});
