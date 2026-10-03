/**
 * Evidence ledger (CMP-EVD, §7): the chained event log, its projections, the artifacts, evidence,
 * decisions, operations and leases. Writes are atomic and never overwrite a revision.
 */
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalize } from "../../contracts/canonical.ts";
import { digestBytes, sha256Hex } from "../../contracts/digest.ts";
import type { ArtifactRef, ObjectRef } from "../../contracts/v1/common.ts";
import type { DecisionRequest, HumanDecision } from "../../contracts/v1/decision.ts";
import { evidenceDigest, type Evidence } from "../../contracts/v1/evidence.ts";
import { apply, replay } from "../../domain/change/apply.ts";
import type { ChangeEvent } from "../../domain/change/events.ts";
import type { ArtifactKind, ChangeState } from "../../domain/change/state.ts";
import { DomainError, messageOf } from "../../domain/errors.ts";
import {
	applyProgram,
	type Baseline,
	type GapKey,
	type IncrementState,
	replayProgram,
	type ProgramEvent,
	type ProgramState,
} from "../../domain/program/program.ts";
import type {
	AppendMeta,
	CommitReceipt,
	IntegrityReport,
	Lease,
	LedgerPort,
	OperationRecord,
	SessionBinding,
	StoredArtifact,
	StoredEvent,
} from "../../ports/ledger.ts";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.ts";

export interface LedgerHooks {
	/** Fault injection: called inside the transaction just before COMMIT. Throwing simulates a crash. */
	beforeCommit?: (aggregateId: string) => void;
	/** Fault injection: called after the events are inserted and before the projection is written. */
	beforeProjection?: (aggregateId: string) => void;
}

export interface LedgerOptions {
	hooks?: LedgerHooks;
	idFactory?: () => string;
	clock?: () => string;
}

let idCounter = 0;
function defaultId(): string {
	idCounter++;
	return `evt_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * node:sqlite types every row as `Record<string, SQLOutputValue>`, which no row type of the port is
 * comparable to. The schema (`schema.ts`) and the only writer (this class) live in this repository,
 * so a row is trusted to carry the columns and types its query selects: these two functions are the
 * one place that trust is taken.
 */
function rows<T>(statement: StatementSync, ...params: SQLInputValue[]): T[] {
	return statement.all(...params) as unknown as T[];
}

function row<T>(statement: StatementSync, ...params: SQLInputValue[]): T | undefined {
	return statement.get(...params) as T | undefined;
}

type EventRow = Omit<StoredEvent, "event"> & { payload: string };
type ArtifactRow = Omit<StoredArtifact, "ref" | "object"> & {
	artifact_id: string;
	revision: number;
	content_digest: string;
	size_bytes: number;
	media_type: string;
};
type OperationRow = Omit<OperationRecord, "result"> & { result: string | null };

/**
 * SQLite implementation of the ledger. One logical writer, `BEGIN IMMEDIATE` transactions, WAL
 * journal, hash-chained events per aggregate and replaceable projections (conception §7.2–7.3).
 */
export class SqliteLedger implements LedgerPort {
	readonly db: DatabaseSync;
	readonly path: string;
	private readonly hooks: LedgerHooks;
	private readonly idFactory: () => string;
	private readonly clock: () => string;

	constructor(path: string, options: LedgerOptions = {}) {
		this.path = path;
		this.hooks = options.hooks ?? {};
		this.idFactory = options.idFactory ?? defaultId;
		this.clock = options.clock ?? (() => new Date().toISOString());
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new DatabaseSync(path);
		this.db.exec("PRAGMA foreign_keys = ON");
		if (path !== ":memory:") {
			this.db.exec("PRAGMA journal_mode = WAL");
			this.db.exec("PRAGMA synchronous = FULL");
		}
		this.db.exec("PRAGMA busy_timeout = 5000");
		this.migrate();
	}

	private migrate(): void {
		this.db.exec(SCHEMA_SQL);
		const applied = row<{ version: number }>(
			this.db.prepare("SELECT version FROM schema_migrations WHERE version = ?"),
			SCHEMA_VERSION,
		);
		if (!applied)
			this.db
				.prepare("INSERT INTO schema_migrations (version, digest, applied_at, result) VALUES (?, ?, ?, ?)")
				.run(SCHEMA_VERSION, digestBytes(SCHEMA_SQL), this.clock(), "applied");
		const newer = row<{ v: number | null }>(this.db.prepare("SELECT MAX(version) AS v FROM schema_migrations"));
		if ((newer?.v ?? 0) > SCHEMA_VERSION)
			throw new DomainError(
				"CONFIGURATION_ERROR",
				`database schema ${newer?.v} is newer than supported ${SCHEMA_VERSION}; refusing to mutate`,
			);
	}

	// --- generic append ------------------------------------------------------------------------

	private append<E extends { type: string; at: string; actor: { actor_id: string } }>(
		kind: "change" | "program",
		aggregateId: string,
		expectedRevision: number,
		events: readonly E[],
		meta: AppendMeta,
		project: (id: string) => void,
	): CommitReceipt {
		if (events.length === 0) {
			const agg = this.aggregate(kind, aggregateId);
			return {
				aggregate_id: aggregateId,
				revision: agg?.revision ?? 0,
				event_ids: [],
				last_hash: agg?.last_hash ?? "",
			};
		}
		return this.transaction(() => {
			const agg = this.aggregate(kind, aggregateId);
			const currentRevision = agg?.revision ?? 0;
			if (currentRevision !== expectedRevision)
				throw new DomainError(
					"REVISION_CONFLICT",
					`aggregate ${aggregateId} is at revision ${currentRevision}, expected ${expectedRevision}`,
					{ retryable: true },
				);
			let previous = agg?.last_hash ?? null;
			let sequence = currentRevision;
			const ids: string[] = [];
			const insert = this.db.prepare(
				"INSERT INTO events (event_id, aggregate_kind, aggregate_id, sequence, correlation_id, causation_id, actor_id, type, payload, previous_hash, hash, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			);
			let causation = meta.causation_id ?? null;
			for (const event of events) {
				sequence++;
				const eventId = this.idFactory();
				const payload = canonicalize(event);
				const hash = `sha256:${sha256Hex(`${previous ?? ""}${payload}`)}`;
				insert.run(
					eventId,
					kind,
					aggregateId,
					sequence,
					meta.correlation_id,
					causation,
					event.actor.actor_id,
					event.type,
					payload,
					previous,
					hash,
					this.clock(),
				);
				ids.push(eventId);
				previous = hash;
				causation = eventId;
			}
			this.db
				.prepare(
					"INSERT INTO aggregates (aggregate_kind, aggregate_id, revision, last_hash) VALUES (?, ?, ?, ?) ON CONFLICT (aggregate_kind, aggregate_id) DO UPDATE SET revision = excluded.revision, last_hash = excluded.last_hash",
				)
				.run(kind, aggregateId, sequence, previous);
			this.hooks.beforeProjection?.(aggregateId);
			project(aggregateId);
			this.hooks.beforeCommit?.(aggregateId);
			return { aggregate_id: aggregateId, revision: sequence, event_ids: ids, last_hash: previous ?? "" };
		});
	}

	/** Runs `work` in one `BEGIN IMMEDIATE` transaction; a failed rollback never hides the error that caused it. */
	private transaction<T>(work: () => T): T {
		this.db.exec("BEGIN IMMEDIATE");
		try {
			const result = work();
			this.db.exec("COMMIT");
			return result;
		} catch (error) {
			try {
				this.db.exec("ROLLBACK");
			} catch {
				/* already rolled back */
			}
			throw error;
		}
	}

	private aggregate(kind: string, id: string): { revision: number; last_hash: string } | null {
		return (
			row<{ revision: number; last_hash: string }>(
				this.db.prepare("SELECT revision, last_hash FROM aggregates WHERE aggregate_kind = ? AND aggregate_id = ?"),
				kind,
				id,
			) ?? null
		);
	}

	private events<E>(kind: string, id: string, from = 0): StoredEvent<E>[] {
		return rows<EventRow>(
			this.db.prepare(
				"SELECT * FROM events WHERE aggregate_kind = ? AND aggregate_id = ? AND sequence > ? ORDER BY sequence",
			),
			kind,
			id,
			from,
		).map((r) => ({
			event_id: r.event_id,
			aggregate_kind: r.aggregate_kind,
			aggregate_id: r.aggregate_id,
			sequence: r.sequence,
			correlation_id: r.correlation_id,
			causation_id: r.causation_id ?? null,
			type: r.type,
			event: JSON.parse(r.payload) as E,
			previous_hash: r.previous_hash ?? null,
			hash: r.hash,
			recorded_at: r.recorded_at,
		}));
	}

	// --- change ---------------------------------------------------------------------------------

	appendChange(
		changeId: string,
		expectedRevision: number,
		events: readonly ChangeEvent[],
		meta: AppendMeta,
	): CommitReceipt {
		return this.append("change", changeId, expectedRevision, events, meta, () => {
			const loaded = expectedRevision === 0 ? null : this.loadChange(changeId);
			let state: ChangeState | null = loaded?.state ?? null;
			for (const e of events) state = apply(state, e);
			if (!state) return;
			for (const e of events) this.projectOperation(changeId, e);
			this.projectChange(changeId, state);
		});
	}

	/**
	 * Effectful operations are recorded in the same transaction as the events that open them, under
	 * a key unique across the whole database. An integration's key names the candidate and the
	 * destination head it starts from: a second integration of the same candidate onto the same head —
	 * from a reloaded extension, a forked conversation — is refused here rather than applying the
	 * effect twice. A verification's key names the change and the revision it starts from: another
	 * change of the dossier whose candidate is identical derives another key, and a second session that
	 * read the same revision is refused by the revision check before its key is read.
	 */
	private projectOperation(changeId: string, event: ChangeEvent): void {
		if (event.type === "operation.opened") {
			const existing = this.getOperationByKey(event.idempotency_key);
			if (existing && existing.operation_id !== event.operation_id) {
				throw new DomainError(
					"OPERATION_ACTIVE",
					`operation ${existing.operation_id} already holds the idempotency key ${event.idempotency_key}; ${event.operation_id} would run the same ${event.kind} a second time`,
				);
			}
			this.upsertOperation({
				operation_id: event.operation_id,
				idempotency_key: event.idempotency_key,
				operation_type: event.kind,
				aggregate_id: changeId,
				inputs_digest: digestBytes(event.idempotency_key),
				status: "running",
				effect_state: "none",
				result: null,
				created_at: event.at,
				updated_at: event.at,
			});
			return;
		}
		if (event.type === "operation.effect") {
			const current = this.getOperation(event.operation_id);
			if (current)
				this.upsertOperation({
					...current,
					effect_state: event.effect_state,
					status:
						event.effect_state === "failed"
							? "failed"
							: event.effect_state === "uncertain"
								? "indeterminate"
								: current.status,
					result: event.detail,
					updated_at: event.at,
				});
			return;
		}
		if (event.type === "operation.closed") {
			const current = this.getOperation(event.operation_id);
			if (current)
				this.upsertOperation({
					...current,
					status: current.status !== "running" ? current.status : event.interrupted ? "cancelled" : "succeeded",
					updated_at: event.at,
				});
		}
	}

	loadChange(changeId: string): { state: ChangeState; revision: number } | null {
		const projected = row<{ state: string; revision: number }>(
			this.db.prepare("SELECT state, revision FROM changes WHERE change_id = ?"),
			changeId,
		);
		if (!projected) return null;
		return { state: JSON.parse(projected.state) as ChangeState, revision: projected.revision };
	}

	/** Rebuilds the projection from events (used after a detected divergence). */
	rebuildChange(changeId: string): ChangeState | null {
		const events = this.readChangeEvents(changeId);
		if (events.length === 0) return null;
		const state = replay(events.map((e) => e.event));
		this.projectChange(changeId, state);
		return state;
	}

	private projectChange(changeId: string, state: ChangeState): void {
		this.db
			.prepare(
				"INSERT INTO changes (change_id, program_id, increment_id, revision, phase, status, outcome, state, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (change_id) DO UPDATE SET revision = excluded.revision, phase = excluded.phase, status = excluded.status, outcome = excluded.outcome, state = excluded.state, updated_at = excluded.updated_at",
			)
			.run(
				changeId,
				state.program_id,
				state.increment_id,
				state.revision,
				state.phase,
				state.status,
				state.outcome,
				JSON.stringify(state),
				state.updated_at,
			);
	}

	readChangeEvents(changeId: string, fromSequence = 0): StoredEvent<ChangeEvent>[] {
		return this.events<ChangeEvent>("change", changeId, fromSequence);
	}

	listChanges(programId?: string) {
		type ChangeRow = ReturnType<LedgerPort["listChanges"]>[number];
		return programId
			? rows<ChangeRow>(
					this.db.prepare(
						"SELECT change_id, program_id, increment_id, phase, status, outcome, updated_at FROM changes WHERE program_id = ? ORDER BY updated_at",
					),
					programId,
				)
			: rows<ChangeRow>(
					this.db.prepare(
						"SELECT change_id, program_id, increment_id, phase, status, outcome, updated_at FROM changes ORDER BY updated_at",
					),
				);
	}

	// --- program --------------------------------------------------------------------------------

	appendProgram(
		programId: string,
		expectedRevision: number,
		events: readonly ProgramEvent[],
		meta: AppendMeta,
	): CommitReceipt {
		return this.append("program", programId, expectedRevision, events, meta, () => {
			let state: ProgramState | null = expectedRevision === 0 ? null : (this.loadProgram(programId)?.state ?? null);
			for (const e of events) state = applyProgram(state, e);
			if (!state) return;
			this.db
				.prepare(
					"INSERT INTO programs (program_id, project_path, title, revision, closed, state, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (program_id) DO UPDATE SET title = excluded.title, revision = excluded.revision, closed = excluded.closed, state = excluded.state, updated_at = excluded.updated_at",
				)
				.run(
					programId,
					state.project_path,
					state.title,
					state.revision,
					state.closed ? 1 : 0,
					JSON.stringify(state),
					state.updated_at,
				);
		});
	}

	loadProgram(programId: string): { state: ProgramState; revision: number } | null {
		const projected = row<{ state: string; revision: number }>(
			this.db.prepare("SELECT state, revision FROM programs WHERE program_id = ?"),
			programId,
		);
		if (!projected) return null;
		// A projection stored before increments named gaps carries neither their gaps nor a baseline.
		const stored = JSON.parse(projected.state) as Omit<ProgramState, "increments" | "baseline"> & {
			increments: (Omit<IncrementState, "gaps"> & { gaps?: GapKey[] })[];
			baseline?: Baseline | null;
		};
		const state: ProgramState = {
			...stored,
			increments: stored.increments.map((i) => ({ ...i, gaps: i.gaps ?? [] })),
			baseline: stored.baseline ?? null,
		};
		return { state, revision: projected.revision };
	}

	readProgramEvents(programId: string): StoredEvent<ProgramEvent>[] {
		return this.events<ProgramEvent>("program", programId);
	}

	listPrograms(projectPath?: string) {
		type ProgramRow = { program_id: string; project_path: string; title: string; updated_at: string; closed: number };
		const programs = projectPath
			? rows<ProgramRow>(
					this.db.prepare(
						"SELECT program_id, project_path, title, updated_at, closed FROM programs WHERE project_path = ? ORDER BY updated_at",
					),
					projectPath,
				)
			: rows<ProgramRow>(
					this.db.prepare(
						"SELECT program_id, project_path, title, updated_at, closed FROM programs ORDER BY updated_at",
					),
				);
		return programs.map((r) => ({ ...r, closed: r.closed === 1 }));
	}

	// --- artifacts, evidence, decisions ------------------------------------------------------------

	putArtifact(
		kind: ArtifactKind,
		changeId: string,
		artifactId: string,
		object: ObjectRef,
		producerId: string,
		at: string,
	): ArtifactRef {
		const latest = row<{ r: number | null }>(
			this.db.prepare("SELECT MAX(revision) AS r FROM artifacts WHERE artifact_id = ?"),
			artifactId,
		);
		const revision = (latest?.r ?? 0) + 1;
		this.db
			.prepare(
				"INSERT INTO artifacts (artifact_id, revision, kind, change_id, content_digest, size_bytes, media_type, producer_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(artifactId, revision, kind, changeId, object.digest, object.size_bytes, object.media_type, producerId, at);
		return { artifact_id: artifactId, revision, content_digest: object.digest, schema_version: 1 };
	}

	getArtifact(ref: Pick<ArtifactRef, "artifact_id" | "revision">): StoredArtifact | null {
		const r = row<ArtifactRow>(
			this.db.prepare("SELECT * FROM artifacts WHERE artifact_id = ? AND revision = ?"),
			ref.artifact_id,
			ref.revision,
		);
		return r ? rowToArtifact(r) : null;
	}

	listArtifacts(changeId: string, kind?: ArtifactKind): StoredArtifact[] {
		const artifacts = kind
			? rows<ArtifactRow>(
					this.db.prepare("SELECT * FROM artifacts WHERE change_id = ? AND kind = ? ORDER BY created_at, revision"),
					changeId,
					kind,
				)
			: rows<ArtifactRow>(
					this.db.prepare("SELECT * FROM artifacts WHERE change_id = ? ORDER BY created_at, revision"),
					changeId,
				);
		return artifacts.map(rowToArtifact);
	}

	putEvidence(evidence: Evidence, changeId: string): void {
		this.db
			.prepare(
				"INSERT OR IGNORE INTO evidence (evidence_id, change_id, control_id, subject_digest, verdict, content_digest, document, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				evidence.evidence_id,
				changeId,
				evidence.control_id,
				evidence.subject.digest,
				evidence.verdict,
				evidence.integrity.content_digest,
				JSON.stringify(evidence),
				evidence.ended_at,
			);
	}

	getEvidence(evidenceId: string): Evidence | null {
		const r = row<{ document: string }>(
			this.db.prepare("SELECT document FROM evidence WHERE evidence_id = ?"),
			evidenceId,
		);
		return r ? (JSON.parse(r.document) as Evidence) : null;
	}

	listEvidence(changeId: string): Evidence[] {
		return rows<{ document: string }>(
			this.db.prepare("SELECT document FROM evidence WHERE change_id = ? ORDER BY recorded_at"),
			changeId,
		).map((r) => JSON.parse(r.document) as Evidence);
	}

	putDecisionRequest(request: DecisionRequest): void {
		this.db
			.prepare(
				"INSERT OR REPLACE INTO decision_requests (decision_id, change_id, interaction, document, requested_at) VALUES (?, ?, ?, ?, ?)",
			)
			.run(request.decision_id, request.change_id, request.interaction, JSON.stringify(request), request.requested_at);
	}

	getDecisionRequest(decisionId: string): DecisionRequest | null {
		const r = row<{ document: string }>(
			this.db.prepare("SELECT document FROM decision_requests WHERE decision_id = ?"),
			decisionId,
		);
		return r ? (JSON.parse(r.document) as DecisionRequest) : null;
	}

	putHumanDecision(decision: HumanDecision, changeId: string): void {
		this.db
			.prepare(
				"INSERT OR REPLACE INTO human_decisions (human_decision_id, decision_id, change_id, actor_id, document, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				decision.human_decision_id,
				decision.request.decision_id,
				changeId,
				decision.origin.actor.actor_id,
				JSON.stringify(decision),
				decision.recorded_at,
			);
	}

	listHumanDecisions(changeId: string): HumanDecision[] {
		return rows<{ document: string }>(
			this.db.prepare("SELECT document FROM human_decisions WHERE change_id = ? ORDER BY recorded_at"),
			changeId,
		).map((r) => JSON.parse(r.document) as HumanDecision);
	}

	// --- operations, bindings, leases ------------------------------------------------------------

	upsertOperation(record: OperationRecord): void {
		this.db
			.prepare(
				"INSERT INTO operations (operation_id, idempotency_key, operation_type, aggregate_id, inputs_digest, status, effect_state, result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (operation_id) DO UPDATE SET status = excluded.status, effect_state = excluded.effect_state, result = excluded.result, updated_at = excluded.updated_at",
			)
			.run(
				record.operation_id,
				record.idempotency_key,
				record.operation_type,
				record.aggregate_id,
				record.inputs_digest,
				record.status,
				record.effect_state,
				record.result === undefined ? null : JSON.stringify(record.result),
				record.created_at,
				record.updated_at,
			);
	}

	getOperationByKey(idempotencyKey: string): OperationRecord | null {
		const r = row<OperationRow>(this.db.prepare("SELECT * FROM operations WHERE idempotency_key = ?"), idempotencyKey);
		return r ? rowToOperation(r) : null;
	}

	getOperation(operationId: string): OperationRecord | null {
		const r = row<OperationRow>(this.db.prepare("SELECT * FROM operations WHERE operation_id = ?"), operationId);
		return r ? rowToOperation(r) : null;
	}

	bindSession(binding: SessionBinding): void {
		this.db
			.prepare(
				"INSERT OR REPLACE INTO pi_bindings (session_id, cwd, program_id, change_id, bound_at) VALUES (?, ?, ?, ?, ?)",
			)
			.run(binding.session_id, binding.cwd, binding.program_id, binding.change_id, binding.bound_at);
	}

	getSessionBinding(sessionId: string): SessionBinding | null {
		return row<SessionBinding>(this.db.prepare("SELECT * FROM pi_bindings WHERE session_id = ?"), sessionId) ?? null;
	}

	findBindingsByCwd(cwd: string): SessionBinding[] {
		return rows<SessionBinding>(this.db.prepare("SELECT * FROM pi_bindings WHERE cwd = ? ORDER BY bound_at DESC"), cwd);
	}

	unbindSession(sessionId: string): void {
		this.db.prepare("DELETE FROM pi_bindings WHERE session_id = ?").run(sessionId);
	}

	acquireLease(
		scope: string,
		owner: string,
		ttlMs: number,
		now: string,
		operationId: string | null = null,
	): Lease | null {
		const expires = new Date(Date.parse(now) + ttlMs).toISOString();
		return this.transaction(() => {
			const current = row<Lease>(this.db.prepare("SELECT * FROM leases WHERE scope = ?"), scope);
			if (current && current.owner !== owner && current.expires_at > now) return null;
			this.db
				.prepare(
					"INSERT INTO leases (scope, owner, expires_at, operation_id) VALUES (?, ?, ?, ?) ON CONFLICT (scope) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at, operation_id = excluded.operation_id",
				)
				.run(scope, owner, expires, operationId);
			return { scope, owner, expires_at: expires, operation_id: operationId };
		});
	}

	/**
	 * Extends a lease still in `owner`'s name, expired or not: an owner suspended past its lease that
	 * nobody took over keeps it, while a lease another owner took is left to that owner.
	 */
	heartbeatLease(scope: string, owner: string, ttlMs: number, now: string): boolean {
		const expires = new Date(Date.parse(now) + ttlMs).toISOString();
		const r = this.db
			.prepare("UPDATE leases SET expires_at = ? WHERE scope = ? AND owner = ?")
			.run(expires, scope, owner);
		return Number(r.changes) === 1;
	}

	releaseLease(scope: string, owner: string): void {
		this.db.prepare("DELETE FROM leases WHERE scope = ? AND owner = ?").run(scope, owner);
	}

	getLease(scope: string): Lease | null {
		return row<Lease>(this.db.prepare("SELECT * FROM leases WHERE scope = ?"), scope) ?? null;
	}

	// --- integrity ------------------------------------------------------------------------------

	async verifyIntegrity(objectVerifier?: (digest: string) => Promise<boolean>): Promise<IntegrityReport> {
		const report: IntegrityReport = {
			ok: true,
			aggregates_checked: 0,
			events_checked: 0,
			objects_checked: 0,
			problems: [],
		};
		const aggregates = rows<{
			aggregate_kind: "change" | "program";
			aggregate_id: string;
			revision: number;
			last_hash: string;
		}>(this.db.prepare("SELECT aggregate_kind, aggregate_id, revision, last_hash FROM aggregates"));
		for (const agg of aggregates) {
			report.aggregates_checked++;
			const events = this.events<{ type: string }>(agg.aggregate_kind, agg.aggregate_id);
			let previous: string | null = null;
			let seq = 0;
			for (const e of events) {
				report.events_checked++;
				seq++;
				if (e.sequence !== seq)
					report.problems.push({
						kind: "chain",
						subject: `${agg.aggregate_kind}:${agg.aggregate_id}`,
						detail: `sequence gap at ${seq}`,
					});
				const expected: string = `sha256:${sha256Hex(`${previous ?? ""}${canonicalize(e.event)}`)}`;
				if (e.previous_hash !== previous)
					report.problems.push({ kind: "chain", subject: e.event_id, detail: "previous hash mismatch" });
				if (e.hash !== expected)
					report.problems.push({ kind: "chain", subject: e.event_id, detail: "event hash mismatch" });
				previous = e.hash;
			}
			if (events.length !== agg.revision || (previous ?? "") !== agg.last_hash)
				report.problems.push({
					kind: "chain",
					subject: `${agg.aggregate_kind}:${agg.aggregate_id}`,
					detail: `aggregate head mismatch (revision ${agg.revision}, ${events.length} events)`,
				});
			try {
				if (agg.aggregate_kind === "change") {
					const projected = this.loadChange(agg.aggregate_id);
					const rebuilt = replay(events.map((e) => e.event as ChangeEvent));
					if (!projected || canonicalize(projected.state) !== canonicalize(rebuilt))
						report.problems.push({
							kind: "projection",
							subject: agg.aggregate_id,
							detail: "projection differs from replay",
						});
				} else {
					const projected = this.loadProgram(agg.aggregate_id);
					const rebuilt = replayProgram(events.map((e) => e.event as ProgramEvent));
					if (!projected || canonicalize(projected.state) !== canonicalize(rebuilt))
						report.problems.push({
							kind: "projection",
							subject: agg.aggregate_id,
							detail: "projection differs from replay",
						});
				}
			} catch (error) {
				report.problems.push({
					kind: "projection",
					subject: agg.aggregate_id,
					detail: `replay failed: ${messageOf(error)}`,
				});
			}
		}
		if (objectVerifier) {
			const digests = new Set<string>();
			for (const r of rows<{ content_digest: string }>(this.db.prepare("SELECT content_digest FROM artifacts")))
				digests.add(r.content_digest);
			for (const r of rows<{ document: string }>(this.db.prepare("SELECT document FROM evidence"))) {
				const ev = JSON.parse(r.document) as Evidence;
				for (const a of ev.artifacts) digests.add(a.ref.digest);
				if (ev.integrity.content_digest !== evidenceDigest(ev))
					report.problems.push({
						kind: "artifact",
						subject: ev.evidence_id,
						detail: "evidence content digest mismatch",
					});
			}
			for (const d of digests) {
				report.objects_checked++;
				if (!(await objectVerifier(d)))
					report.problems.push({ kind: "object", subject: d, detail: "object missing or corrupted" });
			}
		}
		report.ok = report.problems.length === 0;
		return report;
	}

	close(): void {
		this.db.close();
	}
}

function rowToArtifact(r: ArtifactRow): StoredArtifact {
	return {
		ref: {
			artifact_id: r.artifact_id,
			revision: r.revision,
			content_digest: r.content_digest,
			schema_version: 1,
		},
		kind: r.kind,
		change_id: r.change_id,
		object: {
			algorithm: "sha256",
			digest: r.content_digest,
			size_bytes: r.size_bytes,
			media_type: r.media_type,
		},
		producer_id: r.producer_id,
		created_at: r.created_at,
	};
}

function rowToOperation(r: OperationRow): OperationRecord {
	return {
		operation_id: r.operation_id,
		idempotency_key: r.idempotency_key,
		operation_type: r.operation_type,
		aggregate_id: r.aggregate_id,
		inputs_digest: r.inputs_digest,
		status: r.status,
		effect_state: r.effect_state,
		result: r.result ? JSON.parse(r.result) : null,
		created_at: r.created_at,
		updated_at: r.updated_at,
	};
}
