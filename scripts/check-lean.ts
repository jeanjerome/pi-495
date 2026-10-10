/**
 * Development control (not part of the deterministic suites): verifies the Lean proofs of a project against the
 * manifest that approved its definitions and statements before any proof was sought, and prints what it
 * established as a JSON report.
 *
 * Usage: node scripts/check-lean.ts <manifest.json> [--project <directory>] [--toolchain <directory>]
 *
 * The manifest pins the toolchain, the sha256 of every protected file (the definitions, the statements and the
 * files that fix the project and its dependencies), the module to build, each theorem with the statement it must
 * prove, and the axioms a proof may reach. Nothing is downloaded or installed: the toolchain is the one elan keeps
 * on the machine, and it must print the approved version and commit. The project (by default the manifest's
 * directory) is copied into a disposable directory and built there with Lake under the platform sandbox — the copy
 * alone writable, no temporary directory, the network denied — from the protected `lakefile.toml` alone, whatever
 * other configuration the project holds, and with Lake's artifact cache turned off, so every module is compiled from
 * its source. The protected modules are built first, where no proof runs, and what they compile to is set aside out of
 * the reach of the build of the proofs, which cannot replace it. The kernel then replays every module of the project
 * (`leanchecker`) and `scripts/lean/Inspect.lean`, which the proofs do not reach, reads each theorem's declaration
 * and the axioms it reaches as `#print axioms` collects them, both from the `.olean` of each module set aside: the
 * protected modules as first compiled, the others as the build left them. The protected files are compared before
 * and after the build. A declaration the import files under another name than its own is refused: the kernel replay
 * adds it under its own name, so the replay and the inspection would not read the same declaration. So is a name a
 * module of the project declares when an earlier imported module already does: the kernel replay skips a theorem its
 * imports hold under the same name and type, while the import keeps the later copy, which no kernel has checked.
 *
 * A theorem is proved only when it is a theorem, its type is exactly the approved statement, the statement comes
 * from a protected file and it reaches no axiom outside the allowed list: neither the exit status of the build nor
 * a message of Lean is taken for a proof.
 *
 * Exit status: 0 proved, 1 refused, 3 error.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { selectSandbox } from "../src/adapters/sandbox/backends.ts";
import { messageOf } from "../src/domain/errors.ts";
import type { ProcessObservation, SandboxProfile } from "../src/ports/execution.ts";

interface LeanManifest {
	toolchain: { name: string; version: string; commit: string };
	/** Every protected file, by path relative to the project, with its sha256. */
	protected: Record<string, string>;
	module: string;
	theorems: { theorem: string; statement: string }[];
	allowed_axioms: string[];
	budget: { timeout_ms: number; max_output_bytes: number };
}

interface TheoremReport {
	theorem: string;
	statement: string;
	kind: string;
	states_approved: boolean;
	type: string | null;
	statement_module: string | null;
	axioms: string[];
	refused: string[];
}

interface LeanReport {
	manifest: string;
	project: string;
	verdict: "proved" | "refused" | "error";
	reasons: string[];
	toolchain: LeanManifest["toolchain"] & { path: string };
	sandbox: string;
	allowed_axioms: string[];
	protected: { file: string; approved: string; before: string | null; after: string | null }[];
	theorems: TheoremReport[];
	replay: { tool: "leanchecker"; module: string; passed: boolean } | null;
}

/** An imported declaration the import files under a name other than its own, as the inspection prints it. */
interface Misfiled {
	misfiled: string;
	name: string;
	module: string | null;
}

/** A name a module of the project declares when an earlier imported module already does, as the inspection prints it. */
interface DeclaredAgain {
	declared_again: string;
	first: string;
	again: string;
}

const EXIT_OF: Record<LeanReport["verdict"], number> = { proved: 0, refused: 1, error: 3 };
const INSPECT = join(import.meta.dirname, "lean", "Inspect.lean");
/** The only configuration Lake is told to read: a `lakefile.lean`, which Lake would prefer, is never read. */
const LAKE_CONFIGURATION = "lakefile.toml";

function sha256Of(path: string): string | null {
	if (!existsSync(path)) return null;
	return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

/** The manifest, or the first field that does not hold, named with the form it should take. */
function manifestOf(text: string): LeanManifest {
	const m = JSON.parse(text) as Partial<LeanManifest>;
	const fault =
		(!(
			typeof m.toolchain?.name === "string" &&
			typeof m.toolchain.version === "string" &&
			typeof m.toolchain.commit === "string"
		) &&
			'toolchain: { "name": "leanprover/lean4:v<x.y.z>", "version": "<x.y.z>", "commit": "<hash>" }') ||
		(!(typeof m.protected === "object" && m.protected !== null && Object.hasOwn(m.protected, LAKE_CONFIGURATION)) &&
			`protected: { "<path>": "sha256:<hex>" } for the definitions, the statements and the project files, ${LAKE_CONFIGURATION} among them`) ||
		(typeof m.module !== "string" && "module: the root module of the project") ||
		(!(Array.isArray(m.theorems) && m.theorems.length > 0) &&
			'theorems: [{ "theorem": "<name>", "statement": "<name>" }], at least one') ||
		(!Array.isArray(m.allowed_axioms) && "allowed_axioms: the axioms a proof may reach") ||
		(!(Number.isInteger(m.budget?.timeout_ms) && Number.isInteger(m.budget?.max_output_bytes)) &&
			"budget: integers timeout_ms and max_output_bytes");
	if (fault) throw new Error(`the manifest does not hold: ${fault}`);
	return m as LeanManifest;
}

/** Where elan installs a toolchain: `leanprover/lean4:v4.34.1` lives in `leanprover--lean4---v4.34.1`. */
function elanToolchain(name: string): string {
	const home = process.env.ELAN_HOME ?? join(homedir(), ".elan");
	return join(home, "toolchains", name.replace("/", "--").replace(":", "---"));
}

/** Why the toolchain cannot be run as the approved one, said with what to provide, or null when it can. */
function missingToolchain(toolchain: LeanManifest["toolchain"], path: string): string | null {
	const lean = join(path, "bin", "lean");
	const install = `elan toolchain install ${toolchain.name}`;
	if (!existsSync(lean)) return `no Lean toolchain at ${path}: ${install}`;
	const printed = spawnSync(lean, ["--version"], { encoding: "utf8" }).stdout ?? "";
	if (!printed.includes(`version ${toolchain.version},`) || !printed.includes(`commit ${toolchain.commit}`))
		return `${lean} prints ${printed.trim()}, not version ${toolchain.version} at commit ${toolchain.commit}`;
	return null;
}

/** `Verdicts/Statements.lean` is the module `Verdicts.Statements`. */
function moduleOfFile(file: string): string {
	return file
		.replace(/\.lean$/, "")
		.split("/")
		.join(".");
}

/**
 * Copies into `to` the `.olean` that `module` compiled to under `from` (`A/B.olean`) and, when `nested`, those of the
 * modules under it, keeping whatever `to` already holds. A link is copied as the file it points to. Nothing else is
 * taken: `leanchecker` replays the `.olean.server` and `.olean.private` parts it finds beside an `.olean`, which the
 * inspection of a module that is not a `module` never reads, so the kernel and the inspection read the same file.
 */
function copyCompiled(from: string, to: string, module: string, nested: boolean): void {
	const path = join(from, ...module.split("."));
	const options = { recursive: true, force: false, dereference: true };
	if (existsSync(`${path}.olean`)) cpSync(`${path}.olean`, join(to, `${relative(from, path)}.olean`), options);
	if (nested && existsSync(path))
		cpSync(path, join(to, relative(from, path)), {
			...options,
			filter: (source) => source.endsWith(".olean") || statSync(source).isDirectory(),
		});
}

function text(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

function failure(step: string, run: ProcessObservation): string {
	const why = run.spawn_error ?? (run.timed_out ? "timed out" : `exit ${run.exit_code}`);
	const tail = `${text(run.stdout)}${text(run.stderr)}`.trim().split("\n").slice(-20).join("\n");
	return `${step} failed (${why}):\n${tail}`;
}

/** What a theorem the inspection read is refused for; empty when it proves its approved statement. */
function refusals(t: TheoremReport, manifest: LeanManifest): string[] {
	const reasons: string[] = [];
	const approvedModules = Object.keys(manifest.protected).map(moduleOfFile);
	if (t.kind !== "theorem") reasons.push(`${t.theorem} is ${t.kind}, not a theorem`);
	if (!t.states_approved) reasons.push(`${t.theorem} proves ${t.type}, not the approved statement ${t.statement}`);
	if (t.kind !== "absent" && !(t.statement_module && approvedModules.includes(t.statement_module)))
		reasons.push(`${t.statement} comes from ${t.statement_module}, not from a protected file`);
	for (const axiom of t.axioms)
		if (!manifest.allowed_axioms.includes(axiom))
			reasons.push(`${t.theorem} reaches the axiom ${axiom}, which the manifest does not allow`);
	return reasons;
}

function inspected(line: string, manifest: LeanManifest): TheoremReport {
	const printedTheorem = JSON.parse(line) as Omit<TheoremReport, "refused" | "type" | "statement_module"> & {
		type?: string;
		statement_module?: string | null;
	};
	const t: TheoremReport = {
		theorem: printedTheorem.theorem,
		statement: printedTheorem.statement,
		kind: printedTheorem.kind,
		states_approved: printedTheorem.states_approved,
		type: printedTheorem.type ?? null,
		statement_module: printedTheorem.statement_module ?? null,
		axioms: printedTheorem.axioms,
		refused: [],
	};
	return { ...t, refused: refusals(t, manifest) };
}

async function verify(manifestPath: string, project: string, toolchainPath: string | undefined): Promise<LeanReport> {
	const manifest = manifestOf(readFileSync(manifestPath, "utf8"));
	const toolchain = { ...manifest.toolchain, path: toolchainPath ?? elanToolchain(manifest.toolchain.name) };
	// No temporary directory is granted: a proof run by the build writes into its copy and nowhere else.
	const sandbox = selectSandbox({ allow_unconfined: false, temp_paths: [] });
	const report: LeanReport = {
		manifest: manifestPath,
		project,
		verdict: "error",
		reasons: [],
		toolchain,
		sandbox: sandbox.backend.backend,
		allowed_axioms: manifest.allowed_axioms,
		protected: Object.entries(manifest.protected).map(([file, approved]) => ({
			file,
			approved,
			before: sha256Of(join(project, file)),
			after: null,
		})),
		theorems: [],
		replay: null,
	};
	const done = (verdict: LeanReport["verdict"], reasons: string[]): LeanReport => ({ ...report, verdict, reasons });

	const missing = missingToolchain(manifest.toolchain, toolchain.path);
	if (missing !== null) return done("error", [`capability missing: ${missing}`]);
	if (!sandbox.qualification.qualified)
		return done("error", [`capability missing: no qualified sandbox (${sandbox.qualification.reasons.join("; ")})`]);
	const altered = report.protected
		.filter((p) => p.before !== p.approved)
		.map((p) =>
			p.before === null ? `${p.file} is absent` : `${p.file} is ${p.before}, the manifest approves ${p.approved}`,
		);
	if (altered.length > 0)
		return done(
			"refused",
			altered.map((a) => `a protected file is not the approved one: ${a}`),
		);

	const work = mkdtempSync(join(tmpdir(), "495-lean-"));
	const checked = mkdtempSync(join(tmpdir(), "495-lean-checked-"));
	try {
		// What an earlier build left in the project is not copied: every module is built again from its source.
		cpSync(project, work, { recursive: true, filter: (source) => !`${source}${sep}`.includes(`${sep}.lake${sep}`) });
		const bin = join(toolchain.path, "bin");
		const library = join(work, ".lake", "build", "lib", "lean");
		const run = (command: string[], leanPath: string) => {
			const profile: SandboxProfile = {
				profile_id: "verify",
				read_paths: [],
				write_paths: [work],
				network: "denied",
				env_allowlist: [],
				// Lake reads its artifact cache by default, under `$HOME/.cache/lake`: a cache shipped with the project would
				// restore, under the input hash of an approved module, what another source compiled to.
				env: { PATH: `${bin}:/usr/bin:/bin`, HOME: work, LEAN_PATH: leanPath, LAKE_ARTIFACT_CACHE: "false" },
			};
			return sandbox.backend.run(profile, {
				command,
				cwd: work,
				timeout_ms: manifest.budget.timeout_ms,
				max_output_bytes: manifest.budget.max_output_bytes,
			});
		};
		const lake = (targets: string[]) =>
			run([join(bin, "lake"), "-f", join(work, LAKE_CONFIGURATION), "build", ...targets], library);

		// Built alone, the protected modules run nothing but approved code; what they compile to is what the kernel
		// replays the proofs against and the inspection reads, whatever the build of the proofs writes over it.
		const protectedModules = Object.keys(manifest.protected)
			.filter((file) => file.endsWith(".lean"))
			.map(moduleOfFile);
		const approved = await lake(protectedModules);
		if (approved.exit_code !== 0) return done("refused", [failure("the build of the protected modules", approved)]);
		for (const module of protectedModules) copyCompiled(library, checked, module, false);

		const build = await lake([manifest.module]);
		report.protected = report.protected.map((p) => ({ ...p, after: sha256Of(join(work, p.file)) }));
		if (build.exit_code !== 0) return done("refused", [failure("the build of the proofs", build)]);
		const rewritten = report.protected.filter((p) => p.after !== p.approved).map((p) => `${p.file} is ${p.after}`);
		if (rewritten.length > 0)
			return done(
				"refused",
				rewritten.map((r) => `the build rewrote a protected file: ${r}`),
			);

		// Only the modules of the project are taken from the build, so none of them stands in for a module of Lean.
		copyCompiled(library, checked, manifest.module, true);
		const replay = await run([join(bin, "leanchecker"), manifest.module], checked);
		report.replay = { tool: "leanchecker", module: manifest.module, passed: replay.exit_code === 0 };
		if (replay.exit_code !== 0) return done("refused", [failure("the kernel replay", replay)]);

		const inspection = await run(
			[
				join(bin, "lean"),
				"--run",
				INSPECT,
				manifest.module,
				...manifest.theorems.map((t) => `${t.theorem}=${t.statement}`),
			],
			checked,
		);
		if (inspection.exit_code !== 0) return done("error", [failure("the inspection of the theorems", inspection)]);
		const lines = text(inspection.stdout).trim().split("\n");
		const printedObjects = lines.map((line) => JSON.parse(line) as Partial<Misfiled & DeclaredAgain>);
		const misfiled = printedObjects
			.filter((m): m is Misfiled => typeof m.misfiled === "string")
			.map(
				(m) =>
					`${m.module} files the declaration ${m.name} under the name ${m.misfiled}: the kernel replayed it under its own name, the inspection reads it under the other`,
			);
		const declaredAgain = printedObjects
			.filter((d): d is DeclaredAgain => typeof d.declared_again === "string")
			.map(
				(d) =>
					`${d.declared_again} is declared by ${d.first} and again by ${d.again}: the kernel replayed the first, the inspection reads the other`,
			);
		const theoremLines = lines.slice(misfiled.length + declaredAgain.length);
		if (theoremLines.length !== manifest.theorems.length)
			return done("error", [
				`the inspection read ${theoremLines.length} theorems, the manifest names ${manifest.theorems.length}`,
			]);
		report.theorems = theoremLines.map((line) => inspected(line, manifest));
		const refused = [...misfiled, ...declaredAgain, ...report.theorems.flatMap((t) => t.refused)];
		return refused.length > 0 ? done("refused", refused) : done("proved", []);
	} finally {
		rmSync(work, { recursive: true, force: true });
		rmSync(checked, { recursive: true, force: true });
	}
}

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { project: { type: "string" }, toolchain: { type: "string" } },
});
const manifestPath = positionals[0];
if (manifestPath === undefined) {
	console.error("usage: node scripts/check-lean.ts <manifest.json> [--project <dir>] [--toolchain <dir>]");
	process.exit(3);
}
let report: LeanReport;
try {
	report = await verify(resolve(manifestPath), resolve(values.project ?? dirname(manifestPath)), values.toolchain);
} catch (error) {
	console.error(`error: ${manifestPath}: ${messageOf(error)}`);
	process.exit(3);
}
console.log(JSON.stringify(report, null, 2));
process.exit(EXIT_OF[report.verdict]);
