import type { CandidateManifest } from "../contracts/v1/candidate.ts";

/**
 * Whether a test resource carries, byte for byte, a production resource the same candidate wrote
 * next to it. The Maven and Gradle layout keeps the two trees mirrored — `src/test/resources/x`
 * beside `src/main/resources/x` — and copying there the file the change just added is not editing
 * the oracle that protects it. A copy that differs, or one whose production side this change did
 * not write, is an edit like any other.
 */
export function mirrorsProductionResource(manifest: CandidateManifest, path: string): boolean {
	const resource = /^(.*)src\/test\/resources\/(.+)$/.exec(path);
	if (!resource) return false;
	const entry = manifest.entries.find((e) => e.path === path);
	if (!entry || entry.baseline_state === "deleted" || entry.content_digest === null) return false;
	const production = manifest.entries.find((e) => e.path === `${resource[1]}src/main/resources/${resource[2]}`);
	if (!production || production.baseline_state === "unchanged" || production.baseline_state === "deleted") return false;
	return entry.content_digest === production.content_digest;
}
