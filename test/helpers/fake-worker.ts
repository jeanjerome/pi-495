/**
 * Fake worker speaking the supervisor protocol without Pi nor model. Behaviour is chosen by the
 * mandate objective: "complete", "invalid-output", "crash", "silent", "hang", "write-outside".
 */
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const send = (m: unknown) => process.stdout.write(`${JSON.stringify(m)}\n`);
const now = () => new Date().toISOString();
let aborted = false;
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
	const msg = JSON.parse(line) as { type: string; mandate?: { objective: string; workspace_path: string }; reason?: string };
	if (msg.type === "abort") { aborted = true; return; }
	if (msg.type !== "mandate" || !msg.mandate) return;
	const m = msg.mandate;
	send({ type: "ready", pid: process.pid, pi_version: "fake" });
	send({ type: "event", event: { type: "started", at: now() } });
	const counters = { tool_calls: 1, duration_ms: 5, tokens_known: 42, delegations: 0 };
	switch (m.objective) {
		case "crash":
			process.exit(3);
			break;
		case "silent":
			setInterval(() => {}, 1000);
			break;
		case "hang": {
			const t = setInterval(() => {
				send({ type: "heartbeat", at: now() });
				if (aborted) { clearInterval(t); send({ type: "event", event: { type: "cancelled", at: now(), counters } }); setTimeout(() => process.exit(0), 20); }
			}, 50);
			break;
		}
		case "invalid-output":
			send({ type: "event", event: { type: "completed", at: now(), output: { raw: "I did it, trust me" }, output_valid: false, counters } });
			setTimeout(() => process.exit(0), 20);
			break;
		default:
			writeFileSync(join(m.workspace_path, "from-worker.txt"), "written by fake worker\n");
			send({ type: "event", event: { type: "tool_started", at: now(), tool: "write", call_id: "c1", args_digest: "sha256:" + "0".repeat(64) } });
			send({ type: "event", event: { type: "tool_finished", at: now(), tool: "write", call_id: "c1", is_error: false, blocked: false } });
			send({ type: "event", event: { type: "completed", at: now(), output: { summary: "done", changed_paths: ["from-worker.txt"], tests_claimed: true, notes: [] }, output_valid: true, counters } });
			setTimeout(() => process.exit(0), 20);
	}
});
