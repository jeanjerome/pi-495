/**
 * The conformance script of the example technology, run as its guide says, after the build: it judges the
 * technology on its sample project under the sandbox of the platform and leaves that project as it was.
 */
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildUnlessPresent, PACKAGE_ROOT } from "../helpers/built-package.ts";
import { NO_QUALIFIED_SANDBOX } from "../helpers/fixtures.ts";

const SAMPLE_PROJECT = "examples/fictitious-technology/project";

/** What git sees of the sample project, ignored files included. */
function sampleProjectState(): string {
	return execFileSync("git", ["status", "--porcelain", "--ignored", "--untracked-files=all", "--", SAMPLE_PROJECT], {
		cwd: PACKAGE_ROOT,
		encoding: "utf8",
	});
}

describe("the conformance script of the example technology", {
	skip: NO_QUALIFIED_SANDBOX && "no sandbox backend qualifies on this machine",
}, () => {
	it("given the build, node examples/fictitious-technology/conformance.ts prints a report without finding, exits 0 and leaves the sample project as it was", () => {
		buildUnlessPresent("dist/stack.js");
		const before = sampleProjectState();
		const run = spawnSync(process.execPath, [join("examples", "fictitious-technology", "conformance.ts")], {
			cwd: PACKAGE_ROOT,
			encoding: "utf8",
		});
		assert.equal(run.status, 0, run.stdout + run.stderr);
		const report = JSON.parse(run.stdout) as { findings: string[]; projects: { controls: { control_id: string }[] }[] };
		assert.deepEqual(report.findings, [], "the report carries no finding");
		assert.deepEqual(
			report.projects.map((project) => project.controls.map((control) => control.control_id)),
			[["fict-tests"]],
			"the report judges the control of the example on its sample project",
		);
		assert.equal(sampleProjectState(), before, "the sample project is left as it was");
	});
});
