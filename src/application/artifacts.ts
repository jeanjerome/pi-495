/**
 * Artifacts of a change, as the ledger and the object store hold them together: the ledger keeps
 * the reference, its kind and its revision, the store keeps the bytes and answers for their digest.
 *
 * Every read of what a change proposed or adopted goes through here, so a phase addresses one
 * collaborator instead of two stores, and bytes that no longer match their digest are refused at
 * the single place that reads them.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonicalize } from "../contracts/canonical.ts";
import { digestBytes } from "../contracts/digest.ts";
import type { ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type { ArtifactRef } from "../contracts/v1/common.ts";
import type { AdoptedComplement, Protocol } from "../contracts/v1/protocol.ts";
import type { SpecificationReport } from "../contracts/v1/reports.ts";
import type { ChangeEvent } from "../domain/change/events.ts";
import type { ArtifactKind, ChangeState } from "../domain/change/state.ts";
import { DomainError } from "../domain/errors.ts";
import type { LedgerPort } from "../ports/ledger.ts";
import type { ObjectStorePort } from "../ports/object-store.ts";
import type { PreparationRecord } from "./preparation.ts";

export interface ArtifactDeps {
	ledger: LedgerPort;
	objects: ObjectStorePort;
	now(): string;
}

/** The workspace prepared for an attempt, and the adopted preparation written into it. */
export interface PreparedWorkspace {
	workspace_id: string;
	path: string;
	/**
	 * Absent from a workspace recorded before the preparation was written down with it, which is never
	 * taken up again: what it holds is not known.
	 */
	preparation_id?: string | null;
	/**
	 * The digests of the complement files written into it. Absent from a workspace opened before
	 * complements could be adopted, which holds none.
	 */
	complements?: string[];
}

export class ArtifactRepository {
	private readonly deps: ArtifactDeps;
	constructor(deps: ArtifactDeps) {
		this.deps = deps;
	}

	/** Writes the bytes, then the reference that addresses them. A text artifact is kept as text. */
	async store(
		kind: ArtifactKind,
		changeId: string,
		artifactId: string,
		content: unknown,
		producerId: string,
	): Promise<ArtifactRef> {
		const obj = await this.deps.objects.put(
			new TextEncoder().encode(typeof content === "string" ? content : canonicalize(content)),
			typeof content === "string" ? "text/plain; charset=utf-8" : "application/json",
		);
		return this.deps.ledger.putArtifact(kind, changeId, artifactId, obj, producerId, this.deps.now());
	}

	/** Reads one revision back, and refuses bytes whose digest no longer matches the reference. */
	async read<T>(ref: Pick<ArtifactRef, "artifact_id" | "revision">): Promise<T> {
		const stored = this.deps.ledger.getArtifact(ref);
		if (!stored)
			throw new DomainError(
				"EVIDENCE_MISSING",
				`artifact ${ref.artifact_id} r${ref.revision} is missing from the ledger`,
			);
		const bytes = await this.deps.objects.get(stored.object);
		if (!bytes) throw new DomainError("EVIDENCE_MISSING", `object ${stored.object.digest} is missing from the store`);
		const text = new TextDecoder().decode(bytes);
		if (digestBytes(bytes) !== stored.object.digest)
			throw new DomainError("EVIDENCE_STALE", `object ${stored.object.digest} is corrupted`);
		return (stored.object.media_type.startsWith("application/json") ? JSON.parse(text) : text) as T;
	}

	/**
	 * The adopted revision of this kind, or the last one proposed when none is adopted yet. A proposal
	 * written before the owner revoked a question's resolution was written on its faith, so it is not
	 * the change's any more (DEC-06); the reference is the tree the change was opened on, recorded
	 * before any question. That cut reads the whole ledger, so it is taken only when nothing of the
	 * kind is adopted: an intervention reads several kinds, on a ledger every tool call lengthens.
	 */
	async latest<T>(state: ChangeState, kind: ArtifactKind): Promise<{ ref: ArtifactRef; content: T } | null> {
		const ref =
			state.adopted[kind]?.ref ??
			(kind === "reference" ? (state.proposals.reference ?? []) : this.proposedSinceRevocation(state, kind)).at(-1);
		if (!ref) return null;
		return { ref, content: await this.read<T>(ref) };
	}

	/** The tree the change was opened on. Without it nothing this change claims can be compared. */
	async reference(state: ChangeState): Promise<ReferenceSnapshot> {
		const a = await this.latest<ReferenceSnapshot>(state, "reference");
		if (!a) throw new DomainError("EVIDENCE_MISSING", "reference snapshot missing");
		return a.content;
	}

	/** Every specification report of this change but the current one, oldest first. */
	async priorDiagnostics(state: ChangeState): Promise<SpecificationReport[]> {
		const history = await this.specificationHistory(state);
		return [...history.earlier, ...history.sinceLastHumanAct];
	}

	/**
	 * The same reports, split where the latest material answer was recorded or the latest stop was
	 * lifted, whichever came last: each is a human act the rewritings that follow are bounded from, so a
	 * resume obtains a rewriting of the report the change stopped on. Only the ledger's order tells
	 * which reports that act followed: a clarification is entered again after an adoption or a refusal
	 * at G0 as well as after an answer. The reports written before the latest revocation are left out,
	 * and nothing they declared is inherited (DEC-06).
	 */
	async specificationHistory(
		state: ChangeState,
	): Promise<{ earlier: SpecificationReport[]; sinceLastHumanAct: SpecificationReport[] }> {
		const proposed = state.proposals.diagnostic ?? [];
		const writtenBeforeRevocation = proposed.length - this.proposedSinceRevocation(state, "diagnostic").length;
		const priors = proposed.slice(0, -1);
		const actedOn = Math.max(writtenBeforeRevocation, this.writtenBeforeLastAct(state) - 1);
		return {
			earlier: await this.readReports(priors.slice(writtenBeforeRevocation, actedOn)),
			sinceLastHumanAct: await this.readReports(priors.slice(actedOn)),
		};
	}

	/** How many specification reports were written before the latest human act, in the ledger's order. */
	private writtenBeforeLastAct(state: ChangeState): number {
		const material = new Set(state.open_questions.filter((q) => q.material).map((q) => q.id));
		let blocked = false;
		return this.writtenBeforeLast(state, "diagnostic", (event) => {
			if (event.type === "question.answered") return material.has(event.id);
			if (event.type !== "status.changed") return false;
			const lifted = blocked && event.status === "ready";
			blocked = event.status === "blocked";
			return lifted;
		});
	}

	/**
	 * The proposals of `kind` written since the owner last revoked a question's resolution, oldest
	 * first, and every one when nothing was revoked. What was proposed before was written on the faith
	 * of the revoked resolution, so no step takes it up again (DEC-06).
	 */
	proposedSinceRevocation(state: ChangeState, kind: ArtifactKind): ArtifactRef[] {
		const written = this.writtenBeforeLast(state, kind, (event) => event.type === "question.revoked");
		return (state.proposals[kind] ?? []).slice(written);
	}

	/**
	 * The preparations written for the requirements as they stand, oldest first: since the owner last
	 * revoked a question's resolution, and since the requirements were last revised into a different
	 * document. A revision that puts back the document already held changes nothing a preparation was
	 * written for, so it does not start the count again.
	 */
	preparationsForCurrentRequirements(state: ChangeState): ArtifactRef[] {
		let held: string | null = null;
		const written = this.writtenBeforeLast(state, "preparation", (event) => {
			if (event.type === "question.revoked") return true;
			if (event.type !== "artifact.proposed" && event.type !== "artifact.revised") return false;
			if (event.kind !== "requirements") return false;
			const rewritten = event.type === "artifact.revised" && held !== null && held !== event.ref.content_digest;
			held = event.ref.content_digest;
			return rewritten;
		});
		return (state.proposals.preparation ?? []).slice(written);
	}

	/**
	 * How many proposals of `kind` were written before the last event `marks` holds. Only the ledger's
	 * order tells which proposals an event followed: the state keeps the proposals, not what came
	 * between them. `marks` is called once for every other event, in the ledger's order, and never for
	 * a proposal of `kind`, so it may keep what it saw of the events before: `writtenBeforeLastAct`
	 * relies on that to tell a stop lifted from a status merely set.
	 */
	private writtenBeforeLast(state: ChangeState, kind: ArtifactKind, marks: (event: ChangeEvent) => boolean): number {
		let written = 0;
		let writtenBefore = 0;
		for (const { event } of this.deps.ledger.readChangeEvents(state.change_id)) {
			if ((event.type === "artifact.proposed" || event.type === "artifact.revised") && event.kind === kind) written++;
			else if (marks(event)) writtenBefore = written;
		}
		return writtenBefore;
	}

	private async readReports(refs: ArtifactRef[]): Promise<SpecificationReport[]> {
		const out: SpecificationReport[] = [];
		for (const ref of refs) {
			const report = await this.read<SpecificationReport>(ref).catch(() => null);
			if (report) out.push(report);
		}
		return out;
	}

	/** The preparation the kernel adopted, when one was qualified; never a refused proposal. */
	async adoptedPreparation(state: ChangeState): Promise<PreparationRecord | null> {
		const a = state.adopted.preparation ? await this.latest<PreparationRecord>(state, "preparation") : null;
		return a?.content.qualified ? a.content : null;
	}

	/** The complements the owner adopted, as the latest protocol froze them. */
	async adoptedComplements(state: ChangeState): Promise<AdoptedComplement[]> {
		return (await this.latest<Protocol>(state, "protocol"))?.content.complements ?? [];
	}

	/** Writes prepared files into a workspace, from the store and not from a tree. */
	async materializePrepared(
		prepared: { files: readonly { path: string; digest: string }[] } | null,
		workspacePath: string,
	): Promise<void> {
		if (!prepared) return;
		for (const f of prepared.files) {
			const bytes = await this.deps.objects.get(f.digest);
			if (!bytes)
				throw new DomainError("EVIDENCE_MISSING", `prepared file ${f.path} (${f.digest}) is missing from the store`);
			const target = join(workspacePath, f.path);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, bytes);
		}
	}

	/**
	 * The attempt whose workspace was prepared but whose producer never started: the capability check
	 * refused it, or the step stopped between the two. Taking it up again keeps one workspace per
	 * attempt, instead of a new copy of the project at every resume. It applies only before the first
	 * attempt starts: a correction opens the next attempt itself, and a started one stays open. The
	 * copy is the right start only while it holds the preparation and the complements adopted now: the
	 * reference cannot change, but a revocation withdraws the adoption, and the change rebuilt after it
	 * adopts a preparation of its own (DEC-06).
	 */
	async unstartedAttempt(state: ChangeState): Promise<string | null> {
		const started = new Set(state.attempts.map((a) => a.attempt_id));
		const unstarted = this.deps.ledger
			.listArtifacts(state.change_id, "candidate")
			.filter((a) => a.ref.artifact_id.startsWith("ws_") && !started.has(a.ref.artifact_id.slice("ws_".length)))
			.at(-1);
		if (!unstarted) return null;
		const workspace = await this.read<PreparedWorkspace>(unstarted.ref);
		const adopted = await this.adoptedPreparation(state);
		const complements = (await this.adoptedComplements(state)).map((c) => c.digest);
		const holdsComplements =
			(workspace.complements ?? []).length === complements.length &&
			complements.every((digest) => workspace.complements?.includes(digest));
		return workspace.preparation_id === (adopted?.preparation_id ?? null) && holdsComplements
			? unstarted.ref.artifact_id.slice("ws_".length)
			: null;
	}

	/** The workspace an attempt already opened, when the producer is resumed on its own work. */
	async workspaceOfAttempt(changeId: string, attemptId: string): Promise<PreparedWorkspace | null> {
		const opened = this.deps.ledger
			.listArtifacts(changeId, "candidate")
			.find((a) => a.ref.artifact_id === `ws_${attemptId}`);
		return opened ? await this.read<PreparedWorkspace>(opened.ref) : null;
	}

	/** Makes sure the bytes of each file are in the store, reading them back from the tree if not. */
	async ensureBytes(root: string, files: readonly { path: string; digest: string }[]): Promise<void> {
		for (const f of files) {
			if (await this.deps.objects.get(f.digest)) continue;
			await this.deps.objects.put(new Uint8Array(await readFile(join(root, f.path))), "text/plain; charset=utf-8");
		}
	}

	/** Puts the bytes of each path under `root` in the store, keyed by path. Unreadable paths are skipped. */
	async storeBytesOf(
		root: string,
		paths: string[],
	): Promise<Record<string, { digest: string; size_bytes: number; media_type: string }>> {
		const out: Record<string, { digest: string; size_bytes: number; media_type: string }> = {};
		for (const path of paths) {
			try {
				const ref = await this.deps.objects.put(
					new Uint8Array(await readFile(join(root, path))),
					"application/octet-stream",
				);
				out[path] = { digest: ref.digest, size_bytes: ref.size_bytes, media_type: ref.media_type };
			} catch {
				/* unreadable file: the manifest already carries the limit */
			}
		}
		return out;
	}
}
