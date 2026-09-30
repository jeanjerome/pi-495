/**
 * Target adapter registry (CMP-TGT, ADR-012): detects the stack without executing anything and
 * hands the question to the adapter that knows it. A stack nobody adapts is not a stack without
 * defects — it is named as a missing capability, which is what G2 refuses on.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CandidateManifest } from "../contracts/v1/candidate.ts";
import type { RequirementRef } from "../contracts/v1/evidence.ts";
import { MAVEN_ADAPTER } from "./stacks/maven.ts";
import { NODE_ADAPTER } from "./stacks/node.ts";
import type { StackAdapter, StackDetection } from "./stacks/stack.ts";

export type { StackDetection } from "./stacks/stack.ts";

/** The adapters of 495, in the order they claim a project: a Maven project that also carries a `package.json` is judged as Maven. */
const STACK_ADAPTERS: readonly StackAdapter[] = [MAVEN_ADAPTER, NODE_ADAPTER];

export function detectStack(
	projectPath: string,
	requirementRefs: RequirementRef[],
	nodeBinary = process.execPath,
	adapters: readonly StackAdapter[] = STACK_ADAPTERS,
): StackDetection {
	const adapter = adapters.find((a) => a.signal_files.some((file) => existsSync(join(projectPath, file))));
	if (adapter) return adapter.detect(projectPath, requirementRefs, nodeBinary);
	const expected = adapters.flatMap((a) => a.signal_files).join(" or ");
	return {
		stack: "unknown",
		facts: {},
		controls: [],
		positive_witness: {},
		witness_tests: 0,
		negative_witness: {},
		own_negative_witness: {},
		preparation_paths: [],
		capability_missing: [`no qualified target adapter for this project (${expected} expected)`],
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
