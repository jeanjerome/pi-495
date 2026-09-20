/**
 * The 495 session inside a Pi session (CMP-PI): the runtime it opened, the change it is bound to,
 * whether an operation is already under way, and what it still owes the user. Four cells the
 * commands, the tool and the lifecycle hooks all read and write, held in one place instead of being
 * closed over, so that what each of them reaches is stated rather than inherited from a scope.
 *
 * It is also the one channel through which 495 speaks: a screen, a print stream, a structured entry
 * and an RPC client are not told the same way, and none of them may be left out (AT-12, UX-02).
 */
import { userInfo } from "node:os";
import {
	VERSION,
	getAgentDir,
	getPackageDir,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ActorRef } from "../contracts/v1/common.ts";
import type { HumanOrigin } from "../contracts/v1/decision.ts";
import type { StatusView } from "../application/views.ts";
import { createRuntime, type HarnessRuntime } from "./runtime.ts";

interface Binding {
	program_id: string;
	change_id: string;
}

export const VERSION_495 = "0.1.0";

export function safeUser(): string {
	try {
		return userInfo().username || "local-user";
	} catch {
		return "local-user";
	}
}

export function kernelUser(): ActorRef {
	return {
		actor_id: "495-kernel",
		actor_type: "kernel",
		role: "kernel",
		origin: "kernel",
		authentication_level: "host_qualified",
	};
}

export class ExtensionSession {
	private readonly pi: ExtensionAPI;
	private runtime: HarnessRuntime | null = null;
	/** The change this Pi session drives; null until one is started, bound or resolved at startup. */
	binding: Binding | null = null;
	/** An operation is under way: a second one is refused, and a session switch or fork is cancelled. */
	busy = false;
	/**
	 * Diagnostics waiting to be told: what the runtime could not honour, such as an ignored
	 * configuration or a sandbox backend that is not qualified. A screen receives them as soon as
	 * the session starts; print, JSON and RPC receive them on the first `/495` that follows, because
	 * a structured entry opens its stream after `session_start`. Each one is said once per channel.
	 */
	private pending: string[] = [];

	constructor(pi: ExtensionAPI) {
		this.pi = pi;
	}

	/** The language every text of this session is written in, as the runtime resolved it. */
	lang(): "fr" | "en" {
		return this.runtime?.config.language ?? "fr";
	}

	ensureRuntime(ctx: ExtensionContext): HarnessRuntime {
		if (this.runtime) return this.runtime;
		const model = ctx.model
			? { provider_id: ctx.model.provider, model_id: ctx.model.id, thinking_level: String(ctx.thinkingLevel ?? "off") }
			: { provider_id: "", model_id: "", thinking_level: "off" };
		this.runtime = createRuntime({
			pi_version: VERSION,
			pi_package_dir: getPackageDir(),
			pi_agent_dir: getAgentDir(),
			model,
		});
		return this.runtime;
	}

	humanOrigin(ctx: ExtensionContext): HumanOrigin | null {
		const sessionId = ctx.sessionManager.getSessionId();
		if (ctx.mode === "tui") {
			const actor: ActorRef = {
				actor_id: safeUser(),
				actor_type: "human",
				role: "change_owner",
				origin: "tui_session",
				authentication_level: "session",
			};
			return { actor, host: "tui", session_id: sessionId, asserted_at: new Date().toISOString() };
		}
		if (ctx.mode === "rpc") {
			const envName = this.runtime?.config.human_origin.rpc_actor_env ?? "HARNESS495_RPC_HUMAN_ACTOR";
			const declared = process.env[envName];
			if (!declared) return null;
			const actor: ActorRef = {
				actor_id: declared,
				actor_type: "human",
				role: "change_owner",
				origin: "rpc_qualified",
				authentication_level: "host_qualified",
			};
			return { actor, host: "rpc", session_id: sessionId, asserted_at: new Date().toISOString() };
		}
		return null;
	}

	emit(ctx: ExtensionContext, text: string, details?: unknown): void {
		if (ctx.mode === "print") {
			process.stdout.write(`${text}\n`);
			return;
		}
		this.pi.sendMessage({ customType: "495", content: text, display: true, details: details ?? {} });
		if (ctx.hasUI && ctx.mode === "tui") ctx.ui.notify(text.split("\n")[0] ?? "495", "info");
	}

	announce(ctx: ExtensionContext, severity: "warning" | "error" = "warning"): void {
		if (ctx.hasUI) for (const text of this.pending) ctx.ui.notify(text, severity);
	}

	/** Said on the first operation of the session, whatever the entry, then forgotten. */
	flushDiagnostics(ctx: ExtensionContext): void {
		for (const text of this.pending.splice(0)) this.emit(ctx, text, { diagnostic: text });
	}

	updateFooter(ctx: ExtensionContext, view: StatusView | null): void {
		if (!ctx.hasUI) return;
		const c = view?.change;
		ctx.ui.setStatus(
			"495",
			c ? `495 ${c.phase}/${c.status}${c.pending_decisions.length ? " ⏸decision" : ""}` : "495 —",
		);
	}

	currentView(ctx: ExtensionContext): StatusView | null {
		if (!this.binding) return null;
		return this.ensureRuntime(ctx).harness.status(this.binding.change_id);
	}

	resolveBinding(ctx: ExtensionContext): Binding | null {
		const rt = this.ensureRuntime(ctx);
		const sid = ctx.sessionManager.getSessionId();
		const bySession = rt.ledger.getSessionBinding(sid);
		if (bySession?.change_id) return { program_id: bySession.program_id, change_id: bySession.change_id };
		return null;
	}

	bind(ctx: ExtensionContext, b: Binding): void {
		const rt = this.ensureRuntime(ctx);
		this.binding = b;
		rt.ledger.bindSession({
			session_id: ctx.sessionManager.getSessionId(),
			cwd: ctx.cwd,
			program_id: b.program_id,
			change_id: b.change_id,
			bound_at: new Date().toISOString(),
		});
		this.pi.appendEntry("495-binding", b);
	}

	async withLoader<T>(
		ctx: ExtensionCommandContext,
		title: string,
		work: (progress: (m: string) => void) => Promise<T>,
	): Promise<T> {
		if (ctx.mode !== "tui") return work(() => {});
		const { BorderedLoader } = await import("@earendil-works/pi-coding-agent");
		let failure: Error | null = null;
		const result = await ctx.ui.custom<T>((tui, theme, _kb, done) => {
			const loader = new BorderedLoader(tui, theme, title);
			loader.onAbort = () => {
				void this.ensureRuntime(ctx).harness.abortCurrent("user abort");
			};
			work((m) => {
				ctx.ui.setStatus("495", `495 ${m}`);
				tui.requestRender();
			}).then(done, (e: Error) => {
				failure = e;
				done(undefined as unknown as T);
			});
			return loader;
		});
		if (failure) throw failure;
		return result;
	}

	/** Everything the session knows at startup: the change it resumes, and what could not be honoured. */
	openedAt(ctx: ExtensionContext): void {
		try {
			const rt = this.ensureRuntime(ctx);
			this.binding = this.resolveBinding(ctx);
			if (!this.binding) {
				const candidates = rt.ledger.findBindingsByCwd(ctx.cwd).filter((b) => b.change_id);
				if (candidates.length === 1 && candidates[0]!.change_id)
					this.binding = { program_id: candidates[0]!.program_id, change_id: candidates[0]!.change_id };
			}
			this.updateFooter(ctx, this.currentView(ctx));
			// A diagnostic states what the runtime could not honour — an ignored configuration, a
			// sandbox backend that is not qualified. Announcing it only where there is a UI would
			// leave print, JSON and RPC running under a limit nobody was told about (AT-12, UX-02).
			// Held until the first command as well: a structured entry does not carry a message
			// emitted before its stream is open.
			this.pending = rt.diagnostics.map((d) => `495: ${d}`);
			this.announce(ctx);
		} catch (error) {
			this.pending = [`495: ${(error as Error).message}`];
			this.announce(ctx, "error");
		}
	}

	/** The session is ending: whatever is running is aborted, and the runtime is released. */
	async close(): Promise<void> {
		if (this.runtime) {
			await this.runtime.harness.abortCurrent("session shutdown").catch(() => undefined);
			this.runtime.close();
			this.runtime = null;
		}
	}
}
