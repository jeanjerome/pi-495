import { Type, type Static } from "typebox";
import { Closed, Digest, Identifier, NonNegativeInt, contractId } from "./common.ts";
import { Limits } from "./evidence.ts";

export const ENTRY_KINDS = ["file", "symlink", "directory", "submodule", "special"] as const;
export const BASELINE_ENTRY_STATES = [
	"unchanged",
	"added",
	"modified",
	"deleted",
	"mode_changed",
	"type_changed",
] as const;
export const ORIGINS = ["agent", "user", "mixed", "unknown"] as const;

export const ManifestEntry = Type.Object(
	{
		path: Type.String({ minLength: 1 }),
		kind: Closed(ENTRY_KINDS),
		content_digest: Type.Union([Digest, Type.Null()]),
		size: NonNegativeInt,
		mode: Type.String({ pattern: "^[0-7]{6}$" }),
		symlink_target: Type.Union([Type.String(), Type.Null()]),
		baseline_state: Closed(BASELINE_ENTRY_STATES),
		origin: Closed(ORIGINS),
		limits: Type.Union([Limits, Type.Null()]),
	},
	{ additionalProperties: false },
);
export type ManifestEntry = Static<typeof ManifestEntry>;

export const REFERENCE_KINDS = [
	"git_clean_head",
	"git_dirty_head",
	"git_no_head",
	"empty_directory",
	"non_git_directory",
] as const;

export const ReferenceSnapshot = Type.Object(
	{
		reference_id: Identifier,
		kind: Closed(REFERENCE_KINDS),
		project_path: Type.String(),
		head_commit: Type.Union([Type.String({ pattern: "^[0-9a-f]{40}$" }), Type.Null()]),
		branch: Type.Union([Type.String(), Type.Null()]),
		tree_digest: Digest,
		entries: Type.Array(ManifestEntry),
		exclusions: Type.Array(Type.String()),
		captured_at: Type.String({ format: "date-time" }),
		limits: Limits,
	},
	{ $id: contractId("reference-snapshot"), additionalProperties: false },
);
export type ReferenceSnapshot = Static<typeof ReferenceSnapshot>;

export const CandidateManifest = Type.Object(
	{
		candidate_id: Identifier,
		workspace_id: Identifier,
		base_reference_id: Identifier,
		base_digest: Digest,
		selected_paths: Type.Array(Type.String()),
		exclusions: Type.Array(Type.String()),
		entries: Type.Array(ManifestEntry),
		metadata_policy: Closed(["content_and_mode", "content_only"] as const),
		manifest_digest: Digest,
		frozen_at: Type.String({ format: "date-time" }),
		limits: Limits,
	},
	{ $id: contractId("candidate-manifest"), additionalProperties: false },
);
export type CandidateManifest = Static<typeof CandidateManifest>;
