/**
 * Pi worker process entry (ADR-004, ADR-008, D-05, D-11).
 *
 * Reads one `mandate` line on stdin, creates a Pi SDK session with an explicit, empty resource
 * loader (no skills, no AGENTS.md, no project extensions), explicit tools confined to the
 * workspace, the exact model of the mandate (no fallback), and streams closed-set events as JSONL
 * on stdout. It knows nothing about the ledger.
 */
import { createInterface } from "node:readline";
import { realpath, mkdir, readFile, writeFile, access, stat, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, resolve, dirname, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Value } from "typebox/value";
import type { InterventionEvent, InterventionMandate, SandboxPort } from "../../ports/execution.ts";
import { SeatbeltSandbox, BubblewrapSandbox, UnconfinedSandbox } from "../sandbox/backends.ts";
import { digestValue } from "../../contracts/digest.ts";
import { observeSessionEvent, type SessionEventRead } from "./session-observer.ts";
import {
	OUTPUT_SCHEMAS,
	TOOLS_FOR_ROLE,
	extractJsonOutput,
	normalizeOutput,
	retainedRefusedText,
	type SupervisorMessage,
	type WorkerConfig,
	type WorkerMessage,
} from "./protocol.ts";

const send = (m: WorkerMessage) => process.stdout.write(`${JSON.stringify(m)}\n`);
const now = () => new Date().toISOString();

class PathGuard {
	private readonly root: string;
	constructor(root: string) {
		this.root = root;
	}
	async inside(absolutePath: string, forWrite: boolean): Promise<string> {
		const resolved = resolve(absolutePath);
		let real: string;
		try {
			real = await realpath(resolved);
		} catch {
			if (!forWrite) throw new Error(`path not readable: ${absolutePath}`);
			real = join(
				await realpath(dirname(resolved)).catch(() => {
					throw new Error(`parent directory outside the workspace or missing: ${absolutePath}`);
				}),
				resolved.slice(dirname(resolved).length),
			);
		}
		const rel = relative(this.root, real);
		if (rel.startsWith("..") || rel.split(sep)[0] === "..")
			throw new Error(`path outside the workspace is not allowed: ${absolutePath}`);
		return real;
	}
}

async function main(): Promise<void> {
	const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
	let mandate: InterventionMandate | null = null;
	let abortRequested: string | null = null;
	let truncated = false;
	let sessionRef: { abort: () => Promise<void> } | null = null;
	rl.on("line", (line) => {
		if (!line.trim()) return;
		let msg: SupervisorMessage;
		try {
			msg = JSON.parse(line) as SupervisorMessage;
		} catch {
			send({ type: "log", level: "warn", message: "unparseable supervisor line ignored" });
			return;
		}
		if (msg.type === "mandate" && !mandate) {
			mandate = msg.mandate;
			void run(msg.mandate, msg.config);
		} else if (msg.type === "abort") {
			abortRequested = msg.reason;
			void sessionRef?.abort();
		}
	});
	process.on("SIGTERM", () => {
		abortRequested = "SIGTERM";
		void sessionRef?.abort();
	});

	async function run(m: InterventionMandate, c: WorkerConfig): Promise<void> {
		const started = Date.now();
		const counters = { tool_calls: 0, duration_ms: 0, tokens_known: 0, delegations: 0 };
		const heartbeat = setInterval(() => send({ type: "heartbeat", at: now() }), c.heartbeat_ms).unref();
		const finish = (event: InterventionEvent) => {
			counters.duration_ms = Date.now() - started;
			send({ type: "event", event });
			clearInterval(heartbeat);
			setTimeout(() => process.exit(0), 50);
		};
		try {
			const pi = (await import(
				pathToFileURL(join(c.pi_package_dir, "dist", "index.js")).href
			)) as typeof import("@earendil-works/pi-coding-agent");
			send({ type: "ready", pid: process.pid, pi_version: pi.VERSION });
			const modelRuntime = await pi.ModelRuntime.create({
				authPath: join(c.pi_agent_dir, "auth.json"),
				modelsPath: join(c.pi_agent_dir, "models.json"),
			});
			const model = modelRuntime.getModel(m.model.provider_id, m.model.model_id);
			if (!model) {
				finish({
					type: "failed",
					at: now(),
					error: `model ${m.model.provider_id}/${m.model.model_id} is not configured in Pi; no fallback is attempted (RM-022)`,
					counters,
				});
				return;
			}
			const available = await modelRuntime.getAvailable(m.model.provider_id);
			if (!available.some((x) => x.id === model.id)) {
				finish({
					type: "failed",
					at: now(),
					error: `model ${m.model.provider_id}/${m.model.model_id} has no valid authentication in Pi`,
					counters,
				});
				return;
			}
			const workspace = await realpath(m.workspace_path);
			const guard = new PathGuard(workspace);
			const sandbox: SandboxPort =
				c.sandbox_backend === "seatbelt"
					? new SeatbeltSandbox({ denied_read_paths: c.denied_read_paths })
					: c.sandbox_backend === "bubblewrap"
						? new BubblewrapSandbox({ denied_read_paths: c.denied_read_paths })
						: new UnconfinedSandbox();
			const allowed = new Set(m.tools.length > 0 ? m.tools : TOOLS_FOR_ROLE[m.role]);
			const budgetCheck = () => {
				counters.tool_calls++;
				if (counters.tool_calls > m.budgets.tool_calls) {
					truncated = true;
					throw new Error(`tool call budget exhausted (${m.budgets.tool_calls}); the intervention stops`);
				}
				if (Date.now() - started > m.budgets.duration_ms) {
					truncated = true;
					throw new Error("intervention duration budget exhausted");
				}
			};
			// Tool definitions are generic over their parameter schema; the wrapper only touches `execute`.
			// biome-ignore lint/suspicious/noExplicitAny: heterogeneous Pi tool definitions
			type AnyTool = import("@earendil-works/pi-coding-agent").ToolDefinition<any, any, any>;
			const customTools: AnyTool[] = [];
			const wrap = (tool: AnyTool): AnyTool => ({
				...tool,
				execute: async (
					id: string,
					params: unknown,
					signal: AbortSignal | undefined,
					onUpdate: unknown,
					ctx: unknown,
				): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>> => {
					send({
						type: "event",
						event: { type: "tool_started", at: now(), tool: tool.name, call_id: id, args_digest: digestValue(params) },
					});
					let blocked = false;
					try {
						budgetCheck();
						const result = await (
							tool.execute as (
								a: string,
								b: unknown,
								c: unknown,
								d: unknown,
								e: unknown,
							) => Promise<import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>>
						)(id, params, signal, onUpdate, ctx);
						send({
							type: "event",
							event: { type: "tool_finished", at: now(), tool: tool.name, call_id: id, is_error: false, blocked },
						});
						return result;
					} catch (error) {
						blocked = /outside the workspace|budget exhausted|not allowed/.test((error as Error).message);
						send({
							type: "event",
							event: { type: "tool_finished", at: now(), tool: tool.name, call_id: id, is_error: true, blocked },
						});
						if (/budget exhausted/.test((error as Error).message)) void session?.abort();
						throw error;
					}
				},
			});
			const readOps = {
				readFile: async (p: string) => readFile(await guard.inside(p, false)),
				access: async (p: string) => {
					await access(await guard.inside(p, false), fsConstants.R_OK);
				},
			};
			if (allowed.has("read")) customTools.push(wrap(pi.createReadToolDefinition(workspace, { operations: readOps })));
			if (allowed.has("write"))
				customTools.push(
					wrap(
						pi.createWriteToolDefinition(workspace, {
							operations: {
								writeFile: async (p: string, content: string) => writeFile(await guard.inside(p, true), content),
								mkdir: async (d: string) => {
									await mkdir(await guard.inside(d, true), { recursive: true });
								},
							},
						}),
					),
				);
			if (allowed.has("edit"))
				customTools.push(
					wrap(
						pi.createEditToolDefinition(workspace, {
							operations: {
								readFile: async (p: string) => readFile(await guard.inside(p, false)),
								writeFile: async (p: string, content: string) => writeFile(await guard.inside(p, true), content),
								access: async (p: string) => {
									await access(await guard.inside(p, true), fsConstants.R_OK | fsConstants.W_OK);
								},
							},
						}),
					),
				);
			if (allowed.has("ls"))
				customTools.push(
					wrap(
						pi.createLsToolDefinition(workspace, {
							operations: {
								exists: async (p: string) => {
									try {
										await guard.inside(p, false);
										return true;
									} catch {
										return false;
									}
								},
								stat: async (p: string) => stat(await guard.inside(p, false)),
								readdir: async (p: string) => readdir(await guard.inside(p, false)),
							} as never,
						}),
					),
				);
			if (allowed.has("find")) customTools.push(wrap(pi.createFindToolDefinition(workspace)));
			if (allowed.has("grep"))
				customTools.push(
					wrap(
						pi.createGrepToolDefinition(workspace, {
							operations: {
								isDirectory: async (p: string) => (await stat(await guard.inside(p, false))).isDirectory(),
								readFile: async (p: string) => readFile(await guard.inside(p, false), "utf8"),
							},
						}),
					),
				);
			if (allowed.has("bash")) {
				customTools.push(
					wrap(
						pi.createBashToolDefinition(workspace, {
							exposeSessionEnvironment: false,
							operations: {
								exec: async (
									command: string,
									cwd: string,
									options: { onData: (d: Buffer) => void; signal?: AbortSignal; timeout?: number },
								) => {
									const safeCwd = await guard.inside(cwd, false);
									const obs = await sandbox.run(
										{
											...m.profile,
											write_paths: m.profile.write_paths.length > 0 ? m.profile.write_paths : [workspace],
										},
										{
											command: ["/bin/bash", "-c", command],
											cwd: safeCwd,
											timeout_ms: Math.min(options.timeout ?? 300_000, 300_000),
											max_output_bytes: 512 * 1024,
										},
										options.signal,
									);
									if (obs.stdout.byteLength > 0) options.onData(Buffer.from(obs.stdout));
									if (obs.stderr.byteLength > 0) options.onData(Buffer.from(obs.stderr));
									if (obs.spawn_error) options.onData(Buffer.from(`\n[495] ${obs.spawn_error}\n`));
									return { exitCode: obs.timed_out ? null : obs.exit_code };
								},
							},
						}),
					),
				);
			}
			const resourceLoader: import("@earendil-works/pi-coding-agent").ResourceLoader = {
				getExtensions: () => ({ extensions: [], errors: [], runtime: pi.createExtensionRuntime() }),
				getSkills: () => ({ skills: [], diagnostics: [] }),
				getPrompts: () => ({ prompts: [], diagnostics: [] }),
				getThemes: () => ({ themes: [], diagnostics: [] }),
				getAgentsFiles: () => ({ agentsFiles: [] }),
				getSystemPrompt: () => m.system_prompt,
				getSystemPromptSource: () => undefined,
				getAppendSystemPrompt: () => [],
				getAppendSystemPromptSources: () => [],
				extendResources: () => {},
				reload: async () => {},
			};
			const settingsManager = pi.SettingsManager.inMemory({
				compaction: { enabled: true },
				retry: { enabled: true, maxRetries: 2 },
			});
			const { session } = await pi.createAgentSession({
				cwd: workspace,
				agentDir: c.pi_agent_dir,
				model,
				thinkingLevel: m.model.thinking_level as never,
				modelRuntime,
				resourceLoader,
				noTools: "all",
				tools: customTools.map((t) => t.name),
				customTools,
				sessionManager: pi.SessionManager.inMemory(workspace),
				settingsManager,
			});
			sessionRef = session;
			if (abortRequested) {
				finish({ type: "cancelled", at: now(), counters });
				return;
			}
			let finalText = "";
			let lastError: string | undefined;
			session.subscribe((event) => {
				const observed = observeSessionEvent(event as unknown as SessionEventRead, now());
				counters.tokens_known += observed.tokens;
				for (const observation of observed.events) send({ type: "event", event: observation });
				if (observed.text !== undefined) finalText = observed.text;
				if (observed.error !== undefined) lastError = observed.error;
			});
			send({ type: "event", event: { type: "started", at: now() } });
			// The duration budget suspends the work; it does not condemn it. The partial tree stays in
			// the workspace and the kernel is told the session was cut short (never "completed").
			const deadline = setTimeout(() => {
				truncated = true;
				void session.abort();
			}, m.budgets.duration_ms).unref();
			try {
				await session.prompt(m.prompt);
			} finally {
				clearTimeout(deadline);
			}
			const schema = OUTPUT_SCHEMAS[m.output_schema];
			const extracted = extractJsonOutput(finalText);
			const output = extracted === undefined ? undefined : normalizeOutput(schema, extracted);
			const outputValid = output !== undefined && Value.Check(schema, output);
			session.dispose();
			if (abortRequested) finish({ type: "cancelled", at: now(), counters });
			else if (lastError && !finalText) finish({ type: "failed", at: now(), error: lastError, counters });
			else
				finish({
					type: "completed",
					at: now(),
					output: outputValid ? output : { raw: retainedRefusedText(finalText) },
					output_valid: outputValid,
					truncated,
					counters,
				});
		} catch (error) {
			finish({ type: "failed", at: now(), error: (error as Error).message, counters });
		}
	}
}

void main();
