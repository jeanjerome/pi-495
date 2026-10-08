/**
 * ArchUnit on a Maven reactor whose local repository held only what the build of the project fetches: the
 * resolution the adoption of the architecture map runs, with the network open, fetches everything the rules of
 * the map load, the runner of the tests included, so the architecture control is qualified by its witnesses with
 * the network closed on that repository alone.
 */
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { DEFAULT_WORKSPACE_POLICY, GitWorkspace } from "../../src/adapters/workspace/git-workspace.ts";
import { editedFile } from "../../src/application/complement.ts";
import { askedOutsideDirectory, bringInstalls, runInstall } from "../../src/application/installation.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { DOMAIN_MAP, DOMAIN_SOURCES } from "../helpers/architecture-survey.ts";
import { invocationBase } from "../helpers/execution-fixture.ts";
import { NO_QUALIFIED_SANDBOX, outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { READERS_OF_495, STACKS_OF_495 } from "../helpers/technologies.ts";

const mavenAvailable = spawnSync("mvn", ["-v"], { stdio: "ignore" }).status === 0;

const REFS = [{ requirement_id: "ARC-01", revision: 1 }];

const pom = (artifactId: string, dependsOn: readonly string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version></parent>
  <artifactId>${artifactId}</artifactId>
  <dependencies>
${dependsOn.map((d) => `    <dependency><groupId>io.demo</groupId><artifactId>${d}</artifactId><version>1.0.0</version></dependency>\n`).join("")}  </dependencies>
</project>
`;

/** The reactor of `domain` and `infrastructure`, which declares JUnit 5 and has no test yet: its build never loads the runner of JUnit tests. */
const REACTOR: Record<string, string> = {
	"pom.xml": `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version>
  <packaging>pom</packaging>
  <modules><module>domain</module><module>infrastructure</module></modules>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.10.2</version><scope>test</scope></dependency>
  </dependencies>
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
	"domain/pom.xml": pom("domain", []),
	"infrastructure/pom.xml": pom("infrastructure", ["domain"]),
	...DOMAIN_SOURCES,
};

describe("ArchUnit offline on a local Maven repository the build of the project and the adoption alone filled", {
	skip: !mavenAvailable && "mvn is not on PATH",
}, () => {
	const cleanups = removedAfterEach();
	it("sur un dépôt local de Maven que seuls le build du projet et l'adoption de la carte ont rempli, la résolution est resolved et le contrôle d'architecture est qualifié par ses témoins le réseau fermé", async () => {
		const root = outputDir("maven-architecture-offline-", cleanups);
		const repository = join(root, "m2");
		mkdirSync(repository);
		const project = join(root, "project");
		writeFiles(project, REACTOR);
		const offer = STACKS_OF_495.recognise(project, REFS, process.execPath, [], DOMAIN_MAP).architecture_verification;
		assert.equal(offer?.kind, "proposed");
		if (offer?.kind !== "proposed") return;
		const { edit, install } = offer.recommendation;
		assert.ok(edit && install, "the recommendation declares and resolves ArchUnit");

		// Maven reads MAVEN_ARGS from the environment each step passes on, the build's, the adoption's and the controls'.
		const previous = process.env.MAVEN_ARGS;
		process.env.MAVEN_ARGS = `-Dmaven.repo.local=${repository}`;
		try {
			// A machine that builds the project already holds what its build fetches; a copy is built, never the project.
			const built = join(root, "built");
			cpSync(project, built, { recursive: true });
			execFileSync("mvn", ["-B", "-q", "test"], { cwd: built, stdio: "ignore", timeout: 20 * 60_000 });

			const sandbox = selectSandbox({ allow_unconfined: NO_QUALIFIED_SANDBOX });
			const workspace = new GitWorkspace(join(root, "workspaces"));
			const snapshot = await workspace.captureReference(project, DEFAULT_WORKSPACE_POLICY);
			const brought = await bringInstalls(
				{
					workspace,
					workspacePolicy: DEFAULT_WORKSPACE_POLICY,
					install: (copyPath, command, manager, outside) =>
						runInstall(sandbox.backend, copyPath, command, manager, outside),
					outsideDirectory: async (copyPath, manager) => {
						const announced = await askedOutsideDirectory(sandbox.backend, manager, copyPath);
						return "path" in announced ? announced.path : null;
					},
				},
				STACKS_OF_495.installerOf("maven")!,
				snapshot,
				"",
				[install],
				edit,
			);
			assert.notEqual(brought.kind, "failed", brought.kind === "failed" ? brought.reason : "");

			const reference = join(root, "reference");
			cpSync(project, reference, { recursive: true });
			writeFileSync(join(reference, edit.path), editedFile(project, edit) ?? "");
			const detection = STACKS_OF_495.recognise(reference, REFS, process.execPath, [], DOMAIN_MAP);
			const control = detection.controls.find((c) => c.control_id === "architecture");
			const own = detection.own_negative_witness.architecture;
			assert.ok(control && own, "the copy that declares ArchUnit gets the architecture control and its own witness");
			assert.equal(control.network, "denied", "the architecture control runs with the network closed");
			const positive = join(root, "architecture-positive");
			const negative = join(root, "architecture-negative");
			for (const workspacePath of [positive, negative]) {
				cpSync(reference, workspacePath, { recursive: true });
				writeFiles(workspacePath, detection.positive_witness);
			}
			writeFiles(negative, own);
			const withRepository: ControlDefinition = {
				...control,
				env_allowlist: [...control.env_allowlist, "MAVEN_ARGS"],
			};
			const runner = new GenericControlRunner(
				sandbox.backend,
				new CasObjectStore(join(root, "objects")),
				READERS_OF_495,
				{ workspace_of: (workspacePath) => STACKS_OF_495.workspaceOf(workspacePath) },
			);
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
			assert.deepEqual([q.positive, q.negative, q.qualified], ["PASS", "FAIL", true], JSON.stringify(q.notes));
		} finally {
			if (previous === undefined) delete process.env.MAVEN_ARGS;
			else process.env.MAVEN_ARGS = previous;
		}
	});
});
