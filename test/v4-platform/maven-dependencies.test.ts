/**
 * The dependencies the POMs of a real Maven reactor declare compared to those its code uses, through the generic
 * runner and the platform sandbox: once a copy declares ArchUnit by 495's declaration for an adopted map, the
 * Maven technology also declares the control that runs `dependency:analyze` of maven-dependency-plugin 3.11.0 with
 * the network closed. It is qualified by its own witnesses although the project already breaks the rule and one
 * module receives JUnit from the aggregate `junit-jupiter`, and its pass on the reference reports each gap at its
 * file and its line. A dependency declared for the runtime alone is not reported.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
	declaredReference,
	INFRASTRUCTURE_POM,
	lineOf,
	MAIN,
	UNUSED_DECLARED,
	USED_UNDECLARED,
} from "../helpers/dependencies-reactor.ts";
import { mavenBench, qualifyByWitnesses, widenForMaven } from "../helpers/maven-bench.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";

const mavenAvailable = spawnSync("mvn", ["-v"], { stdio: "ignore" }).status === 0;

describe("dependency:analyze compares the dependencies the POMs of a Maven reactor declare to those its code uses", {
	skip: !mavenAvailable && "mvn is not on PATH",
}, () => {
	const cleanups = removedAfterEach();

	it("sur le réacteur domain, infrastructure et app, le contrôle des dépendances est qualifié par ses témoins bien que le projet enfreigne la règle et que app reçoive JUnit de l'agrégat junit-jupiter, et la passe de référence rapporte l'usage de io.demo:domain par app à l'import de Main.java et la déclaration inutilisée de Guava à sa ligne d'infrastructure/pom.xml, sans constat sur h2", async () => {
		const root = outputDir("maven-dependencies-", cleanups);
		const { reference, detection } = declaredReference(root);
		const dependencies = detection.controls.find((c) => c.control_id === "dependencies");
		assert.ok(
			dependencies,
			`the copy that declares ArchUnit gets the dependencies control: ${detection.controls.map((c) => c.control_id).join(", ")}`,
		);
		assert.equal(dependencies.network, "denied", "the dependencies control runs with the network closed");
		assert.equal(dependencies.parser, "dependency-analyze");

		const bench = mavenBench(root);
		const own = detection.own_negative_witness.dependencies;
		assert.ok(own, "the dependencies control has a negative witness of its own");
		// The shared positive witness imports org.junit.jupiter.api.Test, which a module that declares the
		// aggregate uses without declaring: the positive witness of this control is the reference alone.
		const q = await qualifyByWitnesses(bench, root, reference, dependencies, {}, own);
		assert.deepEqual(
			[q.positive, q.negative, q.incident, q.qualified],
			["PASS", "FAIL", "INDETERMINATE", true],
			JSON.stringify(q.notes),
		);

		const pass = (
			await bench.runner.runControl({ ...bench.base, control: widenForMaven(dependencies), workspace_path: reference })
		).evidence;
		assert.equal(pass.verdict, "FAIL", pass.limits.notes.join("; "));
		const located = pass.findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);
		for (const expected of [
			`${USED_UNDECLARED} | ${MAIN}:${lineOf(MAIN, "import io.demo.domain.User;")}`,
			`${UNUSED_DECLARED} | ${INFRASTRUCTURE_POM}:${lineOf(INFRASTRUCTURE_POM, "<artifactId>guava</artifactId>")}`,
		])
			assert.ok(located.includes(expected), `${expected} in\n${located.join("\n")}`);
		assert.ok(
			pass.findings.some((f) => /app uses io\.demo:domain without declaring it/.test(f.message)),
			pass.findings.map((f) => f.message).join("\n"),
		);
		assert.deepEqual(
			pass.findings.filter((f) => f.message.includes("h2")),
			[],
			"a dependency declared for the runtime alone is not given as unused",
		);
	});

	it("sur ce réacteur, le contrôle des tests du projet rend PASS", async () => {
		const root = outputDir("maven-dependencies-tests-", cleanups);
		const { reference, detection } = declaredReference(root);
		const tests = detection.controls.find((c) => c.control_id === "maven-test");
		assert.ok(tests, "the suite of the project is a control");
		assert.ok(
			detection.controls.some((c) => c.control_id === "dependencies"),
			`the copy declares the dependencies control: ${detection.controls.map((c) => c.control_id).join(", ")}`,
		);
		const bench = mavenBench(root);
		const pass = (
			await bench.runner.runControl({ ...bench.base, control: widenForMaven(tests), workspace_path: reference })
		).evidence;
		assert.equal(pass.verdict, "PASS", pass.limits.notes.join("; "));
		assert.equal(pass.facts.tests, 1, "the one test of the project");
	});
});
