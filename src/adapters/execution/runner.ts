/**
 * Generic control runner (CMP-VER): runs a frozen control definition under its sandbox profile and
 * normalizes what it observed into the canonical evidence candidate. It judges nothing.
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { EvidenceCandidate, Finding } from "../../contracts/v1/evidence.ts";
import { RULESET_PLACEHOLDER, type ControlDefinition } from "../../contracts/v1/protocol.ts";
import { controlInputsDigest } from "../../domain/baseline.ts";
import { messageOf } from "../../domain/errors.ts";
import { fingerprintOf, locate, relativize } from "../../domain/findings.ts";
import { readerOf } from "../../domain/survey.ts";
import type {
	ControlExecutionPort,
	ControlInvocation,
	ParsedReport,
	ProcessObservation,
	ReaderPreparation,
	ReportReader,
	SandboxPort,
	SandboxProfile,
} from "../../ports/execution.ts";
import type { ObjectStorePort } from "../../ports/object-store.ts";
import type { WorkspaceCapability } from "../../application/stacks/plugin.ts";
import { workspaceFiles } from "./workspace-files.ts";

export interface RunnerOptions {
	max_output_bytes: number;
	/**
	 * What the technology of the copy at a path puts there that is not the project: the walks of the readers skip
	 * the outputs of its tools and its installed dependencies.
	 */
	workspace_of: (workspacePath: string) => WorkspaceCapability;
}

/**
 * Generic control runner (ADR-012, §11.1): runs one command as an argument array inside the
 * sandbox with the `verify` profile, keeps raw outputs in the object store and normalises the
 * observation through the parser named by the frozen control definition.
 */
export class GenericControlRunner implements ControlExecutionPort {
	readonly readers: readonly ReportReader[];
	private readonly sandbox: SandboxPort;
	private readonly objects: ObjectStorePort;
	private readonly options: RunnerOptions;
	constructor(
		sandbox: SandboxPort,
		objects: ObjectStorePort,
		readers: readonly ReportReader[],
		options: Partial<RunnerOptions> = {},
	) {
		this.sandbox = sandbox;
		this.objects = objects;
		this.readers = readers;
		this.options = {
			max_output_bytes: options.max_output_bytes ?? 4 * 1024 * 1024,
			workspace_of: options.workspace_of ?? (() => ({ outputs: [] })),
		};
	}

	profileFor(control: ControlDefinition, workspacePath: string): SandboxProfile {
		const writable = control.writable_paths
			.map((p) => (isAbsolute(p) ? p : resolve(workspacePath, p)))
			.filter((p) => p.startsWith(resolve(workspacePath)));
		// The files the control writes: its report when the path is not a pattern, and a path its command names,
		// as an argument or as the value of an option, which is where a tool is told the file to write, such as
		// the destination of the LCOV reporter of node:test.
		const cwd = resolve(workspacePath, control.cwd);
		const files = new Set(control.command.map((arg) => resolve(cwd, arg.slice(arg.indexOf("=") + 1))));
		if (control.report_path !== null && !control.report_path.startsWith("**/"))
			files.add(resolve(workspacePath, control.report_path));
		return {
			profile_id: "verify",
			read_paths: [workspacePath],
			write_paths: writable,
			write_files: writable.filter((p) => files.has(p)),
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
		const reader = readerOf(this.readers, control.parser);
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
			const introduced = invocation.introduced_lines ?? null;
			const files = workspaceFiles(
				invocation.workspace_path,
				control.report_path,
				async (doc, mediaType) => {
					artifacts.push({
						name: `report:${doc.name}`,
						ref: await this.objects.put(new TextEncoder().encode(doc.text), mediaType),
					});
				},
				this.options.workspace_of(invocation.workspace_path),
			);
			const prepared: ReaderPreparation = (await reader?.prepare?.(control, introduced, files)) ?? { arguments: [] };
			if (reader === undefined) {
				report = unknownReader(control);
			} else if ("decided" in prepared) {
				report = prepared.decided;
			} else {
				command = [...control.command, ...prepared.arguments];
				// The sandbox lets a command create what sits under a writable path and nothing above it: the
				// directory that holds `reports/mutation` is made here, by the runner, so that the tool can
				// create the path it was granted without being granted its parent.
				for (const writable of profile.write_paths) await mkdir(dirname(writable), { recursive: true });
				const ruleset = await rulesetOf(control, reader);
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
				report = await reader.read({
					...files,
					control,
					observation,
					stdout: new TextDecoder().decode(observation.stdout),
					stderr: new TextDecoder().decode(observation.stderr),
					introduced_lines: introduced,
					relativize: (message) => relativize(message, ...roots),
				});
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
			control_version: `${control.version}+${control.parser}@${reader?.version ?? "unknown"}`,
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

/** What a control concludes when no loaded technology brings the reader it names: nothing, and it is not run. */
function unknownReader(control: ControlDefinition): ParsedReport {
	return { verdict: "INDETERMINATE", facts: {}, notes: [`parser ${control.parser} is not qualified`], failures: [] };
}

/**
 * The rule set a quality control applies, written by its reader from the rules of its frozen definition
 * into a directory of its own outside the workspace, so that no file of the analysed tree can stand for
 * it. Null for a control whose command names no rule set, or whose reader writes none.
 */
async function rulesetOf(
	control: ControlDefinition,
	reader: ReportReader,
): Promise<{ directory: string; path: string } | null> {
	if (!control.command.some((arg) => arg.includes(RULESET_PLACEHOLDER))) return null;
	const file = reader.ruleset?.(control.quality_rules ?? []);
	if (!file) return null;
	const directory = await mkdtemp(join(tmpdir(), "495-ruleset-"));
	const path = join(directory, file.name);
	await writeFile(path, file.text);
	return { directory, path };
}
