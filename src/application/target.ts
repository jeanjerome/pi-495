/**
 * Target adapter registry (CMP-TGT, ADR-012): detects the stack without executing anything and
 * hands the question to the adapter that knows it. A stack nobody adapts is not a stack without
 * defects — it is named as a missing capability, which is what G2 refuses on.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CandidateManifest } from "../contracts/v1/candidate.ts";
import type { RequirementRef } from "../contracts/v1/evidence.ts";
import { detectMavenStack } from "./stacks/maven.ts";
import { detectNodeStack } from "./stacks/node.ts";
import type { StackDetection } from "./stacks/stack.ts";

export type { StackDetection } from "./stacks/stack.ts";

export function detectStack(
	projectPath: string,
	requirementRefs: RequirementRef[],
	nodeBinary = process.execPath,
): StackDetection {
	if (existsSync(join(projectPath, "package.json"))) return detectNodeStack(projectPath, requirementRefs, nodeBinary);
	if (existsSync(join(projectPath, "pom.xml"))) return detectMavenStack(projectPath, requirementRefs, nodeBinary);
	return {
		stack: "unknown",
		facts: {},
		controls: [],
		positive_witness: {},
		witness_tests: 0,
		negative_witness: {},
		own_negative_witness: {},
		preparation_paths: [],
		capability_missing: ["no qualified target adapter for this project (package.json or pom.xml expected)"],
	};
}

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
