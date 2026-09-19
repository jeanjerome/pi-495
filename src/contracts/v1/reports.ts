/**
 * Contract v1 — structured outputs of agent interventions and the closed tool sets per role.
 * An output that does not validate is a proposal with `output_valid=false`, never a decision.
 */
import { Type, type Static } from "typebox";
import type { InterventionRole } from "./common.ts";

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
		answers: Type.Array(
			Type.Object(
				{
					question_id: Type.String(),
					observable: Type.Boolean({ description: "the answer fixes something a control can observe — a status, a message, a bound; false says explicitly that it fixes nothing observable" }),
					requirement_ids: Type.Array(Type.String(), { description: "the mandatory requirements of this report that carry the answer; empty only when observable is false" }),
				},
				{ additionalProperties: false },
			),
			{ description: "what this report did with each material question already answered: silence is not a declaration that an answer carries nothing" },
		),
		out_of_scope: Type.Array(Type.String()),
		risks: Type.Array(Type.String()),
		requirements: Type.Array(Type.Object({ requirement_id: Type.String(), statement: Type.String(), mandatory: Type.Boolean(), criterion: Type.String(), category: Type.String(), satisfied_by_reference: Type.Boolean({ description: "the project as it stands already behaves this way; false when the requirement asks for something it does not do yet" }) }, { additionalProperties: false })),
		design: Type.Object({ summary: Type.String(), components: Type.Array(Type.String()), interfaces: Type.Array(Type.String()), risks: Type.Array(Type.String()) }, { additionalProperties: false }),
	},
	{ $id: "urn:495:contract:specification-report:1", additionalProperties: false },
);
export type SpecificationReport = Static<typeof SpecificationReport>;

export const OUTPUT_SCHEMAS = { "producer-report": ProducerReport, "review-report": ReviewReport, "observation-report": ObservationReport, "specification-report": SpecificationReport } as const;

/**
 * Extracts the structured output of a model text: the last fenced block whose language is `json`
 * (or unlabelled) that parses, else a trailing bare JSON object. Fenced blocks of other languages
 * are skipped so that an earlier ```js example cannot swallow the report.
 */
export function extractJsonOutput(text: string): unknown | undefined {
	const lines = text.split(/\r?\n/);
	const blocks: { lang: string; body: string[] }[] = [];
	let open: { lang: string; body: string[] } | null = null;
	for (const line of lines) {
		const fence = /^\s*```(\w*)\s*$/.exec(line);
		if (fence) {
			if (open) { blocks.push(open); open = null; }
			else open = { lang: (fence[1] ?? "").toLowerCase(), body: [] };
			continue;
		}
		if (open) open.body.push(line);
	}
	if (open) blocks.push(open);
	for (let i = blocks.length - 1; i >= 0; i--) {
		const b = blocks[i]!;
		if (b.lang !== "" && b.lang !== "json" && b.lang !== "jsonc") continue;
		try {
			return JSON.parse(b.body.join("\n"));
		} catch {
			/* try an earlier block */
		}
	}
	const start = text.lastIndexOf("{");
	if (start >= 0) {
		try {
			return JSON.parse(text.slice(start));
		} catch {
			/* no bare json */
		}
	}
	return undefined;
}

/**
 * What the trace keeps of a model text whose structured output was refused. The reason a report
 * fails its schema is almost always at its end — a block left open, a key written last, a value cut
 * mid-string — so keeping only the head keeps the part that was already well formed and drops the
 * evidence: the dossier of a refused intervention then cannot say why it was refused. Both ends are
 * kept, the tail the larger of the two, and the cut is written in the text so no two kept fragments
 * read as contiguous. The head and the tail together honour `limit`; the line that names the cut is
 * the harness speaking, and is counted apart.
 */
export function retainedRefusedText(text: string, limit = 20_000, head = 8_000): string {
	if (text.length <= limit) return text;
	const kept = Math.min(head, limit);
	const tail = limit - kept;
	const elided = text.length - kept - tail;
	return `${text.slice(0, kept)}\n\n[... ${elided} characters elided by the harness: head and tail of the refused output are kept ...]\n\n${tail > 0 ? text.slice(text.length - tail) : ""}`;
}

/** Drops unknown properties and fills missing arrays with [] before validation (tolerant to small models). */
export function normalizeOutput(schema: import("typebox").TSchema, value: unknown): unknown {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	const props = (schema as { properties?: Record<string, { type?: string; properties?: unknown }> }).properties ?? {};
	const out: Record<string, unknown> = {};
	const v = value as Record<string, unknown>;
	for (const [key, sub] of Object.entries(props)) {
		let x = v[key];
		if (x === undefined || x === null) {
			if (sub.type === "array") x = [];
			else if (sub.type === "object") x = normalizeOutput(sub as import("typebox").TSchema, {});
			else if (sub.type === "string") x = x === null ? null : undefined;
			else if (sub.type === "boolean") x = false;
		} else if (sub.type === "object" && typeof x === "object" && !Array.isArray(x)) x = normalizeOutput(sub as import("typebox").TSchema, x);
		else if (sub.type === "array" && Array.isArray(x) && (sub as { items?: { type?: string } }).items?.type === "object") x = x.map((item) => normalizeOutput((sub as { items: import("typebox").TSchema }).items, item));
		if (x !== undefined) out[key] = x;
	}
	return out;
}

export const TOOLS_FOR_ROLE: Record<InterventionRole, string[]> = {
	observe: ["read", "ls", "find", "grep"],
	specify: ["read", "ls", "find", "grep"],
	prepare: ["read", "write", "edit", "bash", "ls", "find", "grep"],
	implement: ["read", "write", "edit", "bash", "ls", "find", "grep"],
	verify: ["read", "ls", "find", "grep"],
	review: ["read", "ls", "find", "grep"],
	integrate: ["read", "ls", "find", "grep"],
};
