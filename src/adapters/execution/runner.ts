/**
 * Generic control runner (CMP-VER): runs a frozen control definition under its sandbox profile and
 * normalizes what it observed into the canonical evidence candidate. It judges nothing.
 */
import type { Dirent } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { EvidenceCandidate, Finding } from "../../contracts/v1/evidence.ts";
import { SCOPE_PLACEHOLDER, type ControlDefinition } from "../../contracts/v1/protocol.ts";
import { controlInputsDigest } from "../../domain/baseline.ts";
import { fingerprintOf, locate, relativize } from "../../domain/findings.ts";
import type {
	ControlExecutionPort,
	ControlInvocation,
	ProcessObservation,
	SandboxPort,
	SandboxProfile,
} from "../../ports/execution.ts";
import type { ObjectStorePort } from "../../ports/object-store.ts";
import { analyzeMutation, mutationScopeOf, nothingToMutate, unscopedMutation, type MutationScope } from "./mutation.ts";
import {
	PARSER_VERSIONS,
	parseExitCode,
	parseJacoco,
	parseJUnit,
	parseNodeTestTap,
	type ParsedReport,
} from "./parsers.ts";
import { analyzeJavaStructure, readJavaSources } from "./structure.ts";

export interface RunnerOptions {
	max_output_bytes: number;
	/** Absolute paths never readable by controls (data dir); passed to the sandbox at construction. */
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
		try {
			if (!cwd.startsWith(resolve(invocation.workspace_path)))
				throw new Error(`control cwd escapes the workspace: ${control.cwd}`);
			// An expensive control is scoped to what the subject introduced before anything is spawned.
			// The two cases that decide themselves without a run are the reason the scope is computed
			// here: a subject that introduces no class has nothing to mutate, and a subject whose lines
			// nobody established would be mutated whole, on the budget of one change (VER-04).
			let scope: MutationScope | null = null;
			let decided: ParsedReport | null = null;
			if (control.parser === "pitest-xml") {
				const lines = invocation.introduced_lines ?? null;
				if (lines === null) decided = unscopedMutation();
				else {
					scope = await mutationScopeOf(invocation.workspace_path, lines);
					if (scope.paths.length === 0) decided = nothingToMutate(scope);
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
				observation = await this.sandbox.run(
					profile,
					{ command, cwd, timeout_ms: control.timeout_ms, max_output_bytes: this.options.max_output_bytes },
					signal,
				);
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
					case "jacoco-xml": {
						// The sensor measures nothing of its own: the report is the one the test control of the
						// same protocol wrote in this workspace, and only the introduced lines are judged. A
						// subject that introduces nothing — the reference pass — is decided without looking for
						// a report the control would not read, and keeps none as evidence.
						const introduced = invocation.introduced_lines ?? null;
						const docs =
							introduced !== null && Object.keys(introduced).length === 0
								? []
								: await readReports(invocation.workspace_path, control.report_path);
						for (const d of docs)
							artifacts.push({
								name: `report:${d.name}`,
								ref: await this.objects.put(new TextEncoder().encode(d.text), "application/xml"),
							});
						report = parseJacoco(observation, docs, introduced);
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
				facts: { error: (error as Error).message },
				notes: [`runner error: ${(error as Error).message}`],
				failures: [],
			};
		}
		const ended = new Date().toISOString();
		// The workspace the run happened to use is stripped from every message: the reference and the
		// candidate are two directories holding the same project, and a finding that keeps the path of
		// its run can never be paired with the same finding observed on the other side (VER-08).
		const roots = [
			invocation.workspace_path,
			await realpath(invocation.workspace_path).catch(() => invocation.workspace_path),
		];
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
		return [];
	}
}

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
			continue;
		}
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			if (!entry.isDirectory() || entry.name === ".git" || entry.name === "node_modules") continue;
			const rel = current.relative ? `${current.relative}/${entry.name}` : entry.name;
			const abs = join(current.absolute, entry.name);
			if (rel === directorySuffix || rel.endsWith(`/${directorySuffix}`)) {
				try {
					for (const file of (await readdir(abs)).sort()) {
						if (!file.endsWith(".xml")) continue;
						if (out.length >= 500) throw new Error("JUnit report scan exceeded 500 XML files");
						out.push({ name: `${rel}/${file}`, text: await readFile(join(abs, file), "utf8") });
					}
				} catch (error) {
					if ((error as Error).message.startsWith("JUnit report scan exceeded")) throw error;
					/* a missing or unreadable report directory produces no report */
				}
				continue;
			}
			stack.push({ absolute: abs, relative: rel });
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

export { qualifyControl, type QualificationFixtures } from "../../application/qualification.ts";
