/**
 * Verification coordinator (CMP-VER): it orders the controls a target offers, qualifies each sensor
 * against its witnesses on the reference, freezes the protocol they form, then runs the frozen
 * controls on the candidate and on the reference and turns their observations into evidence.
 *
 * It writes no verdict about the change. It records evidence and returns the facts the application
 * controller commits through the domain reducer, so no verdict is ever written outside it (AT-01).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { digestValue } from "../contracts/digest.ts";
import { validate } from "../contracts/validate.ts";
import type { CandidateRef, EnvironmentRef, ProtocolRef } from "../contracts/v1/common.ts";
import type { CandidateManifest, ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import { Evidence, EvidenceCandidate, evidenceDigest, type RequirementRef } from "../contracts/v1/evidence.ts";
import {
	isDifferentialParser,
	type ControlCapabilityDiagnosis,
	type ControlDefinition,
	type Obligation,
	type Protocol,
	type Qualification,
	type RequirementsDocument,
} from "../contracts/v1/protocol.ts";
import {
	applyInstability,
	blockingCount,
	candidateShape,
	compareToReference,
	divergesFromReference,
	reusableReferencePass,
	type CandidateShape,
	type ReferencePass,
} from "../domain/baseline.ts";
import type { EvidenceFact } from "../domain/change/commands.ts";
import { candidateMoved, writablePrefixes } from "../domain/candidate.ts";
import { orderControls, prerequisitesOf } from "../domain/controls.ts";
import { DomainError } from "../domain/errors.ts";
import type { ActivePolicy } from "../domain/policy.ts";
import type { ControlExecutionPort, WorkspacePolicy, WorkspacePort } from "../ports/execution.ts";
import type { LedgerPort } from "../ports/ledger.ts";
import type { ObjectStorePort } from "../ports/object-store.ts";
import { EXECUTOR_ACTOR } from "./actors.ts";
import { introducedLinesOf, type IntroducedLinesResult } from "./coverage.ts";
import type { PreparationRecord, ReferenceSuiteObservation } from "./preparation.ts";
import { qualifyControlDetailed, reusableQualification, type DetailedQualification } from "./qualification.ts";

export interface VerificationDeps {
	controls: ControlExecutionPort;
	workspace: WorkspacePort;
	workspacePolicy: WorkspacePolicy;
	objects: ObjectStorePort;
	ledger: LedgerPort;
	environment: EnvironmentRef;
	policy: ActivePolicy;
	now(): string;
	id(prefix: string): string;
	/** Reads an artifact the ledger holds, by identifier and revision. */
	readArtifact<T>(ref: { artifact_id: string; revision: number }): Promise<T>;
	progress(message: string): void;
}

export interface QualifyInput {
	change_id: string;
	reference: ReferenceSnapshot;
	/**
	 * The workspace the stack was detected on, which serves as the positive witness: it already
	 * carries a copy of the reference, and a second copy costs a full copy of the target for nothing.
	 */
	positive: { workspace_id: string; path: string };
	ordered: readonly ControlDefinition[];
	witnesses: {
		/** Files written on the reference so that the property every control claims holds. */
		positive: Record<string, string>;
		/** Files written on top of those so that the targeted defect is present. */
		negative: Record<string, string>;
		/** Per control, the defect only that one detects, when the shared one proves nothing for it. */
		own_negative: Record<string, Record<string, string>>;
		/** Test cases the witnesses contribute, which exercise the runner and not the project. */
		tests: number;
	};
	prepared: PreparationRecord | null;
	requirement_refs: RequirementRef[];
	/** Protocols already proposed for this change: a sensor qualified there is not qualified again. */
	prior_protocol_refs: readonly { artifact_id: string; revision: number }[];
}

export interface QualificationOutcome {
	qualifications: Protocol["qualifications"];
	/** What the reference suite reported while the witnesses ran, or null when no parser said. */
	observation: ReferenceSuiteObservation | null;
}

export interface FreezeInput {
	change_id: string;
	ordered: readonly ControlDefinition[];
	qualifications: Protocol["qualifications"];
	diagnosis: ControlCapabilityDiagnosis;
	requirements: RequirementsDocument;
	requirements_revision: number;
	prepared: PreparationRecord | null;
}

export interface RunInput {
	change_id: string;
	protocol: Protocol;
	protocol_ref: ProtocolRef;
	candidate: CandidateRef;
	manifest: CandidateManifest;
	reference: ReferenceSnapshot;
	workspace_path: string;
}

export interface VerificationOutcome {
	facts: EvidenceFact[];
	/** The frozen candidate was written to while the controls ran: these facts prove nothing. */
	candidate_moved: boolean;
}

/** Writes the files a witness workspace carries on top of the reference. */
async function writeWitness(workspacePath: string, files: Record<string, string>): Promise<void> {
	for (const [rel, content] of Object.entries(files)) {
		const target = join(workspacePath, rel);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, content);
	}
}

export class VerificationCoordinator {
	private readonly deps: VerificationDeps;
	constructor(deps: VerificationDeps) {
		this.deps = deps;
	}

	/**
	 * The order the controls run in: producers before the sensors that read what they leave in the
	 * workspace, read off what each control declares (VER-05). Two controls waiting on each other
	 * have no order at all, and running them in the one an adapter happened to push into the array
	 * would hide it.
	 */
	orderOf(controls: ControlDefinition[]): ControlDefinition[] {
		const ordering = orderControls(controls);
		if (ordering.cycles.length > 0)
			throw new DomainError(
				"CONFIGURATION_ERROR",
				`controls declare a cycle of reports: ${ordering.cycles.join(", ")}`,
				{ nextActions: ["prepare_capabilities"] },
			);
		return ordering.ordered;
	}

	/**
	 * Qualifies every control on the reference (§11.3, VER-05, PRE-03): a positive witness must PASS,
	 * a negative one must FAIL and a broken runner must give INDETERMINATE. The witnesses qualify the
	 * sensor mechanism; a prepared discriminant suite is judged separately and only noted here.
	 */
	async qualify(input: QualifyInput): Promise<QualificationOutcome> {
		const { positive, reference, prepared } = input;
		const negative = await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy);
		try {
			const sharedNegativeFiles = { ...input.witnesses.positive, ...input.witnesses.negative };
			await writeWitness(positive.path, input.witnesses.positive);
			await writeWitness(negative.path, sharedNegativeFiles);
			const qualifications: Protocol["qualifications"] = {};
			const observed = { reported: 0, skipped: 0, witnesses: 0, any: false };
			const base = {
				protocol: { protocol_id: "qualification", revision: 1, content_digest: digestValue("qualification") } as const,
				candidate: {
					candidate_id: "qualification",
					manifest_digest: reference.tree_digest,
					base_digest: reference.tree_digest,
					workspace_id: positive.workspace_id,
				},
				subject: { kind: "fixture" as const, id: reference.reference_id, revision: 1, digest: reference.tree_digest },
				environment: this.deps.environment,
				requirement_refs: input.requirement_refs,
				producer: EXECUTOR_ACTOR,
			};
			for (const control of input.ordered) {
				const reusable = await this.establishedQualification(input.prior_protocol_refs, control);
				if (reusable) {
					this.deps.progress(`control ${control.control_id} keeps its qualification`);
					qualifications[control.control_id] = reusable;
					this.countReferenceCases(
						observed,
						control,
						input.witnesses.tests,
						reusable.evidence_ids
							? (this.deps.ledger.getEvidence(reusable.evidence_ids.positive)?.facts ?? null)
							: null,
					);
					if (prepared)
						qualifications[control.control_id]!.notes.push(
							`prepared suite on the bare reference: ${prepared.on_reference} (${prepared.discriminant ? "discriminant" : "not discriminant"})`,
						);
					continue;
				}
				this.deps.progress(`qualifying control ${control.control_id}`);
				// What proves a sensor is a tree carrying the defect it claims to detect, and the shared
				// failing test is not that tree for every sensor: a coverage control is proved by code the
				// suite never exercises, on a build that completes. Such a control gets its own witness
				// workspace, built on the positive one (VER-05).
				const ownNegative = input.witnesses.own_negative[control.control_id];
				const negativeFiles = ownNegative ? { ...input.witnesses.positive, ...ownNegative } : sharedNegativeFiles;
				const ownHandle = ownNegative
					? await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy)
					: null;
				// A sensor that measures nothing of its own reads a report a witness workspace only holds
				// once the control that writes it has run there. Each witness workspace is a fresh copy of
				// the reference, so the producers run in it before the sensor is asked anything.
				const producers = prerequisitesOf(control, input.ordered as ControlDefinition[]);
				let detailed: DetailedQualification;
				try {
					if (ownHandle) await writeWitness(ownHandle.path, negativeFiles);
					detailed = await qualifyControlDetailed(
						this.deps.controls,
						control,
						{
							positive_path: positive.path,
							negative_path: ownHandle?.path ?? negative.path,
							positive_files: input.witnesses.positive,
							negative_files: negativeFiles,
						},
						base,
						producers,
					);
				} finally {
					if (ownHandle) await this.deps.workspace.closeWorkspace(ownHandle.workspace_id, "delete");
				}
				const evidenceIds = {
					positive: this.deps.id("evq"),
					negative: this.deps.id("evq"),
					incident: this.deps.id("evq"),
				};
				this.storeEvidence(input.change_id, detailed.evidence.positive, evidenceIds.positive);
				this.storeEvidence(input.change_id, detailed.evidence.negative, evidenceIds.negative);
				this.storeEvidence(input.change_id, detailed.evidence.incident, evidenceIds.incident);
				qualifications[control.control_id] = { ...detailed.qualification, evidence_ids: evidenceIds };
				this.countReferenceCases(observed, control, input.witnesses.tests, detailed.evidence.positive.facts);
				if (!detailed.qualification.qualified)
					qualifications[control.control_id]!.notes.push(
						`qualification evidence: positive=${evidenceIds.positive}, negative=${evidenceIds.negative}, incident=${evidenceIds.incident}`,
					);
				if (prepared)
					qualifications[control.control_id]!.notes.push(
						`prepared suite on the bare reference: ${prepared.on_reference} (${prepared.discriminant ? "discriminant" : "not discriminant"})`,
					);
			}
			// Levels 2 and 3 of the scale are read off a run the qualification pays for anyway: the
			// positive witness runs the reference suite next to its own case, so what the reference
			// itself discovers and executes needs no run of its own.
			return {
				qualifications,
				observation: observed.any
					? { reported: observed.reported, skipped: observed.skipped, witnesses: observed.witnesses }
					: null,
			};
		} finally {
			await this.deps.workspace.closeWorkspace(negative.workspace_id, "delete");
		}
	}

	/**
	 * What a prepared suite does on the bare reference (PRE-03, SA-009). FAIL is a suite that detects
	 * the behaviour the tree does not have yet, which is the only thing that makes it discriminant; a
	 * suite reporting no test at all did not load, whatever its exit code said.
	 */
	async judgePreparedSuite(input: {
		control: ControlDefinition;
		reference: ReferenceSnapshot;
		manifest: CandidateManifest;
		workspace_id: string;
		workspace_path: string;
	}): Promise<{ on_reference: PreparationRecord["on_reference"]; loadable: boolean; notes: string[] }> {
		const { evidence } = await this.deps.controls.runControl({
			control: input.control,
			protocol: { protocol_id: "preparation", revision: 0, content_digest: digestValue("preparation") },
			candidate: {
				candidate_id: "preparation",
				manifest_digest: input.manifest.manifest_digest,
				base_digest: input.reference.tree_digest,
				workspace_id: input.workspace_id,
			},
			subject: { kind: "fixture", id: input.reference.reference_id, revision: 1, digest: input.reference.tree_digest },
			workspace_path: input.workspace_path,
			environment: this.deps.environment,
			requirement_refs: [],
			producer: EXECUTOR_ACTOR,
		});
		const onReference = evidence.verdict;
		const tests = Number(evidence.facts.tests ?? 0);
		return {
			on_reference: onReference,
			loadable: onReference === "PASS" || (onReference === "FAIL" && tests > 0),
			notes:
				onReference === "INDETERMINATE"
					? [`prepared suite is not loadable or produced no test: ${evidence.limits.notes.join("; ")}`]
					: [],
		};
	}

	/**
	 * The protocol the gate freezes. The rules for reading the two passes are fixed here, before any
	 * control has run on a candidate: what a preexisting defect is worth and what an unstable control
	 * is worth are never decided once a verdict is known (VER-08).
	 */
	freeze(input: FreezeInput): Protocol {
		const controls: ControlDefinition[] = input.ordered.map((c) => ({
			...c,
			protected_paths: [...new Set([...c.protected_paths, ...(input.prepared?.files.map((f) => f.path) ?? [])])],
		}));
		// A differential control answers a question every requirement asks, whatever its category: a
		// requirement whose lines no test exercises is not demonstrated by a suite that stayed green,
		// a responsibility placed in a forbidden module is not demonstrated either, and neither is a
		// line whose mutation nothing notices (QLT-04, ARC-04, VER-04). An improvement elsewhere
		// never compensates for any of the three.
		const differential = controls.filter((c) => isDifferentialParser(c.parser)).map((c) => c.control_id);
		const obligations: Obligation[] = input.requirements.requirements.map((r) => {
			const preferred =
				r.category.toLowerCase().includes("quality") || r.category.toLowerCase().includes("lint")
					? controls.filter((c) => c.control_id === "lint")
					: controls.filter((c) => c.control_id !== "lint");
			const chosen = (preferred.length > 0 ? preferred : controls).map((c) => c.control_id);
			return {
				requirement: { requirement_id: r.requirement_id, revision: input.requirements_revision },
				mandatory: r.mandatory,
				control_ids: [...new Set([...chosen, ...differential])],
				combination: "all_pass",
				human_interaction: null,
				not_applicable_reason: null,
			};
		});
		return {
			protocol_id: this.deps.id("prt"),
			change_id: input.change_id,
			controls,
			qualifications: input.qualifications,
			capability_diagnosis: input.diagnosis,
			obligations,
			required_reviews: [...this.deps.policy.required_reviews],
			arbitration: "human_decision",
			baseline: { ...this.deps.policy.baseline },
			environment_digest: this.deps.environment.digest,
		};
	}

	/**
	 * Runs every frozen control on the candidate, next to the pass the same control gives on the
	 * reference, and records what each observed as evidence.
	 */
	async run(input: RunInput): Promise<VerificationOutcome> {
		const { protocol, manifest, reference } = input;
		const facts: EvidenceFact[] = [];
		const baseline = protocol.baseline;
		const shape = candidateShape(manifest);
		// What this change wrote, line by line: a differential control is given the introduced lines and
		// judges those, instead of a ratio that would answer for the whole tree (QLT-04).
		const introduced = await this.introducedLines(manifest, shape);
		const passes = await this.referencePasses(input.change_id, protocol, input.protocol_ref, reference);
		for (const control of protocol.controls) {
			this.deps.progress(`running control ${control.control_id}`);
			const invocation = {
				control,
				protocol: input.protocol_ref,
				candidate: input.candidate,
				subject: {
					kind: "candidate" as const,
					id: input.candidate.candidate_id,
					revision: 1,
					digest: input.candidate.manifest_digest,
				},
				workspace_path: input.workspace_path,
				environment: this.deps.environment,
				requirement_refs: control.requirement_refs,
				producer: EXECUTOR_ACTOR,
				introduced_lines: introduced.lines,
			};
			const observed = (await this.deps.controls.runControl(invocation)).evidence;
			// A path the diff could not read is a limit of every control that judged the introduced lines,
			// not a silent zero.
			const limits =
				introduced.notes.length > 0 && isDifferentialParser(control.parser)
					? { ...observed.limits, notes: [...observed.limits.notes, ...introduced.notes] }
					: observed.limits;
			let candidate: EvidenceCandidate = { ...observed, facts: { ...observed.facts, run: "candidate" }, limits };
			const pass = passes.get(control.control_id);
			if (pass) {
				let outcome = compareToReference(observed.verdict, observed.findings, pass, shape, baseline.tolerance);
				// The divergence to pay a confirmation for is the one the tolerance left standing: a control
				// whose every finding the reference already carried has nothing to confirm.
				if (
					baseline.instability === "confirm_then_indeterminate" &&
					baseline.max_confirmations > 0 &&
					divergesFromReference(outcome.verdict, pass.verdict)
				) {
					// The two passes diverge and no preexisting finding explains it. The frozen rule pays
					// for one confirmation on the same candidate before the change is corrected for it.
					this.deps.progress(
						`confirming control ${control.control_id}: it fails on the candidate and passes on the reference`,
					);
					const confirmation = (await this.deps.controls.runControl(invocation)).evidence;
					const confirmationId = this.deps.id("evc");
					this.storeEvidence(
						input.change_id,
						{ ...confirmation, facts: { ...confirmation.facts, run: "confirmation" } },
						confirmationId,
					);
					outcome = applyInstability(outcome, confirmation.verdict, confirmationId);
				}
				candidate = {
					...candidate,
					verdict: outcome.verdict,
					findings: outcome.findings,
					baseline: outcome.comparison,
					limits: {
						...candidate.limits,
						unstable: outcome.comparison.unstable,
						notes: [...candidate.limits.notes, ...outcome.comparison.notes],
					},
				};
			}
			const evidenceId = this.deps.id("evd");
			const evidence = this.storeEvidence(input.change_id, candidate, evidenceId);
			// What blocks is what the frozen tolerance leaves blocking: without a reference pass, every
			// blocking finding counts, because an unknown baseline is not a tolerance (VER-08).
			const blocking = evidence.baseline
				? evidence.baseline.blocking_findings
				: blockingCount(evidence.findings, "block_any");
			facts.push({
				evidence_id: evidenceId,
				control_id: evidence.control_id,
				control_version: evidence.control_version,
				requirement_ids: evidence.requirement_refs.map((r) => r.requirement_id),
				subject_digest: evidence.subject.digest,
				protocol_revision: evidence.protocol_revision.revision,
				environment_digest: evidence.environment_digest,
				verdict: evidence.verdict,
				findings_blocking: blocking,
			});
		}
		// Evidence is about the snapshot the protocol froze: the kernel says whether the tree the
		// controls left behind is still that one (VER-03).
		const writable = writablePrefixes(protocol.controls);
		const after = await this.snapshotAfterControls(input, writable);
		return { facts, candidate_moved: candidateMoved(manifest, after, writable) };
	}

	/**
	 * The candidate tree once the controls have run, taken with their writable declarations excluded:
	 * a build output is not part of what the two passes have to agree on.
	 */
	private async snapshotAfterControls(input: RunInput, writable: readonly string[]): Promise<CandidateManifest> {
		const handle = {
			workspace_id: input.candidate.workspace_id,
			path: input.workspace_path,
			reference_id: input.reference.reference_id,
			created_at: this.deps.now(),
		};
		return await this.deps.workspace.snapshotCandidate(handle, input.reference, {
			...this.deps.workspacePolicy,
			exclusions: [...this.deps.workspacePolicy.exclusions, ...writable],
		});
	}

	/**
	 * The reference pass of every control (VER-08): the same control, on the initial tree, in the same
	 * environment — the comparability `environment_digest` expresses is the condition for the two
	 * passes to be about the same thing. A pass already established for this control, this reference
	 * and this environment is read back from the ledger: a reference does not change during a change,
	 * so the attempts that follow a refusal cost nothing on the reference side.
	 */
	private async referencePasses(
		changeId: string,
		protocol: Protocol,
		protocolRef: ProtocolRef,
		reference: ReferenceSnapshot,
	): Promise<Map<string, ReferencePass>> {
		const passes = new Map<string, ReferencePass>();
		if (!protocol.baseline.compare_to_reference) return passes;
		const established = this.deps.ledger.listEvidence(changeId);
		const pending: ControlDefinition[] = [];
		for (const control of protocol.controls) {
			const reused = reusableReferencePass(
				established,
				control,
				reference.tree_digest,
				this.deps.environment.digest,
				protocolRef,
			);
			if (reused)
				passes.set(control.control_id, {
					reference_id: reference.reference_id,
					reference_digest: reference.tree_digest,
					verdict: reused.verdict,
					findings: reused.findings,
					evidence_id: reused.evidence_id,
					reused: true,
				});
			else pending.push(control);
		}
		if (pending.length === 0) return passes;
		const handle = await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy);
		try {
			for (const control of pending) {
				this.deps.progress(`running control ${control.control_id} on the reference`);
				// The reference introduces nothing: that is the whole content of this pass for a differential
				// control, and it is why such a control carries no preexisting finding of its own (QLT-04).
				const { evidence } = await this.deps.controls.runControl({
					control,
					protocol: protocolRef,
					candidate: {
						candidate_id: reference.reference_id,
						manifest_digest: reference.tree_digest,
						base_digest: reference.tree_digest,
						workspace_id: handle.workspace_id,
					},
					subject: { kind: "reference", id: reference.reference_id, revision: 1, digest: reference.tree_digest },
					workspace_path: handle.path,
					environment: this.deps.environment,
					requirement_refs: control.requirement_refs,
					producer: EXECUTOR_ACTOR,
					introduced_lines: {},
				});
				const evidenceId = this.deps.id("evr");
				// Observed on the initial tree: every finding of this pass is a defect the change inherited.
				const stored = this.storeEvidence(
					changeId,
					{
						...evidence,
						facts: { ...evidence.facts, run: "reference" },
						findings: evidence.findings.map((finding) => ({ ...finding, baseline_state: "preexisting" as const })),
					},
					evidenceId,
				);
				passes.set(control.control_id, {
					reference_id: reference.reference_id,
					reference_digest: reference.tree_digest,
					verdict: stored.verdict,
					findings: stored.findings,
					evidence_id: evidenceId,
					reused: false,
				});
			}
		} finally {
			await this.deps.workspace.closeWorkspace(handle.workspace_id, "delete");
		}
		return passes;
	}

	/**
	 * The lines the frozen candidate introduces, recomputed from the store and not from a tree: the
	 * candidate bytes of `files_` and the reference bytes of `base_files_` are both in the dossier, so
	 * the calculation an auditor would redo is the one the controls were given (QLT-04).
	 */
	private async introducedLines(manifest: CandidateManifest, shape: CandidateShape): Promise<IntroducedLinesResult> {
		const index = async (artifactId: string) =>
			await this.deps
				.readArtifact<Record<string, { digest: string }>>({ artifact_id: artifactId, revision: 1 })
				.catch(() => ({}));
		const candidateFiles = await index(`files_${manifest.candidate_id}`);
		const referenceFiles = await index(`base_files_${manifest.candidate_id}`);
		const bytesOf = (files: Record<string, { digest: string }>) => async (path: string) => {
			const entry = files[path];
			return entry ? await this.deps.objects.get(entry.digest) : null;
		};
		return introducedLinesOf(manifest, shape.renames, bytesOf(referenceFiles), bytesOf(candidateFiles));
	}

	/** A qualification an earlier protocol of this change established for this exact sensor. */
	private async establishedQualification(
		protocolRefs: readonly { artifact_id: string; revision: number }[],
		control: ControlDefinition,
	): Promise<Qualification | null> {
		const priors: Protocol[] = [];
		for (const ref of protocolRefs) {
			const prior = await this.deps.readArtifact<Protocol>(ref).catch(() => null);
			if (prior) priors.push(prior);
		}
		return reusableQualification(priors, control, this.deps.environment.digest);
	}

	/**
	 * Adds what one qualification run saw on the reference to the suite observation. Only a parser
	 * that reports cases can contribute: an exit code alone tells nothing apart.
	 */
	private countReferenceCases(
		into: { reported: number; skipped: number; witnesses: number; any: boolean },
		control: ControlDefinition,
		witnessTests: number,
		facts: Record<string, unknown> | null,
	): void {
		if (control.parser === "exit-code" || !facts || typeof facts.tests !== "number") return;
		into.reported += facts.tests;
		into.skipped +=
			(typeof facts.skipped === "number" ? facts.skipped : 0) + (typeof facts.todo === "number" ? facts.todo : 0);
		into.witnesses += witnessTests;
		into.any = true;
	}

	/** Seals one observation into the ledger: chained, digested, and never rewritten (EVD-01). */
	private storeEvidence(changeId: string, candidate: EvidenceCandidate, evidenceId: string): Evidence {
		validate(EvidenceCandidate, candidate, "evidence-candidate");
		const evidence: Evidence = {
			evidence_id: evidenceId,
			requirement_refs: candidate.requirement_refs,
			control_id: candidate.control_id,
			control_version: candidate.control_version,
			subject: candidate.subject,
			protocol_revision: candidate.protocol_revision,
			environment_digest: candidate.environment.digest,
			inputs_digest: candidate.inputs_digest,
			started_at: candidate.started_at,
			ended_at: candidate.ended_at,
			verdict: candidate.verdict,
			facts: candidate.facts,
			findings: candidate.findings,
			artifacts: candidate.artifacts,
			limits: candidate.limits,
			baseline: candidate.baseline,
			producer: candidate.producer,
			integrity: { content_digest: "", chained_to: null },
		};
		evidence.integrity.content_digest = evidenceDigest(evidence);
		validate(Evidence, evidence, "evidence");
		this.deps.ledger.putEvidence(evidence, changeId);
		return evidence;
	}
}
