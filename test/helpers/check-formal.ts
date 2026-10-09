import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";

const CHECK_FORMAL = join(import.meta.dirname, "..", "..", "scripts", "check-formal.ts");
/** Where the standalone jar of the TLA+ release is kept, read when `TLA2TOOLS_JAR` names none. */
const LOCAL_JAR = join(homedir(), ".local", "share", "tlaplus", "tla2tools.jar");
const JAR = process.env.TLA2TOOLS_JAR ?? LOCAL_JAR;

/** Why an exploration cannot run on this machine, or false when TLC and Java are there. */
export const formalToolingMissing: string | false =
	(!existsSync(JAR) && `no tla2tools.jar at ${JAR}: set TLA2TOOLS_JAR to the jar of TLC 2.19`) ||
	(spawnSync("java", ["-version"]).status !== 0 && "java is not on PATH");

interface TraceState {
	step: number;
	action: string;
	state: string;
}

interface FormalReport {
	outcome: string;
	pass: boolean;
	reasons: string[];
	result: {
		properties: { name: string; kind: string; verified: boolean }[];
		bounds: Record<string, string>;
		counterexample: { property: string; trace: TraceState[] } | null;
	} | null;
}

/** A counterexample's trace with each action named by its operator alone, without its place in the module. */
export function normalisedTrace(trace: readonly TraceState[]): TraceState[] {
	return trace.map(({ step, action, state }) => ({ step, action: action.replace(/ line \d+, col .*$/, ""), state }));
}

/**
 * Runs the formal control on a manifest with the real TLC, and reads back the report it kept in the object
 * store; `report` is null when the control refused the manifest before exploring anything.
 */
export async function exploreManifest(
	manifest: string,
	store: string,
): Promise<{ output: string; report: FormalReport | null }> {
	const run = spawnSync(process.execPath, [CHECK_FORMAL, manifest, "--jar", JAR, "--store", store], {
		encoding: "utf8",
	});
	const output = run.stdout + run.stderr;
	const digest = /^report: (sha256:\w+)$/m.exec(output)?.[1];
	const bytes = digest ? await new CasObjectStore(store).get(digest) : null;
	const report = bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as FormalReport) : null;
	return { output, report };
}
