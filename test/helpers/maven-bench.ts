/**
 * The bench of a test that runs real Maven controls: the generic runner on the platform sandbox, the
 * environment Maven reads let through it, the request every control of the test shares, and, for the
 * quality controls, the reference copy that declares PMD and the qualification of a control by its witnesses.
 */
import { execFileSync } from "node:child_process";
import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { editedFile } from "../../src/application/complement.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { ControlDefinition, FileEdit } from "../../src/contracts/v1/protocol.ts";
import type { ControlInvocation } from "../../src/ports/execution.ts";
import { ENV, EXECUTOR } from "./change-fixture.ts";
import { writeFiles } from "./fixtures.ts";

export interface MavenBench {
	runner: GenericControlRunner;
	base: Omit<ControlInvocation, "control" | "workspace_path">;
}

/** The generic runner on the platform sandbox, its object store under `root`, and the base request. */
export function mavenBench(root: string): MavenBench {
	const sandbox = selectSandbox({ allow_unconfined: process.platform !== "darwin" });
	return {
		runner: new GenericControlRunner(sandbox.backend, new CasObjectStore(join(root, "objects"))),
		base: {
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
		},
	};
}

/** `c` with the environment Maven reads let through the sandbox. */
export function widenForMaven(c: ControlDefinition): ControlDefinition {
	return { ...c, env_allowlist: [...c.env_allowlist, "M2_HOME", "MAVEN_HOME", "JAVA_TOOL_OPTIONS", "USER"] };
}

/** The copy of `project` under `root` where the controls run, its POM edited by `edit` and its plugins resolved. */
export function mavenReference(root: string, project: string, edit: FileEdit): string {
	// The copy where the controls run declares the plugin; the project itself is never written.
	const reference = join(root, "reference");
	cpSync(project, reference, { recursive: true });
	writeFileSync(join(reference, "pom.xml"), editedFile(project, edit) ?? "");
	// The resolution of the plugins, the one step that may open the network, runs once outside the sandbox.
	execFileSync("mvn", ["-B", "-q", "org.apache.maven.plugins:maven-dependency-plugin:3.11.0:resolve-plugins"], {
		cwd: reference,
		stdio: "ignore",
		timeout: 10 * 60_000,
	});
	return reference;
}

/**
 * The qualification of `control`, widened for Maven, by its witnesses: each is a copy of `reference` under
 * `root` with the `positive` files, and the negative one adds the control's `own` files.
 */
export async function qualifyByWitnesses(
	bench: MavenBench,
	root: string,
	reference: string,
	control: ControlDefinition,
	positive: Record<string, string>,
	own: Record<string, string>,
) {
	const positivePath = join(root, `${control.control_id}-positive`);
	const negativePath = join(root, `${control.control_id}-negative`);
	for (const workspace of [positivePath, negativePath]) {
		cpSync(reference, workspace, { recursive: true });
		writeFiles(workspace, positive);
	}
	writeFiles(negativePath, own);
	return qualifyControl(
		bench.runner,
		widenForMaven(control),
		{
			positive_path: positivePath,
			negative_path: negativePath,
			positive_files: positive,
			negative_files: { ...positive, ...own },
		},
		bench.base,
	);
}
