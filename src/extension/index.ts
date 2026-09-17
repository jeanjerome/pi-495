/**
 * 495 Pi extension (CMP-PI, ADR-001, ADR-009): deterministic `/495` commands, a closed
 * conversational tool without authority, session bindings kept outside the Pi session, mode-aware
 * presentation. All normative work happens in the application controller.
 */
import { userInfo } from "node:os";
import { join } from "node:path";
import { VERSION, getAgentDir, getPackageDir, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ActorRef } from "../contracts/v1/common.ts";
import type { DecisionRequest, HumanOrigin } from "../contracts/v1/decision.ts";
import { DomainError } from "../domain/errors.ts";
import { formatDecision, formatReport, formatStatus } from "../presentation/structured/text.ts";
import { exportChange, verifyExport } from "../export/export-service.ts";
import { createRuntime, type HarnessRuntime } from "./runtime.ts";
import { openReviewTui } from "./review-command.ts";
import type { StatusView } from "../application/views.ts";

interface Binding {
	program_id: string;
	change_id: string;
}

const SUBCOMMANDS = ["start", "status", "resume", "review", "report", "verify", "decide", "integrate", "export", "pause", "cancel", "bind", "unbind", "help"] as const;

export default function harness495(pi: ExtensionAPI): void {
	let runtime: HarnessRuntime | null = null;
	let binding: Binding | null = null;
	let busy = false;

	const lang = () => runtime?.config.language ?? "fr";

	function ensureRuntime(ctx: ExtensionContext): HarnessRuntime {
		if (runtime) return runtime;
		const model = ctx.model ? { provider_id: ctx.model.provider, model_id: ctx.model.id, thinking_level: String(ctx.thinkingLevel ?? "off") } : { provider_id: "", model_id: "", thinking_level: "off" };
		runtime = createRuntime({ pi_version: VERSION, pi_package_dir: getPackageDir(), pi_agent_dir: getAgentDir(), model });
		return runtime;
	}

	function humanOrigin(ctx: ExtensionContext): HumanOrigin | null {
		const sessionId = ctx.sessionManager.getSessionId();
		if (ctx.mode === "tui") {
			const actor: ActorRef = { actor_id: safeUser(), actor_type: "human", role: "change_owner", origin: "tui_session", authentication_level: "session" };
			return { actor, host: "tui", session_id: sessionId, asserted_at: new Date().toISOString() };
		}
		if (ctx.mode === "rpc") {
			const envName = runtime?.config.human_origin.rpc_actor_env ?? "HARNESS495_RPC_HUMAN_ACTOR";
			const declared = process.env[envName];
			if (!declared) return null;
			const actor: ActorRef = { actor_id: declared, actor_type: "human", role: "change_owner", origin: "rpc_qualified", authentication_level: "host_qualified" };
			return { actor, host: "rpc", session_id: sessionId, asserted_at: new Date().toISOString() };
		}
		return null;
	}

	function emit(ctx: ExtensionContext, text: string, details?: unknown): void {
		if (ctx.mode === "print") { process.stdout.write(`${text}\n`); return; }
		pi.sendMessage({ customType: "495", content: text, display: true, details: details ?? {} });
		if (ctx.hasUI && ctx.mode === "tui") ctx.ui.notify(text.split("\n")[0] ?? "495", "info");
	}

	/**
	 * Diagnostics waiting to be told: what the runtime could not honour, such as an ignored
	 * configuration or a sandbox backend that is not qualified. A screen receives them as soon as
	 * the session starts; print, JSON and RPC receive them on the first `/495` that follows, because
	 * a structured entry opens its stream after `session_start`. Each one is said once per channel.
	 */
	let pending: string[] = [];

	function announce(ctx: ExtensionContext, severity: "warning" | "error" = "warning"): void {
		if (ctx.hasUI) for (const text of pending) ctx.ui.notify(text, severity);
	}

	/** Said on the first operation of the session, whatever the entry, then forgotten. */
	function flushDiagnostics(ctx: ExtensionContext): void {
		for (const text of pending.splice(0)) emit(ctx, text, { diagnostic: text });
	}

	function updateFooter(ctx: ExtensionContext, view: StatusView | null): void {
		if (!ctx.hasUI) return;
		const c = view?.change;
		ctx.ui.setStatus("495", c ? `495 ${c.phase}/${c.status}${c.pending_decisions.length ? " ⏸decision" : ""}` : "495 —");
	}

	function currentView(ctx: ExtensionContext): StatusView | null {
		if (!binding) return null;
		return ensureRuntime(ctx).harness.status(binding.change_id);
	}

	function resolveBinding(ctx: ExtensionContext): Binding | null {
		const rt = ensureRuntime(ctx);
		const sid = ctx.sessionManager.getSessionId();
		const bySession = rt.ledger.getSessionBinding(sid);
		if (bySession?.change_id) return { program_id: bySession.program_id, change_id: bySession.change_id };
		return null;
	}

	function bind(ctx: ExtensionContext, b: Binding): void {
		const rt = ensureRuntime(ctx);
		binding = b;
		rt.ledger.bindSession({ session_id: ctx.sessionManager.getSessionId(), cwd: ctx.cwd, program_id: b.program_id, change_id: b.change_id, bound_at: new Date().toISOString() });
		pi.appendEntry("495-binding", b);
	}

	async function withLoader<T>(ctx: ExtensionCommandContext, title: string, work: (progress: (m: string) => void) => Promise<T>): Promise<T> {
		if (ctx.mode !== "tui") return work(() => {});
		const { BorderedLoader } = await import("@earendil-works/pi-coding-agent");
		let failure: Error | null = null;
		const result = await ctx.ui.custom<T>((tui, theme, _kb, done) => {
			const loader = new BorderedLoader(tui, theme, title);
			loader.onAbort = () => { void ensureRuntime(ctx).harness.abortCurrent("user abort"); };
			work((m) => { ctx.ui.setStatus("495", `495 ${m}`); tui.requestRender(); }).then(done, (e: Error) => { failure = e; done(undefined as unknown as T); });
			return loader;
		});
		if (failure) throw failure;
		return result;
	}

	async function conduct(ctx: ExtensionCommandContext, changeId: string): Promise<void> {
		const rt = ensureRuntime(ctx);
		if (busy) { emit(ctx, "495: une opération est déjà en cours dans cette session."); return; }
		busy = true;
		try {
			rt.harness.deps.onProgress = (m) => { if (ctx.hasUI) ctx.ui.setStatus("495", `495 ${m}`); };
			const result = await withLoader(ctx, "495", async () => rt.harness.advance(changeId, { max_steps: 40 }));
			updateFooter(ctx, result.view);
			emit(ctx, `${formatStatus(result.view, lang())}\n${result.steps.length ? `\n${result.steps.join("\n")}` : ""}`, { view: result.view, stopped_because: result.stopped_because });
			if (result.stopped_because === "decision_required") await presentDecisions(ctx, changeId);
		} finally {
			busy = false;
		}
	}

	async function presentDecisions(ctx: ExtensionCommandContext, changeId: string): Promise<void> {
		const rt = ensureRuntime(ctx);
		const pending = rt.harness.pendingDecisions(changeId);
		if (pending.length === 0) { emit(ctx, lang() === "fr" ? "Aucune décision en attente." : "No pending decision."); return; }
		const origin = humanOrigin(ctx);
		for (const req of pending) {
			emit(ctx, formatDecision(req), { decision: req });
			if (!origin || !ctx.hasUI) {
				emit(ctx, lang() === "fr" ? `decision_required: ${req.decision_id} — répondez dans le TUI Pi avec /495 decide (reprise: /495 resume dans une session liée).` : `decision_required: ${req.decision_id} — answer in the Pi TUI with /495 decide.`, { decision_required: req.decision_id });
				continue;
			}
			const choice = await ctx.ui.select(req.question, [...req.options.map((o) => `${o.id} — ${o.label}${o.risky ? " ⚠" : ""}`), lang() === "fr" ? "(plus tard)" : "(later)"]);
			if (!choice || choice.startsWith("(")) continue;
			const optionId = choice.split(" — ")[0]!;
			let freeText: string | null = null;
			if (req.allow_free_text && (optionId === "answer" || optionId === "extend")) freeText = (await ctx.ui.input(lang() === "fr" ? "Votre réponse" : "Your answer")) ?? null;
			const answer = rt.harness.answerDecision(changeId, { decision_id: req.decision_id, option_id: optionId, free_text: freeText, reason: null, subject_revision: req.subject.revision, scope: null, expires_at: null }, origin);
			if (answer.error) emit(ctx, `${lang() === "fr" ? "Décision refusée" : "Decision refused"}: ${answer.error.code} ${answer.error.message}`);
			else emit(ctx, `${lang() === "fr" ? "Décision enregistrée" : "Decision recorded"}: ${answer.decision?.human_decision_id}`);
			updateFooter(ctx, answer.view);
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			const rt = ensureRuntime(ctx);
			binding = resolveBinding(ctx);
			if (!binding) {
				const candidates = rt.ledger.findBindingsByCwd(ctx.cwd).filter((b) => b.change_id);
				if (candidates.length === 1 && candidates[0]!.change_id) binding = { program_id: candidates[0]!.program_id, change_id: candidates[0]!.change_id };
			}
			updateFooter(ctx, currentView(ctx));
			// A diagnostic states what the runtime could not honour — an ignored configuration, a
			// sandbox backend that is not qualified. Announcing it only where there is a UI would
			// leave print, JSON and RPC running under a limit nobody was told about (AT-12, UX-02).
			// Held until the first command as well: a structured entry does not carry a message
			// emitted before its stream is open.
			pending = rt.diagnostics.map((d) => `495: ${d}`);
			announce(ctx);
		} catch (error) {
			pending = [`495: ${(error as Error).message}`];
			announce(ctx, "error");
		}
	});

	pi.on("session_shutdown", async () => {
		if (runtime) {
			await runtime.harness.abortCurrent("session shutdown").catch(() => undefined);
			runtime.close();
			runtime = null;
		}
	});

	pi.on("session_before_switch", async () => (busy ? { cancel: true } : undefined));
	pi.on("session_before_fork", async () => (busy ? { cancel: true } : undefined));

	pi.registerMessageRenderer("495", (message, _options, theme) => new Text(theme.fg("accent", "495 ") + theme.fg("text", String(message.content)), 0, 0));

	pi.registerCommand("495", {
		description: "495 harness: start|status|resume|review|report|verify|decide|integrate|export|pause|cancel|bind|unbind",
		getArgumentCompletions: (prefix) => {
			const items = SUBCOMMANDS.filter((s) => s.startsWith(prefix.trim())).map((s) => ({ value: s, label: s }));
			return items.length ? items : null;
		},
		handler: async (args, ctx) => {
			const [sub, ...rest] = (args ?? "").trim().split(/\s+/);
			const text = rest.join(" ").trim();
			flushDiagnostics(ctx);
			try {
				const rt = ensureRuntime(ctx);
				switch (sub) {
					case "start": {
						if (!text) { emit(ctx, "usage: /495 start <request text>"); return; }
						if (binding) { emit(ctx, lang() === "fr" ? `Cette session est déjà liée à ${binding.change_id} ; /495 status, /495 resume ou /495 unbind.` : `This session is bound to ${binding.change_id}; use /495 status, resume or unbind.`); return; }
						const origin = humanOrigin(ctx);
						const actor: ActorRef = origin?.actor ?? { actor_id: safeUser(), actor_type: "human", role: "requester", origin: ctx.mode === "json" ? "json" : "print", authentication_level: "none" };
						const created = await withLoader(ctx, "495 start", async () => rt.harness.start({ project_path: ctx.cwd, request_text: text, actor, language: lang() }));
						bind(ctx, { program_id: created.program.program_id, change_id: created.change.change_id });
						emit(ctx, `${lang() === "fr" ? "Programme créé" : "Program created"}: ${created.program.program_id} / ${created.change.change_id}`);
						await conduct(ctx, created.change.change_id);
						return;
					}
					case "status": {
						const view = currentView(ctx);
						updateFooter(ctx, view);
						emit(ctx, view ? formatStatus(view, lang()) : lang() === "fr" ? "Aucun programme lié à cette session. /495 start <demande> ou /495 bind <change_id>." : "No program bound. /495 start <request> or /495 bind <change_id>.", { view });
						return;
					}
					case "resume": {
						if (!binding) { emit(ctx, "no binding"); return; }
						rt.harness.resume(binding.change_id, humanOrigin(ctx)?.actor ?? kernelUser());
						await conduct(ctx, binding.change_id);
						return;
					}
					case "verify": {
						if (!binding) { emit(ctx, "no binding"); return; }
						busy = true;
						try {
							const result = await withLoader(ctx, "495 verify", async () => rt.harness.verify(binding!.change_id));
							emit(ctx, formatStatus(result.view, lang()), { view: result.view });
							updateFooter(ctx, result.view);
						} finally { busy = false; }
						return;
					}
					case "decide": {
						if (!binding) { emit(ctx, "no binding"); return; }
						await presentDecisions(ctx, binding.change_id);
						return;
					}
					case "review": {
						if (!binding) { emit(ctx, "no binding"); return; }
						const review = await rt.harness.openReview(binding.change_id, rest[0]?.startsWith("cand_") ? rest[0] : undefined);
						if (ctx.mode === "tui") await openReviewTui(ctx, review, lang());
						else {
							const { summarizeReview } = await import("../presentation/structured/review-text.ts");
							emit(ctx, await summarizeReview(review, rest[0] && !rest[0].startsWith("cand_") ? rest[0] : null, lang()), { snapshot: review.snapshot });
						}
						return;
					}
					case "report": {
						if (!binding) { emit(ctx, "no binding"); return; }
						const report = await rt.harness.report(binding.change_id);
						emit(ctx, formatReport(report, lang()), { report });
						return;
					}
					case "integrate": {
						if (!binding) { emit(ctx, "no binding"); return; }
						if (!rt.config.policy.integration_enabled) { emit(ctx, lang() === "fr" ? "L'intégration est désactivée par la politique (HARNESS495_INTEGRATION=1 ou config.json)." : "Integration is disabled by policy."); return; }
						await conduct(ctx, binding.change_id);
						return;
					}
					case "export": {
						if (!binding) { emit(ctx, "no binding"); return; }
						const redact = rest.includes("--redact");
						const dest = join(rt.dataDir, "exports", `${binding.change_id}-${redact ? "redacted" : "full"}-${Date.now()}`);
						const result = await exportChange(rt.ledger, rt.objects, { change_id: binding.change_id, destination: dest, redact, now: new Date().toISOString(), producer: `495 ${VERSION}` });
						const check = await verifyExport(dest);
						emit(ctx, `${lang() === "fr" ? "Export" : "Export"}: ${result.path}\n${result.files} files, ${result.bytes} bytes, ${result.redactions} redactions${result.missing.length ? `, missing: ${result.missing.join(", ")}` : ""}\nverify: ${check.ok ? "ok" : check.problems.join("; ")}`, { export: result, verify: check });
						return;
					}
					case "pause": {
						if (!binding) { emit(ctx, "no binding"); return; }
						await rt.harness.abortCurrent("pause");
						emit(ctx, formatStatus(rt.harness.pause(binding.change_id, humanOrigin(ctx)?.actor ?? kernelUser()), lang()));
						return;
					}
					case "cancel": {
						if (!binding) { emit(ctx, "no binding"); return; }
						const origin = humanOrigin(ctx);
						if (!origin) { emit(ctx, lang() === "fr" ? "L'annulation exige une provenance humaine (TUI ou hôte RPC qualifié)." : "Cancellation requires a human origin."); return; }
						if (ctx.hasUI && !(await ctx.ui.confirm("495", lang() === "fr" ? "Annuler le changement ? Le dossier est conservé." : "Cancel the change? The dossier is kept."))) return;
						await rt.harness.abortCurrent("cancel");
						emit(ctx, formatStatus(rt.harness.cancel(binding.change_id, origin.actor, text || "cancelled from Pi"), lang()));
						return;
					}
					case "bind": {
						const target = rest[0];
						if (!target) {
							const list = rt.ledger.listChanges().filter((c) => c.phase !== "closed").map((c) => `${c.change_id} ${c.phase}/${c.status} (${c.program_id})`);
							emit(ctx, list.length ? list.join("\n") : "no change recorded");
							return;
						}
						const loaded = rt.ledger.loadChange(target);
						if (!loaded) { emit(ctx, `unknown change ${target}`); return; }
						bind(ctx, { program_id: loaded.state.program_id, change_id: target });
						emit(ctx, formatStatus(rt.harness.status(target), lang()));
						return;
					}
					case "unbind":
						rt.ledger.unbindSession(ctx.sessionManager.getSessionId());
						binding = null;
						updateFooter(ctx, null);
						emit(ctx, "unbound");
						return;
					default:
						emit(ctx, `495 ${VERSION_495}\n/495 start <demande> · status · resume · review [path|cand_id] · report · verify · decide · integrate · export [--redact] · pause · cancel · bind [change_id] · unbind`);
				}
			} catch (error) {
				const msg = error instanceof DomainError ? `${error.code}: ${error.message}` : (error as Error).message;
				emit(ctx, `495 error: ${msg}`, { error: error instanceof DomainError ? error.toCanonical() : { message: msg } });
				updateFooter(ctx, currentView(ctx));
			}
		},
	});

	pi.registerTool({
		name: "harness495",
		label: "495 harness",
		description: "Read-only access to the 495 harness state for the bound program: status, pending decisions, review summary. Cannot decide, adopt or integrate.",
		promptSnippet: "Query the 495 harness (status, pending decisions, review summary) or start a change from a request",
		promptGuidelines: ["Use harness495 to read the harness state; deterministic /495 commands remain the way humans decide."],
		parameters: Type.Object({
			operation: StringEnum(["status", "start", "verify", "list_pending_decisions", "review_summary", "report", "export"] as const),
			request_text: Type.Optional(Type.String({ description: "for start: the request" })),
			path: Type.Optional(Type.String({ description: "for review_summary: a path to read" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			flushDiagnostics(ctx);
			const rt = ensureRuntime(ctx);
			const say = (text: string, details: unknown = {}) => ({ content: [{ type: "text" as const, text }], details });
			switch (params.operation) {
				case "status": {
					const view = currentView(ctx);
					return say(view ? formatStatus(view, lang()) : "no program bound", { view });
				}
				case "list_pending_decisions":
					return say(binding ? rt.harness.pendingDecisions(binding.change_id).map(formatDecision).join("\n\n") || "none" : "no program bound");
				case "start": {
					if (binding) return say(`already bound to ${binding.change_id}`);
					if (!params.request_text) return say("request_text required");
					const created = await rt.harness.start({ project_path: ctx.cwd, request_text: params.request_text, actor: { actor_id: "model", actor_type: "agent", role: "requester", origin: "tool_call", authentication_level: "none" }, language: lang() });
					bind(ctx, { program_id: created.program.program_id, change_id: created.change.change_id });
					return say(`program ${created.program.program_id} created; run /495 resume to conduct it (a tool call cannot drive decisions)`);
				}
				case "verify": {
					if (!binding || busy) return say(busy ? "busy" : "no program bound");
					busy = true;
					try { return say(formatStatus((await rt.harness.verify(binding.change_id)).view, lang())); } finally { busy = false; }
				}
				case "review_summary": {
					if (!binding) return say("no program bound");
					const review = await rt.harness.openReview(binding.change_id);
					const { summarizeReview } = await import("../presentation/structured/review-text.ts");
					return say(await summarizeReview(review, params.path ?? null, lang()));
				}
				case "report": {
					if (!binding) return say("no program bound");
					const report = await rt.harness.report(binding.change_id);
					return say(formatReport(report, lang()), { report });
				}
				case "export": {
					if (!binding) return say("no program bound");
					const dest = join(rt.dataDir, "exports", `${binding.change_id}-redacted-${Date.now()}`);
					const result = await exportChange(rt.ledger, rt.objects, { change_id: binding.change_id, destination: dest, redact: true, now: new Date().toISOString(), producer: `495 ${VERSION}` });
					return say(`exported (redacted) to ${result.path}`);
				}
			}
			return say("unsupported");
		},
	});
}

const VERSION_495 = "0.1.0";

function safeUser(): string {
	try {
		return userInfo().username || "local-user";
	} catch {
		return "local-user";
	}
}

function kernelUser(): ActorRef {
	return { actor_id: "495-kernel", actor_type: "kernel", role: "kernel", origin: "kernel", authentication_level: "host_qualified" };
}
