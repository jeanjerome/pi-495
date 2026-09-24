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
import { DomainError } from "../domain/errors.ts";
import { locateModel } from "../domain/policy.ts";
import { createRuntime, type HarnessRuntime } from "./runtime.ts";

interface Binding {
	program_id: string;
	change_id: string;
}

export const VERSION_495 = "0.2.0";

/**
 * A runtime that could not be created, told by its error code alone: the system's message names the
 * data directory, which holds config.json, and the refusal reaches the context of the session's model.
 */
function cannotCreate(error: NodeJS.ErrnoException): Error {
	return new Error(
		`the 495 runtime cannot be created (${error.code ?? error.name}); no change runs until the cause is removed and Pi is reloaded (/reload) or a new session is started`,
	);
}

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
	/** Created by session start alone: no command or tool creates it, they only read it through `runtime()`. */
	private harnessRuntime: HarnessRuntime | null = null;
	/** The change this Pi session drives; null until one is started, bound or resolved at startup. */
	binding: Binding | null = null;
	/** An operation is under way: a second one is refused, and a session switch or fork is cancelled. */
	busy = false;
	/**
	 * Diagnostics waiting to be told: what the runtime could not honour, such as a configuration key
	 * it no longer reads or a sandbox backend that is not qualified. A screen receives them as soon as
	 * the session starts; print, JSON and RPC receive them on the first `/495` that follows, because
	 * a structured entry opens its stream after `session_start`. Each one is said once per channel.
	 */
	private pending: string[] = [];
	/**
	 * Why session start could not create the runtime, the answer of every command and of the tool for
	 * the rest of the session. Session start also binds the session and gathers the diagnostics, so a
	 * runtime created later — a configuration repaired in the meantime — would run unbound and with
	 * nothing announced: none is.
	 */
	private runtimeFailure: Error | null = null;
	/** The Pi session this one was opened for, so that a second start of it is not a second opening. */
	private openedSession: string | null = null;

	constructor(pi: ExtensionAPI) {
		this.pi = pi;
	}

	/** The language every text of this session is written in, as the runtime resolved it. */
	lang(): "fr" | "en" {
		return this.harnessRuntime?.config.language ?? "fr";
	}

	/** The runtime session start created, or the reason it could not be. */
	runtime(): HarnessRuntime {
		if (this.harnessRuntime) return this.harnessRuntime;
		throw this.runtimeFailure ?? new Error("the 495 runtime is not open: no Pi session has started, or it has ended");
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
			const envName = this.harnessRuntime?.config.human_origin.rpc_actor_env ?? "HARNESS495_RPC_HUMAN_ACTOR";
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

	announce(ctx: ExtensionContext): void {
		if (ctx.hasUI) for (const text of this.pending) ctx.ui.notify(text, "warning");
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

	currentView(): StatusView | null {
		if (!this.binding) return null;
		return this.runtime().harness.status(this.binding.change_id);
	}

	resolveBinding(ctx: ExtensionContext): Binding | null {
		const rt = this.runtime();
		const sid = ctx.sessionManager.getSessionId();
		const bySession = rt.ledger.getSessionBinding(sid);
		if (bySession?.change_id) return { program_id: bySession.program_id, change_id: bySession.change_id };
		return null;
	}

	bind(ctx: ExtensionContext, b: Binding): void {
		const rt = this.runtime();
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
				void this.runtime().harness.abortCurrent("user abort");
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

	/**
	 * The one place the runtime is created. It holds no model: each intervention reads the one selected
	 * when it starts, from the context of the command that advances the change (`conduct`).
	 */
	private createRuntimeAt(ctx: ExtensionContext): void {
		try {
			this.harnessRuntime = createRuntime({
				pi_version: VERSION,
				pi_package_dir: getPackageDir(),
				pi_agent_dir: getAgentDir(),
				catalogue: ctx.modelRegistry,
			});
		} catch (error) {
			this.runtimeFailure = error instanceof DomainError ? error : cannotCreate(error as NodeJS.ErrnoException);
		}
	}

	/**
	 * Everything the session knows at startup: the change it resumes, what could not be honoured, and
	 * where the model Pi opened it with sits. A model restored with the session is resolved before
	 * `session_start` and never passes through `model_select` (Pi 0.87.1), so it is judged here.
	 */
	openedAt(ctx: ExtensionContext): void {
		// Pi's RPC mode starts the same session twice on `new_session`, `switch_session`, `fork` and
		// `clone` (`rpc-mode.js`, Pi 0.87.1): the second start would tell the screen everything again,
		// and replace the queue a structured entry has not read yet.
		const sessionId = ctx.sessionManager.getSessionId();
		if (sessionId === this.openedSession) return;
		this.openedSession = sessionId;
		this.openRuntimeAt(ctx);
		this.modelSelected(ctx, ctx.model);
	}

	/**
	 * A model reached off this machine is said like a diagnostic, whether or not the runtime exists:
	 * where Pi sends what 495 hands it is a fact of Pi. Its address is never said, since it may carry
	 * a token or a private path. A model on this machine is not announced.
	 *
	 * A model an extension loaded before 495 selects in its own `session_start` reaches 495 before its
	 * session opens. The opening reads it from `ctx.model` and says it then, so it is not said here.
	 */
	modelSelected(ctx: ExtensionContext, model: { provider: string; id: string; baseUrl?: string } | undefined): void {
		if (this.openedSession === null) return;
		if (!model || locateModel(model.baseUrl) === "on_machine") return;
		const text = `495: the selected model ${model.provider}/${model.id} is reached off this machine; what 495 sends it leaves the machine`;
		this.pending.push(text);
		if (ctx.hasUI) ctx.ui.notify(text, "warning");
	}

	private openRuntimeAt(ctx: ExtensionContext): void {
		if (!this.harnessRuntime && !this.runtimeFailure) this.createRuntimeAt(ctx);
		if (this.runtimeFailure) {
			// The failure is the answer of every `/495`, so it is not queued to be said once more before it.
			if (ctx.hasUI) ctx.ui.notify(`495: ${this.runtimeFailure.message}`, "error");
			return;
		}
		try {
			const rt = this.runtime();
			this.binding = this.resolveBinding(ctx);
			if (!this.binding) {
				const candidates = rt.ledger.findBindingsByCwd(ctx.cwd).filter((b) => b.change_id);
				if (candidates.length === 1 && candidates[0]!.change_id)
					this.binding = { program_id: candidates[0]!.program_id, change_id: candidates[0]!.change_id };
			}
			this.updateFooter(ctx, this.currentView());
			// A diagnostic states what the runtime could not honour — a configuration key it no longer
			// reads, a sandbox backend that is not qualified. Announcing it only where there is a UI
			// would leave print, JSON and RPC running under a limit nobody was told about (AT-12, UX-02).
			// Held until the first command as well: a structured entry does not carry a message
			// emitted before its stream is open.
			this.pending = rt.diagnostics.map((d) => `495: ${d}`);
			this.announce(ctx);
		} catch (error) {
			const text = `495: ${(error as Error).message}`;
			this.pending = [text];
			if (ctx.hasUI) ctx.ui.notify(text, "error");
		}
	}

	/** The session is ending: whatever is running is aborted, and the runtime is released. */
	async close(): Promise<void> {
		if (this.harnessRuntime) {
			await this.harnessRuntime.harness.abortCurrent("session shutdown").catch(() => undefined);
			this.harnessRuntime.close();
			this.harnessRuntime = null;
		}
	}
}
