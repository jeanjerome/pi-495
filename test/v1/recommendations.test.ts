/**
 * The test complements a technology recommends when a sensor it can read is missing on the target.
 * A recommendation is data of the adapter, read from the project's files alone: no tool, version or
 * date comes from a model or from anything the detection executes.
 */
import { strict as assert } from "node:assert";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { detectStack } from "../../src/application/target.ts";
import { validate } from "../../src/contracts/validate.ts";
import type { StackAdapter } from "../../src/application/stacks/stack.ts";
import { RecommendedComplement } from "../../src/contracts/v1/protocol.ts";
import { fixtureJava, tempDir, writeFiles } from "../helpers/fixtures.ts";

const NODE = process.execPath;
const REFS = [{ requirement_id: "R1", revision: 1 }];

let root: string;
beforeEach(() => {
	root = tempDir("495-recommendations-");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** A pitest-maven declaration outside any profile, with none of the properties that make its report readable. */
const PIT_WITHOUT_REPORT = `      <plugin>
        <groupId>org.pitest</groupId>
        <artifactId>pitest-maven</artifactId>
        <version>1.22.0</version>
        <configuration>
          <timestampedReports>true</timestampedReports>
        </configuration>
      </plugin>
`;

function mavenProject(name: string, withCoverage = false, withMutation = false, extraPlugin = ""): string {
	const project = join(root, name);
	fixtureJava(project, withCoverage, withMutation);
	if (extraPlugin) {
		const pom = join(project, "pom.xml");
		writeFileSync(pom, readFileSync(pom, "utf8").replace("</plugins>", `${extraPlugin}    </plugins>`));
	}
	return project;
}

describe("Maven recommends the sensors its POM lacks", () => {
	it("given a Maven project binding neither JaCoCo nor PIT, then the detection recommends JaCoCo for coverage and PIT for mutation, each with its version, the date it was established, its source and the change the POM needs", () => {
		const detection = detectStack(mavenProject("bare"), REFS, NODE);
		const recommendations = detection.recommendations;
		assert.deepEqual(
			recommendations.map((r) => [r.test_type, r.tool]),
			[
				["coverage", "org.jacoco:jacoco-maven-plugin"],
				["mutation", "org.pitest:pitest-maven"],
			],
		);
		for (const recommendation of recommendations) {
			assert.deepEqual(validate(RecommendedComplement, recommendation), recommendation);
			assert.match(recommendation.version, /^\d+\.\d+\.\d+$/);
			assert.match(recommendation.source, /^[a-z.-]+\.[a-z]+\//);
			assert.match(recommendation.change, /\bPOM\b/);
		}
		assert.match(recommendations[0]!.change, /prepare-agent/);
		assert.match(recommendations[0]!.change, /report/);
		assert.match(recommendations[1]!.change, /declare pitest-maven/);
		assert.match(recommendations[1]!.change, /XML/);
		assert.match(recommendations[1]!.change, /timestampedReports/);
	});

	it("given PIT declared without an XML report and with timestamped directories, then the recommendation names what the POM must change", () => {
		const detection = detectStack(mavenProject("pit-unreadable", true, false, PIT_WITHOUT_REPORT), REFS, NODE);
		const recommendations = detection.recommendations;
		assert.deepEqual(
			recommendations.map((r) => r.test_type),
			["mutation"],
		);
		const change = recommendations[0]!.change;
		assert.match(change, /XML/);
		assert.match(change, /timestampedReports/);
		assert.match(change, /in the pitest-maven declaration/, "the change is made to the declaration PIT already has");
		assert.doesNotMatch(change, /\bdeclare\b/, "PIT is declared already: its addition is not what the POM lacks");
	});

	it("given a project whose JaCoCo and PIT are read, then it recommends nothing", () => {
		const detection = detectStack(mavenProject("complete", true, true), REFS, NODE);
		assert.deepEqual(detection.recommendations, []);
	});

	it("given a project reading JaCoCo but not PIT, or PIT but not JaCoCo, then it recommends only the missing one", () => {
		const jacocoOnly = detectStack(mavenProject("jacoco-only", true, false), REFS, NODE);
		assert.deepEqual(
			jacocoOnly.recommendations.map((r) => r.test_type),
			["mutation"],
		);
		const pitOnly = detectStack(mavenProject("pit-only", false, true), REFS, NODE);
		assert.deepEqual(
			pitOnly.recommendations.map((r) => r.test_type),
			["coverage"],
		);
	});
});

function nodeProject(name: string, scriptsTest: string, extra: Record<string, string> = {}): string {
	const project = join(root, name);
	writeFiles(project, { "package.json": JSON.stringify({ name, scripts: { test: scriptsTest } }), ...extra });
	return project;
}

describe("Node recommends the coverage its runner can produce", () => {
	it("given node --test without the coverage flag, then the detection recommends adding --experimental-test-coverage and installing nothing", () => {
		const detection = detectStack(nodeProject("plain", "node --test"), REFS, NODE);
		const recommendations = detection.recommendations;
		assert.equal(recommendations.length, 1);
		const [recommendation] = recommendations;
		assert.deepEqual(validate(RecommendedComplement, recommendation), recommendation);
		assert.equal(recommendation?.test_type, "coverage");
		assert.match(recommendation?.tool ?? "", /--experimental-test-coverage/);
		assert.match(recommendation?.version ?? "", /^\d+\.\d+\.\d+$/);
		assert.match(recommendation?.source ?? "", /^nodejs\.org\//);
		assert.match(recommendation?.change ?? "", /add --experimental-test-coverage to scripts\.test/);
		assert.doesNotMatch(recommendation?.change ?? "", /install/i);
	});

	it("given vitest without a coverage provider, then it recommends @vitest/coverage-v8 at the version of the installed vitest", () => {
		const project = nodeProject("vitest", "vitest run", {
			"node_modules/vitest/package.json": JSON.stringify({ name: "vitest", version: "3.2.4" }),
		});
		const recommendations = detectStack(project, REFS, NODE).recommendations;
		assert.deepEqual(
			recommendations.map((r) => [r.test_type, r.tool, r.version]),
			[["coverage", "@vitest/coverage-v8", "3.2.4"]],
		);
		assert.match(recommendations[0]?.change ?? "", /@vitest\/coverage-v8@3\.2\.4/);
	});

	it("given jest, mocha or a target that already asks for coverage, then it recommends nothing", () => {
		const targets = {
			jest: nodeProject("jest", "jest"),
			mocha: nodeProject("mocha", "mocha"),
			"node --test with coverage": nodeProject("covered", "node --test --experimental-test-coverage"),
			"vitest with a provider": nodeProject("provided", "vitest run", {
				"node_modules/vitest/package.json": JSON.stringify({ name: "vitest", version: "3.2.4" }),
				"node_modules/@vitest/coverage-v8/package.json": JSON.stringify({ name: "@vitest/coverage-v8" }),
			}),
		};
		for (const [label, project] of Object.entries(targets))
			assert.deepEqual(detectStack(project, REFS, NODE).recommendations, [], label);
	});
});

describe("A technology declares its own recommendations", () => {
	it("given a list of adapters gaining a test adapter that declares a recommendation, then the detection of a project it recognises carries it", () => {
		const recommendation: RecommendedComplement = {
			test_type: "coverage",
			tool: "cargo-llvm-cov",
			version: "0.6.0",
			established_on: "2026-09-30",
			source: "https://github.com/taiki-e/cargo-llvm-cov",
			change: "install cargo-llvm-cov",
		};
		const cargo: StackAdapter = {
			stack: "cargo",
			signal_files: ["Cargo.toml"],
			detect: () => ({
				stack: "cargo",
				facts: {},
				controls: [],
				positive_witness: {},
				witness_tests: 0,
				negative_witness: {},
				own_negative_witness: {},
				preparation_paths: [],
				capability_missing: [],
				recommendations: [recommendation],
			}),
		};
		const project = join(root, "rust");
		writeFiles(project, { "Cargo.toml": "[package]" });
		assert.deepEqual(detectStack(project, REFS, NODE, [cargo]).recommendations, [recommendation]);
		assert.deepEqual(detectStack(project, REFS, NODE).recommendations, [], "no central table knows the technology");
	});
});
