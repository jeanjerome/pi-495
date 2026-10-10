/**
 * The reuse of an exploration of a formal model (CMP-VER). An exploration proves the model under its bounds and reads
 * nothing of the program: a later candidate of the same change, holding the same model, cites the original proof
 * instead of exploring it again. It is cited only while everything it read is identified and unchanged — the closure
 * of the model's modules, its configuration, the Java runtime, the jar, the variables the control passes, the frozen
 * package and the environment — while it was conclusive, and while its record and its output are intact. Anything
 * else explores again, and the evidence says why. The controls of the program beside it never take this path.
 */
import { readFile } from "node:fs/promises";
import { isAbsolute, join, posix } from "node:path";
import { digestBytes, digestValue } from "../contracts/digest.ts";
import type { ProtocolRef } from "../contracts/v1/common.ts";
import { type Evidence, type EvidenceCandidate, evidenceDigest } from "../contracts/v1/evidence.ts";
import type { ControlDefinition } from "../contracts/v1/protocol.ts";
import { type FormalInputs, importedModules, TLC_STANDARD_MODULES } from "../domain/formal-package.ts";
import type { ControlInvocation } from "../ports/execution.ts";
import type { ObjectStorePort } from "../ports/object-store.ts";

/** The verdicts an exploration concludes on: a completed exploration and a counterexample. */
const CONCLUSIVE = new Set(["PASS", "FAIL"]);

async function digestOf(path: string): Promise<string | null> {
	const bytes = await readFile(path).catch(() => null);
	return bytes ? digestBytes(bytes) : null;
}

/** What one exploration reads: its root model and configuration, the tools it runs and the variables it passes. */
export interface ExplorationReads {
	/** From the root of the copy, as `config` and `cwd` are. */
	model: string;
	config: string;
	/** The directory TLC runs in, from the root of the copy: the first it looks for a module in. */
	cwd: string;
	tools: readonly string[];
	env_allowlist: readonly string[];
}

/**
 * The root model and every module it reaches in the copy at `root`, each by digest, looked for where TLC 2.19 looks:
 * the directory it runs in, then the root model's, then the modules it ships. A module found in none of them is not
 * identified. A file of either directory named after a module TLC ships is read in its place whoever names it, so it
 * enters the closure imported or not.
 */
async function moduleClosure(reads: ExplorationReads, root: string): Promise<Record<string, string | null>> {
	const modules: Record<string, string | null> = {};
	const names: string[] = [];
	const readModule = async (path: string): Promise<boolean> => {
		if (path in modules) return modules[path] !== null;
		const bytes = await readFile(join(root, path)).catch(() => null);
		if (!bytes) return false;
		modules[path] = digestBytes(bytes);
		names.push(...importedModules(bytes.toString("utf8")));
		return true;
	};
	if (!(await readModule(reads.model))) modules[reads.model] = null;
	const modelDirectory = posix.dirname(reads.model);
	const directories = [...new Set([posix.normalize(reads.cwd), modelDirectory])];
	for (const directory of directories)
		for (const name of TLC_STANDARD_MODULES) await readModule(posix.join(directory, `${name}.tla`));
	const resolved = new Set<string>();
	for (let name = names.pop(); name !== undefined; name = names.pop()) {
		if (resolved.has(name)) continue;
		resolved.add(name);
		let found = false;
		for (const directory of directories) if (!found) found = await readModule(posix.join(directory, `${name}.tla`));
		if (!found && !TLC_STANDARD_MODULES.has(name)) modules[posix.join(modelDirectory, `${name}.tla`)] = null;
	}
	return modules;
}

/**
 * What an exploration reads in the copy at `root`, each by digest: the configuration, then the closure of its modules,
 * then the tools and the variables it passes. A tool named by something other than its path is not identified.
 */
export async function formalInputsOf(
	reads: ExplorationReads,
	root: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<FormalInputs> {
	const inputs: Record<string, string | null> = { [reads.config]: await digestOf(join(root, reads.config)) };
	Object.assign(inputs, await moduleClosure(reads, root));
	for (const tool of reads.tools) inputs[tool] = isAbsolute(tool) ? await digestOf(tool) : null;
	for (const name of reads.env_allowlist) inputs[`env:${name}`] = digestValue(env[name] ?? null);
	return inputs;
}

/**
 * The modules of `processed`, those TLC reports it processed, that the closure in `inputs` does not cover: what the
 * reading of the imports missed. Only a module file covers a module, never a tool or a variable of the same name, and a
 * name is enough since the closure resolves each one to the file TLC reads; a module TLC ships is covered by the jar,
 * since the closure holds any file of the directories TLC looks in that would stand in its place.
 */
export function uncoveredModules(processed: readonly string[], inputs: FormalInputs): string[] {
	const modules = Object.keys(inputs).filter((path) => path.endsWith(".tla"));
	const read = new Set(modules.map((path) => posix.basename(path, ".tla")));
	return processed.filter((m) => !TLC_STANDARD_MODULES.has(m) && !read.has(m));
}

/** The modules TLC reports it processed in the exploration `original`. */
function processedModules(original: Evidence): string[] {
	const tlc = original.facts.tlc as { modules?: unknown } | undefined;
	return Array.isArray(tlc?.modules) ? tlc.modules.filter((m) => typeof m === "string") : [];
}

/** Why `original` cannot be cited as it stands, or null when its record and every object it keeps are intact. */
async function alteration(original: Evidence, objects: ObjectStorePort, inputs: FormalInputs): Promise<string | null> {
	const id = original.evidence_id;
	if (evidenceDigest(original) !== original.integrity.content_digest) return `the record of ${id} is altered`;
	for (const artifact of original.artifacts)
		if (!(await objects.verify(artifact.ref.digest)))
			return `the ${artifact.name} of ${id} is lost or altered (${artifact.ref.digest})`;
	const missed = uncoveredModules(processedModules(original), inputs);
	return missed.length > 0 ? `${id} read ${missed.join(", ")}, which its identity does not cover` : null;
}

type ExplorationLookup = { original: Evidence } | { rerun_because: string };

/**
 * The latest exploration of this change whose inputs digest is `key`, run under the same environment and protocol
 * revision, when it concluded and is intact; otherwise why the model is to be explored again. Only an execution is
 * cited, never a citation, so every reuse names the original proof.
 */
export async function establishedExploration(
	evidence: readonly Evidence[],
	control: ControlDefinition,
	inputs: FormalInputs,
	key: string,
	context: { environment_digest: string; protocol: ProtocolRef; objects: ObjectStorePort },
): Promise<ExplorationLookup> {
	const unidentified = Object.keys(inputs).filter((name) => inputs[name] === null);
	if (unidentified.length > 0) return { rerun_because: `inputs not identified: ${unidentified.join(", ")}` };
	const original = evidence.findLast(
		(e) =>
			e.control_id === control.control_id &&
			e.facts.run === "candidate" &&
			e.inputs_digest === key &&
			e.environment_digest === context.environment_digest &&
			e.protocol_revision.protocol_id === context.protocol.protocol_id &&
			e.protocol_revision.revision === context.protocol.revision,
	);
	if (!original) return { rerun_because: "no earlier exploration read the same model, tool and environment" };
	if (!CONCLUSIVE.has(original.verdict))
		return {
			rerun_because: `the exploration ${original.evidence_id} ended ${original.verdict}, which concludes nothing`,
		};
	const altered = await alteration(original, context.objects, inputs);
	return altered ? { rerun_because: altered } : { original };
}

/**
 * The evidence that cites `original` for the candidate of `invocation`: its verdict, findings and objects by
 * reference, over the time the lookup took, and no fact of an execution — no command, no duration.
 */
export function citationOf(
	original: Evidence,
	invocation: ControlInvocation,
	key: string,
	span: { started_at: string; ended_at: string },
): EvidenceCandidate {
	return {
		control_id: original.control_id,
		control_version: original.control_version,
		requirement_refs: invocation.requirement_refs,
		subject: invocation.subject,
		protocol_revision: invocation.protocol,
		environment: invocation.environment,
		inputs_digest: key,
		...span,
		verdict: original.verdict,
		facts: { run: "reused", reused_from: original.evidence_id },
		findings: original.findings,
		artifacts: original.artifacts,
		limits: original.limits,
		baseline: original.baseline,
		producer: invocation.producer,
	};
}
