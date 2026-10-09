/** A fake of the ledger, for the dossiers the gates never write. */
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import type { ArtifactRef, ObjectRef } from "../../src/contracts/v1/common.ts";
import type { StoredArtifact } from "../../src/ports/ledger.ts";

/**
 * A ledger that serves, for one artifact, another object than the one recorded. G2 does not freeze a
 * protocol whose control failed its qualification, so a survey that names such a control a blind spot for
 * that reason is a dossier the gates never write: it is served in place of the accepted one.
 */
export class LedgerServingAnotherObject extends SqliteLedger {
	private readonly served = new Map<string, ObjectRef>();
	serve(ref: Pick<ArtifactRef, "artifact_id" | "revision">, object: ObjectRef): void {
		this.served.set(`${ref.artifact_id}@${ref.revision}`, object);
	}
	override getArtifact(ref: Pick<ArtifactRef, "artifact_id" | "revision">): StoredArtifact | null {
		const stored = super.getArtifact(ref);
		const object = this.served.get(`${ref.artifact_id}@${ref.revision}`);
		return stored && object ? { ...stored, object } : stored;
	}
}
