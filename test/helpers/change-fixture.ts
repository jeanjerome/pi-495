import { strict as assert } from "node:assert";
import type { ActorRef, ArtifactRef, CandidateRef } from "../../src/contracts/v1/common.ts";
import type { Design, Mandate, Protocol, RequirementsDocument } from "../../src/contracts/v1/protocol.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import { DEFAULT_POLICY, type ActivePolicy } from "../../src/domain/policy.ts";
import { decide, type Decision } from "../../src/domain/change/decide.ts";
import { apply } from "../../src/domain/change/apply.ts";
import type { ChangeCommand, EvidenceFact } from "../../src/domain/change/commands.ts";
import type { ChangeEvent } from "../../src/domain/change/events.ts";
import type { ChangeState } from "../../src/domain/change/state.ts";
import type { DomainError } from "../../src/domain/errors.ts";

export const KERNEL: ActorRef = { actor_id: "kernel", actor_type: "kernel", role: "kernel", origin: "kernel", authentication_level: "host_qualified" };
export const HUMAN: ActorRef = { actor_id: "alice", actor_type: "human", role: "change_owner", origin: "tui_session", authentication_level: "session" };
export const AGENT: ActorRef = { actor_id: "producer-1", actor_type: "agent", role: "producer_agent", origin: "model_output", authentication_level: "none" };
export const EXECUTOR: ActorRef = { actor_id: "executor", actor_type: "executor", role: "executor", origin: "executor", authentication_level: "host_qualified" };

export const ENV = digestValue({ os: "darwin", arch: "arm64", pi: "0.85.1" });

let clock = Date.parse("2026-09-16T10:00:00.000Z");
export function tick(): string {
	clock += 1000;
	return new Date(clock).toISOString();
}

export function ref(id: string, content: unknown, revision = 1): ArtifactRef {
	return { artifact_id: id, revision, content_digest: digestValue(content), schema_version: 1 };
}

export function mandate(over: Partial<Mandate> = {}): Mandate {
	return { change_id: "chg_1", objective: "Add a greeting function", scope: ["src/"], out_of_scope: ["docs/"], assumptions: [], open_questions: [], allowed_paths: ["src/", "test/"], integration: "disabled", language: "fr", ...over };
}

export function requirements(over: Partial<RequirementsDocument> = {}): RequirementsDocument {
	return {
		change_id: "chg_1",
		requirements: [
			{ requirement_id: "R1", statement: "greet returns Hello, <name>", category: "functional", mandatory: true, criterion: "unit test greet('x') === 'Hello, x'", source: "request", contract_family: "api", satisfied_by_reference: false },
			{ requirement_id: "R2", statement: "no lint regression", category: "quality", mandatory: true, criterion: "lint exit code 0", source: "policy", contract_family: null, satisfied_by_reference: true },
		],
		assumptions: [],
		contract_families: { api: "covered", data: "not_applicable" },
		...over,
	};
}

export function protocol(over: Partial<Protocol> = {}): Protocol {
	return {
		protocol_id: "prt_1",
		change_id: "chg_1",
		controls: [
			{ control_id: "unit", version: "1", title: "unit tests", command: ["node", "--test"], cwd: ".", env_allowlist: ["PATH"], env: {}, timeout_ms: 60000, parser: "node-test", report_path: null, structure_rules: [], scope_argument: null, network: "denied", writable_paths: [], requirement_refs: [{ requirement_id: "R1", revision: 1 }], protected: true, protected_paths: ["test/"] },
			{ control_id: "lint", version: "1", title: "lint", command: ["npm", "run", "lint"], cwd: ".", env_allowlist: ["PATH"], env: {}, timeout_ms: 60000, parser: "exit-code", report_path: null, structure_rules: [], scope_argument: null, network: "denied", writable_paths: [], requirement_refs: [{ requirement_id: "R2", revision: 1 }], protected: true, protected_paths: ["eslint.config.js"] },
		],
		qualifications: {
			unit: { positive: "PASS", negative: "FAIL", incident: "INDETERMINATE", qualified: true, environment_digest: ENV, notes: [] },
			lint: { positive: "PASS", negative: "FAIL", incident: "INDETERMINATE", qualified: true, environment_digest: ENV, notes: [] },
		},
		capability_diagnosis: { stack: "node", level: "discriminating", test_files: 1, discovered: 1, executed: 1, undiscriminated_requirements: [], unobserved_requirements: [], notes: [] },
		baseline: { compare_to_reference: true, tolerance: "no_aggravation", instability: "confirm_then_indeterminate", max_confirmations: 1 },
		obligations: [
			{ requirement: { requirement_id: "R1", revision: 1 }, mandatory: true, control_ids: ["unit"], combination: "all_pass", human_interaction: null, not_applicable_reason: null },
			{ requirement: { requirement_id: "R2", revision: 1 }, mandatory: true, control_ids: ["lint"], combination: "all_pass", human_interaction: null, not_applicable_reason: null },
		],
		required_reviews: [],
		arbitration: "human_decision",
		environment_digest: ENV,
		...over,
	};
}

export function design(over: Partial<Design> = {}): Design {
	return { change_id: "chg_1", summary: "add greet in src/greet.ts", components: ["greet"], interfaces: ["greet(name)"], alternatives: [], risks: [], requirement_ids: ["R1", "R2"], compatible_with_mandate: true, executable: true, ...over };
}

export function candidate(seed: string, base = "sha256:" + "0".repeat(64)): CandidateRef {
	return { candidate_id: `cand_${seed}`, manifest_digest: digestValue({ seed }), base_digest: base, workspace_id: "ws_1" };
}

export function evidence(over: Partial<EvidenceFact> & { control_id: string; subject_digest: string }): EvidenceFact {
	return { evidence_id: `evd_${over.control_id}_${Math.random().toString(36).slice(2, 8)}`, control_version: "1", requirement_ids: over.control_id === "unit" ? ["R1"] : ["R2"], protocol_revision: 1, environment_digest: ENV, verdict: "PASS", findings_blocking: 0, ...over };
}

export class Runner {
	state: ChangeState | null = null;
	events: ChangeEvent[] = [];
	policy: ActivePolicy;
	constructor(policy: Partial<Omit<ActivePolicy, "budgets" | "adoption">> & { budgets?: Partial<ActivePolicy["budgets"]>; adoption?: Partial<ActivePolicy["adoption"]> } = {}) {
		this.policy = { ...DEFAULT_POLICY, ...policy, budgets: { ...DEFAULT_POLICY.budgets, ...(policy.budgets ?? {}) }, adoption: { ...DEFAULT_POLICY.adoption, ...(policy.adoption ?? {}) } };
	}
	try(command: ChangeCommand): Decision {
		const d = decide(this.state, command, this.policy);
		if (d.ok) for (const e of d.events) { this.state = apply(this.state, e); this.events.push(e); }
		return d;
	}
	run(command: ChangeCommand): ChangeState {
		const d = this.try(command);
		if (!d.ok) throw new Error(`command ${command.type} rejected: ${d.error.code} ${d.error.message}`);
		return this.state!;
	}
	expectError(command: ChangeCommand, code: DomainError["code"]): DomainError {
		const d = this.try(command);
		assert.equal(d.ok, false, `expected ${code} for ${command.type}`);
		if (d.ok) throw new Error("unreachable");
		assert.equal(d.error.code, code, `expected ${code} got ${d.error.code}: ${d.error.message}`);
		return d.error;
	}
	get s(): ChangeState {
		return this.state!;
	}

	create(over: Partial<Extract<ChangeCommand, { type: "change.create" }>> = {}): this {
		this.run({ type: "change.create", at: tick(), actor: HUMAN, change_id: "chg_1", program_id: "prg_1", increment_id: "inc_1", request: ref("req_1", { text: "Add greet" }), reference: { reference_id: "ref_1", kind: "git_clean_head", digest: digestValue({ tree: "base" }) }, environment_digest: ENV, ...over });
		return this;
	}
	g0(m: Mandate = mandate()): this {
		this.run({ type: "gate.evaluate", gate: "G0", at: tick(), actor: KERNEL, mandate_ref: ref("mnd_1", m), mandate: m });
		return this;
	}
	g1(r: RequirementsDocument = requirements()): this {
		this.run({ type: "gate.evaluate", gate: "G1", at: tick(), actor: KERNEL, requirements_ref: ref("rqs_1", r), requirements: r, report: { valid: true, issues: [] } });
		return this;
	}
	g2(p: Protocol = protocol()): this {
		this.run({ type: "gate.evaluate", gate: "G2", at: tick(), actor: KERNEL, protocol_ref: ref("prt_1", p), protocol: p });
		return this;
	}
	g3(d: Design = design()): this {
		this.run({ type: "gate.evaluate", gate: "G3", at: tick(), actor: KERNEL, design_ref: ref("dsg_1", d), design: d });
		return this;
	}
	toImplementing(): this {
		return this.create().g0().g1().g2().g3();
	}
	implement(interventionId = "int_1", attemptId = "att_1"): this {
		this.run({ type: "intervention.start", at: tick(), actor: KERNEL, intervention_id: interventionId, role: "implement", attempt_id: attemptId, model: { provider_id: "omlx", model_id: "qwen3.8-27b-oq8e", thinking_level: "medium" }, profile_id: "implement", profile_qualified: true });
		this.run({ type: "intervention.finish", at: tick(), actor: KERNEL, intervention_id: interventionId, result: "completed", counters: { tool_calls: 3, duration_ms: 1000, tokens_known: 100, delegations: 0 }, detail: null });
		return this;
	}
	freeze(c: CandidateRef, over: Partial<Extract<ChangeCommand, { type: "candidate.freeze" }>["facts"]> = {}): this {
		const attempt = this.s.attempts[this.s.attempts.length - 1]!;
		this.run({ type: "candidate.freeze", at: tick(), actor: KERNEL, attempt_id: attempt.attempt_id, facts: { candidate: c, entry_count: 3, changed_paths: ["src/greet.ts"], out_of_scope_paths: [], altered_protected_paths: [], complete: true, limits_notes: [], allowed_protected_paths: [], ...over } });
		return this;
	}
	verify(facts: EvidenceFact[]): this {
		this.run({ type: "verification.start", at: tick(), actor: KERNEL, operation_id: "op_v1", idempotency_key: "k_v1" });
		this.run({ type: "verification.record", at: tick(), actor: EXECUTOR, evidence: facts });
		this.run({ type: "verification.complete", at: tick(), actor: KERNEL, operation_id: "op_v1" });
		return this;
	}
	g5(): this {
		this.run({ type: "gate.evaluate", gate: "G5", at: tick(), actor: KERNEL, decision_id: null });
		return this;
	}
	/** Full nominal path up to G5 with the given candidate and verdicts. */
	toDeciding(c: CandidateRef, verdicts: { unit?: EvidenceFact["verdict"]; lint?: EvidenceFact["verdict"] } = {}): this {
		this.toImplementing().implement().freeze(c);
		const facts: EvidenceFact[] = [];
		if (verdicts.unit !== undefined || Object.keys(verdicts).length === 0) facts.push(evidence({ control_id: "unit", subject_digest: c.manifest_digest, verdict: verdicts.unit ?? "PASS" }));
		if (verdicts.lint !== undefined || Object.keys(verdicts).length === 0) facts.push(evidence({ control_id: "lint", subject_digest: c.manifest_digest, verdict: verdicts.lint ?? "PASS" }));
		return this.verify(facts);
	}
}
