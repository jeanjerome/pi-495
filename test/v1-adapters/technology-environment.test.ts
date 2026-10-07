import { strict as assert } from "node:assert";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { NODE_PLUGIN } from "../../src/adapters/stacks/node/node.ts";
import { fixtureMavenMultiModule, removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const REFS = [{ requirement_id: "R1", revision: 1 }];
const JAVA_ENVIRONMENT = ["JAVA_HOME", "MAVEN_OPTS"];

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-technology-environment-", cleanups);
});

describe("a technology passes its controls the variables it declares, and those alone", () => {
	it("aucun contrôle de la détection d'un projet Node sous node --test ne porte JAVA_HOME ni MAVEN_OPTS dans son env_allowlist, et chaque contrôle de la détection d'un projet Maven porte les deux", () => {
		const node = join(root, "node");
		writeFiles(node, {
			"package.json": JSON.stringify({ name: "t", type: "module", scripts: { test: "node --test" } }),
		});
		const maven = join(root, "maven");
		fixtureMavenMultiModule(maven, true);

		const nodeControls = STACKS_OF_495.recognise(node, REFS).controls;
		const mavenControls = STACKS_OF_495.recognise(maven, REFS).controls;

		assert.ok(nodeControls.length > 0 && mavenControls.length > 0, "both projects are detected with controls");
		assert.deepEqual(
			nodeControls.flatMap((c) => c.env_allowlist.filter((name) => JAVA_ENVIRONMENT.includes(name))),
			[],
		);
		assert.deepEqual(
			mavenControls
				.filter((c) => !JAVA_ENVIRONMENT.every((name) => c.env_allowlist.includes(name)))
				.map((c) => c.control_id),
			[],
		);
	});
});

describe("the tools whose version identifies the environment", () => {
	it("given the technologies of 495, then the probes they declare are java -version and mvn -v, both from Maven", () => {
		assert.deepEqual(STACKS_OF_495.toolVersions(), { java: ["java", ["-version"]], mvn: ["mvn", ["-v"]] });
		assert.equal(NODE_PLUGIN.capabilities.workspace?.versions, undefined, "Node declares no tool");
	});
});
