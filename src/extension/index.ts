/**
 * 495 Pi extension (CMP-PI, ADR-001, ADR-009): deterministic `/495` commands, a closed
 * conversational tool without authority, session bindings kept outside the Pi session, mode-aware
 * presentation. All normative work happens in the application controller.
 *
 * This module wires the four surfaces Pi offers — lifecycle hooks, a command, a tool and a message
 * renderer — onto one session. It holds no state of its own: what they share is in `session.ts`.
 */
import { join } from "node:path";
import { VERSION, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ActorRef } from "../contracts/v1/common.ts";
import { DomainError } from "../domain/errors.ts";
import { formatDecision, formatReport, formatStatus } from "../presentation/structured/text.ts";
import { exportChange, verifyExport } from "../export/export-service.ts";
import { openReviewTui } from "./review-command.ts";
import { ExtensionSession, VERSION_495, kernelUser, safeUser } from "./session.ts";

const SUBCOMMANDS = [
	"start",
	"status",
	"resume",
	"review",
	"report",
	"verify",
	"decide",
	"integrate",
	"export",
	"pause",
	"cancel",
	"bind",
	"unbind",
	"help",
] as const;

export default function harness495(pi: ExtensionAPI): void {
	const session = new ExtensionSession(pi);

	async function conduct(ctx: ExtensionCommandContext, changeId: string): Promise<void> {
		const rt = session.ensureRuntime(ctx);
		if (session.busy) {
			session.emit(ctx, "495: une opération est déjà en cours dans cette session.");
			return;
		}
		session.busy = true;
		try {
			rt.harness.deps.onProgress = (m) => {
				if (ctx.hasUI) ctx.ui.setStatus("495", `495 ${m}`);
			};
			const result = await session.withLoader(ctx, "495", async () => rt.harness.advance(changeId, { max_steps: 40 }));
			session.updateFooter(ctx, result.view);
			session.emit(
				ctx,
				`${formatStatus(result.view, session.lang())}\n${result.steps.length ? `\n${result.steps.join("\n")}` : ""}`,
				{
					view: result.view,
					stopped_because: result.stopped_because,
				},
			);
			if (result.stopped_because === "decision_required") await presentDecisions(ctx, changeId);
		} finally {
			session.busy = false;
		}
	}

	async function presentDecisions(ctx: ExtensionCommandContext, changeId: string): Promise<void> {
		const rt = session.ensureRuntime(ctx);
		const pending = rt.harness.pendingDecisions(changeId);
		if (pending.length === 0) {
			session.emit(ctx, session.lang() === "fr" ? "Aucune décision en attente." : "No pending decision.");
			return;
		}
		const origin = session.humanOrigin(ctx);
		for (const req of pending) {
			session.emit(ctx, formatDecision(req), { decision: req });
			if (!origin || !ctx.hasUI) {
				session.emit(
					ctx,
					session.lang() === "fr"
						? `decision_required: ${req.decision_id} — répondez dans le TUI Pi avec /495 decide (reprise: /495 resume dans une session liée).`
						: `decision_required: ${req.decision_id} — answer in the Pi TUI with /495 decide.`,
					{ decision_required: req.decision_id },
				);
				continue;
			}
			const choice = await ctx.ui.select(req.question, [
				...req.options.map((o) => `${o.id} — ${o.label}${o.risky ? " ⚠" : ""}`),
				session.lang() === "fr" ? "(plus tard)" : "(later)",
			]);
			if (!choice || choice.startsWith("(")) continue;
			const optionId = choice.split(" — ")[0]!;
			let freeText: string | null = null;
			// A refusal that carries no reason leaves the dossier with a blocked change and nothing to
			// read; only the interactions whose text is actually recorded are asked for one.
			if (req.allow_free_text && (optionId === "answer" || optionId === "extend" || optionId === "refuse"))
				freeText =
					(await ctx.ui.input(
						session.lang() === "fr"
							? optionId === "refuse"
								? "Motif du refus"
								: "Votre réponse"
							: optionId === "refuse"
								? "Reason for the refusal"
								: "Your answer",
					)) ?? null;
			const answer = rt.harness.answerDecision(
				changeId,
				{
					decision_id: req.decision_id,
					option_id: optionId,
					free_text: freeText,
					reason: null,
					subject_revision: req.subject.revision,
					scope: null,
					expires_at: null,
				},
				origin,
			);
			if (answer.error)
				session.emit(
					ctx,
					`${session.lang() === "fr" ? "Décision refusée" : "Decision refused"}: ${answer.error.code} ${answer.error.message}`,
				);
			else
				session.emit(
					ctx,
					`${session.lang() === "fr" ? "Décision enregistrée" : "Decision recorded"}: ${answer.decision?.human_decision_id}`,
				);
			session.updateFooter(ctx, answer.view);
		}
	}

	pi.on("session_start", async (_event, ctx) => session.openedAt(ctx));
	pi.on("session_shutdown", async () => session.close());
	pi.on("session_before_switch", async () => (session.busy ? { cancel: true } : undefined));
	pi.on("session_before_fork", async () => (session.busy ? { cancel: true } : undefined));

	pi.registerMessageRenderer(
		"495",
		(message, _options, theme) =>
			new Text(theme.fg("accent", "495 ") + theme.fg("text", String(message.content)), 0, 0),
	);

	pi.registerCommand("495", {
		description:
			"495 harness: start|status|resume|review|report|verify|decide|integrate|export|pause|cancel|bind|unbind",
		getArgumentCompletions: (prefix) => {
			const items = SUBCOMMANDS.filter((s) => s.startsWith(prefix.trim())).map((s) => ({ value: s, label: s }));
			return items.length ? items : null;
		},
		handler: async (args, ctx) => {
			const [sub, ...rest] = (args ?? "").trim().split(/\s+/);
			const text = rest.join(" ").trim();
			session.flushDiagnostics(ctx);
			try {
				const rt = session.ensureRuntime(ctx);
				switch (sub) {
					case "start": {
						if (!text) {
							session.emit(ctx, "usage: /495 start <request text>");
							return;
						}
						if (session.binding) {
							session.emit(
								ctx,
								session.lang() === "fr"
									? `Cette session est déjà liée à ${session.binding.change_id} ; /495 status, /495 resume ou /495 unbind.`
									: `This session is bound to ${session.binding.change_id}; use /495 status, resume or unbind.`,
							);
							return;
						}
						const origin = session.humanOrigin(ctx);
						const actor: ActorRef = origin?.actor ?? {
							actor_id: safeUser(),
							actor_type: "human",
							role: "requester",
							origin: ctx.mode === "json" ? "json" : "print",
							authentication_level: "none",
						};
						const created = await session.withLoader(ctx, "495 start", async () =>
							rt.harness.start({ project_path: ctx.cwd, request_text: text, actor, language: session.lang() }),
						);
						session.bind(ctx, { program_id: created.program.program_id, change_id: created.change.change_id });
						session.emit(
							ctx,
							`${session.lang() === "fr" ? "Programme créé" : "Program created"}: ${created.program.program_id} / ${created.change.change_id}`,
						);
						await conduct(ctx, created.change.change_id);
						return;
					}
					case "status": {
						const view = session.currentView(ctx);
						session.updateFooter(ctx, view);
						session.emit(
							ctx,
							view
								? formatStatus(view, session.lang())
								: session.lang() === "fr"
									? "Aucun programme lié à cette session. /495 start <demande> ou /495 bind <change_id>."
									: "No program bound. /495 start <request> or /495 bind <change_id>.",
							{ view },
						);
						return;
					}
					case "resume": {
						if (!session.binding) {
							session.emit(ctx, "no binding");
							return;
						}
						rt.harness.resume(session.binding.change_id, session.humanOrigin(ctx)?.actor ?? kernelUser());
						await conduct(ctx, session.binding.change_id);
						return;
					}
					case "verify": {
						if (!session.binding) {
							session.emit(ctx, "no binding");
							return;
						}
						session.busy = true;
						try {
							const result = await session.withLoader(ctx, "495 verify", async () =>
								rt.harness.verify(session.binding!.change_id),
							);
							session.emit(ctx, formatStatus(result.view, session.lang()), { view: result.view });
							session.updateFooter(ctx, result.view);
						} finally {
							session.busy = false;
						}
						return;
					}
					case "decide": {
						if (!session.binding) {
							session.emit(ctx, "no binding");
							return;
						}
						await presentDecisions(ctx, session.binding.change_id);
						return;
					}
					case "review": {
						if (!session.binding) {
							session.emit(ctx, "no binding");
							return;
						}
						const review = await rt.harness.openReview(
							session.binding.change_id,
							rest[0]?.startsWith("cand_") ? rest[0] : undefined,
						);
						if (ctx.mode === "tui") await openReviewTui(ctx, review, session.lang());
						else {
							const { summarizeReview } = await import("../presentation/structured/review-text.ts");
							session.emit(
								ctx,
								await summarizeReview(review, rest[0] && !rest[0].startsWith("cand_") ? rest[0] : null, session.lang()),
								{ snapshot: review.snapshot },
							);
						}
						return;
					}
					case "report": {
						if (!session.binding) {
							session.emit(ctx, "no binding");
							return;
						}
						const report = await rt.harness.report(session.binding.change_id);
						session.emit(ctx, formatReport(report, session.lang()), { report });
						return;
					}
					case "integrate": {
						if (!session.binding) {
							session.emit(ctx, "no binding");
							return;
						}
						if (!rt.config.policy.integration_enabled) {
							session.emit(
								ctx,
								session.lang() === "fr"
									? "L'intégration est désactivée par la politique (HARNESS495_INTEGRATION=1 ou config.json)."
									: "Integration is disabled by policy.",
							);
							return;
						}
						await conduct(ctx, session.binding.change_id);
						return;
					}
					case "export": {
						if (!session.binding) {
							session.emit(ctx, "no binding");
							return;
						}
						const redact = rest.includes("--redact");
						const dest = join(
							rt.dataDir,
							"exports",
							`${session.binding.change_id}-${redact ? "redacted" : "full"}-${Date.now()}`,
						);
						const result = await exportChange(rt.ledger, rt.objects, {
							change_id: session.binding.change_id,
							destination: dest,
							redact,
							now: new Date().toISOString(),
							producer: `495 ${VERSION}`,
						});
						const check = await verifyExport(dest);
						session.emit(
							ctx,
							`${session.lang() === "fr" ? "Export" : "Export"}: ${result.path}\n${result.files} files, ${result.bytes} bytes, ${result.redactions} redactions${result.missing.length ? `, missing: ${result.missing.join(", ")}` : ""}\nverify: ${check.ok ? "ok" : check.problems.join("; ")}`,
							{ export: result, verify: check },
						);
						return;
					}
					case "pause": {
						if (!session.binding) {
							session.emit(ctx, "no binding");
							return;
						}
						await rt.harness.abortCurrent("pause");
						session.emit(
							ctx,
							formatStatus(
								rt.harness.pause(session.binding.change_id, session.humanOrigin(ctx)?.actor ?? kernelUser()),
								session.lang(),
							),
						);
						return;
					}
					case "cancel": {
						if (!session.binding) {
							session.emit(ctx, "no binding");
							return;
						}
						const origin = session.humanOrigin(ctx);
						if (!origin) {
							session.emit(
								ctx,
								session.lang() === "fr"
									? "L'annulation exige une provenance humaine (TUI ou hôte RPC qualifié)."
									: "Cancellation requires a human origin.",
							);
							return;
						}
						if (
							ctx.hasUI &&
							!(await ctx.ui.confirm(
								"495",
								session.lang() === "fr"
									? "Annuler le changement ? Le dossier est conservé."
									: "Cancel the change? The dossier is kept.",
							))
						)
							return;
						await rt.harness.abortCurrent("cancel");
						session.emit(
							ctx,
							formatStatus(
								rt.harness.cancel(session.binding.change_id, origin.actor, text || "cancelled from Pi"),
								session.lang(),
							),
						);
						return;
					}
					case "bind": {
						const target = rest[0];
						if (!target) {
							const list = rt.ledger
								.listChanges()
								.filter((c) => c.phase !== "closed")
								.map((c) => `${c.change_id} ${c.phase}/${c.status} (${c.program_id})`);
							session.emit(ctx, list.length ? list.join("\n") : "no change recorded");
							return;
						}
						const loaded = rt.ledger.loadChange(target);
						if (!loaded) {
							session.emit(ctx, `unknown change ${target}`);
							return;
						}
						session.bind(ctx, { program_id: loaded.state.program_id, change_id: target });
						session.emit(ctx, formatStatus(rt.harness.status(target), session.lang()));
						return;
					}
					case "unbind":
						rt.ledger.unbindSession(ctx.sessionManager.getSessionId());
						session.binding = null;
						session.updateFooter(ctx, null);
						session.emit(ctx, "unbound");
						return;
					default:
						session.emit(
							ctx,
							`495 ${VERSION_495}\n/495 start <demande> · status · resume · review [path|cand_id] · report · verify · decide · integrate · export [--redact] · pause · cancel · bind [change_id] · unbind`,
						);
				}
			} catch (error) {
				const msg = error instanceof DomainError ? `${error.code}: ${error.message}` : (error as Error).message;
				session.emit(ctx, `495 error: ${msg}`, {
					error: error instanceof DomainError ? error.toCanonical() : { message: msg },
				});
				session.updateFooter(ctx, session.currentView(ctx));
			}
		},
	});

	pi.registerTool({
		name: "harness495",
		label: "495 harness",
		description:
			"Read-only access to the 495 harness state for the bound program: status, pending decisions, review summary. Cannot decide, adopt or integrate.",
		promptSnippet: "Query the 495 harness (status, pending decisions, review summary) or start a change from a request",
		promptGuidelines: [
			"Use harness495 to read the harness state; deterministic /495 commands remain the way humans decide.",
		],
		parameters: Type.Object({
			operation: StringEnum([
				"status",
				"start",
				"verify",
				"list_pending_decisions",
				"review_summary",
				"report",
				"export",
			] as const),
			request_text: Type.Optional(Type.String({ description: "for start: the request" })),
			path: Type.Optional(Type.String({ description: "for review_summary: a path to read" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			session.flushDiagnostics(ctx);
			const rt = session.ensureRuntime(ctx);
			const say = (text: string, details: unknown = {}) => ({ content: [{ type: "text" as const, text }], details });
			switch (params.operation) {
				case "status": {
					const view = session.currentView(ctx);
					return say(view ? formatStatus(view, session.lang()) : "no program bound", { view });
				}
				case "list_pending_decisions":
					return say(
						session.binding
							? rt.harness.pendingDecisions(session.binding.change_id).map(formatDecision).join("\n\n") || "none"
							: "no program bound",
					);
				case "start": {
					if (session.binding) return say(`already bound to ${session.binding.change_id}`);
					if (!params.request_text) return say("request_text required");
					const created = await rt.harness.start({
						project_path: ctx.cwd,
						request_text: params.request_text,
						actor: {
							actor_id: "model",
							actor_type: "agent",
							role: "requester",
							origin: "tool_call",
							authentication_level: "none",
						},
						language: session.lang(),
					});
					session.bind(ctx, { program_id: created.program.program_id, change_id: created.change.change_id });
					return say(
						`program ${created.program.program_id} created; run /495 resume to conduct it (a tool call cannot drive decisions)`,
					);
				}
				case "verify": {
					if (!session.binding || session.busy) return say(session.busy ? "busy" : "no program bound");
					session.busy = true;
					try {
						return say(formatStatus((await rt.harness.verify(session.binding.change_id)).view, session.lang()));
					} finally {
						session.busy = false;
					}
				}
				case "review_summary": {
					if (!session.binding) return say("no program bound");
					const review = await rt.harness.openReview(session.binding.change_id);
					const { summarizeReview } = await import("../presentation/structured/review-text.ts");
					return say(await summarizeReview(review, params.path ?? null, session.lang()));
				}
				case "report": {
					if (!session.binding) return say("no program bound");
					const report = await rt.harness.report(session.binding.change_id);
					return say(formatReport(report, session.lang()), { report });
				}
				case "export": {
					if (!session.binding) return say("no program bound");
					const dest = join(rt.dataDir, "exports", `${session.binding.change_id}-redacted-${Date.now()}`);
					const result = await exportChange(rt.ledger, rt.objects, {
						change_id: session.binding.change_id,
						destination: dest,
						redact: true,
						now: new Date().toISOString(),
						producer: `495 ${VERSION}`,
					});
					return say(`exported (redacted) to ${result.path}`);
				}
			}
			return say("unsupported");
		},
	});
}
