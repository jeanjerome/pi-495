/**
 * Manual campaign (not part of the deterministic suites): prints the PRE-01 control-capability
 * diagnosis of a target, for a requirement asking for new behaviour and for one the target is
 * expected to keep. It answers, without running anything, whether a change on that target would
 * open a preparation phase.
 * Usage: node scripts/diagnose-capability.ts <project path>
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitWorkspace, DEFAULT_WORKSPACE_POLICY } from "../src/adapters/workspace/git-workspace.ts";
import { detectStack } from "../src/application/target.ts";
import { diagnoseControlCapability, referenceTestFiles } from "../src/application/preparation.ts";

const project = process.argv[2];
if (!project) {
	console.error("usage: node scripts/diagnose-capability.ts <project path>");
	process.exit(2);
}
const workspace = new GitWorkspace(mkdtempSync(join(tmpdir(), "495-diagnose-")));
const reference = await workspace.captureReference(project, DEFAULT_WORKSPACE_POLICY);
const handle = await workspace.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
try {
	const detection = detectStack(handle.path, [{ requirement_id: "R1", revision: 1 }]);
	const test_files = referenceTestFiles(reference, detection.preparation_paths);
	const addition = { requirement_id: "R-new", mandatory: true, satisfied_by_reference: false };
	const preservation = { requirement_id: "R-kept", mandatory: true, satisfied_by_reference: true };
	console.log(`stack: ${detection.stack}`);
	console.log(`test roots: ${detection.preparation_paths.join(", ") || "none"}`);
	console.log(`test files named as such: ${test_files.length}`);
	for (const [label, requirements] of [
		["behaviour to add", [addition]],
		["behaviour to keep", [preservation]],
	] as const) {
		const diagnosis = diagnoseControlCapability({
			stack: detection.stack,
			test_files,
			requirements,
			suite: null,
			prepared: null,
		});
		const opens = diagnosis.undiscriminated_requirements.length > 0 && detection.preparation_paths.length > 0;
		console.log(`\n${label}: level ${diagnosis.level}, preparation ${opens ? "opens" : "does not open"}`);
		for (const note of diagnosis.notes) console.log(`  - ${note}`);
	}
} finally {
	await workspace.closeWorkspace(handle.workspace_id, "delete");
}
