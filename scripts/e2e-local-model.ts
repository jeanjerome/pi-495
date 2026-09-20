/**
 * Manual campaign (not part of the deterministic suites): runs one real implement intervention
 * with the locally configured Pi model on the F-TS fixture and prints the event stream.
 * Usage: node scripts/e2e-local-model.ts [provider/model]
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PiWorkerAgent } from "../src/adapters/pi-worker/supervisor.ts";
import { TOOLS_FOR_ROLE } from "../src/adapters/pi-worker/protocol.ts";
import type { InterventionMandate } from "../src/ports/execution.ts";
import { fixtureTs } from "../test/helpers/fixtures.ts";

const [provider, modelId] = (process.argv[2] ?? "omlx/qwen3.8-27b-oq8e").split("/") as [string, string];
mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
const ws = mkdtempSync(join(process.cwd(), "test-output", "e2e-"));
fixtureTs(ws);
const piDir = process.env.HARNESS495_PI_PACKAGE_DIR ?? "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent";
const agent = new PiWorkerAgent({ config: { pi_package_dir: piDir, pi_agent_dir: join(homedir(), ".pi", "agent"), sandbox_backend: process.platform === "darwin" ? "seatbelt" : "unconfined", denied_read_paths: [], heartbeat_ms: 5000 }, silence_timeout_ms: 300_000 });
const mandate: InterventionMandate = {
	intervention_id: "int_e2e",
	change_id: "chg_e2e",
	role: "implement",
	objective: "Make greet return 'Hello, <name>!' with a trailing exclamation mark",
	prompt: ["You work in the current directory, a small JavaScript project.", "Task: modify src/greet.js so that greet(name) returns `Hello, ${name}!` (with a trailing exclamation mark) and update test/greet.test.js to expect it.", "Use the read, edit, write and bash tools. Run `node --test` with bash to check.", "When finished, answer with a short summary followed by a fenced ```json block with exactly these fields: {\"summary\": string, \"changed_paths\": string[], \"tests_claimed\": boolean, \"notes\": string[]}."].join("\n"),
	system_prompt: "You are a careful software engineer working inside an isolated workspace. Only the workspace is writable. Do not attempt to access other directories or the network.",
	context: { role: "implement", objective: "greet", output_schema: "producer-report", trusted_instructions: ["workspace only"], adopted_refs: [], untrusted_excerpts: [], tools: TOOLS_FOR_ROLE.implement, exclusions: [], input_budget_bytes: 20000, output_reserve_tokens: 2000, truncations: [], prompt_digest: null },
	tools: TOOLS_FOR_ROLE.implement,
	profile: { profile_id: "implement", read_paths: [ws], write_paths: [ws], network: "denied", env_allowlist: ["PATH", "HOME", "TMPDIR"], env: {} },
	workspace_path: ws,
	model: { provider_id: provider, model_id: modelId, thinking_level: "low" },
	budgets: { duration_ms: 20 * 60_000, tool_calls: 40 },
	output_schema: "producer-report",
};
const started = Date.now();
const handle = await agent.startIntervention(mandate);
for await (const event of handle.events) {
	const t = ((Date.now() - started) / 1000).toFixed(1);
	if (event.type === "model_event") console.log(`[${t}s] model ${event.kind} ${event.tokens ?? ""}`);
	else if (event.type === "tool_started") console.log(`[${t}s] tool ${event.tool} start`);
	else if (event.type === "tool_finished") console.log(`[${t}s] tool ${event.tool} ${event.is_error ? "error" : "ok"}${event.blocked ? " BLOCKED" : ""}`);
	else console.log(`[${t}s] ${event.type} ${JSON.stringify(event).slice(0, 600)}`);
}
console.log("--- src/greet.js after intervention ---");
console.log(readFileSync(join(ws, "src", "greet.js"), "utf8"));
writeFileSync(join(ws, "E2E-DONE"), "1");
console.log("workspace:", ws);
