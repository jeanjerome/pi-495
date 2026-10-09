/**
 * Development control (not part of the deterministic suites): explores a finite TLA+ model with TLC, as an
 * approved manifest pins it, and prints what the exploration establishes.
 *
 * Usage: node scripts/check-formal.ts <manifest.json> --jar <tla2tools.jar> [--java <java>] [--store <directory>]
 *
 * The manifest names the model, its configuration, the sha256 of every file the model is made of, the
 * properties the exploration must check, the TLC it was approved with and the budget of a run. Nothing is
 * downloaded or installed: the jar and the Java runtime are the developer's, and the jar must be the approved
 * one byte for byte. The pinned files are copied into a disposable directory, TLC runs there as an argument
 * array through the project's control runner under the time, output and memory budget of the manifest, and
 * its raw output and the normalised report go to the object store under `--store` (`~/.495/formal/objects`
 * by default).
 *
 * Exit status: 0 completed, 1 counterexample, 2 inconclusive, 3 error. Only 0 lets what depends on the model
 * go on, and it covers the model under its bounds, never the program the model describes.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { digestValue } from "../src/contracts/digest.ts";
import { readersOf } from "../src/adapters/execution/common-readers.ts";
import { GenericControlRunner } from "../src/adapters/execution/runner.ts";
import type { TlcOutcome, TlcResult } from "../src/adapters/formal/tlc.ts";
import { CasObjectStore } from "../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../src/adapters/sandbox/backends.ts";
import { messageOf } from "../src/domain/errors.ts";

interface FormalManifest {
	model: string;
	config: string;
	/** Every file of the model, its configuration included, by path relative to the manifest, with its sha256. */
	files: Record<string, string>;
	required_properties: string[];
	tool: { name: "TLC"; version: string; jar_sha256: string };
	budget: { timeout_ms: number; max_output_bytes: number; workers: number; heap_mb: number };
}

interface FormalReport {
	manifest: { path: string; sha256: string };
	model: string;
	config: string;
	files: Record<string, string>;
	required_properties: string[];
	tool: { name: "TLC"; version: string; jar: string; jar_sha256: string; java: string };
	budget: FormalManifest["budget"];
	sandbox: string;
	outcome: TlcOutcome;
	/** Whether the run is the PASS of the model: completed, every required property checked. */
	pass: boolean;
	reasons: string[];
	result: TlcResult | null;
	raw: { name: string; digest: string }[];
}

const EXIT_OF: Record<TlcOutcome, number> = { completed: 0, counterexample: 1, inconclusive: 2, error: 3 };

function sha256Of(path: string): string {
	return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
	return typeof value === "object" && value !== null && Object.values(value).every((v) => typeof v === "string");
}

function positive(value: unknown): boolean {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** The manifest, or the first field that does not hold, named with the form it should take. */
function manifestOf(text: string): FormalManifest {
	const m = JSON.parse(text) as Partial<FormalManifest>;
	const fault =
		(typeof m.model !== "string" && "model: the .tla file of the root module") ||
		(typeof m.config !== "string" && "config: the .cfg file TLC is given") ||
		(!isRecordOfStrings(m.files) && 'files: { "<path>": "sha256:<hex>" } for every file of the model') ||
		(!(Array.isArray(m.required_properties) && m.required_properties.length > 0) &&
			"required_properties: the invariants and properties the exploration must check, at least one") ||
		(!(m.tool?.name === "TLC" && typeof m.tool.version === "string" && typeof m.tool.jar_sha256 === "string") &&
			'tool: { "name": "TLC", "version": "<as TLC prints it>", "jar_sha256": "sha256:<hex>" }') ||
		(!(
			positive(m.budget?.timeout_ms) &&
			positive(m.budget?.max_output_bytes) &&
			positive(m.budget?.workers) &&
			positive(m.budget?.heap_mb)
		) &&
			"budget: positive integers timeout_ms, max_output_bytes, workers and heap_mb");
	if (fault) throw new Error(`the manifest does not hold: ${fault}`);
	return m as FormalManifest;
}

/** Why the model on disk is not the one the manifest approved, or null when it is. */
function unapprovedFiles(manifest: FormalManifest, directory: string): string | null {
	for (const file of [manifest.model, manifest.config])
		if (!(file in manifest.files)) return `${file} is not among the files the manifest pins`;
	for (const [file, approved] of Object.entries(manifest.files)) {
		const path = join(directory, file);
		if (!existsSync(path)) return `${file} is absent from ${directory}`;
		const actual = sha256Of(path);
		if (actual !== approved) return `${file} is ${actual}, the manifest approves ${approved}`;
	}
	return null;
}

/** Why the jar cannot be run as the approved TLC, said with what to provide, or null when it can. */
function missingTool(manifest: FormalManifest, jar: string | undefined): string | null {
	const approved = `TLC ${manifest.tool.version}, ${manifest.tool.jar_sha256}`;
	if (jar === undefined) return `no tla2tools.jar named: pass --jar <path> to the jar of ${approved}`;
	if (!existsSync(jar)) return `no tla2tools.jar at ${jar}: pass --jar <path> to the jar of ${approved}`;
	const actual = sha256Of(jar);
	if (actual !== manifest.tool.jar_sha256) return `the jar at ${jar} is ${actual}, not the approved ${approved}`;
	return null;
}

/** A completed exploration that left a required property unchecked proves less than the manifest asks. */
function normalised(result: TlcResult, required: readonly string[]): { outcome: TlcOutcome; reasons: string[] } {
	if (result.outcome !== "completed") return { outcome: result.outcome, reasons: result.reasons };
	const unchecked = required.filter((name) => !result.properties.some((p) => p.name === name && p.verified));
	return unchecked.length === 0
		? { outcome: "completed", reasons: [] }
		: { outcome: "error", reasons: [`the configuration does not activate the required ${unchecked.join(", ")}`] };
}

async function explore(
	manifestPath: string,
	options: { jar: string | undefined; java: string; store: CasObjectStore },
): Promise<FormalReport> {
	const text = readFileSync(manifestPath, "utf8");
	const manifest = manifestOf(text);
	const directory = dirname(manifestPath);
	const report = (
		outcome: TlcOutcome,
		reasons: string[],
		result: TlcResult | null = null,
		raw: FormalReport["raw"] = [],
	): FormalReport => ({
		manifest: { path: manifestPath, sha256: `sha256:${createHash("sha256").update(text).digest("hex")}` },
		model: manifest.model,
		config: manifest.config,
		files: manifest.files,
		required_properties: manifest.required_properties,
		tool: { ...manifest.tool, jar: options.jar ?? "", java: options.java },
		budget: manifest.budget,
		sandbox: "unconfined",
		outcome,
		pass: outcome === "completed",
		reasons,
		result,
		raw,
	});
	const tool = missingTool(manifest, options.jar);
	if (tool !== null) return report("error", [`capability missing: ${tool}`]);
	const files = unapprovedFiles(manifest, directory);
	if (files !== null) return report("error", [`the model is not the approved one: ${files}`]);

	const work = mkdtempSync(join(tmpdir(), "495-formal-"));
	try {
		for (const file of Object.keys(manifest.files)) {
			mkdirSync(dirname(join(work, file)), { recursive: true });
			copyFileSync(join(directory, file), join(work, file));
		}
		mkdirSync(join(work, "tmp"));
		const { budget } = manifest;
		const runner = new GenericControlRunner(new UnconfinedSandbox(), options.store, readersOf([]), {
			max_output_bytes: budget.max_output_bytes,
		});
		const identity = digestValue(manifest.files);
		const { evidence } = await runner.runControl({
			control: {
				control_id: `tlc-${basename(manifest.model, ".tla")}`,
				version: manifest.tool.version,
				title: `TLC on ${manifest.model}`,
				command: [
					options.java,
					`-Xmx${budget.heap_mb}m`,
					// TLC writes the standard modules it reads out of its jar there: they stay in the disposable copy.
					`-Djava.io.tmpdir=${join(work, "tmp")}`,
					"-XX:+UseParallelGC",
					"-cp",
					resolve(options.jar ?? ""),
					"tlc2.TLC",
					"-tool",
					"-workers",
					String(budget.workers),
					"-metadir",
					"states",
					"-config",
					manifest.config,
					manifest.model,
				],
				cwd: ".",
				env_allowlist: ["PATH", "HOME", "JAVA_HOME"],
				env: {},
				timeout_ms: budget.timeout_ms,
				parser: "tlc",
				report_path: null,
				structure_rules: [],
				provides: [],
				requires: [],
				scope_argument: null,
				network: "denied",
				writable_paths: [work],
				requirement_refs: [],
				protected: true,
				protected_paths: [],
			},
			protocol: { protocol_id: "formal", revision: 1, content_digest: digestValue(manifest) },
			candidate: { candidate_id: "model", manifest_digest: identity, base_digest: identity, workspace_id: work },
			// The subject is the model, an artifact: what TLC establishes is never said of a program candidate.
			subject: { kind: "artifact", id: basename(manifest.model, ".tla"), revision: 1, digest: identity },
			workspace_path: work,
			environment: { environment_id: "formal", digest: digestValue({ java: options.java }), profile_id: "verify" },
			requirement_refs: [],
			producer: {
				actor_id: "check-formal",
				actor_type: "executor",
				role: "executor",
				origin: "executor",
				authentication_level: "host_qualified",
			},
		});
		const raw = evidence.artifacts.map((a) => ({ name: a.name, digest: a.ref.digest }));
		const result = evidence.facts.tlc as TlcResult | undefined;
		if (result === undefined) return report("error", evidence.limits.notes, null, raw);
		const { outcome, reasons } = normalised(result, manifest.required_properties);
		return report(outcome, reasons, result, raw);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}

function printed(report: FormalReport, stored: string): string {
	const result = report.result;
	const lines = [
		`${report.model} with ${report.config}: ${report.outcome}${report.pass ? " — PASS for the model under its bounds" : " — not PASS"}`,
		...report.reasons.map((reason) => `  ${reason}`),
		`tool: TLC ${result?.tool.version ?? report.tool.version}, jar ${report.tool.jar_sha256}, java ${report.tool.java}`,
		`files: ${Object.entries(report.files)
			.map(([file, digest]) => `${file} ${digest}`)
			.join(", ")}`,
		`required: ${report.required_properties.join(", ")}`,
		`budget: ${report.budget.timeout_ms} ms, ${report.budget.max_output_bytes} bytes of output, ${report.budget.workers} worker(s), ${report.budget.heap_mb} MB of heap; sandbox ${report.sandbox}`,
		...(result ? explored(result) : []),
		...report.raw.map((a) => `raw ${a.name}: ${a.digest}`),
		`report: ${stored}`,
	];
	return lines.join("\n");
}

/** What TLC's own output establishes: properties, bounds, assumptions, modules, search and counterexample. */
function explored(result: TlcResult): string[] {
	const lines = [
		`properties: ${result.properties.map((p) => `${p.name} (${p.kind}) ${p.verified ? "verified" : "not verified"}`).join(", ") || "none"}`,
		`bounds: ${
			Object.entries(result.bounds)
				.map(([name, value]) => `${name} = ${value}`)
				.join(", ") || "none"
		}`,
		`assumptions: ${result.assumptions.join("; ") || "none"}`,
		`modules: ${result.modules.join(", ")}`,
		`search: ${result.exhaustive ? "exhaustive breadth-first" : "not exhaustive"}; states: ${result.states ? `${result.states.generated} generated, ${result.states.distinct} distinct` : "unknown"}; depth: ${result.depth ?? "unknown"}; ${result.duration_ms} ms`,
	];
	if (result.counterexample) {
		lines.push(`counterexample to ${result.counterexample.property}:`);
		for (const state of result.counterexample.trace)
			lines.push(`  ${state.step}: <${state.action}>`, ...state.state.split("\n").map((v) => `     ${v}`));
	}
	return lines;
}

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { jar: { type: "string" }, java: { type: "string" }, store: { type: "string" } },
});
const manifestPath = positionals[0];
if (manifestPath === undefined) {
	console.error(
		"usage: node scripts/check-formal.ts <manifest.json> --jar <tla2tools.jar> [--java <java>] [--store <dir>]",
	);
	process.exit(3);
}
const store = new CasObjectStore(values.store ?? join(homedir(), ".495", "formal", "objects"));
let report: FormalReport;
try {
	report = await explore(resolve(manifestPath), { jar: values.jar, java: values.java ?? "java", store });
} catch (error) {
	console.error(`error: ${manifestPath}: ${messageOf(error)}`);
	process.exit(3);
}
const stored = await store.putText(`${JSON.stringify(report, null, 2)}\n`, "application/json");
console.log(printed(report, stored.digest));
process.exit(EXIT_OF[report.outcome]);
