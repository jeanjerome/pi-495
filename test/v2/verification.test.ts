/**
 * Evidence is about the frozen candidate, and about nothing else (VER-03).
 *
 * A control that writes to the tree while it is being measured leaves a candidate that is no longer
 * the one the protocol froze, so its facts prove nothing about it. What a control declares writable
 * is not such a write — a build leaves its outputs there and the requirement provides for exactly
 * that — so both sides are read with those paths left out, and only a difference elsewhere counts.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import { DEFAULT_WORKSPACE_POLICY, GitWorkspace } from "../../src/adapters/workspace/git-workspace.ts";
import { EXECUTOR_ACTOR } from "../../src/application/actors.ts";
import { VerificationCoordinator } from "../../src/application/verification.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { EvidenceCandidate } from "../../src/contracts/v1/evidence.ts";
import type { ControlDefinition, Protocol } from "../../src/contracts/v1/protocol.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";
import type { ControlExecutionPort, ControlInvocation } from "../../src/ports/execution.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";

const ENVIRONMENT = { environment_id: "env_test", digest: digestValue({ test: true }), profile_id: "unconfined" };
const AT = "2026-09-20T12:00:00.000Z";

function control(over: Partial<ControlDefinition> = {}): ControlDefinition {
	return {
		control_id: "c1",
		version: "1",
		title: "a control the double stands in for",
		command: ["true"],
		cwd: ".",
		env_allowlist: [],
		env: {},
		timeout_ms: 1000,
		parser: "exit-code",
		report_path: null,
		structure_rules: [],
		provides: [],
		requires: [],
		scope_argument: null,
		network: "denied",
		writable_paths: [],
		requirement_refs: [{ requirement_id: "VER-03", revision: 1 }],
		protected: true,
		protected_paths: [],
		...over,
	};
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
	root = tempDir("495-verif-");
});
afterEach(() => {
	ledger?.close();
	rmSync(root, { recursive: true, force: true });
});

/** Freezes a candidate on a copy of the reference, and runs one control against it. */
async function runOneControl(
	definition: ControlDefinition,
	controls: ControlExecutionPort,
	/** Files the candidate already carries when it is frozen, written on top of the reference. */
	seed: Record<string, string> = {},
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

	ledger = new SqliteLedger(join(root, "state.sqlite"));
	const protocol = protocolOf([definition]);
	let next = 0;
	const coordinator = new VerificationCoordinator({
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
			throw new Error("no file index for this candidate");
		},
		progress: () => {},
	});
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
