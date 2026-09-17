/**
 * Minimal Pi RPC client for the V3 campaign: commands as JSON lines on stdin, events and extension
 * UI requests as JSON lines on stdout.
 *
 * Records are split on LF only. `node:readline` also breaks on U+2028 and U+2029, which are legal
 * inside a JSON string, so a generic line reader is not a conforming client of this protocol.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface RpcEvent {
	type: string;
	id?: string;
	method?: string;
	command?: string;
	success?: boolean;
	message?: { role?: string; customType?: string; content?: string; details?: Record<string, unknown> };
	[key: string]: unknown;
}

/** Answers an `extension_ui_request`; `null` leaves the dialog unanswered. */
export type UiResponder = (request: RpcEvent) => Record<string, unknown> | null;

export class PiRpcClient {
	readonly events: RpcEvent[] = [];
	readonly uiRequests: RpcEvent[] = [];
	readonly stderr: string[] = [];
	/** Everything read from stdout, kept raw so a test can assert no terminal escape reached it. */
	raw = "";
	private readonly child: ChildProcessWithoutNullStreams;
	private buffer = "";
	private readonly waiters: { predicate: (e: RpcEvent) => boolean; resolve: (e: RpcEvent) => void }[] = [];
	private exited: { code: number | null; signal: NodeJS.Signals | null } | null = null;
	private lastEventAt = Date.now();

	constructor(options: { bin: string; args: string[]; cwd: string; env: Record<string, string | undefined>; respond?: UiResponder | undefined }) {
		this.child = spawn(options.bin, options.args, { cwd: options.cwd, env: options.env, stdio: ["pipe", "pipe", "pipe"] }) as ChildProcessWithoutNullStreams;
		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => this.consume(chunk, options.respond));
		this.child.stderr.setEncoding("utf8");
		this.child.stderr.on("data", (chunk: string) => this.stderr.push(chunk));
		this.child.on("exit", (code, signal) => { this.exited = { code, signal }; });
	}

	private consume(chunk: string, respond?: UiResponder): void {
		this.raw += chunk;
		this.buffer += chunk;
		for (;;) {
			const index = this.buffer.indexOf("\n");
			if (index < 0) return;
			const line = this.buffer.slice(0, index).replace(/\r$/, "");
			this.buffer = this.buffer.slice(index + 1);
			if (!line.trim()) continue;
			let event: RpcEvent;
			try { event = JSON.parse(line) as RpcEvent; } catch { continue; }
			this.events.push(event);
			this.lastEventAt = Date.now();
			if (event.type === "extension_ui_request") {
				this.uiRequests.push(event);
				const answer = respond?.(event);
				if (answer) this.send({ type: "extension_ui_response", id: event.id, ...answer });
			}
			for (let i = this.waiters.length - 1; i >= 0; i--) {
				const waiter = this.waiters[i]!;
				if (!waiter.predicate(event)) continue;
				this.waiters.splice(i, 1);
				waiter.resolve(event);
			}
		}
	}

	send(command: Record<string, unknown>): void {
		this.child.stdin.write(`${JSON.stringify(command)}\n`);
	}

	/** Resolves on the first event matching `predicate`, including events already received. */
	waitFor(predicate: (e: RpcEvent) => boolean, timeoutMs = 120_000): Promise<RpcEvent> {
		const already = this.events.find(predicate);
		if (already) return Promise.resolve(already);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`no matching RPC event within ${timeoutMs} ms; stderr: ${this.stderr.join("").slice(0, 500)}`)), timeoutMs);
			this.waiters.push({ predicate, resolve: (e) => { clearTimeout(timer); resolve(e); } });
		});
	}

	/**
	 * An extension command is handled inside the `prompt` command and never starts the agent, so no
	 * `agent_settled` closes it. What marks its end is the stream falling quiet.
	 */
	async waitQuiet(quietMs = 1500, timeoutMs = 300_000): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			await new Promise((resolve) => setTimeout(resolve, 250));
			if (Date.now() - this.lastEventAt >= quietMs) return;
			if (Date.now() > deadline) throw new Error(`the RPC stream never fell quiet within ${timeoutMs} ms; stderr: ${this.stderr.join("").slice(0, 500)}`);
		}
	}

	/** The `495` custom messages, with the structured payload each one carries. */
	messages(): { content: string; details: Record<string, unknown> }[] {
		return this.events.filter((e) => e.type === "message_end" && e.message?.customType === "495").map((e) => ({ content: String(e.message?.content ?? ""), details: (e.message?.details ?? {}) as Record<string, unknown> }));
	}

	async close(): Promise<void> {
		this.child.stdin.end();
		if (this.exited) return;
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => { this.child.kill("SIGKILL"); resolve(); }, 5000);
			this.child.on("exit", () => { clearTimeout(timer); resolve(); });
		});
	}
}
