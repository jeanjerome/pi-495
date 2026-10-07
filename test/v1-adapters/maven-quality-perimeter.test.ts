/**
 * What the quality referential of a Maven target measures and what it does not: data of the adapter,
 * read from the POMs of the reactor, never from a file of the analysed tree. PMD reads the main sources
 * of each module; a file whose type carries a Generated annotation is generated code; test sources,
 * declared dependencies and duplication across modules are not measured, each for its reason.
 */
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { fixtureJava, fixtureMavenHexagonal, removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const NODE = process.execPath;
const REFS = [{ requirement_id: "QLT-01", revision: 1 }];

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-quality-perimeter-", cleanups);
});

function perimeterOf(project: string) {
	const offer = STACKS_OF_495.recognise(project, REFS, NODE).quality_referential;
	assert.equal(offer?.kind, "proposed", "a Maven project without PMD is offered the referential");
	if (offer?.kind !== "proposed") throw new Error("no referential is proposed");
	assert.ok(offer.perimeter, "the referential names its perimeter");
	return offer.perimeter;
}

describe("the Maven adapter declares what its quality referential measures", () => {
	it("la détection d'un projet Maven sans PMD déclare avec le référentiel proposé les sources principales de chaque module comme mesurées, les trois annotations Generated comme marques du code généré, et comme non mesurées ses sources de test, org.junit.jupiter:junit-jupiter et la duplication entre deux modules, chacune avec sa raison", () => {
		const project = join(root, "single");
		fixtureJava(project);
		const perimeter = perimeterOf(project);
		assert.deepEqual(perimeter.measured, [{ module: ".", root: "src/main/java/" }], "the main sources are measured");
		assert.deepEqual(
			perimeter.generated_annotations,
			["javax.annotation.Generated", "javax.annotation.processing.Generated", "jakarta.annotation.Generated"],
			"the three Generated annotations mark generated code",
		);
		const unmeasured = perimeter.unmeasured.map((u) => u.subject);
		assert.deepEqual(unmeasured, [
			"src/test/java/",
			"org.junit.jupiter:junit-jupiter",
			"duplication between two modules",
		]);
		const reasonOf = (subject: string) => perimeter.unmeasured.find((u) => u.subject === subject)?.reason ?? "";
		assert.match(reasonOf("src/test/java/"), /includeTests/, "PMD does not read the test sources");
		assert.match(reasonOf("org.junit.jupiter:junit-jupiter"), /outside the tree/, "a dependency is an artifact");
		assert.match(reasonOf("duplication between two modules"), /aggregate/, "CPD compares one module at a time");

		// Each module of a reactor: its main sources measured, its test sources not; a dependency on
		// another module of the reactor is measured with that module, and is not named.
		const reactor = join(root, "reactor");
		fixtureMavenHexagonal(reactor);
		writeFiles(reactor, {
			"domain/src/test/java/io/demo/domain/user/UserTest.java": "package io.demo.domain.user;\n\nclass UserTest {}\n",
			"infrastructure/src/test/java/io/demo/infra/UserRepositoryTest.java":
				"package io.demo.infra;\n\nclass UserRepositoryTest {}\n",
		});
		const modules = perimeterOf(reactor);
		assert.deepEqual(modules.measured, [
			{ module: "domain", root: "domain/src/main/java/" },
			{ module: "infrastructure", root: "infrastructure/src/main/java/" },
		]);
		assert.deepEqual(
			modules.unmeasured.map((u) => u.subject),
			["domain/src/test/java/", "infrastructure/src/test/java/", "duplication between two modules"],
		);
	});

	it("names a dependency by its artifactId alone when its group is a property, and never an artifact the dependency excludes, wherever its exclusions are written", () => {
		const project = join(root, "exclusions");
		fixtureJava(project);
		const pom = join(project, "pom.xml");
		writeFileSync(
			pom,
			readFileSync(pom, "utf8").replace(
				"  </dependencies>",
				`    <dependency>
      <exclusions>
        <exclusion><groupId>org.excluded</groupId><artifactId>excluded-lib</artifactId></exclusion>
      </exclusions>
      <groupId>org.slf4j</groupId>
      <artifactId>slf4j-api</artifactId>
      <version>2.0.13</version>
    </dependency>
    <dependency>
      <groupId>\${project.groupId}</groupId>
      <artifactId>sibling</artifactId>
      <version>1.0.0</version>
    </dependency>
  </dependencies>`,
			),
		);
		assert.deepEqual(
			perimeterOf(project).unmeasured.map((u) => u.subject),
			[
				"src/test/java/",
				"org.junit.jupiter:junit-jupiter",
				"org.slf4j:slf4j-api",
				"sibling",
				"duplication between two modules",
			],
		);
	});
});
