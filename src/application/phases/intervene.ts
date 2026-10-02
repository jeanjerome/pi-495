/**
 * Intervening: one bounded agent session, from the context it is handed to the change as the session
 * left it. The context is composed and stored, the session runs under the supervisor, each tool call
 * is paid for as it happens, and what the session produced is recorded before it is handed back.
 */
import type { Protocol } from "../../contracts/v1/protocol.ts";
import { TOOLS_FOR_ROLE } from "../../contracts/v1/reports.ts";
import type { ChangeCommand } from "../../domain/change/commands.ts";
import type { ChangeState } from "../../domain/change/state.ts";
import { DomainError } from "../../domain/errors.ts";
import { imposedLayersFor, recordImposedLayers } from "../../domain/imposed-layers.ts";
import type { InterventionMandate, ModelSelection } from "../../ports/execution.ts";
import type { ObjectStorePort } from "../../ports/object-store.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import type { ArtifactRepository } from "../artifacts.ts";
import { buildContext } from "../context.ts";
import type { InterventionSupervisor } from "../intervention.ts";
import type { InterventionOptions, InterventionOutcome, Unit } from "./phase.ts";

/** What an intervention reads, stores and commits through. */
export interface InterveneDeps {
	readonly artifacts: ArtifactRepository;
	readonly interventions: InterventionSupervisor;
	readonly objects: ObjectStorePort;
	commit(unit: Unit, command: ChangeCommand, correlation: string): Unit;
	now(): string;
	id(prefix: string): string;
	language(state: ChangeState): "fr" | "en";
}

export async function intervene(
	deps: InterveneDeps,
	readModel: () => ModelSelection,
	unit: Unit,
	cor: string,
	role: InterventionMandate["role"],
	objective: string,
	workspacePath: string,
	extra: InterventionOptions,
): Promise<InterventionOutcome> {
	// Read once: the model judged is the one journaled, declared in the context and handed to the
	// worker, whatever is selected in Pi while the capability check awaits the model's description.
	const model = readModel();
	await deps.interventions.requireCapable(role, model);
	const interventionId = deps.id("int");
	const attemptId = extra.attempt_id ?? (role === "implement" || role === "prepare" ? deps.id("att") : null);
	unit = deps.commit(
		unit,
		{
			type: "intervention.start",
			at: deps.now(),
			actor: KERNEL_ACTOR,
			intervention_id: interventionId,
			role,
			attempt_id: attemptId,
			model,
			profile_id: role,
			profile_qualified: deps.interventions.qualifiedFor(role),
		},
		cor,
	);
	if (unit.state.status === "blocked")
		return { unit, output: null, output_valid: false, result: "failed", intervention_id: interventionId };
	const adopted: { kind: string; artifact_id: string; revision: number; digest: string; text: string }[] = [];
	for (const kind of extra.adopted ?? []) {
		const a = await deps.artifacts.latest<unknown>(unit.state, kind);
		if (a)
			adopted.push({
				kind,
				artifact_id: a.ref.artifact_id,
				revision: a.ref.revision,
				digest: a.ref.content_digest,
				text: typeof a.content === "string" ? a.content : JSON.stringify(a.content, null, 2),
			});
	}
	const protocol = await deps.artifacts.latest<Protocol>(unit.state, "protocol");
	const ctx = buildContext({
		role,
		objective,
		language: deps.language(unit.state),
		adopted,
		untrusted: [],
		feedback: extra.feedback ?? null,
		tools: TOOLS_FOR_ROLE[role],
		budget_bytes: 60_000,
		// The provider is read from the same selection the supervisor hands the worker; what it
		// imposes is declared whether or not this intervention writes (CTX-02).
		imposed_layers: imposedLayersFor(model.provider_id),
		// A preparation opens before any protocol is frozen: the controls it is judged by are the ones
		// its phase detected on the target, and the latest protocol is read only when none is handed.
		controls: extra.controls ?? protocol?.content.controls ?? [],
		boundaries: (protocol?.content.controls ?? []).flatMap((c) => c.structure_rules.map((rule) => rule.statement)),
	});
	// The manifest addresses the prompt and each excerpt by digest; the bytes go to the store, or
	// those digests resolve to nothing and the dossier cannot say what the model read.
	await deps.objects.putText(ctx.record, "application/json");
	const contextRef = await deps.artifacts.store(
		"context",
		unit.state.change_id,
		deps.id("ctx"),
		ctx.manifest,
		KERNEL_ACTOR.actor_id,
	);
	unit = deps.commit(
		unit,
		{ type: "artifact.propose", at: deps.now(), actor: KERNEL_ACTOR, kind: "context", ref: contextRef },
		cor,
	);
	// Each tool call is paid for as it happens: what the budget refuses ends the session there.
	const report = await deps.interventions.run(
		{
			intervention_id: interventionId,
			change_id: unit.state.change_id,
			role,
			objective,
			workspace_path: workspacePath,
			prompt: ctx.prompt,
			system_prompt: ctx.system_prompt,
			context: ctx.manifest,
			model,
		},
		() => {
			try {
				unit = deps.commit(
					unit,
					{
						type: "budget.consume",
						at: deps.now(),
						actor: KERNEL_ACTOR,
						intervention_id: interventionId,
						counters: { tool_calls: 1, duration_ms: 0, tokens_known: 0, delegations: 0 },
					},
					cor,
				);
				return null;
			} catch (error) {
				if (error instanceof DomainError) return error;
				throw error;
			}
		},
	);
	const outputRef = await deps.artifacts.store(
		"output",
		unit.state.change_id,
		deps.id("out"),
		{ intervention_id: interventionId, role, terminal: report.terminal, events: report.events },
		interventionId,
	);
	unit = deps.commit(
		unit,
		{
			type: "artifact.propose",
			at: deps.now(),
			actor: {
				actor_id: interventionId,
				actor_type: "agent",
				role: role === "review" ? "reviewer_agent" : "producer_agent",
				origin: "model_output",
				authentication_level: "none",
			},
			kind: "output",
			ref: outputRef,
		},
		cor,
	);
	unit = deps.commit(
		unit,
		{
			type: "intervention.finish",
			at: deps.now(),
			actor: KERNEL_ACTOR,
			intervention_id: interventionId,
			result: report.result,
			counters: report.counters,
			detail: report.detail,
			cost: report.cost,
			imposed_layers: report.imposed_layers_observed.map((observed) =>
				recordImposedLayers(ctx.manifest.imposed_layers, observed),
			),
		},
		cor,
	);
	// The tool-call bound is what caps spending on a provider billed per token, so reaching it waits
	// for the owner instead of resuming on its own the way the duration bound does, where a truncated
	// session resumes on its own workspace within the same attempt. Whatever the role, the change
	// stops here; a resume lifts it.
	if (report.budget_refusal !== null)
		unit = deps.commit(
			unit,
			{
				type: "change.block",
				at: deps.now(),
				actor: KERNEL_ACTOR,
				reason: "budget_exhausted",
				detail: `${role} intervention: ${report.budget_refusal}; the change waits for its owner, and a raised bound takes effect in a new session`,
				retryable: true,
			},
			cor,
		);
	return {
		unit,
		output: report.output,
		output_valid: report.output_valid,
		result: report.result,
		intervention_id: interventionId,
	};
}
