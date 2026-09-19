/**
 * JSONL protocol between the supervisor (trusted) and a Pi worker process (confined), ADR-007.
 * Every line is one JSON object with a `type`. The worker never receives the ledger path.
 */
import type { InterventionMandate } from "../../ports/execution.ts";

export interface WorkerConfig {
	/** Root of the `@earendil-works/pi-coding-agent` package that loaded the extension. */
	pi_package_dir: string;
	/** Pi agent directory holding models.json and auth.json (credentials stay managed by Pi). */
	pi_agent_dir: string;
	sandbox_backend: "seatbelt" | "bubblewrap" | "unconfined";
	denied_read_paths: string[];
	heartbeat_ms: number;
}

export type SupervisorMessage = { type: "mandate"; mandate: InterventionMandate; config: WorkerConfig } | { type: "abort"; reason: string };

export type WorkerMessage =
	| { type: "ready"; pid: number; pi_version: string }
	| { type: "heartbeat"; at: string }
	| { type: "event"; event: import("../../ports/execution.ts").InterventionEvent }
	| { type: "log"; level: "info" | "warn" | "error"; message: string };

export { ProducerReport, ReviewReport, ObservationReport, SpecificationReport, OUTPUT_SCHEMAS, TOOLS_FOR_ROLE, extractJsonOutput, normalizeOutput, retainedRefusedText } from "../../contracts/v1/reports.ts";
export type { ProducerReport as ProducerReportType, ReviewReport as ReviewReportType, ObservationReport as ObservationReportType, SpecificationReport as SpecificationReportType } from "../../contracts/v1/reports.ts";
