import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
	AgentCapabilities,
	AgentPort,
	InterventionEvent,
	InterventionHandle,
	InterventionMandate,
	ModelSelection,
} from "../../ports/execution.ts";
import { PiModelDescription, type PiModelCatalogue } from "./capabilities.ts";
import type { SupervisorMessage, WorkerConfig, WorkerMessage } from "./protocol.ts";

export interface SupervisorOptions {
	config: WorkerConfig;
	/** Command used to start a worker; defaults to `node <worker-main>` next to this module. */
	workerCommand?: string[];
	/** Kill the worker when no heartbeat or event arrives within this delay. */
	silence_timeout_ms?: number;
	grace_ms?: number;
	/** Extra environment given to the worker (PATH, HOME). The ledger path is never included. */
	env?: Record<string, string>;
	/**
	 * Pi's model surface, which the host hands to the extension. Without it nothing can be consulted
	 * about the model, and nothing is claimed of it.
	 */
	catalogue?: PiModelCatalogue | null;
}

function defaultWorkerCommand(): string[] {
	const here = fileURLToPath(import.meta.url);
	const ext = here.endsWith(".ts") ? ".ts" : ".js";
	return [process.execPath, join(dirname(here), `worker-main${ext}`)];
}

/**
 * Intervention supervisor (CMP-INT): starts a confined Pi worker per intervention, relays its
 * closed-set events, enforces silence timeouts and cancellation, and never lets the worker reach
 * the normative storage (AT-04).
 */
export class PiWorkerAgent implements AgentPort {
	private readonly options: Required<
		Pick<SupervisorOptions, "config" | "workerCommand" | "silence_timeout_ms" | "grace_ms" | "env">
	>;
	private readonly description: PiModelDescription;
	constructor(options: SupervisorOptions) {
		this.options = {
			workerCommand: defaultWorkerCommand(),
			silence_timeout_ms: 60_000,
			grace_ms: 3_000,
			env: {},
			...options,
		};
		this.description = new PiModelDescription(options.catalogue ?? null);
	}

	async describeCapabilities(model: ModelSelection): Promise<AgentCapabilities> {
		return this.description.describe(model);
	}

	async startIntervention(mandate: InterventionMandate): Promise<InterventionHandle> {
		const [file, ...args] = this.options.workerCommand;
		const env: Record<string, string> = {
			PATH: process.env.PATH ?? "",
			HOME: process.env.HOME ?? "",
			...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
			...this.options.env,
		};
		const child: ChildProcess = spawn(file!, args, {
			cwd: mandate.workspace_path,
			env,
			stdio: ["pipe", "pipe", "pipe"],
			detached: process.platform !== "win32",
		});
		const queue: InterventionEvent[] = [];
		let done = false;
		let notify: (() => void) | null = null;
		const push = (e: InterventionEvent) => {
			queue.push(e);
			if (e.type === "completed" || e.type === "failed" || e.type === "cancelled") done = true;
			notify?.();
		};
		const counters = () => ({
			tool_calls: toolCalls,
			duration_ms: Date.now() - startedAt,
			tokens_known: 0,
			delegations: 0,
		});
		const startedAt = Date.now();
		let toolCalls = 0;
		let lastSignal = Date.now();
		const killGroup = (sig: NodeJS.Signals) => {
			try {
				if (process.platform !== "win32" && child.pid) process.kill(-child.pid, sig);
				else child.kill(sig);
			} catch {
				/* gone */
			}
		};
		const silence = setInterval(() => {
			if (done) return;
			if (Date.now() - lastSignal > this.options.silence_timeout_ms) {
				push({
					type: "failed",
					at: new Date().toISOString(),
					error: `worker silent for more than ${this.options.silence_timeout_ms} ms`,
					counters: counters(),
				});
				killGroup("SIGTERM");
				setTimeout(() => killGroup("SIGKILL"), this.options.grace_ms).unref();
			}
		}, 1000);
		silence.unref();
		const stderrChunks: string[] = [];
		child.stderr?.on("data", (d: Buffer) => {
			if (stderrChunks.join("").length < 20_000) stderrChunks.push(d.toString("utf8"));
		});
		const rl = createInterface({ input: child.stdout!, crlfDelay: Number.POSITIVE_INFINITY });
		rl.on("line", (line) => {
			if (!line.trim()) return;
			lastSignal = Date.now();
			let msg: WorkerMessage;
			try {
				msg = JSON.parse(line) as WorkerMessage;
			} catch {
				return;
			}
			if (msg.type === "event") {
				if (msg.event.type === "tool_started") toolCalls++;
				push(msg.event);
			}
		});
		child.on("error", (error) =>
			push({
				type: "failed",
				at: new Date().toISOString(),
				error: `worker spawn error: ${error.message}`,
				counters: counters(),
			}),
		);
		child.on("close", (code, sig) => {
			clearInterval(silence);
			if (!done)
				push({
					type: "failed",
					at: new Date().toISOString(),
					error: `worker exited (${code ?? sig}) without a terminal event${stderrChunks.length ? `: ${stderrChunks.join("").slice(-2000)}` : ""}`,
					counters: counters(),
				});
		});
		const message: SupervisorMessage = { type: "mandate", mandate, config: this.options.config };
		child.stdin?.write(`${JSON.stringify(message)}\n`);
		const events: AsyncIterable<InterventionEvent> = {
			[Symbol.asyncIterator]: () => ({
				next: async (): Promise<IteratorResult<InterventionEvent>> => {
					while (queue.length === 0) {
						if (done) return { value: undefined, done: true };
						await new Promise<void>((r) => {
							notify = r;
						});
						notify = null;
					}
					return { value: queue.shift()!, done: false };
				},
			}),
		};
		return {
			intervention_id: mandate.intervention_id,
			events,
			abort: async (reason: string) => {
				if (done) return;
				try {
					child.stdin?.write(`${JSON.stringify({ type: "abort", reason } satisfies SupervisorMessage)}\n`);
				} catch {
					/* stdin closed */
				}
				setTimeout(() => {
					if (!done) killGroup("SIGTERM");
				}, this.options.grace_ms).unref();
				setTimeout(() => {
					if (!done) killGroup("SIGKILL");
				}, this.options.grace_ms * 2).unref();
			},
		};
	}
}
