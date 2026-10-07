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
import { mavenResolutionCommand } from "../../src/application/installation.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { ControlDefinition, FileEdit, PackageInstall } from "../../src/contracts/v1/protocol.ts";
import type { ControlInvocation } from "../../src/ports/execution.ts";
import { ENV, EXECUTOR } from "./change-fixture.ts";
import { NO_QUALIFIED_SANDBOX, writeFiles } from "./fixtures.ts";
import { READERS_OF_495 } from "./technologies.ts";

export interface MavenBench {
	runner: GenericControlRunner;
	base: Omit<ControlInvocation, "control" | "workspace_path">;
}

/** The generic runner on the platform sandbox, its object store under `root`, and the base request. */
export function mavenBench(root: string): MavenBench {
	const sandbox = selectSandbox({ allow_unconfined: NO_QUALIFIED_SANDBOX });
	return {
		runner: new GenericControlRunner(sandbox.backend, new CasObjectStore(join(root, "objects")), READERS_OF_495),
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

/**
 * The copy of `project` under `root` where the controls run, its POM edited by `edit`, with what the controls
 * read offline in the local repository: the plugins and the site skin the adoption resolves, and the project's
 * own dependencies, which a machine that builds the project already holds.
 */
export function mavenReference(root: string, project: string, edit: FileEdit, install: PackageInstall): string {
	// The copy where the controls run declares the plugin; the project itself is never written.
	const reference = join(root, "reference");
	cpSync(project, reference, { recursive: true });
	writeFileSync(join(reference, "pom.xml"), editedFile(project, edit) ?? "");
	// The resolution, the one step that may open the network, runs once outside the sandbox, in a copy of its
	// own so that no build output reaches the reference.
	const primed = join(root, "primed");
	cpSync(reference, primed, { recursive: true });
	const [mvn = "mvn", ...resolution] = mavenResolutionCommand([install]);
	execFileSync(mvn, [...resolution, "-q", "test-compile"], { cwd: primed, stdio: "ignore", timeout: 10 * 60_000 });
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
