/**
 * The test complements a technology recommends when a sensor it can read is missing on the target.
 * A recommendation is data of the adapter, read from the project's files alone: no tool, version or
 * date comes from a model or from anything the detection executes.
 */
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { editedFile } from "../../src/application/complement.ts";
import { detectStack } from "../../src/application/target.ts";
import { validate } from "../../src/contracts/validate.ts";
import type { StackAdapter } from "../../src/application/stacks/stack.ts";
import { RecommendedComplement } from "../../src/contracts/v1/protocol.ts";
import { fixtureJava, tempDir, writeFiles, removedAfterEach } from "../helpers/fixtures.ts";

const NODE = process.execPath;
const REFS = [{ requirement_id: "R1", revision: 1 }];

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-recommendations-", cleanups);
});

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

/** A POM that declares nothing about JaCoCo, whose `build` is the text given. */
function pomWithBuild(name: string, build: string, profiles = ""): string {
	const project = join(root, name);
	writeFiles(project, {
		"pom.xml": `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.h495</groupId>
  <artifactId>${name}</artifactId>
  <version>1.0.0</version>
${build}${profiles}</project>
`,
	});
	return project;
}

const SUREFIRE = `<plugin><artifactId>maven-surefire-plugin</artifactId><version>3.2.5</version></plugin>`;

describe("Maven describes the declaration of JaCoCo when its POM takes it without ambiguity", () => {
	it("given a POM with one build plugins section, then the coverage recommendation carries the insertion of jacoco-maven-plugin 0.8.15 and its resolution with maven, and given none, or plugins only in a profile or in pluginManagement, then it carries neither", () => {
		const [coverage] = detectStack(mavenProject("one-section"), REFS, NODE).recommendations;
		assert.equal(coverage?.test_type, "coverage");
		assert.equal(coverage?.edit?.path, "pom.xml");
		assert.ok(coverage?.edit?.wanted.startsWith(coverage.edit.current), "the anchor is kept, the declaration follows");
		const declaration = coverage?.edit?.wanted.slice(coverage.edit.current.length) ?? "";
		for (const expected of [
			"jacoco-maven-plugin",
			"<version>0.8.15</version>",
			"<goal>prepare-agent</goal>",
			"<goal>report</goal>",
		])
			assert.ok(declaration.includes(expected), expected);
		assert.deepEqual(coverage?.install, {
			package: "org.jacoco:jacoco-maven-plugin",
			version: "0.8.15",
			manager: "maven",
		});
		assert.deepEqual(validate(RecommendedComplement, coverage), coverage);

		const targets = {
			"no build section": pomWithBuild("no-build", ""),
			"plugins only in a profile": pomWithBuild(
				"in-profile",
				"  <build/>\n",
				`  <profiles><profile><id>p</id><build>\n<plugins>\n${SUREFIRE}\n</plugins>\n</build></profile></profiles>\n`,
			),
			"plugins only in pluginManagement": pomWithBuild(
				"in-management",
				`  <build>\n    <pluginManagement>\n      <plugins>\n        ${SUREFIRE}\n      </plugins>\n    </pluginManagement>\n  </build>\n`,
			),
		};
		for (const [label, project] of Object.entries(targets)) {
			const [recommendation] = detectStack(project, REFS, NODE).recommendations;
			assert.equal(recommendation?.test_type, "coverage", label);
			assert.equal(recommendation?.edit, undefined, label);
			assert.equal(recommendation?.install, undefined, label);
		}
	});
});

describe("Maven declares JaCoCo beside one the POM keeps in a profile", () => {
	it("given a POM whose JaCoCo is declared in a profile only, then the coverage recommendation carries the insertion, and given one declaring it outside any profile without the report goal, then it carries none", () => {
		const profile = `  <profiles><profile><id>coverage</id><build><plugins>
<plugin><groupId>org.jacoco</groupId><artifactId>jacoco-maven-plugin</artifactId><version>0.8.11</version></plugin>
</plugins></build></profile></profiles>\n`;
		const inProfile = pomWithBuild(
			"jacoco-in-profile",
			`  <build>\n    <plugins>\n      ${SUREFIRE}\n    </plugins>\n  </build>\n`,
			profile,
		);
		const [beside] = detectStack(inProfile, REFS, NODE).recommendations;
		assert.equal(beside?.test_type, "coverage");
		assert.equal(beside?.edit?.path, "pom.xml");
		assert.equal(beside?.install?.manager, "maven");

		const declared = pomWithBuild(
			"jacoco-declared",
			`  <build>\n    <plugins>\n      <plugin><artifactId>jacoco-maven-plugin</artifactId><version>0.8.11</version></plugin>\n    </plugins>\n  </build>\n`,
		);
		const [twice] = detectStack(declared, REFS, NODE).recommendations;
		assert.equal(twice?.test_type, "coverage");
		assert.equal(twice?.edit, undefined, "a second declaration in the same scope is not proposed");
		assert.equal(twice?.install, undefined);
	});
});

describe("Maven declares JaCoCo in the plugins of the build, wherever else the POM lists plugins", () => {
	it("given a POM listing plugins in pluginManagement before its build plugins, and another listing them in a profile, then the insertion follows the opening of the build plugins", () => {
		const managed = pomWithBuild(
			"managed-before-build",
			`  <build>\n    <pluginManagement>\n      <plugins>\n        ${SUREFIRE}\n      </plugins>\n    </pluginManagement>\n    <plugins>\n      ${SUREFIRE}\n    </plugins>\n  </build>\n`,
		);
		const profiled = pomWithBuild(
			"profile-after-build",
			`  <build>\n    <plugins>\n      ${SUREFIRE}\n    </plugins>\n  </build>\n`,
			`  <profiles>\n    <profile>\n      <id>p</id>\n      <build>\n    <plugins>\n        ${SUREFIRE}\n    </plugins>\n      </build>\n    </profile>\n  </profiles>\n`,
		);
		for (const project of [managed, profiled]) {
			const [coverage] = detectStack(project, REFS, NODE).recommendations;
			const edit = coverage?.edit;
			assert.ok(edit, project);
			const edited = editedFile(project, edit) ?? "";
			const buildPlugins = /<\/pluginManagement>\s*<plugins>|<build>\s*<plugins>/.exec(edited);
			assert.ok(buildPlugins, project);
			const declaredAt = edited.indexOf("jacoco-maven-plugin");
			assert.ok(declaredAt > buildPlugins.index, `${project}: the declaration follows the plugins of the build`);
			assert.ok(edited.slice(buildPlugins.index, declaredAt).indexOf("</plugins>") < 0, project);
		}
	});
});

describe("Maven keeps the recommendation a text when the POM lists its build plugins twice", () => {
	it("given a POM whose build holds two plugins sections, then the coverage recommendation carries neither the edit nor the resolution", () => {
		const twice = pomWithBuild(
			"two-sections",
			`  <build>\n    <plugins>\n      ${SUREFIRE}\n    </plugins>\n    <plugins>\n      ${SUREFIRE}\n    </plugins>\n  </build>\n`,
		);
		const [coverage] = detectStack(twice, REFS, NODE).recommendations;
		assert.equal(coverage?.test_type, "coverage");
		assert.equal(coverage?.edit, undefined, "no one section is the place of the declaration");
		assert.equal(coverage?.install, undefined);
	});
});

describe("The declaration of JaCoCo is inserted into the POM byte for byte, or not at all", () => {
	const fourSpaces = `    <!-- the build of the project -->
    <build>
        <!-- plugins are listed below -->
        <plugins>
            <plugin>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.2.5</version>
            </plugin>
            <!-- the compiler comes last -->
            <plugin>
                <artifactId>maven-compiler-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
`;

	it("given a pom.xml with comments and four-space indentation, then the edited text differs from the original by the inserted declaration only, and given the anchor absent or present twice, then nothing is applied", () => {
		const project = pomWithBuild("four-spaces", fourSpaces);
		const [coverage] = detectStack(project, REFS, NODE).recommendations;
		const edit = coverage?.edit;
		assert.ok(edit, "the POM takes the declaration");
		const original = readFileSync(join(project, "pom.xml"), "utf8");
		const edited = editedFile(project, edit);
		assert.ok(edited !== null, "the edit applies");
		const at = original.indexOf(edit.current) + edit.current.length;
		const inserted = edit.wanted.slice(edit.current.length);
		assert.equal(edited.slice(0, at), original.slice(0, at), "everything before the anchor is unchanged");
		assert.equal(edited.slice(at, at + inserted.length), inserted);
		assert.equal(edited.slice(at + inserted.length), original.slice(at), "everything after the anchor is unchanged");
		assert.match(
			inserted,
			/^ {12}<plugin>\n {16}<groupId>org\.jacoco<\/groupId>/,
			"the declaration follows the indentation",
		);

		const absent = join(root, "absent");
		writeFiles(absent, { "pom.xml": original.replace(edit.current, "") });
		assert.equal(editedFile(absent, edit), null);
		const twice = join(root, "twice");
		writeFiles(twice, { "pom.xml": original.replace("</project>", `<!--\n${edit.current}-->\n</project>`) });
		assert.equal(editedFile(twice, edit), null);
	});
});

function nodeProject(name: string, scriptsTest: string, extra: Record<string, string> = {}): string {
	const project = join(root, name);
	writeFiles(project, { "package.json": JSON.stringify({ name, scripts: { test: scriptsTest } }), ...extra });
	return project;
}

/** The coverage recommendation of a Node target: Stryker is recommended beside it when it is not installed. */
function coverageRecommendations(project: string): RecommendedComplement[] {
	return detectStack(project, REFS, NODE).recommendations.filter((r) => r.test_type === "coverage");
}

describe("Node recommends the coverage its runner can produce", () => {
	it("given node --test without the coverage flag, then the detection recommends adding --experimental-test-coverage and installing nothing", () => {
		const recommendations = coverageRecommendations(nodeProject("plain", "node --test"));
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
		const recommendations = coverageRecommendations(project);
		assert.deepEqual(
			recommendations.map((r) => [r.test_type, r.tool, r.version]),
			[["coverage", "@vitest/coverage-v8", "3.2.4"]],
		);
		assert.match(recommendations[0]?.change ?? "", /@vitest\/coverage-v8@3\.2\.4/);
	});

	it("given a vitest target without a coverage provider, then the coverage recommendation carries the install of @vitest/coverage-v8 at the installed vitest version with npm, and no file edit", () => {
		const project = nodeProject("vitest-install", "vitest run", {
			"node_modules/vitest/package.json": JSON.stringify({ name: "vitest", version: "3.2.4" }),
			"package-lock.json": "{}",
		});
		const [recommendation, ...others] = coverageRecommendations(project);
		assert.deepEqual(others, []);
		assert.deepEqual(recommendation?.install, { package: "@vitest/coverage-v8", version: "3.2.4", manager: "npm" });
		assert.equal(recommendation?.edit, undefined);
		assert.deepEqual(validate(RecommendedComplement, recommendation), recommendation);
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
			assert.deepEqual(coverageRecommendations(project), [], label);
	});
});

describe("Node describes the edit of scripts.test that adds the coverage flag", () => {
	it("given scripts.test node --test and node --test test/, then the coverage recommendation carries the edit suffixing the value, and given no scripts.test or a vitest provider to install, then it carries none", () => {
		for (const current of ["node --test", "node --test test/"]) {
			const [recommendation, ...others] = coverageRecommendations(nodeProject("edited", current));
			assert.deepEqual(others, []);
			assert.deepEqual(recommendation?.edit, {
				path: "package.json",
				current,
				wanted: `${current} --experimental-test-coverage`,
			});
			assert.deepEqual(validate(RecommendedComplement, recommendation), recommendation);
		}
		const noScriptsTest = join(root, "no-scripts-test");
		writeFiles(noScriptsTest, { "package.json": JSON.stringify({ name: "no-scripts-test", scripts: {} }) });
		const bare = coverageRecommendations(noScriptsTest);
		assert.deepEqual(
			bare.map((r) => [r.test_type, r.edit]),
			[["coverage", undefined]],
			"the recommendation stays a text",
		);
		const vitest = nodeProject("vitest-edit", "vitest run", {
			"node_modules/vitest/package.json": JSON.stringify({ name: "vitest", version: "3.2.4" }),
		});
		const installs = coverageRecommendations(vitest);
		assert.deepEqual(
			installs.map((r) => [r.tool, r.edit]),
			[["@vitest/coverage-v8", undefined]],
		);
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
