import type { ObjectRef } from "../contracts/v1/common.ts";

/** Content-addressed, immutable byte store (conception §7.1). */
export interface ObjectStorePort {
	/** Writes bytes atomically; returns the reference. Writing the same bytes twice is idempotent. */
	put(bytes: Uint8Array, mediaType: string): Promise<ObjectRef>;
	putText(text: string, mediaType?: string): Promise<ObjectRef>;
	get(ref: ObjectRef | string, range?: { offset: number; length: number }): Promise<Uint8Array | null>;
	has(digest: string): Promise<boolean>;
	/** Recomputes the digest of one object; false when the bytes do not match. */
	verify(digest: string): Promise<boolean>;
	listDigests(): Promise<string[]>;
}
