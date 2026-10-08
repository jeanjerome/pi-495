/**
 * The conformance of a technology (CMP-CNF): what whoever writes one runs on projects of their own before it
 * joins the list `extension/runtime.ts` mounts. Each project is recognised by that technology alone; each control
 * an available capability offers is qualified by its witnesses as the qualification of a change qualifies it, and
 * each reader of the technology is asked about a copy without report and a copy whose report passes the read
 * bound. The commands run under the sandbox of the platform, in copies of the project: the project is never
 * written.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { digestValue } from "../../contracts/digest.ts";
import type { Verdict } from "../../contracts/v1/common.ts";
import type { ReferenceSnapshot } from "../../contracts/v1/candidate.ts";
import type { ControlDefinition } from "../../contracts/v1/protocol.ts";
import { orderControls, prerequisitesOf } from "../../domain/controls.ts";
import { DomainError } from "../../domain/errors.ts";
import type {
	ControlInvocation,
	ReportReader,
	SandboxSelection,
	WorkspaceHandle,
	WorkspacePolicy,
} from "../../ports/execution.ts";
import { EXECUTOR_ACTOR } from "../../application/actors.ts";
import { introducedByAddedFiles } from "../../application/coverage.ts";
import { qualifyControlDetailed } from "../../application/qualification.ts";
import type { StackPlugin, WitnessFiles } from "../../application/stacks/plugin.ts";
import { StackRegistry } from "../../application/stacks/registry.ts";
import type { DetectedTechnology } from "../../application/stacks/stack.ts";
import { emptyTrigger } from "../../application/stacks/stack.ts";
import { writeWitness } from "../../application/verification.ts";
import { readersOf } from "../execution/common-readers.ts";
import { MAX_REPORT_BYTES } from "../execution/parsers.ts";
import { GenericControlRunner } from "../execution/runner.ts";
import { CasObjectStore } from "../object-store/cas.ts";
import { selectSandbox } from "../sandbox/backends.ts";
import { DEFAULT_WORKSPACE_POLICY, GitWorkspace } from "../workspace/git-workspace.ts";
import { openProjectView } from "./project-view.ts";

/** What a control gave on its three witnesses, and why it is not qualified when it is not. */
export interface ControlConformance {
	control_id: string;
	positive: Verdict;
	negative: Verdict;
	incident: Verdict;
	qualified: boolean;
	notes: string[];
}

/**
 * What a reader concluded through the control that names it on a copy without report, then on a copy whose
 * report passes the read bound; null for both when no control the project is offered names it with a report.
 */
export interface ReaderConformance {
	reader_id: string;
	control_id: string | null;
	report_path: string | null;
	absent: Verdict | null;
	oversized: Verdict | null;
}

export interface ProjectConformance {
	project: string;
	controls: ControlConformance[];
	readers: ReaderConformance[];
}

/** What was judged, project by project, and one finding per control not qualified, per reader that concluded and per project not recognised. */
export interface ConformanceReport {
	technology: string;
	projects: ProjectConformance[];
	findings: string[];
}

export interface ConformanceOptions {
	/** The projects of the technology to judge it on, each copied before anything runs. */
	projects: readonly string[];
}

/**
 * What judging the projects of one technology shares: the copies, the runner of its controls, the runner of the
 * probes of its readers and the identity of the run.
 */
interface Bench {
	technology: StackPlugin<unknown>;
	registry: StackRegistry;
	workspace: GitWorkspace;
	runner: GenericControlRunner;
	probe: GenericControlRunner;
	environment: ControlInvocation["environment"];
}

/** Judges `technology` on each of `options.projects` under the sandbox of the platform; refuses with `CAPABILITY_MISSING` when it is not qualified. */
export function stackConformance<Model>(
	technology: StackPlugin<Model>,
	options: ConformanceOptions,
): Promise<ConformanceReport> {
	return judgeTechnology(technology, options.projects, selectSandbox({ allow_unconfined: false }));
}

/**
 * Judges `technology` on each of `projects` under `sandbox`. The package publishes only `stackConformance`, which
 * takes the sandbox of the platform: whoever imports `pi-495/stack` has no way to hand it a backend of their own.
 */
export async function judgeTechnology<Model>(
	technology: StackPlugin<Model>,
	projects: readonly string[],
	sandbox: SandboxSelection,
): Promise<ConformanceReport> {
	// The witnesses are commands of the technology like any other: nothing runs where they would run unconfined.
	if (!sandbox.qualification.qualified)
		throw new DomainError(
			"CAPABILITY_MISSING",
			`sandbox backend ${sandbox.backend.backend} is not qualified: ${sandbox.qualification.reasons.join("; ")}`,
		);
	const root = await mkdtemp(join(tmpdir(), "495-conformance-"));
	try {
		const technologies: StackPlugin<unknown>[] = [technology];
		const registry = new StackRegistry(technologies, openProjectView, readersOf(technologies));
		const objects = new CasObjectStore(join(root, "objects"));
		const runnerOptions = { workspace_of: (path: string) => registry.workspaceOf(path) };
		const bench: Bench = {
			technology,
			registry,
			workspace: new GitWorkspace(join(root, "workspaces")),
			runner: new GenericControlRunner(sandbox.backend, objects, readersOf(technologies), runnerOptions),
			probe: new GenericControlRunner(
				sandbox.backend,
				objects,
				readersOf(technologies).map(withoutArguments),
				runnerOptions,
			),
			environment: {
				environment_id: "conformance",
				digest: digestValue({ node: process.version, sandbox: sandbox.backend.backend }),
				profile_id: "verify",
			},
		};
		const report: ConformanceReport = { technology: technology.id, projects: [], findings: [] };
		for (const project of projects) {
			const judged = await judgeProject(bench, project);
			report.projects.push(judged.judgement);
			report.findings.push(...judged.findings);
		}
		return report;
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

/** The judgement of one project, and its findings. */
async function judgeProject(
	bench: Bench,
	project: string,
): Promise<{ judgement: ProjectConformance; findings: string[] }> {
	const id = bench.technology.id;
	const policy = bench.registry.copyPolicyOf(project, DEFAULT_WORKSPACE_POLICY);
	const reference = await bench.workspace.captureReference(project, policy);
	const positive = await bench.workspace.createWorkspace(reference, policy);
	const judgement: ProjectConformance = { project, controls: [], readers: [] };
	try {
		const detection = bench.registry.recognise(positive.path, []);
		if (detection.stack !== id)
			return {
				judgement,
				findings: [`${project} is not recognised by ${id}: ${detection.capability_missing.join("; ")}`],
			};
		if (detection.controls.length === 0)
			return {
				judgement,
				findings: [`${id} offers no control on ${project}: ${detection.capability_missing.join("; ")}`],
			};
		const { ordered, cycles } = orderControls(detection.controls);
		if (cycles.length > 0)
			return {
				judgement,
				findings: [`the controls ${id} offers on ${project} wait on each other: ${cycles.join(", ")}`],
			};
		const copies = { reference, policy, positive };
		judgement.controls = await qualifyControls(bench, copies, ordered, detection);
		judgement.readers = await probeReaders(bench, copies, ordered, detection.positive_witness);
		return { judgement, findings: findingsOf(judgement) };
	} finally {
		await bench.workspace.closeWorkspace(positive.workspace_id, "delete");
	}
}

/** The reference of a project, the policy its copies are taken under, and the copy that carries the positive witness. */
interface Copies {
	reference: ReferenceSnapshot;
	policy: WorkspacePolicy;
	positive: WorkspaceHandle;
}

/** What a control is run with, the control and the copy aside. */
function invocationBase(bench: Bench, copies: Copies): Omit<ControlInvocation, "control" | "workspace_path"> {
	const { reference } = copies;
	return {
		protocol: { protocol_id: "conformance", revision: 1, content_digest: digestValue("conformance") },
		candidate: {
			candidate_id: "conformance",
			manifest_digest: reference.tree_digest,
			base_digest: reference.tree_digest,
			workspace_id: copies.positive.workspace_id,
		},
		subject: { kind: "fixture", id: reference.reference_id, revision: 1, digest: reference.tree_digest },
		environment: bench.environment,
		requirement_refs: [],
		producer: EXECUTOR_ACTOR,
	};
}

/**
 * Qualifies each control as the qualification of a change does: the positive witness written on the copy, the
 * shared negative witness on another, a control's own negative witness on a copy of its own, and the controls
 * that write what a control reads run before it in each.
 */
async function qualifyControls(
	bench: Bench,
	copies: Copies,
	ordered: readonly ControlDefinition[],
	detection: DetectedTechnology,
): Promise<ControlConformance[]> {
	const sharedNegative = { ...detection.positive_witness, ...detection.negative_witness };
	await writeWitness(copies.positive.path, detection.positive_witness);
	const results: ControlConformance[] = [];
	for (const control of ordered) {
		const own = detection.own_negative_witness[control.control_id];
		const negativeFiles = own ? { ...detection.positive_witness, ...own } : sharedNegative;
		const negative = await bench.workspace.createWorkspace(copies.reference, copies.policy);
		try {
			await writeWitness(negative.path, negativeFiles);
			const { qualification } = await qualifyControlDetailed(
				bench.runner,
				control,
				{
					positive_path: copies.positive.path,
					negative_path: negative.path,
					positive_files: detection.positive_witness,
					negative_files: negativeFiles,
				},
				invocationBase(bench, copies),
				prerequisitesOf(control, ordered),
			);
			const { positive, negative: negativeVerdict, incident, qualified, notes } = qualification;
			results.push({ control_id: control.control_id, positive, negative: negativeVerdict, incident, qualified, notes });
		} finally {
			await bench.workspace.closeWorkspace(negative.workspace_id, "delete");
		}
	}
	return results;
}

/**
 * Asks each reader of the technology, through the first control that names it with a report, what it concludes
 * where the control ran and wrote nothing, then where the report passes the read bound.
 */
async function probeReaders(
	bench: Bench,
	copies: Copies,
	ordered: readonly ControlDefinition[],
	positiveWitness: WitnessFiles,
): Promise<ReaderConformance[]> {
	const results: ReaderConformance[] = [];
	for (const reader of bench.technology.readers) {
		const control = ordered.find((c) => c.parser === reader.id && c.report_path !== null);
		const reportPath = control?.report_path ?? null;
		if (control === undefined || reportPath === null) {
			results.push({ reader_id: reader.id, control_id: null, report_path: null, absent: null, oversized: null });
			continue;
		}
		const absent = await probeReader(bench, copies, control, reportPath, positiveWitness, false);
		const oversized = await probeReader(bench, copies, control, reportPath, positiveWitness, true);
		results.push({
			reader_id: reader.id,
			control_id: control.control_id,
			report_path: reportPath,
			absent,
			oversized,
		});
	}
	return results;
}

/** The directory or file a report path names, a recursive one at the root of the copy. */
function reportLocation(reportPath: string): string {
	return reportPath.startsWith("**/") ? reportPath.slice(3) : reportPath;
}

/** Where the report past the read bound is written: the file the control names, or one file in the directory it names. */
function oversizedReport(reportPath: string): string {
	return reportPath.startsWith("**/") ? `${reportLocation(reportPath)}/495-oversized.xml` : reportPath;
}

/**
 * The verdict of `control`, run as a command that writes nothing, on a copy carrying the positive witness and no
 * report at `reportPath`, or a report one byte past the read bound there when `oversized`.
 */
async function probeReader(
	bench: Bench,
	copies: Copies,
	control: ControlDefinition,
	reportPath: string,
	positiveWitness: WitnessFiles,
	oversized: boolean,
): Promise<Verdict> {
	const copy = await bench.workspace.createWorkspace(copies.reference, copies.policy);
	try {
		await writeWitness(copy.path, positiveWitness);
		await rm(join(copy.path, reportLocation(reportPath)), { recursive: true, force: true });
		if (oversized) {
			const report = join(copy.path, oversizedReport(reportPath));
			await mkdir(dirname(report), { recursive: true });
			await writeFile(report, Buffer.alloc(MAX_REPORT_BYTES + 1, " "));
		}
		const { evidence } = await bench.probe.runControl({
			...invocationBase(bench, copies),
			control: { ...control, command: emptyTrigger(process.execPath) },
			workspace_path: copy.path,
			introduced_lines: introducedByAddedFiles(positiveWitness),
		});
		return evidence.verdict;
	} finally {
		await bench.workspace.closeWorkspace(copy.workspace_id, "delete");
	}
}

/**
 * `reader` with what its preparation decides kept and the arguments it adds dropped: a probe runs the empty trigger
 * alone, since an argument the scope of a mutation engine adds is one Node refuses.
 */
function withoutArguments(reader: ReportReader): ReportReader {
	const { prepare } = reader;
	if (prepare === undefined) return reader;
	return {
		...reader,
		async prepare(control, introduced, files) {
			const prepared = await prepare(control, introduced, files);
			return "decided" in prepared ? prepared : { arguments: [] };
		},
	};
}

/** One finding per control not qualified, and per reader that concluded where it had nothing to read. */
function findingsOf(judgement: ProjectConformance): string[] {
	const { project } = judgement;
	const controls = judgement.controls
		.filter((c) => !c.qualified)
		.map((c) => `control ${c.control_id} is not qualified on ${project}: ${c.notes.join("; ")}`);
	const readers = judgement.readers.flatMap((r) => {
		const found: string[] = [];
		const through = `through control ${r.control_id}`;
		if (r.absent !== null && r.absent !== "INDETERMINATE")
			found.push(`reader ${r.reader_id} gave ${r.absent} on ${project} with no report at ${r.report_path}, ${through}`);
		if (r.oversized !== null && r.oversized !== "INDETERMINATE")
			found.push(
				`reader ${r.reader_id} gave ${r.oversized} on ${project} with a report past the read bound of ${MAX_REPORT_BYTES} bytes, ${through}`,
			);
		return found;
	});
	return [...controls, ...readers];
}
