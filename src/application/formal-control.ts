/**
 * The control that explores the formal package the owner adopted (CMP-VER), built from the policy and never from a
 * file of the target nor from what an agent reports: no technology detects a model, and a project whose policy adopts
 * none gets no such control. It runs the TLC the owner named through the control runner, is read by the TLC reader,
 * protects every file of the package, and is qualified like the others, on the approved model and on its mutant.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ControlDefinition, FormalPackage } from "../contracts/v1/protocol.ts";
import { DomainError, messageOf } from "../domain/errors.ts";
import { formalPackageDigest } from "../domain/formal-package.ts";
import type { DetectedTechnology } from "./stacks/stack.ts";

const FORMAL_CONTROL = "formal-model";

/** Where TLC writes its states, inside the copy: the only path of the copy it is granted. */
const TLC_METADIR = ".495-tlc";
const TLC_STATES = `${TLC_METADIR}/states`;

/** The control exploring `pkg`, versioned by its identity, so that another package is another control. */
function formalControlOf(pkg: FormalPackage, revision: number): ControlDefinition {
	return {
		control_id: FORMAL_CONTROL,
		version: formalPackageDigest(pkg),
		title: `TLC on ${pkg.model}`,
		command: [
			pkg.tool.java,
			`-Xmx${pkg.budget.heap_mb}m`,
			// TLC writes the standard modules a model extends at a fixed name in its temporary directory, and deletes
			// them at exit: in a directory every exploration shares, one removes what another is parsing. Its states
			// directory is in the copy and exists once TLC starts, before any module is read.
			`-Djava.io.tmpdir=${TLC_STATES}`,
			"-XX:+UseParallelGC",
			"-cp",
			pkg.tool.jar,
			"tlc2.TLC",
			"-tool",
			"-workers",
			String(pkg.budget.workers),
			"-metadir",
			TLC_STATES,
			"-config",
			pkg.config,
			pkg.model,
		],
		cwd: ".",
		env_allowlist: ["PATH", "HOME", "TMPDIR", "JAVA_HOME"],
		env: {},
		timeout_ms: pkg.budget.timeout_ms,
		// The reader of TLC's `-tool` output, among the readers common to every technology.
		parser: "tlc",
		report_path: null,
		structure_rules: [],
		provides: [],
		requires: [],
		scope_argument: null,
		// TLC listens on a port of its own host at start (an RMI export, `Listen failed on port: 0` when refused): it
		// reaches itself, never another host.
		network: "loopback",
		writable_paths: [TLC_METADIR],
		requirement_refs: pkg.requirement_ids.map((requirement_id) => ({ requirement_id, revision })),
		protected: true,
		protected_paths: Object.keys(pkg.files),
		formal_package: pkg,
	};
}

/**
 * The detection with the control of the adopted package beside the controls of the technology: its positive witness
 * is the reference, which holds the approved model, and its negative witness the pinned mutant written in place of the
 * file it replaces, read from the reference. Without an adopted package, the detection as it was.
 */
export async function withFormalControl(
	detection: DetectedTechnology,
	pkg: FormalPackage | null,
	revision: number,
	referencePath: string,
): Promise<DetectedTechnology> {
	if (!pkg) return detection;
	const control = formalControlOf(pkg, revision);
	const { mutant, replaces } = pkg.expected_violation;
	const text = await readFile(join(referencePath, mutant), "utf8").catch((error: unknown) => {
		throw new DomainError(
			"CAPABILITY_MISSING",
			`the mutant ${mutant} of the adopted formal package cannot be read in the reference (${messageOf(error)}): commit it, or adopt another package`,
			{ nextActions: ["cancel"] },
		);
	});
	return {
		...detection,
		controls: [...detection.controls, control],
		own_negative_witness: { ...detection.own_negative_witness, [control.control_id]: { [replaces]: text } },
		reference_positive: [...(detection.reference_positive ?? []), control.control_id],
	};
}
