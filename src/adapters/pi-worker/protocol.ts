/**
 * JSONL protocol between the supervisor (trusted) and a Pi worker process (confined), ADR-007.
 * Every line is one JSON object with a `type`. The worker never receives the ledger path.
 */
import { Type, type Static } from "typebox";
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

export const ProducerReport = Type.Object(
	{
		summary: Type.String({ minLength: 1 }),
		changed_paths: Type.Array(Type.String()),
		tests_claimed: Type.Boolean({ description: "the producer claims it ran tests; the kernel never trusts this" }),
		notes: Type.Array(Type.String()),
	},
	{ $id: "urn:495:contract:producer-report:1", additionalProperties: false },
);
export type ProducerReport = Static<typeof ProducerReport>;

export const ReviewReport = Type.Object(
	{
		conclusion: Type.Union([Type.Literal("approve"), Type.Literal("reject"), Type.Literal("consultative")]),
		findings: Type.Array(Type.Object({ path: Type.Union([Type.String(), Type.Null()]), line: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]), severity: Type.Union([Type.Literal("blocker"), Type.Literal("major"), Type.Literal("minor"), Type.Literal("info")]), expected: Type.String(), observed: Type.String(), requirement_id: Type.Union([Type.String(), Type.Null()]) }, { additionalProperties: false })),
		limits: Type.Array(Type.String()),
	},
	{ $id: "urn:495:contract:review-report:1", additionalProperties: false },
);
export type ReviewReport = Static<typeof ReviewReport>;

export const ObservationReport = Type.Object(
	{
		observations: Type.Array(Type.String()),
		interpretations: Type.Array(Type.String()),
		missing: Type.Array(Type.String()),
		technologies: Type.Array(Type.String()),
		build_commands: Type.Array(Type.String()),
		test_commands: Type.Array(Type.String()),
	},
	{ $id: "urn:495:contract:observation-report:1", additionalProperties: false },
);
export type ObservationReport = Static<typeof ObservationReport>;

export const SpecificationReport = Type.Object(
	{
		objective: Type.String({ minLength: 1 }),
		facts: Type.Array(Type.String()),
		assumptions: Type.Array(Type.String()),
		questions: Type.Array(Type.Object({ id: Type.String(), question: Type.String(), material: Type.Boolean() }, { additionalProperties: false })),
		out_of_scope: Type.Array(Type.String()),
		risks: Type.Array(Type.String()),
		requirements: Type.Array(Type.Object({ requirement_id: Type.String(), statement: Type.String(), mandatory: Type.Boolean(), criterion: Type.String(), category: Type.String() }, { additionalProperties: false })),
		design: Type.Object({ summary: Type.String(), components: Type.Array(Type.String()), interfaces: Type.Array(Type.String()), risks: Type.Array(Type.String()) }, { additionalProperties: false }),
	},
	{ $id: "urn:495:contract:specification-report:1", additionalProperties: false },
);
export type SpecificationReport = Static<typeof SpecificationReport>;

export const OUTPUT_SCHEMAS = { "producer-report": ProducerReport, "review-report": ReviewReport, "observation-report": ObservationReport, "specification-report": SpecificationReport } as const;

/** Extracts the last fenced JSON block (```json ... ```) or a trailing bare JSON object from a model text. */
export function extractJsonOutput(text: string): unknown | undefined {
	const fences = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/g)];
	for (let i = fences.length - 1; i >= 0; i--) {
		try {
			return JSON.parse(fences[i]![1]!);
		} catch {
			/* try earlier block */
		}
	}
	const start = text.lastIndexOf("{");
	if (start >= 0) {
		const candidate = text.slice(start);
		try {
			return JSON.parse(candidate);
		} catch {
			/* no bare json */
		}
	}
	return undefined;
}

export const TOOLS_FOR_ROLE: Record<InterventionMandate["role"], string[]> = {
	observe: ["read", "ls", "find", "grep"],
	specify: ["read", "ls", "find", "grep"],
	prepare: ["read", "write", "edit", "bash", "ls", "find", "grep"],
	implement: ["read", "write", "edit", "bash", "ls", "find", "grep"],
	verify: ["read", "ls", "find", "grep"],
	review: ["read", "ls", "find", "grep"],
	integrate: ["read", "ls", "find", "grep"],
};
