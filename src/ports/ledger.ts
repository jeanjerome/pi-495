import type { ArtifactRef, ObjectRef } from "../contracts/v1/common.ts";
import type { DecisionRequest, HumanDecision } from "../contracts/v1/decision.ts";
import type { Evidence } from "../contracts/v1/evidence.ts";
import type { ChangeEvent } from "../domain/change/events.ts";
import type { ChangeState, ArtifactKind } from "../domain/change/state.ts";
import type { ProgramEvent, ProgramState } from "../domain/program/program.ts";

export interface CommitReceipt {
	aggregate_id: string;
	revision: number;
	event_ids: string[];
	last_hash: string;
}

export interface StoredEvent<E = unknown> {
	event_id: string;
	aggregate_kind: "change" | "program";
	aggregate_id: string;
	sequence: number;
	correlation_id: string;
	causation_id: string | null;
	type: string;
	event: E;
	previous_hash: string | null;
	hash: string;
	recorded_at: string;
}

export interface AppendMeta {
	correlation_id: string;
	causation_id?: string | null;
}

export interface IntegrityReport {
	ok: boolean;
	aggregates_checked: number;
	events_checked: number;
	objects_checked: number;
	problems: { kind: "chain" | "projection" | "object" | "artifact"; subject: string; detail: string }[];
}

export interface StoredArtifact {
	ref: ArtifactRef;
	kind: ArtifactKind;
	change_id: string;
	object: ObjectRef;
	producer_id: string;
	created_at: string;
}

export interface OperationRecord {
	operation_id: string;
	idempotency_key: string;
	operation_type: string;
	aggregate_id: string;
	inputs_digest: string;
	status: "accepted" | "running" | "succeeded" | "failed" | "indeterminate" | "cancelled";
	effect_state: "none" | "prepared" | "started" | "confirmed" | "failed" | "uncertain" | "reconciled";
	result: unknown;
	created_at: string;
	updated_at: string;
}

export interface SessionBinding {
	session_id: string;
	cwd: string;
	program_id: string;
	change_id: string | null;
	bound_at: string;
}

export interface Lease {
	scope: string;
	owner: string;
	expires_at: string;
	operation_id: string | null;
}

/** Transactional normative journal (conception §7, ADR-005). Only the application layer writes it. */
export interface LedgerPort {
	appendChange(changeId: string, expectedRevision: number, events: readonly ChangeEvent[], meta: AppendMeta): CommitReceipt;
	loadChange(changeId: string): { state: ChangeState; revision: number } | null;
	readChangeEvents(changeId: string, fromSequence?: number): StoredEvent<ChangeEvent>[];
	listChanges(programId?: string): { change_id: string; program_id: string; increment_id: string; phase: string; status: string; outcome: string; updated_at: string }[];

	appendProgram(programId: string, expectedRevision: number, events: readonly ProgramEvent[], meta: AppendMeta): CommitReceipt;
	loadProgram(programId: string): { state: ProgramState; revision: number } | null;
	readProgramEvents(programId: string): StoredEvent<ProgramEvent>[];
	listPrograms(projectPath?: string): { program_id: string; project_path: string; title: string; updated_at: string; closed: boolean }[];

	putArtifact(kind: ArtifactKind, changeId: string, artifactId: string, object: ObjectRef, producerId: string, at: string): ArtifactRef;
	getArtifact(ref: Pick<ArtifactRef, "artifact_id" | "revision">): StoredArtifact | null;
	listArtifacts(changeId: string, kind?: ArtifactKind): StoredArtifact[];

	putEvidence(evidence: Evidence, changeId: string): void;
	getEvidence(evidenceId: string): Evidence | null;
	listEvidence(changeId: string): Evidence[];

	putDecisionRequest(request: DecisionRequest): void;
	getDecisionRequest(decisionId: string): DecisionRequest | null;
	putHumanDecision(decision: HumanDecision, changeId: string): void;
	listHumanDecisions(changeId: string): HumanDecision[];

	upsertOperation(record: OperationRecord): void;
	getOperationByKey(idempotencyKey: string): OperationRecord | null;
	getOperation(operationId: string): OperationRecord | null;

	bindSession(binding: SessionBinding): void;
	getSessionBinding(sessionId: string): SessionBinding | null;
	findBindingsByCwd(cwd: string): SessionBinding[];
	unbindSession(sessionId: string): void;

	acquireLease(scope: string, owner: string, ttlMs: number, now: string, operationId?: string | null): Lease | null;
	heartbeatLease(scope: string, owner: string, ttlMs: number, now: string): boolean;
	releaseLease(scope: string, owner: string): void;
	getLease(scope: string): Lease | null;

	verifyIntegrity(objectVerifier?: (digest: string) => Promise<boolean>): Promise<IntegrityReport>;
	close(): void;
}
