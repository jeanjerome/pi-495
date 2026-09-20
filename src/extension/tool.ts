/**
 * The conversational tool (CMP-PI, ADR-009): a closed surface a model may call, carrying no
 * authority of its own. It reads the state of the session and advances the change the session is
 * bound to; it adopts nothing, answers no decision and reaches no other change.
 */
import { join } from "node:path";
import { VERSION, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { formatDecision, formatReport, formatStatus } from "../presentation/structured/text.ts";
import { exportChange } from "../export/export-service.ts";
import type { ExtensionSession } from "./session.ts";

export function registerTool495(pi: ExtensionAPI, session: ExtensionSession): void {
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
