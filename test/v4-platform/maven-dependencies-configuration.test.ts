/**
 * What the POMs and the Maven configuration of a project say about `dependency:analyze` does not change what the
 * dependencies control measures: the configuration of the plugin in the POM of a module, an execution `default-cli`
 * of its own, the management of the plugins of the parent, the properties the plugin reads and `.mvn/maven.config`
 * each silence a gap when the goal is named by its coordinates. The analysis 495 declares in a copy of each POM of
 * the reactor replaces all of them, and the control stays qualified and reports both gaps of the reactor.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
	DEPENDENCIES_REACTOR,
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

const ROOT_POM = DEPENDENCIES_REACTOR["pom.xml"]!;
const APP_POM = DEPENDENCIES_REACTOR["app/pom.xml"]!;

/** The POM of `app` ignoring `io.demo:domain` in the configuration of the plugin, and skipping the analysis in an execution `default-cli`. */
const APP_CONFIGURES_THE_PLUGIN = APP_POM.replace(
	"</project>",
	`  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-dependency-plugin</artifactId>
        <configuration>
          <ignoredDependencies><ignoredDependency>io.demo:domain</ignoredDependency></ignoredDependencies>
        </configuration>
        <executions>
          <execution>
            <id>default-cli</id>
            <configuration><skip>true</skip></configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
</project>`,
);

/** The parent ignoring, in the management of its plugins, every dependency declared and not used. */
const PARENT_MANAGES_THE_PLUGIN = ROOT_POM.replace(
	"  <build>\n    <plugins>",
	`  <build>
    <pluginManagement>
      <plugins>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-dependency-plugin</artifactId>
          <configuration>
            <ignoredUnusedDeclaredDependencies><ignoredUnusedDeclaredDependency>*</ignoredUnusedDeclaredDependency></ignoredUnusedDeclaredDependencies>
          </configuration>
        </plugin>
      </plugins>
    </pluginManagement>
    <plugins>`,
);

/** The parent carrying the properties that skip the analysis and exclude the classes of `app` from it. */
const PARENT_SETS_THE_PROPERTIES = ROOT_POM.replace(
	"  </properties>",
	"    <mdep.analyze.skip>true</mdep.analyze.skip>\n    <mdep.analyze.excludedClasses>io.demo.app.*</mdep.analyze.excludedClasses>\n  </properties>",
);

/** The dependencies control qualified by its witnesses on the copy of `reactor`, then its pass on the reference. */
async function qualifiedAndPassed(prefix: string, reactor: Record<string, string>, cleanups: string[]) {
	const root = outputDir(prefix, cleanups);
	const { reference, detection } = declaredReference(root, reactor);
	const dependencies = detection.controls.find((c) => c.control_id === "dependencies");
	const own = detection.own_negative_witness.dependencies;
	assert.ok(
		dependencies && own,
		`the copy gets the dependencies control and its witness: ${detection.controls.map((c) => c.control_id).join(", ")}`,
	);
	const bench = mavenBench(root);
	// The positive witness of this control is the reference alone.
	const q = await qualifyByWitnesses(bench, root, reference, dependencies, {}, own);
	const pass = (
		await bench.runner.runControl({ ...bench.base, control: widenForMaven(dependencies), workspace_path: reference })
	).evidence;
	return { q, pass };
}

/** Both gaps of the reactor are reported, at their file and their line. */
function assertBothGaps(pass: Awaited<ReturnType<typeof qualifiedAndPassed>>["pass"]): void {
	assert.equal(pass.verdict, "FAIL", pass.limits.notes.join("; "));
	const located = pass.findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);
	for (const expected of [
		`${USED_UNDECLARED} | ${MAIN}:${lineOf(MAIN, "import io.demo.domain.User;")}`,
		`${UNUSED_DECLARED} | ${INFRASTRUCTURE_POM}:${lineOf(INFRASTRUCTURE_POM, "<artifactId>guava</artifactId>")}`,
	])
		assert.ok(located.includes(expected), `${expected} in\n${located.join("\n")}`);
}

describe("the configuration of the project silences no gap of the dependencies control", {
	skip: !mavenAvailable && "mvn is not on PATH",
}, () => {
	const cleanups = removedAfterEach();

	it("un POM d'app qui ignore io.demo:domain et saute l'analyse dans une exécution default-cli, et un parent qui ignore toute déclaration inutilisée dans sa gestion des greffons, laissent le contrôle des dépendances qualifié et la passe de référence rapporte l'usage de io.demo:domain par app et la déclaration inutilisée de Guava", async () => {
		const reactor = {
			...DEPENDENCIES_REACTOR,
			"pom.xml": PARENT_MANAGES_THE_PLUGIN,
			"app/pom.xml": APP_CONFIGURES_THE_PLUGIN,
		};
		assert.notEqual(reactor["pom.xml"], ROOT_POM, "the parent manages the plugin");
		assert.notEqual(reactor["app/pom.xml"], APP_POM, "app configures the plugin");
		const { q, pass } = await qualifiedAndPassed("maven-dependencies-plugin-configuration-", reactor, cleanups);
		assert.deepEqual([q.positive, q.negative, q.qualified], ["PASS", "FAIL", true], JSON.stringify(q.notes));
		assertBothGaps(pass);
	});

	it("les propriétés mdep.analyze.skip et mdep.analyze.excludedClasses du parent et un .mvn/maven.config qui saute l'analyse laissent le contrôle qualifié et la passe de référence rapporte les deux écarts", async () => {
		const reactor = {
			...DEPENDENCIES_REACTOR,
			"pom.xml": PARENT_SETS_THE_PROPERTIES,
			".mvn/maven.config": "-Dmdep.analyze.skip=true\n",
		};
		assert.notEqual(reactor["pom.xml"], ROOT_POM, "the parent sets the properties of the plugin");
		const { q, pass } = await qualifiedAndPassed("maven-dependencies-properties-", reactor, cleanups);
		assert.deepEqual([q.positive, q.negative, q.qualified], ["PASS", "FAIL", true], JSON.stringify(q.notes));
		assertBothGaps(pass);
	});
});
