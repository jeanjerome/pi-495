/**
 * Generic control runner (CMP-VER): runs a frozen control definition under its sandbox profile and
 * normalizes what it observed into the canonical evidence candidate. It judges nothing.
 */
import type { Dirent } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { EvidenceCandidate, Finding } from "../../contracts/v1/evidence.ts";
import { RULESET_PLACEHOLDER, SCOPE_PLACEHOLDER, type ControlDefinition } from "../../contracts/v1/protocol.ts";
import { controlInputsDigest } from "../../domain/baseline.ts";
import { messageOf } from "../../domain/errors.ts";
import { fingerprintOf, locate, relativize } from "../../domain/findings.ts";
import type {
	ControlExecutionPort,
	ControlInvocation,
	ProcessObservation,
	SandboxPort,
	SandboxProfile,
} from "../../ports/execution.ts";
import type { ObjectStorePort } from "../../ports/object-store.ts";
import { parseJestJson } from "./jest-report.ts";
import { expectedInLcovReport, parseLcov } from "./lcov.ts";
import {
	analyzeMutation,
	mutationScopeOf,
	nothingToMutate,
	unaddressableMutation,
	unscopedMutation,
	type MutationScope,
	type MutationReportDocument,
} from "./mutation.ts";
import {
	PARSER_VERSIONS,
	parseExitCode,
	parseJacoco,
	parseJUnit,
	parseNodeTestTap,
	MAX_REPORT_BYTES,
	type ParsedReport,
} from "./parsers.ts";
import { parseEslintJson, parseJscpdJson } from "./eslint-jscpd-report.ts";
import { jscpdConfig } from "./jscpd-config.ts";
import { parseCpdXml, parsePmdXml } from "./pmd-report.ts";
import { pmdRuleset } from "./pmd-ruleset.ts";
import { analyzeJavaStructure, readJavaSources } from "./structure.ts";

export interface RunnerOptions {
	max_output_bytes: number;
}

/**
 * Generic control runner (ADR-012, §11.1): runs one command as an argument array inside the
 * sandbox with the `verify` profile, keeps raw outputs in the object store and normalises the
 * observation through the parser named by the frozen control definition.
 */
export class GenericControlRunner implements ControlExecutionPort {
	private readonly sandbox: SandboxPort;
	private readonly objects: ObjectStorePort;
	private readonly options: RunnerOptions;
	constructor(sandbox: SandboxPort, objects: ObjectStorePort, options: Partial<RunnerOptions> = {}) {
		this.sandbox = sandbox;
		this.objects = objects;
		this.options = { max_output_bytes: options.max_output_bytes ?? 4 * 1024 * 1024 };
	}

	profileFor(control: ControlDefinition, workspacePath: string): SandboxProfile {
		const writable = control.writable_paths
			.map((p) => (isAbsolute(p) ? p : resolve(workspacePath, p)))
			.filter((p) => p.startsWith(resolve(workspacePath)));
		return {
			profile_id: "verify",
			read_paths: [workspacePath],
			write_paths: writable,
			network: control.network,
			env_allowlist: control.env_allowlist,
			env: control.env,
		};
	}

	async runControl(
		invocation: ControlInvocation,
		signal?: AbortSignal,
	): Promise<{ evidence: EvidenceCandidate; observation: ProcessObservation | null }> {
		const { control } = invocation;
		const cwd = resolve(invocation.workspace_path, control.cwd);
		const profile = this.profileFor(control, invocation.workspace_path);
		const started = new Date().toISOString();
		let observation: ProcessObservation | null = null;
		let report: ParsedReport;
		let command = control.command;
		const artifacts: EvidenceCandidate["artifacts"] = [];
		// The workspace the run happened to use is stripped from every message: the reference and the
		// candidate are two directories holding the same project, and a finding that keeps the path of
		// its run can never be paired with the same finding observed on the other side (VER-08).
		const roots = [
			invocation.workspace_path,
			await realpath(invocation.workspace_path).catch(() => invocation.workspace_path),
		];
		try {
			if (!cwd.startsWith(resolve(invocation.workspace_path)))
				throw new Error(`control cwd escapes the workspace: ${control.cwd}`);
			// An expensive control is scoped to what the subject introduced before anything is spawned.
			// The two cases that decide themselves without a run are the reason the scope is computed
			// here: a subject that introduces no class has nothing to mutate, and a subject whose lines
			// nobody established would be mutated whole, on the budget of one change (VER-04).
			let scope: MutationScope | null = null;
			let decided: ParsedReport | null = null;
			if (control.parser === "pitest-xml" || control.parser === "stryker-json") {
				const lines = invocation.introduced_lines ?? null;
				if (lines === null) decided = unscopedMutation();
				else {
					scope = await mutationScopeOf(invocation.workspace_path, lines, control.parser);
					if (scope.unaddressable.length > 0) decided = unaddressableMutation(scope);
					else if (scope.paths.length === 0) decided = nothingToMutate(scope);
					else if (control.scope_argument !== null)
						command = [
							...control.command,
							control.scope_argument.split(SCOPE_PLACEHOLDER).join(scope.classes.join(",")),
						];
				}
			}
			if (decided) {
				report = decided;
			} else {
				// The sandbox lets a command create what sits under a writable path and nothing above it: the
				// directory that holds `reports/mutation` is made here, by the runner, so that the tool can
				// create the path it was granted without being granted its parent.
				for (const writable of profile.write_paths) await mkdir(dirname(writable), { recursive: true });
				const ruleset = await rulesetOf(control);
				try {
					observation = await this.sandbox.run(
						profile,
						{
							command: ruleset ? command.map((arg) => arg.split(RULESET_PLACEHOLDER).join(ruleset.path)) : command,
							cwd,
							timeout_ms: control.timeout_ms,
							max_output_bytes: this.options.max_output_bytes,
						},
						signal,
					);
				} finally {
					if (ruleset) await rm(ruleset.directory, { recursive: true, force: true });
				}
				const stdoutText = new TextDecoder().decode(observation.stdout);
				const stderrText = new TextDecoder().decode(observation.stderr);
				if (observation.stdout.byteLength > 0)
					artifacts.push({
						name: "stdout",
						ref: await this.objects.put(observation.stdout, "text/plain; charset=utf-8"),
					});
				if (observation.stderr.byteLength > 0)
					artifacts.push({
						name: "stderr",
						ref: await this.objects.put(observation.stderr, "text/plain; charset=utf-8"),
					});
				switch (control.parser) {
					case "exit-code":
						report = parseExitCode(observation);
						break;
					case "node-test":
						report = parseNodeTestTap(observation, stdoutText);
						break;
					case "junit-xml": {
						const docs = await readReports(invocation.workspace_path, control.report_path);
						for (const d of docs)
							artifacts.push({
								name: `report:${d.name}`,
								ref: await this.objects.put(new TextEncoder().encode(d.text), "application/xml"),
							});
						// Build tools name a compilation failure on stdout; the parser needs it to point at a file.
						report = parseJUnit(
							observation,
							docs.map((d) => d.text),
							`${stdoutText}\n${stderrText}`,
						);
						break;
					}
					case "jest-json": {
						const docs = await readReports(invocation.workspace_path, control.report_path);
						for (const d of docs)
							artifacts.push({
								name: `report:${d.name}`,
								ref: await this.objects.put(new TextEncoder().encode(d.text), "application/json"),
							});
						report = parseJestJson(
							observation,
							docs.map((d) => d.text),
						);
						break;
					}
					case "lcov": {
						const docs = await coverageReports(invocation);
						for (const d of docs)
							artifacts.push({
								name: `report:${d.name}`,
								ref: await this.objects.put(new TextEncoder().encode(d.text), "text/plain; charset=utf-8"),
							});
						const introduced = invocation.introduced_lines ?? null;
						const sources = await introducedSources(
							invocation.workspace_path,
							introduced === null ? [] : expectedInLcovReport(introduced),
						);
						report = parseLcov(observation, docs, introduced, sources);
						break;
					}
					case "jacoco-xml": {
						// The sensor measures nothing of its own: the report is the one the test control of the
						// same protocol wrote in this workspace, and only the introduced lines are judged.
						const docs = await coverageReports(invocation);
						for (const d of docs)
							artifacts.push({
								name: `report:${d.name}`,
								ref: await this.objects.put(new TextEncoder().encode(d.text), "application/xml"),
							});
						report = parseJacoco(observation, docs, invocation.introduced_lines ?? null);
						break;
					}
					case "java-imports": {
						// The architecture rules are the ones the protocol froze, never a file of the tree the
						// producer could edit. The sensor runs no analysis of its own beyond reading the package
						// and import declarations of the sources those rules scope (ARC-04, CON-03).
						const read = await readJavaSources(
							invocation.workspace_path,
							control.structure_rules.flatMap((rule) => rule.scope),
						);
						report = analyzeJavaStructure(
							observation,
							read.sources,
							control.structure_rules,
							invocation.introduced_lines ?? null,
							read.notes,
						);
						break;
					}
					case "pitest-xml": {
						// The run the protocol froze has just mutated the classes of the frozen candidate, and
						// nothing else. What is read back is the report it left at the stable path the target
						// declares, and what is judged in it are the mutants sitting on the introduced lines.
						const docs = await readReports(invocation.workspace_path, control.report_path);
						for (const d of docs)
							artifacts.push({
								name: `report:${d.name}`,
								ref: await this.objects.put(new TextEncoder().encode(d.text), "application/xml"),
							});
						report = analyzeMutation(
							observation,
							docs,
							invocation.introduced_lines ?? null,
							scope!,
							`${stdoutText}\n${stderrText}`,
						);
						break;
					}
					case "stryker-json": {
						// Stryker ran once unmutated and then on the introduced line ranges only. What is read back
						// is the report of its JSON reporter at the path the target declares, bounded in size: the
						// report is an output of the project judged. The introduced sources are read too: a comment
						// that silences Stryker leaves a complete report whose mutants are Ignored, which only the
						// source shows.
						const docs = await readBoundedReport(invocation.workspace_path, control.report_path);
						for (const d of docs)
							if (d.oversized_bytes === undefined)
								artifacts.push({
									name: `report:${d.name}`,
									ref: await this.objects.put(new TextEncoder().encode(d.text), "application/json"),
								});
						report = analyzeMutation(
							observation,
							docs,
							invocation.introduced_lines ?? null,
							scope!,
							`${stdoutText}\n${stderrText}`,
							"stryker-json",
							await introducedSources(invocation.workspace_path, scope!.paths),
						);
						break;
					}
					case "pmd-xml":
					case "cpd-xml": {
						// The analyser judges the whole tree; what is read back is the report it left in the
						// build directory of each module, beside which the other analyser's report may lie.
						const docs = await readReports(invocation.workspace_path, control.report_path);
						for (const d of docs)
							artifacts.push({
								name: `report:${d.name}`,
								ref: await this.objects.put(new TextEncoder().encode(d.text), "application/xml"),
							});
						const read = control.parser === "pmd-xml" ? parsePmdXml : parseCpdXml;
						report = read(observation, docs, `${stdoutText}\n${stderrText}`);
						break;
					}
					case "eslint-json":
					case "jscpd-json": {
						const docs = await readReports(invocation.workspace_path, control.report_path);
						for (const d of docs)
							artifacts.push({
								name: `report:${d.name}`,
								ref: await this.objects.put(new TextEncoder().encode(d.text), "application/json"),
							});
						const read = control.parser === "eslint-json" ? parseEslintJson : parseJscpdJson;
						const parsed = read(observation, docs, `${stdoutText}\n${stderrText}`);
						// ESLint names each file by its absolute path, a file it could not parse included: the note
						// that names it does so relative to the workspace, as a finding does.
						report = { ...parsed, notes: parsed.notes.map((note) => relativize(note, ...roots)) };
						break;
					}
					default:
						report = {
							verdict: "INDETERMINATE",
							facts: {},
							notes: [`parser ${String(control.parser)} is not qualified`],
							failures: [],
						};
				}
			}
		} catch (error) {
			report = {
				verdict: "INDETERMINATE",
				facts: { error: messageOf(error) },
				notes: [`runner error: ${messageOf(error)}`],
				failures: [],
			};
		}
		const ended = new Date().toISOString();
		const finding = (
			raw: string,
			ruleId: string,
			category: Finding["category"],
			severity: Finding["severity"],
			symbol: string | null,
		): Finding => {
			const message = relativize(raw, ...roots);
			const located = locate(message);
			// The runner observes one tree; which of the two carries the finding is not its to decide.
			return {
				rule_id: ruleId,
				category,
				severity,
				message,
				path: located.path,
				region: located.region,
				symbol,
				requirement_refs: invocation.requirement_refs,
				baseline_state: "unknown" as const,
				fingerprint: fingerprintOf({
					tool: control.control_id,
					rule_id: ruleId,
					symbol,
					path: located.path,
					text: located.text,
				}),
				tool: control.control_id,
				tool_version: control.version,
				confidence: 1,
				raw_evidence_ref: artifacts[0]?.ref ?? null,
			};
		};
		const findings: Finding[] = report.findings
			? report.findings.map((f) => finding(f.message, f.rule_id, f.category, f.severity, f.symbol))
			: report.failures.map((raw) => finding(raw, `${control.control_id}:failure`, "assertion", "blocker", null));
		const evidence: EvidenceCandidate = {
			control_id: control.control_id,
			control_version: `${control.version}+${control.parser}@${PARSER_VERSIONS[control.parser]}`,
			requirement_refs: invocation.requirement_refs,
			subject: invocation.subject,
			protocol_revision: invocation.protocol,
			environment: invocation.environment,
			inputs_digest: controlInputsDigest({ ...control, command }, invocation.candidate.manifest_digest),
			started_at: started,
			ended_at: ended,
			verdict: report.verdict,
			facts: {
				...report.facts,
				command,
				cwd: control.cwd,
				sandbox: this.sandbox.backend,
				duration_ms: observation?.duration_ms ?? null,
			},
			findings,
			artifacts,
			limits: {
				truncated: observation?.stdout_truncated || observation?.stderr_truncated || false,
				bytes_read: (observation?.stdout.byteLength ?? 0) + (observation?.stderr.byteLength ?? 0),
				bytes_total: null,
				exclusions: [],
				unstable: false,
				notes: report.notes,
			},
			baseline: null,
			producer: invocation.producer,
		};
		return { evidence, observation };
	}
}

/**
 * The rule set a quality control applies, written from the rules of its frozen definition into a
 * directory of its own outside the workspace, so that no file of the analysed tree can stand for it:
 * the configuration of jscpd for jscpd, a PMD rule set otherwise. Null for a control whose command names
 * no rule set.
 */
async function rulesetOf(control: ControlDefinition): Promise<{ directory: string; path: string } | null> {
	if (!control.command.some((arg) => arg.includes(RULESET_PLACEHOLDER))) return null;
	const rules = control.quality_rules ?? [];
	const file =
		control.parser === "jscpd-json"
			? { name: "jscpd.json", text: jscpdConfig(rules) }
			: { name: "ruleset.xml", text: pmdRuleset(rules) };
	const directory = await mkdtemp(join(tmpdir(), "495-ruleset-"));
	const path = join(directory, file.name);
	await writeFile(path, file.text);
	return { directory, path };
}

/**
 * The coverage report a differential control reads. A subject that introduces nothing — the reference
 * pass — is decided without looking for a report the control would not read, and keeps none as evidence.
 */
async function coverageReports(invocation: ControlInvocation): Promise<{ name: string; text: string }[]> {
	const introduced = invocation.introduced_lines ?? null;
	if (introduced !== null && Object.keys(introduced).length === 0) return [];
	return readReports(invocation.workspace_path, invocation.control.report_path);
}

/**
 * The text of the introduced source files a reader looks into, keyed by path. A file the change deleted
 * has nothing to read; one over the bound is not read, and that is an error rather than a silent gap.
 */
async function introducedSources(workspace: string, paths: readonly string[]): Promise<Map<string, string>> {
	const root = resolve(workspace);
	const sources = new Map<string, string>();
	for (const path of paths) {
		const absolute = resolve(root, path);
		if (!absolute.startsWith(`${root}${sep}`)) continue;
		const stats = await stat(absolute).catch(() => null);
		if (!stats?.isFile()) continue;
		if (stats.size > MAX_REPORT_BYTES) throw new Error(`${path} exceeds ${MAX_REPORT_BYTES} bytes`);
		sources.set(path, await readFile(absolute, "utf8"));
	}
	return sources;
}

async function readReports(workspace: string, reportPath: string | null): Promise<{ name: string; text: string }[]> {
	if (!reportPath) return [];
	if (reportPath.startsWith("**/")) return readRecursiveReports(workspace, reportPath.slice(3));
	const abs = resolve(workspace, reportPath);
	if (!abs.startsWith(resolve(workspace))) return [];
	try {
		const st = await stat(abs);
		if (st.isFile()) return [{ name: reportPath, text: await readFile(abs, "utf8") }];
		const out: { name: string; text: string }[] = [];
		for (const f of (await readdir(abs)).sort())
			if (f.endsWith(".xml")) out.push({ name: `${reportPath}/${f}`, text: await readFile(join(abs, f), "utf8") });
		return out;
	} catch {
		return []; // a missing or unreadable report path yields no report, which the parser judges as such
	}
}

/**
 * The single report file a control declares, or none when it is absent. A file past the read bound is
 * returned unread with its size: the reader then says it could not check it, instead of this function
 * loading what the project judged chose to write.
 */
async function readBoundedReport(workspace: string, reportPath: string | null): Promise<MutationReportDocument[]> {
	if (!reportPath) return [];
	const absolute = resolve(workspace, reportPath);
	if (!absolute.startsWith(`${resolve(workspace)}${sep}`)) return [];
	const stats = await stat(absolute).catch(() => null);
	if (!stats?.isFile()) return [];
	if (stats.size > MAX_REPORT_BYTES) return [{ name: reportPath, text: "", oversized_bytes: stats.size }];
	return [{ name: reportPath, text: await readFile(absolute, "utf8") }];
}

/** The bound on the XML files a recursive scan reads; it escapes the catch that skips unreadable directories. */
class ScanBound extends Error {}

async function readRecursiveReports(
	workspace: string,
	directorySuffix: string,
): Promise<{ name: string; text: string }[]> {
	const root = resolve(workspace);
	const out: { name: string; text: string }[] = [];
	const stack: { absolute: string; relative: string }[] = [{ absolute: root, relative: "" }];
	let visited = 0;
	while (stack.length > 0) {
		const current = stack.pop()!;
		visited++;
		if (visited > 10_000) throw new Error("JUnit report scan exceeded 10000 directories");
		let entries: Dirent[];
		try {
			entries = await readdir(current.absolute, { withFileTypes: true });
		} catch {
			continue; // an unreadable directory is not scanned; the reports found elsewhere still count
		}
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			if (!entry.isDirectory() || entry.name === ".git" || entry.name === "node_modules") continue;
			const rel = current.relative ? `${current.relative}/${entry.name}` : entry.name;
			const abs = join(current.absolute, entry.name);
			if (rel === directorySuffix || rel.endsWith(`/${directorySuffix}`)) {
				try {
					for (const file of (await readdir(abs)).sort()) {
						if (!file.endsWith(".xml")) continue;
						if (out.length >= 500) throw new ScanBound("JUnit report scan exceeded 500 XML files");
						out.push({ name: `${rel}/${file}`, text: await readFile(join(abs, file), "utf8") });
					}
				} catch (error) {
					if (error instanceof ScanBound) throw error;
					/* a missing or unreadable report directory produces no report */
				}
				continue;
			}
			stack.push({ absolute: abs, relative: rel });
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}
