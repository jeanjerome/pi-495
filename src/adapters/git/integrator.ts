/**
 * Git integrator (CMP-GIT, ADR-015, §9.4): applies the exact accepted candidate to the project
 * branch as one local commit. Never a model tool; never pushes. Two-phase: prepared -> started ->
 * confirmed | failed | uncertain, with the receipt recorded before G6.
 */
import { cp, mkdir, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { digestValue } from "../../contracts/digest.ts";
import type { CandidateManifest, ReferenceSnapshot } from "../../contracts/v1/candidate.ts";
import { DomainError } from "../../domain/errors.ts";
import type { ChangeState } from "../../domain/change/state.ts";
import type { ObjectStorePort } from "../../ports/object-store.ts";
import { git, inspectGit } from "../workspace/git-workspace.ts";
import { walkTree, diffEntries, includedEntries } from "../workspace/walk.ts";
import { KERNEL_ACTOR } from "../../application/actors.ts";
import type { Harness } from "../../application/harness.ts";

type Unit = { state: ChangeState; revision: number };

export interface IntegrationReceipt {
	destination: string;
	before: string;
	after: string;
	candidate_digest: string;
	applied_digest: string;
	commit: string;
	files: string[];
	at: string;
}

export class GitIntegrator {
	private readonly harness: Harness;
	private readonly objects: ObjectStorePort;
	constructor(harness: Harness, objects: ObjectStorePort) {
		this.harness = harness;
		this.objects = objects;
	}

	/** Bound to the controller: one integration step per call. */
	step = async (unit: Unit, cor: string): Promise<Unit> => {
		const h = this.harness;
		const state = unit.state;
		const reference = (await h.artifacts.latest<ReferenceSnapshot>(state, "reference"))!.content;
		const manifest = await h.artifacts.read<CandidateManifest>({ artifact_id: state.candidate!.candidate_id, revision: 1 });
		const project = reference.project_path;
		const referenceEntries = includedEntries(reference.entries, reference.exclusions);
		const info = await inspectGit(project);
		const destination = info.branch ?? "HEAD";
		const before = info.head ?? "0".repeat(40);
		// destination advanced?
		if (state.integration && state.integration.destination_before !== before) {
			const current = await walkTree(project, { exclusions: reference.exclusions, max_file_bytes: 8 * 1024 * 1024, max_entries: 50_000 });
			const changed = digestValue(current.entries.map((e) => [e.path, e.content_digest])) !== digestValue(referenceEntries.map((e) => [e.path, e.content_digest]));
			return h.commit(unit, { type: "integration.destination_advanced", at: h.now(), actor: KERNEL_ACTOR, destination_before: before, combined_changed: changed }, cor);
		}
		if (!state.operation) {
			const workingTree = await walkTree(project, { exclusions: reference.exclusions, max_file_bytes: 8 * 1024 * 1024, max_entries: 50_000 });
			if (diffEntries(referenceEntries, workingTree.entries).some((e) => e.baseline_state !== "unchanged")) {
				return h.commit(unit, { type: "change.block", at: h.now(), actor: KERNEL_ACTOR, reason: "integration_conflict", detail: "the project tree differs from the reference captured at intake; re-verify or resolve before integrating (RM-054)" }, cor);
			}
			const plan = { destination, before, candidate: manifest.manifest_digest, paths: manifest.selected_paths };
			return h.commit(unit, { type: "integration.prepare", at: h.now(), actor: KERNEL_ACTOR, operation_id: h.id("op"), idempotency_key: `integrate:${manifest.manifest_digest}:${before}`, destination, destination_before: before, plan_digest: digestValue(plan) }, cor);
		}
		const opId = state.operation.operation_id;
		if (state.operation.effect_state === "prepared") {
			unit = h.commit(unit, { type: "integration.effect", at: h.now(), actor: KERNEL_ACTOR, operation_id: opId, effect_state: "started", detail: null, decision_id: null }, cor);
			try {
				const workspace = this.harness.deps.workspace.workspacePath(state.candidate!.workspace_id);
				for (const e of manifest.entries) {
					if (e.baseline_state === "unchanged") continue;
					const target = join(project, e.path);
					if (e.baseline_state === "deleted") { await rm(target, { force: true }); continue; }
					await mkdir(dirname(target), { recursive: true });
					await rm(target, { force: true });
					if (e.kind === "symlink" && e.symlink_target) await symlink(e.symlink_target, target);
					else if (e.kind === "file") await cp(join(workspace, e.path), target, { dereference: false });
				}
				if (info.is_repo) {
					await git(project, ["add", "-A", "--", ...manifest.selected_paths]);
					const r = await git(project, ["-c", "user.name=495", "-c", "user.email=495@localhost", "commit", "-q", "-m", `495: integrate candidate ${manifest.candidate_id}\n\nchange: ${state.change_id}\ncandidate: ${manifest.manifest_digest}`], true);
					if (r.code !== 0) throw new Error(`git commit failed: ${r.stderr}`);
				}
				const after = (await inspectGit(project)).head ?? before;
				const applied = await walkTree(project, { exclusions: reference.exclusions, max_file_bytes: 8 * 1024 * 1024, max_entries: 50_000 });
				const appliedEntries = diffEntries(referenceEntries, applied.entries);
				const appliedDigest = digestValue({ base_ref: reference.tree_digest, selected_paths: appliedEntries.filter((e) => e.baseline_state !== "unchanged").map((e) => e.path), exclusions: manifest.exclusions, entries: appliedEntries.map((e) => [e.path, e.kind, e.content_digest, e.mode, e.symlink_target, e.baseline_state]), metadata_policy: "content_and_mode" });
				const receipt: IntegrationReceipt = { destination, before, after, candidate_digest: manifest.manifest_digest, applied_digest: appliedDigest, commit: after, files: manifest.selected_paths, at: h.now() };
				await h.artifacts.store("integration", state.change_id, h.id("rcp"), receipt, KERNEL_ACTOR.actor_id);
				unit = h.commit(unit, { type: "integration.effect", at: h.now(), actor: KERNEL_ACTOR, operation_id: opId, effect_state: "confirmed", detail: null, decision_id: null }, cor);
				return h.commit(unit, { type: "gate.evaluate", gate: "G6", at: h.now(), actor: KERNEL_ACTOR, destination_after: after, applied_digest: appliedDigest, receipt_digest: digestValue(receipt) }, cor);
			} catch (error) {
				const detail = (error as Error).message;
				return h.commit(unit, { type: "integration.effect", at: h.now(), actor: KERNEL_ACTOR, operation_id: opId, effect_state: "uncertain", detail, decision_id: h.id("dec") }, cor);
			}
		}
		if (state.operation.effect_state === "started" || state.operation.effect_state === "uncertain") {
			return h.commit(unit, { type: "change.block", at: h.now(), actor: KERNEL_ACTOR, reason: "integration_conflict", detail: "integration effect uncertain; reconcile (IH-12) before any retry" }, cor);
		}
		if (state.operation.effect_state === "reconciled") {
			const after = (await inspectGit(project)).head ?? before;
			return h.commit(unit, { type: "integration.reconcile", at: h.now(), actor: KERNEL_ACTOR, operation_id: opId, applied: true, destination_after: after, receipt_digest: digestValue({ reconciled: after }) }, cor);
		}
		throw new DomainError("PRECONDITION_FAILED", `unexpected integration state ${state.operation.effect_state}`);
	};
}
