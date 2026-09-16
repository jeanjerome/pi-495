import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { digestValue } from "../../contracts/digest.ts";
import type { EvidenceCandidate, Finding } from "../../contracts/v1/evidence.ts";
import type { ControlDefinition, Qualification } from "../../contracts/v1/protocol.ts";
import type { ControlExecutionPort, ControlInvocation, ProcessObservation, SandboxPort, SandboxProfile } from "../../ports/execution.ts";
import type { ObjectStorePort } from "../../ports/object-store.ts";
import { PARSER_VERSIONS, parseExitCode, parseJUnit, parseNodeTestTap, type ParsedReport } from "./parsers.ts";

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
		const writable = control.writable_paths.map((p) => (isAbsolute(p) ? p : resolve(workspacePath, p))).filter((p) => p.startsWith(resolve(workspacePath)));
		return { profile_id: "verify", read_paths: [workspacePath], write_paths: writable, network: control.network, env_allowlist: control.env_allowlist, env: control.env };
	}

	async runControl(invocation: ControlInvocation, signal?: AbortSignal): Promise<{ evidence: EvidenceCandidate; observation: ProcessObservation | null }> {
		const { control } = invocation;
		const cwd = resolve(invocation.workspace_path, control.cwd);
		const profile = this.profileFor(control, invocation.workspace_path);
		const started = new Date().toISOString();
		let observation: ProcessObservation | null = null;
		let report: ParsedReport;
		const artifacts: EvidenceCandidate["artifacts"] = [];
		try {
			if (!cwd.startsWith(resolve(invocation.workspace_path))) throw new Error(`control cwd escapes the workspace: ${control.cwd}`);
			observation = await this.sandbox.run(profile, { command: control.command, cwd, timeout_ms: control.timeout_ms, max_output_bytes: this.options.max_output_bytes }, signal);
			const stdoutText = new TextDecoder().decode(observation.stdout);
			if (observation.stdout.byteLength > 0) artifacts.push({ name: "stdout", ref: await this.objects.put(observation.stdout, "text/plain; charset=utf-8") });
			if (observation.stderr.byteLength > 0) artifacts.push({ name: "stderr", ref: await this.objects.put(observation.stderr, "text/plain; charset=utf-8") });
			switch (control.parser) {
				case "exit-code":
					report = parseExitCode(observation);
					break;
				case "node-test":
					report = parseNodeTestTap(observation, stdoutText);
					break;
				case "junit-xml": {
					const docs = await readReports(invocation.workspace_path, control.report_path);
					for (const d of docs) artifacts.push({ name: `report:${d.name}`, ref: await this.objects.put(new TextEncoder().encode(d.text), "application/xml") });
					report = parseJUnit(observation, docs.map((d) => d.text));
					break;
				}
				default:
					report = { verdict: "INDETERMINATE", facts: {}, notes: [`parser ${String(control.parser)} is not qualified`], failures: [] };
			}
		} catch (error) {
			report = { verdict: "INDETERMINATE", facts: { error: (error as Error).message }, notes: [`runner error: ${(error as Error).message}`], failures: [] };
		}
		const ended = new Date().toISOString();
		const findings: Finding[] = report.failures.map((f) => ({ rule_id: `${control.control_id}:failure`, category: "assertion", severity: "blocker", message: f, path: null, region: null, symbol: null, requirement_refs: invocation.requirement_refs, baseline_state: "new", fingerprint: digestValue([control.control_id, f]), tool: control.control_id, tool_version: control.version, confidence: 1, raw_evidence_ref: artifacts[0]?.ref ?? null }));
		const evidence: EvidenceCandidate = {
			control_id: control.control_id,
			control_version: `${control.version}+${control.parser}@${PARSER_VERSIONS[control.parser]}`,
			requirement_refs: invocation.requirement_refs,
			subject: invocation.subject,
			protocol_revision: invocation.protocol,
			environment: invocation.environment,
			inputs_digest: digestValue({ command: control.command, cwd: control.cwd, env: control.env, candidate: invocation.candidate.manifest_digest }),
			started_at: started,
			ended_at: ended,
			verdict: report.verdict,
			facts: { ...report.facts, command: control.command, cwd: control.cwd, sandbox: this.sandbox.backend, duration_ms: observation?.duration_ms ?? null },
			findings,
			artifacts,
			limits: { truncated: observation?.stdout_truncated || observation?.stderr_truncated || false, bytes_read: (observation?.stdout.byteLength ?? 0) + (observation?.stderr.byteLength ?? 0), bytes_total: null, exclusions: [], unstable: false, notes: report.notes },
			producer: invocation.producer,
		};
		return { evidence, observation };
	}
}

async function readReports(workspace: string, reportPath: string | null): Promise<{ name: string; text: string }[]> {
	if (!reportPath) return [];
	const abs = resolve(workspace, reportPath);
	if (!abs.startsWith(resolve(workspace))) return [];
	try {
		const st = await stat(abs);
		if (st.isFile()) return [{ name: reportPath, text: await readFile(abs, "utf8") }];
		const out: { name: string; text: string }[] = [];
		for (const f of (await readdir(abs)).sort()) if (f.endsWith(".xml")) out.push({ name: `${reportPath}/${f}`, text: await readFile(join(abs, f), "utf8") });
		return out;
	} catch {
		return [];
	}
}

export interface QualificationFixtures {
	/** Workspace where the property holds. */
	positive_path: string;
	/** Workspace where the targeted defect is present. */
	negative_path: string;
}

/**
 * Qualifies a control (§11.3, VER-05): a positive witness must PASS, a negative witness must FAIL
 * and a broken runner must give INDETERMINATE. Only then may the control contribute to G2.
 */
export async function qualifyControl(runner: GenericControlRunner, control: ControlDefinition, fixtures: QualificationFixtures, base: Omit<ControlInvocation, "control" | "workspace_path">): Promise<Qualification> {
	const run = async (path: string, c: ControlDefinition) => (await runner.runControl({ ...base, control: c, workspace_path: path })).evidence.verdict;
	const positive = await run(fixtures.positive_path, control);
	const negative = await run(fixtures.negative_path, control);
	const incident = await run(fixtures.positive_path, { ...control, command: ["/nonexistent/495-broken-runner", ...control.command.slice(1)] });
	const notes: string[] = [];
	if (positive !== "PASS") notes.push(`positive witness gave ${positive}`);
	if (negative !== "FAIL") notes.push(`negative witness gave ${negative}: the control does not detect the defect it claims to cover`);
	if (incident !== "INDETERMINATE") notes.push(`broken runner gave ${incident}`);
	return { positive, negative, incident, qualified: notes.length === 0, environment_digest: base.environment.digest, notes };
}
