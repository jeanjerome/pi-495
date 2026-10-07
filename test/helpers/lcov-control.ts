import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import type { EvidenceCandidate } from "../../src/contracts/v1/evidence.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type { IntroducedLines } from "../../src/ports/execution.ts";
import { controlOf, invocationBase } from "./execution-fixture.ts";
import { READERS_OF_495 } from "./technologies.ts";

export const LCOV_REPORT = "495-lcov.info";

/** A report recorded from a real runner, kept under `test/fixtures/lcov/`. */
export function recordedLcov(name: string): string {
	return readFileSync(new URL(`../fixtures/lcov/${name}`, import.meta.url), "utf8");
}

/** The coverage control a Node target declares: it runs nothing and reads the report `unit` left. */
export function lcovControl(over: Partial<ControlDefinition> = {}): ControlDefinition {
	return controlOf({
		control_id: "coverage",
		title: "introduced-line coverage, read from the LCOV report of the test run",
		parser: "lcov",
		report_path: LCOV_REPORT,
		requires: ["lcov-report"],
		protected_paths: ["test/", "tests/", "package.json"],
		...over,
	});
}

/** A copy of a project holding the given files, the LCOV report among them. */
export function workspaceWith(root: string, name: string, files: Record<string, string>): string {
	const workspace = join(root, name);
	mkdirSync(workspace, { recursive: true });
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(workspace, path)), { recursive: true });
		writeFileSync(join(workspace, path), text);
	}
	return workspace;
}

/** The coverage control run on a workspace, with the introduced lines it is to judge. */
export async function judgeCoverage(
	root: string,
	workspace: string,
	introduced: IntroducedLines | null,
	control: ControlDefinition = lcovControl(),
): Promise<EvidenceCandidate> {
	const runner = new GenericControlRunner(
		new UnconfinedSandbox(),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);
	const { evidence } = await runner.runControl({
		...invocationBase(),
		control,
		workspace_path: workspace,
		introduced_lines: introduced,
	});
	return evidence;
}
