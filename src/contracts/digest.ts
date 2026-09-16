import { createHash } from "node:crypto";
import { canonicalize } from "./canonical.ts";

export type Digest = `sha256:${string}`;

export function sha256Hex(data: Uint8Array | string): string {
	return createHash("sha256").update(data).digest("hex");
}

export function digestBytes(data: Uint8Array | string): Digest {
	return `sha256:${sha256Hex(data)}`;
}

/** Digest of the canonical JSON form of a value. */
export function digestValue(value: unknown): Digest {
	return digestBytes(canonicalize(value));
}

export const EMPTY_DIGEST: Digest = digestBytes("");

export function isDigest(value: unknown): value is Digest {
	return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}
