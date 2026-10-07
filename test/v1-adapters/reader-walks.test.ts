import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { workspaceFiles } from "../../src/adapters/execution/workspace-files.ts";
import { removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";

let ws: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	ws = tempDir("495-reader-walks-", cleanups);
});

/** A technology whose tools write under `fict-out/` and which installs its dependencies under `fict_modules/`. */
const FICT_LAYOUT = { outputs: ["fict-out/"], installed_dependencies: "fict_modules" };

describe("the directory walks of the readers follow the technology of the copy", () => {
	it("given a technology that declares fict-out/ and fict_modules, then the source tree skips both and still reads target/ and build/, which it does not declare", async () => {
		writeFiles(ws, {
			"src/A.java": "class A {}\n",
			"fict-out/Generated.java": "class Generated {}\n",
			"fict_modules/dep/Dep.java": "class Dep {}\n",
			"target/Target.java": "class Target {}\n",
			"build/Build.java": "class Build {}\n",
		});
		const tree = await workspaceFiles(ws, null, async () => {}, FICT_LAYOUT).tree([""], ".java");
		assert.deepEqual(
			tree.files.map((f) => f.path),
			["build/Build.java", "src/A.java", "target/Target.java"],
		);
	});

	it("given a technology that installs its dependencies under fict_modules, then a recursive report path reads the reports of the project and none under fict_modules", async () => {
		writeFiles(ws, {
			"module/target/surefire-reports/TEST-a.xml": "<testsuite/>",
			"fict_modules/dep/target/surefire-reports/TEST-b.xml": "<testsuite/>",
		});
		const docs = await workspaceFiles(ws, "**/target/surefire-reports", async () => {}, FICT_LAYOUT).reports(
			"application/xml",
		);
		assert.deepEqual(
			docs.map((d) => d.name),
			["module/target/surefire-reports/TEST-a.xml"],
		);
	});
});
