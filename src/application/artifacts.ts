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
import type { SpecificationReport } from "../contracts/v1/reports.ts";
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

	/** The adopted revision of this kind, or the last one proposed when none is adopted yet. */
	async latest<T>(state: ChangeState, kind: ArtifactKind): Promise<{ ref: ArtifactRef; content: T } | null> {
		const adopted = state.adopted[kind];
		const ref = adopted?.ref ?? state.proposals[kind]?.at(-1);
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
		const out: SpecificationReport[] = [];
		for (const ref of (state.proposals.diagnostic ?? []).slice(0, -1)) {
			const prior = await this.read<SpecificationReport>(ref).catch(() => null);
			if (prior) out.push(prior);
		}
		return out;
	}

	/** The preparation the kernel adopted, when one was qualified; never a refused proposal. */
	async adoptedPreparation(state: ChangeState): Promise<PreparationRecord | null> {
		const a = state.adopted.preparation ? await this.latest<PreparationRecord>(state, "preparation") : null;
		return a?.content.qualified ? a.content : null;
	}

	/** Writes the adopted prepared files back into a workspace, from the store and not from a tree. */
	async materializePrepared(prepared: PreparationRecord | null, workspacePath: string): Promise<void> {
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

	/** The workspace an attempt already opened, when the producer is resumed on its own work. */
	async workspaceOfAttempt(
		changeId: string,
		attemptId: string,
	): Promise<{ workspace_id: string; path: string } | null> {
		const opened = this.deps.ledger
			.listArtifacts(changeId, "candidate")
			.find((a) => a.ref.artifact_id === `ws_${attemptId}`);
		return opened ? await this.read<{ workspace_id: string; path: string }>(opened.ref) : null;
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
