/**
 * PMD and CPD on a real Maven reactor whose `infrastructure` module declares its `domain` neighbour as
 * a dependency, through the generic runner and the platform sandbox, the network closed: Maven must
 * resolve the neighbour from the reactor, since the local repository never received it.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { detectStack } from "../../src/application/target.ts";
import { mavenBench, mavenReference, qualifyByWitnesses, widenForMaven } from "../helpers/maven-bench.ts";
import { fixtureMavenHexagonal, outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";

const mavenAvailable = spawnSync("mvn", ["-v"], { stdio: "ignore" }).status === 0;

const CACHE = "infrastructure/src/main/java/io/demo/infra/UserCache.java";
const CACHE_SOURCE = `package io.demo.infra;

import io.demo.domain.user.User;

public final class UserCache {
    private User last;

    public User remember(User user) { last = user; return last; }

    private User forgotten() { return last; }
}
`;
const FORGOTTEN_LINE = CACHE_SOURCE.split("\n").findIndex((l) => l.includes("User forgotten(")) + 1;

/**
 * The root POM of the reactor, with a plugins section the declaration of PMD can be added to, and the Java
 * release and source encoding the compile phase in front of the goals builds the modules with.
 */
const REACTOR_POM = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.demo</groupId><artifactId>demo-reactor</artifactId><version>1.0.0</version>
  <packaging>pom</packaging>
  <modules><module>domain</module><module>infrastructure</module></modules>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <build>
    <plugins>
    </plugins>
  </build>
</project>
`;

describe("PMD and CPD on a Maven reactor where one module depends on another", {
	skip: !mavenAvailable && "mvn is not on PATH",
}, () => {
	const cleanups = removedAfterEach();
	it("sur un réacteur Maven dont le module infrastructure dépend du module domain, pmd et cpd sont qualifiés par leurs témoins, aucune note ne nomme une dépendance non résolue, et la passe de pmd sur la référence rapporte UnusedPrivateMethod dans le module infrastructure à la ligne de la méthode", async () => {
		const root = outputDir("maven-quality-reactor-", cleanups);
		const project = join(root, "project");
		fixtureMavenHexagonal(project);
		writeFiles(project, { "pom.xml": REACTOR_POM, [CACHE]: CACHE_SOURCE });
		const offer = detectStack(project, [{ requirement_id: "QLT-01", revision: 1 }]).quality_referential;
		assert.equal(offer?.kind, "proposed");
		if (offer?.kind !== "proposed") return;
		const edit = offer.recommendations[0]?.edit;
		assert.ok(edit, "the recommendation carries the declaration of the plugin");

		const reference = mavenReference(root, project, edit);

		const detection = detectStack(reference, [{ requirement_id: "QLT-01", revision: 1 }]);
		const pmd = detection.controls.find((c) => c.control_id === "pmd");
		const cpd = detection.controls.find((c) => c.control_id === "cpd");
		assert.ok(
			pmd && cpd,
			`the reactor that declares the plugin gets pmd and cpd: ${detection.controls.map((c) => c.control_id)}`,
		);
		for (const control of [pmd, cpd])
			assert.equal(control.network, "denied", `${control.control_id} runs with the network closed`);

		const bench = mavenBench(root);
		const { runner, base } = bench;

		for (const control of [pmd, cpd]) {
			const own = detection.own_negative_witness[control.control_id];
			assert.ok(own, `${control.control_id} has a negative witness of its own`);
			const q = await qualifyByWitnesses(bench, root, reference, control, detection.positive_witness, own);
			assert.deepEqual(
				[q.positive, q.negative, q.qualified],
				["PASS", "FAIL", true],
				`${control.control_id}: ${JSON.stringify(q.notes)}`,
			);
			const unresolved = q.notes.filter((note) => /could not resolve dependencies/i.test(note));
			assert.deepEqual(unresolved, [], `${control.control_id}: no note names an unresolved dependency`);
		}

		const pmdPass = (await runner.runControl({ ...base, control: widenForMaven(pmd), workspace_path: reference }))
			.evidence;
		assert.equal(pmdPass.verdict, "FAIL", pmdPass.limits.notes.join("; "));
		const located = pmdPass.findings.map((f) => `${f.rule_id} ${f.path}:${f.region?.start_line}`);
		assert.ok(located.includes(`UnusedPrivateMethod ${CACHE}:${FORGOTTEN_LINE}`), located.join(", "));
	});
});
