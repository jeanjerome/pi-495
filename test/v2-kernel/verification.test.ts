/**
 * Evidence is about the frozen candidate, and about nothing else (VER-03).
 *
 * A control that writes to the tree while it is being measured leaves a candidate that is no longer
 * the one the protocol froze, so its facts prove nothing about it. What a control declares writable
 * is not such a write — a build leaves its outputs there and the requirement provides for exactly
 * that — so both sides are read with those paths left out, and only a difference elsewhere counts.
 */
import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import { DEFAULT_WORKSPACE_POLICY, GitWorkspace } from "../../src/adapters/workspace/git-workspace.ts";
import { EXECUTOR_ACTOR } from "../../src/application/actors.ts";
import { type QualifyInput, VerificationCoordinator } from "../../src/application/verification.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { CandidateManifest, ManifestEntry } from "../../src/contracts/v1/candidate.ts";
import type { EvidenceCandidate } from "../../src/contracts/v1/evidence.ts";
import type {
	AdoptedComplement,
	ControlDefinition,
	Protocol,
	RecommendedComplement,
} from "../../src/contracts/v1/protocol.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { protectedPathsChanged } from "../../src/domain/gates/g4.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";
import type { ControlExecutionPort, ControlInvocation } from "../../src/ports/execution.ts";
import { fixtureTs, initRepo, tempDir, removedAfterEach } from "../helpers/fixtures.ts";
import { controlOf } from "../helpers/execution-fixture.ts";

const ENVIRONMENT = { environment_id: "env_test", digest: digestValue({ test: true }), profile_id: "unconfined" };
const AT = "2026-09-20T12:00:00.000Z";

function control(over: Partial<ControlDefinition> = {}): ControlDefinition {
	return controlOf({
		title: "a control the double stands in for",
		command: ["true"],
		env_allowlist: [],
		timeout_ms: 1000,
		requirement_refs: [{ requirement_id: "VER-03", revision: 1 }],
		...over,
	});
}

/** A protocol reduced to what `run` reads: its controls, and how it compares them to the reference. */
function protocolOf(controls: ControlDefinition[]): Protocol {
	return {
		protocol_id: "prt_1",
		change_id: "chg_1",
		controls,
		qualifications: {},
		capability_diagnosis: {
			stack: "node",
			level: "discriminating",
			test_files: 1,
			discovered: 1,
			executed: 1,
			undiscriminated_requirements: [],
			unobserved_requirements: [],
			notes: [],
		},
		obligations: [],
		required_reviews: [],
		arbitration: "human_decision",
		// The reference pass is VER-08's business, measured elsewhere; here the question is what the
		// candidate tree became while the control ran.
		baseline: { compare_to_reference: false, tolerance: "block_any", instability: "none", max_confirmations: 0 },
		environment_digest: ENVIRONMENT.digest,
	};
}

function evidenceOf(invocation: ControlInvocation): EvidenceCandidate {
	return {
		control_id: invocation.control.control_id,
		control_version: invocation.control.version,
		requirement_refs: invocation.requirement_refs,
		subject: invocation.subject,
		protocol_revision: invocation.protocol,
		environment: invocation.environment,
		inputs_digest: digestValue({ control: invocation.control.control_id }),
		started_at: AT,
		ended_at: AT,
		verdict: "PASS",
		facts: {},
		findings: [],
		artifacts: [],
		limits: { truncated: false, bytes_read: 0, bytes_total: null, exclusions: [], unstable: false, notes: [] },
		baseline: null,
		producer: EXECUTOR_ACTOR,
	};
}

/** A control that writes one file into the workspace it is measuring, then reports a green pass. */
function writingControl(relativePath: string | null): ControlExecutionPort {
	return {
		async runControl(invocation: ControlInvocation) {
			if (relativePath !== null) {
				const target = join(invocation.workspace_path, relativePath);
				mkdirSync(dirname(target), { recursive: true });
				writeFileSync(target, "written while the control ran\n");
			}
			return { evidence: evidenceOf(invocation), observation: null };
		},
	};
}

let root: string;
let ledger: SqliteLedger;
beforeEach(() => {
	root = tempDir("495-verif-", cleanups);
});
afterEach(() => {
	ledger?.close();
});
/** Registered after the teardown above, so the directories are removed once it has run. */
const cleanups = removedAfterEach();

/** A coordinator over a fresh ledger and object store, the ports its callers do not replace being the real ones. */
function coordinatorOver(controls: ControlExecutionPort, workspace: GitWorkspace): VerificationCoordinator {
	ledger = new SqliteLedger(join(root, "state.sqlite"));
	let next = 0;
	return new VerificationCoordinator({
		controls,
		workspace,
		workspacePolicy: DEFAULT_WORKSPACE_POLICY,
		objects: new CasObjectStore(join(root, "objects")),
		ledger,
		environment: ENVIRONMENT,
		policy: DEFAULT_POLICY,
		now: () => AT,
		id: (prefix) => `${prefix}_${++next}`,
		readArtifact: async () => {
			throw new DomainError("EVIDENCE_MISSING", "no file index for this candidate");
		},
		storedFiles: async () => async () => null,
		progress: () => {},
	});
}

/** Freezes a candidate on a copy of the reference, and runs one control against it. */
async function runOneControl(
	definition: ControlDefinition,
	controls: ControlExecutionPort,
	/** Files the candidate already carries when it is frozen, written on top of the reference. */
	seed: Record<string, string> = {},
	/** What the frozen protocol carries on top of its controls. */
	protocolOver: Partial<Protocol> = {},
): Promise<{ candidate_moved: boolean; facts: number }> {
	const project = join(root, "project");
	fixtureTs(project);
	initRepo(project);
	const workspace = new GitWorkspace(join(root, "workspaces"));
	const reference = await workspace.captureReference(project, DEFAULT_WORKSPACE_POLICY);
	const handle = await workspace.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
	writeFileSync(join(handle.path, "src/greet.js"), "export function greet(name) {\n  return `Hi, ${name}`;\n}\n");
	for (const [relative, content] of Object.entries(seed)) {
		const target = join(handle.path, relative);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, content);
	}
	const manifest = await workspace.snapshotCandidate(handle, reference, DEFAULT_WORKSPACE_POLICY);

	const protocol = { ...protocolOf([definition]), ...protocolOver };
	const coordinator = coordinatorOver(controls, workspace);
	const outcome = await coordinator.run({
		change_id: "chg_1",
		protocol,
		protocol_ref: { protocol_id: "prt_1", revision: 1, content_digest: digestValue(protocol) },
		candidate: {
			candidate_id: manifest.candidate_id,
			manifest_digest: manifest.manifest_digest,
			base_digest: reference.tree_digest,
			workspace_id: handle.workspace_id,
		},
		manifest,
		reference,
		workspace_path: handle.path,
	});
	return { candidate_moved: outcome.candidate_moved, facts: outcome.facts.length };
}

describe("the frozen candidate, while the controls measure it (VER-03)", () => {
	it("a control writing inside the paths it declares writable leaves the candidate frozen", async () => {
		const outcome = await runOneControl(control({ writable_paths: ["out"] }), writingControl("out/report.xml"));
		assert.equal(
			outcome.candidate_moved,
			false,
			"a build output written where the control declared it writes is not a mutation of the candidate",
		);
		assert.equal(outcome.facts, 1, "the evidence of a control that stayed in its writable paths is kept");
	});

	it("a write anywhere else moves the candidate, and the run says so", async () => {
		const outcome = await runOneControl(control({ writable_paths: ["out"] }), writingControl("src/formatted.js"));
		assert.equal(
			outcome.candidate_moved,
			true,
			"a source file written during the measurement leaves a tree the protocol never froze",
		);
	});

	it("a candidate frozen with an output already under a writable path is not read as moved", async () => {
		// Both sides are read with the writable paths left out: the frozen manifest carries the file and
		// the pass that follows does not, and a comparison of the two raw trees would call that a
		// mutation nobody made.
		const outcome = await runOneControl(control({ writable_paths: ["out"] }), writingControl(null), {
			"out/report.xml": "<report/>\n",
		});
		assert.equal(outcome.candidate_moved, false, "a file the control declared writable is not compared at all");
	});

	it("the same write is a mutation for a control that declared no writable path", async () => {
		const outcome = await runOneControl(control({ writable_paths: [] }), writingControl("out/report.xml"));
		assert.equal(
			outcome.candidate_moved,
			true,
			"what makes an output tolerable is the control's declaration, not the name of the directory",
		);
	});
});

describe("the protocol frozen from a detection", () => {
	const recommendation: RecommendedComplement = {
		test_type: "coverage",
		tool: "--experimental-test-coverage",
		version: "24.21.0",
		established_on: "2026-09-30",
		source: "https://nodejs.org/docs/latest-v24.x/api/test.html#collecting-code-coverage",
		change: "in package.json, add --experimental-test-coverage to scripts.test",
	};
	const freezeWith = (recommendations: RecommendedComplement[]): Protocol => {
		const { capability_diagnosis: diagnosis } = protocolOf([]);
		return coordinatorOver(writingControl(null), new GitWorkspace(join(root, "workspaces"))).freeze({
			change_id: "chg_1",
			ordered: [control()],
			lint_control_ids: [],
			qualifications: {},
			diagnosis,
			requirements: { change_id: "chg_1", requirements: [], answers: [], assumptions: [], contract_families: {} },
			requirements_revision: 1,
			prepared: null,
			assigned_to_human: [],
			recommendations,
			complements: [],
			installed: [],
		});
	};

	it("given a target with a recommendation, then the frozen protocol carries it in its diagnosis", () => {
		assert.deepEqual(freezeWith([recommendation]).capability_diagnosis.recommendations, [recommendation]);
	});

	it("given a target without a recommendation, then the diagnosis of the frozen protocol has no list of them", () => {
		assert.equal("recommendations" in freezeWith([]).capability_diagnosis, false);
	});
});

describe("the paths the frozen protocol protects, whatever the stack of the target", () => {
	const entry = (path: string, digest: string, baseline_state: ManifestEntry["baseline_state"]): ManifestEntry => ({
		path,
		kind: "file",
		content_digest: digest,
		size: 1,
		mode: "000644",
		symlink_target: null,
		baseline_state,
		origin: "agent",
		limits: null,
	});
	const manifestOf = (...entries: ManifestEntry[]): CandidateManifest => ({
		candidate_id: "cnd_1",
		workspace_id: "wsp_1",
		base_reference_id: "ref_1",
		base_digest: digestValue("base"),
		selected_paths: [],
		exclusions: [],
		entries,
		metadata_policy: "content_and_mode",
		manifest_digest: digestValue("manifest"),
		frozen_at: AT,
		limits: { truncated: false, bytes_read: 0, bytes_total: null, exclusions: [], unstable: false, notes: [] },
	});

	it("given the controls of a Maven target and no adopted complement, then the frozen protocol protects node_modules/, a candidate adding node_modules/x/index.js and src/main/java/Greet.java is refused naming node_modules/x/index.js and not src/main/java/Greet.java, and one keeping a node_modules/x/index.js written by an adopted complement is allowed", () => {
		// The controls of a Maven target declare the preparation files and the pom.xml files, never node_modules/.
		const { capability_diagnosis: diagnosis } = protocolOf([]);
		const protocol = coordinatorOver(writingControl(null), new GitWorkspace(join(root, "workspaces"))).freeze({
			change_id: "chg_1",
			ordered: [control({ control_id: "maven-test", protected_paths: ["pom.xml", "*/pom.xml"] })],
			lint_control_ids: [],
			qualifications: {},
			diagnosis,
			requirements: { change_id: "chg_1", requirements: [], answers: [], assumptions: [], contract_families: {} },
			requirements_revision: 1,
			prepared: null,
			assigned_to_human: [],
			recommendations: [],
			complements: [],
			installed: [],
		});
		const protectedPaths = protocol.controls.flatMap((c) => c.protected_paths);
		assert.ok(protectedPaths.includes("node_modules/"), "the frozen protocol protects node_modules/");
		const dependency = digestValue("the bytes of node_modules/x/index.js");
		const refused = protectedPathsChanged(
			manifestOf(
				entry("node_modules/x/index.js", dependency, "added"),
				entry("src/main/java/Greet.java", digestValue("class Greet {}"), "added"),
			),
			protectedPaths,
			[],
		);
		assert.deepEqual(refused.altered, ["node_modules/x/index.js"]);
		const kept = protectedPathsChanged(
			manifestOf(entry("node_modules/x/index.js", dependency, "added")),
			protectedPaths,
			[],
			() => false,
			[{ path: "node_modules/x/index.js", digest: dependency }],
		);
		assert.deepEqual(kept.altered, []);
		assert.deepEqual(kept.allowed, ["node_modules/x/index.js"]);
	});
});

/** The package.json an adopted complement writes: the test script asks for coverage. */
const COMPLEMENT_TEXT = '{"name":"f-ts","scripts":{"test":"node --test --experimental-test-coverage"}}\n';

describe("the workspaces of a qualification, once a complement is adopted", () => {
	/** What each control saw of package.json in the workspace it ran in, by workspace. */
	function packageJsonSeen(seen: Map<string, string | null>): ControlExecutionPort {
		return {
			async runControl(invocation: ControlInvocation) {
				const file = join(invocation.workspace_path, "package.json");
				seen.set(invocation.workspace_path, existsSync(file) ? readFileSync(file, "utf8") : null);
				return { evidence: evidenceOf(invocation), observation: null };
			},
		};
	}

	/** Qualifies two controls, one on the shared negative copy and one on its own, over the adopted complement. */
	async function qualifyOver(
		complement: AdoptedComplement,
		seen: Map<string, string | null>,
		witnesses: Partial<Pick<QualifyInput["witnesses"], "positive" | "negative" | "own_negative">> = {},
	): Promise<void> {
		const project = join(root, "project");
		fixtureTs(project);
		initRepo(project);
		const workspace = new GitWorkspace(join(root, "workspaces"));
		const reference = await workspace.captureReference(project, DEFAULT_WORKSPACE_POLICY);
		const positive = await workspace.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
		// The workspace the stack was detected on is the positive witness: the complement is written there.
		writeFileSync(join(positive.path, "package.json"), COMPLEMENT_TEXT);
		await coordinatorOver(packageJsonSeen(seen), workspace).qualify({
			change_id: "chg_1",
			reference,
			positive,
			ordered: [control({ control_id: "shared" }), control({ control_id: "own" })],
			witnesses: {
				positive: { "test/witness.test.js": "// passes\n" },
				negative: { "test/failing.test.js": "// fails\n" },
				own_negative: { own: { "src/uncovered.js": "// never exercised\n" } },
				tests: 1,
				...witnesses,
			},
			requirement_refs: [],
			prior_protocol_refs: [],
			complements: [complement],
		});
	}

	async function adopted(): Promise<AdoptedComplement> {
		const stored = await new CasObjectStore(join(root, "objects")).putText(COMPLEMENT_TEXT);
		return { path: "package.json", digest: stored.digest, test_type: "coverage", tool: "--experimental-test-coverage" };
	}

	it("given an adopted complement, then the positive, negative and control-specific negative workspaces of the qualification each carry it before the witness is written", async () => {
		const seen = new Map<string, string | null>();
		await qualifyOver(await adopted(), seen);
		assert.equal(seen.size, 3, "the control ran in the positive, the negative and the control-specific negative copy");
		for (const [path, text] of seen)
			assert.equal(text, COMPLEMENT_TEXT, `the copy ${path} carries the package.json of the complement`);
	});

	it("given an adopted complement and witnesses that write package.json themselves, then the witness is written over the complement in each of the three workspaces, not the complement over the witness", async () => {
		const seen = new Map<string, string | null>();
		const witnessText = '{"name":"written-by-the-witness"}\n';
		await qualifyOver(await adopted(), seen, {
			positive: { "package.json": witnessText },
			negative: { "package.json": witnessText },
			own_negative: { own: { "package.json": witnessText } },
		});
		assert.equal(seen.size, 3, "the control ran in the positive, the negative and the control-specific negative copy");
		for (const [path, text] of seen)
			assert.equal(text, witnessText, `the witness was written over the complement in the copy ${path}`);
	});

	it("given a complement whose stored bytes no longer match its digest, then the qualification writes nothing of it, stops and deletes the copy it could not complete", async () => {
		const complement = await adopted();
		const hex = complement.digest.slice("sha256:".length);
		writeFileSync(join(root, "objects", "sha256", hex.slice(0, 2), hex.slice(2)), '{"name":"tampered"}\n');
		const seen = new Map<string, string | null>();
		await assert.rejects(qualifyOver(complement, seen), /package\.json/);
		assert.deepEqual(
			[...seen.values()].filter((text) => text === '{"name":"tampered"}\n'),
			[],
		);
		assert.equal(
			readdirSync(join(root, "workspaces")).length,
			1,
			"only the positive copy the caller opened remains: the negative copy that could not be completed is deleted",
		);
	});
});

describe("the workspace of a reference pass, once a complement is adopted", () => {
	it("given a frozen protocol carrying an adopted complement, then the workspace of a reference pass carries it", async () => {
		const stored = await new CasObjectStore(join(root, "objects")).putText(COMPLEMENT_TEXT);
		const seenOnReference: (string | null)[] = [];
		const recording: ControlExecutionPort = {
			async runControl(invocation: ControlInvocation) {
				if (invocation.subject.kind === "reference") {
					const file = join(invocation.workspace_path, "package.json");
					seenOnReference.push(existsSync(file) ? readFileSync(file, "utf8") : null);
				}
				return { evidence: evidenceOf(invocation), observation: null };
			},
		};
		const { baseline } = protocolOf([]);
		await runOneControl(
			control(),
			recording,
			{},
			{
				baseline: { ...baseline, compare_to_reference: true },
				complements: [
					{ path: "package.json", digest: stored.digest, test_type: "coverage", tool: "--experimental-test-coverage" },
				],
			},
		);
		assert.deepEqual(seenOnReference, [COMPLEMENT_TEXT], "the control ran once on the reference, over the complement");
	});
});
