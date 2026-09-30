import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { EvidenceCandidate } from "../../src/contracts/v1/evidence.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type { ControlInvocation, IntroducedLines } from "../../src/ports/execution.ts";
import { EXECUTOR, ENV } from "./change-fixture.ts";

export const LCOV_REPORT = "495-lcov.info";

/** A report recorded from a real runner, kept under `test/fixtures/lcov/`. */
export function recordedLcov(name: string): string {
	return readFileSync(new URL(`../fixtures/lcov/${name}`, import.meta.url), "utf8");
}

/** The coverage control a Node target declares: it runs nothing and reads the report `unit` left. */
export function lcovControl(over: Partial<ControlDefinition> = {}): ControlDefinition {
	return {
		control_id: "coverage",
		version: "1",
		title: "introduced-line coverage, read from the LCOV report of the test run",
		command: [process.execPath, "-e", ""],
		cwd: ".",
		env_allowlist: ["PATH", "HOME", "TMPDIR"],
		env: {},
		timeout_ms: 30000,
		parser: "lcov",
		report_path: LCOV_REPORT,
		structure_rules: [],
		provides: [],
		requires: ["lcov-report"],
		scope_argument: null,
		network: "denied",
		writable_paths: [],
		requirement_refs: [{ requirement_id: "R1", revision: 1 }],
		protected: true,
		protected_paths: ["test/", "tests/", "package.json"],
		...over,
	};
}

export function invocationBase(): Omit<ControlInvocation, "control" | "workspace_path"> {
	return {
		protocol: { protocol_id: "p", revision: 1, content_digest: digestValue("p") },
		candidate: {
			candidate_id: "c",
			manifest_digest: digestValue("c"),
			base_digest: digestValue("b"),
			workspace_id: "w",
		},
		subject: { kind: "candidate", id: "c", revision: 1, digest: digestValue("c") },
		environment: { environment_id: "env", digest: ENV, profile_id: "verify" },
		requirement_refs: [{ requirement_id: "R1", revision: 1 }],
		producer: EXECUTOR,
	};
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
	const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
	const { evidence } = await runner.runControl({
		...invocationBase(),
		control,
		workspace_path: workspace,
		introduced_lines: introduced,
	});
	return evidence;
}
