/**
 * The `/495` command (CMP-PI, UX-02): one deterministic subcommand per act a human may ask of the
 * harness, answering the same way on a screen, in print, in JSON and over RPC. It decides nothing —
 * every subcommand reaches the application controller through the session it is handed.
 */
import { join } from "node:path";
import { VERSION, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ActorRef } from "../contracts/v1/common.ts";
import { DomainError } from "../domain/errors.ts";
import { formatReport, formatStatus } from "../presentation/structured/text.ts";
import { exportChange, verifyExport } from "../export/export-service.ts";
import { conduct, presentDecisions } from "./conduct.ts";
import { openReviewTui } from "./review-command.ts";
import { type ExtensionSession, VERSION_495, kernelUser, safeUser } from "./session.ts";

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

export function registerCommand495(pi: ExtensionAPI, session: ExtensionSession): void {
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
				const rt = session.runtime();
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
						await conduct(session, ctx, created.change.change_id);
						return;
					}
					case "status": {
						const view = session.currentView();
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
						await conduct(session, ctx, session.binding.change_id);
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
						await presentDecisions(session, ctx, session.binding.change_id);
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
						await conduct(session, ctx, session.binding.change_id);
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
				session.updateFooter(ctx, session.currentView());
			}
		},
	});
}
