/**
 * PMD and CPD on a real Maven reactor whose `infrastructure` module declares its `domain` neighbour as
 * a dependency, through the generic runner and the platform sandbox, the network closed: Maven must
 * resolve the neighbour from the reactor, since the local repository never received it.
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

		const reference = join(root, "reference");
		cpSync(project, reference, { recursive: true });
		writeFileSync(join(reference, "pom.xml"), editedFile(project, edit) ?? "");
		// The resolution of the plugins, the one step that may open the network, runs once outside the sandbox.
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
			`the reactor that declares the plugin gets pmd and cpd: ${detection.controls.map((c) => c.control_id)}`,
		);
		for (const control of [pmd, cpd])
			assert.equal(control.network, "denied", `${control.control_id} runs with the network closed`);

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
				[q.positive, q.negative, q.qualified],
				["PASS", "FAIL", true],
				`${control.control_id}: ${JSON.stringify(q.notes)}`,
			);
			const unresolved = q.notes.filter((note) => /could not resolve dependencies/i.test(note));
			assert.deepEqual(unresolved, [], `${control.control_id}: no note names an unresolved dependency`);
		}

		const pmdPass = (await runner.runControl({ ...base, control: widen(pmd), workspace_path: reference })).evidence;
		assert.equal(pmdPass.verdict, "FAIL", pmdPass.limits.notes.join("; "));
		const located = pmdPass.findings.map((f) => `${f.rule_id} ${f.path}:${f.region?.start_line}`);
		assert.ok(located.includes(`UnusedPrivateMethod ${CACHE}:${FORGOTTEN_LINE}`), located.join(", "));
	});
});
