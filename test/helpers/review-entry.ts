import { digestValue } from "../../src/contracts/digest.ts";
import type { ManifestEntry } from "../../src/contracts/v1/candidate.ts";

/** A one-byte file of the review fixtures in the given baseline state, with the fields a test sets laid over it. */
export function entry(
	path: string,
	state: ManifestEntry["baseline_state"],
	over: Partial<ManifestEntry> = {},
): ManifestEntry {
	return {
		path,
		kind: "file",
		content_digest: digestValue(path + state),
		size: 1,
		mode: "000644",
		symlink_target: null,
		baseline_state: state,
		origin: "unknown",
		limits: null,
		...over,
	};
}
