import type { CandidateManifest } from "../contracts/v1/candidate.ts";

/**
 * Whether a test resource carries, byte for byte, a production resource the same candidate wrote
 * next to it. A technology may keep the two trees mirrored, and `productionOf` names the production
 * resource a test resource stands beside; copying there the file the change just added is not editing
 * the oracle that protects it. A copy that differs, or one whose production side this change did
 * not write, is an edit like any other.
 */
export function mirrorsProductionResource(
	manifest: CandidateManifest,
	path: string,
	productionOf: (path: string) => string | null,
): boolean {
	const productionPath = productionOf(path);
	if (productionPath === null) return false;
	const entry = manifest.entries.find((e) => e.path === path);
	if (!entry || entry.baseline_state === "deleted" || entry.content_digest === null) return false;
	const production = manifest.entries.find((e) => e.path === productionPath);
	if (!production || production.baseline_state === "unchanged" || production.baseline_state === "deleted") return false;
	return entry.content_digest === production.content_digest;
}
