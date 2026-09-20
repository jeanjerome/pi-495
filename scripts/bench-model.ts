/**
 * Speed benchmark of the model endpoint the harness drives (manual, not part of the deterministic
 * suites). It reproduces the request shape of a 495 intervention rather than a generic prompt: the
 * system prompt and the context `buildContext` produces for a role, the tool schemas that role
 * exposes, the 60 000-byte input budget, and the growing tool-call conversation an intervention
 * turns into. Two models, or the same model under two server configurations, are then compared on
 * what the harness actually sends.
 *
 * Three regimes are measured separately because they do not scale together:
 *   - `prefill`  one cold request at a real context size; nothing of its prefix is cached.
 *   - `decode`   a short prompt and a long answer; generation isolated from prompt processing.
 *   - `agentic`  a conversation that grows one tool result at a time, which is where an
 *                intervention spends its life and where the prefix cache decides the cost.
 *
 * Usage: node scripts/bench-model.ts [--model provider/id] [--scenario all|prefill|decode|agentic]
 *                                    [--repeat N] [--turns N] [--out file.json] [--label text]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildContext } from "../src/application/context.ts";
import { TOOLS_FOR_ROLE } from "../src/contracts/v1/reports.ts";

// --- arguments ------------------------------------------------------------------------------------

function flag(name: string, fallback: string | null = null): string | null {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback;
}

const SCENARIO = flag("scenario", "all")!;
const REPEAT = Number(flag("repeat", "3"));
const TURNS = Number(flag("turns", "12"));
const OUT = flag("out");
const LABEL = flag("label", "");

// --- endpoint, read where pi reads it -------------------------------------------------------------

interface PiModel {
	id: string;
	contextWindow?: number;
	maxTokens?: number;
}
interface PiProvider {
	baseUrl: string;
	apiKey?: string;
	models?: PiModel[];
}

const agentDir = join(homedir(), ".pi", "agent");

function readJson<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

const settings = readJson<{ defaultProvider?: string; defaultModel?: string }>(join(agentDir, "settings.json")) ?? {};
const catalogue = readJson<{ providers?: Record<string, PiProvider> }>(join(agentDir, "models.json")) ?? {};
const [wantedProvider, wantedModel] = (
	flag("model") ?? `${settings.defaultProvider ?? ""}/${settings.defaultModel ?? ""}`
).split("/");
const provider = catalogue.providers?.[wantedProvider ?? ""];
if (!provider || !wantedModel) {
	console.error(`no provider "${wantedProvider}" with model "${wantedModel}" in ${join(agentDir, "models.json")}`);
	process.exit(1);
}
const BASE = provider.baseUrl.replace(/\/$/, "");
const HEADERS: Record<string, string> = { "Content-Type": "application/json" };
if (provider.apiKey) HEADERS.Authorization = `Bearer ${provider.apiKey}`;

// --- deterministic corpus -------------------------------------------------------------------------

/**
 * Pseudo-random but seeded, so the same run on another machine or another model sends byte-identical
 * prompts. A benchmark whose input drifts measures the input.
 */
function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

const WORDS = [
	"user",
	"name",
	"repository",
	"service",
	"domain",
	"adapter",
	"value",
	"identifier",
	"request",
	"response",
	"mapper",
	"entity",
	"record",
	"validation",
	"exception",
	"port",
	"handler",
	"factory",
	"builder",
	"context",
];

/** A Java-shaped source file of about `bytes` characters; the target stack of the real campaigns. */
function javaSource(seed: number, bytes: number, path: string): { source: string; text: string } {
	const rand = rng(seed);
	const pick = () => WORDS[Math.floor(rand() * WORDS.length)]!;
	const lines: string[] = [`package io.scalastic.demo.${pick()}.${pick()};`, "", `public class Generated${seed} {`];
	while (lines.join("\n").length < bytes) {
		const n = Math.floor(rand() * 4);
		if (n === 0) lines.push(`    private final String ${pick()}${Math.floor(rand() * 100)};`);
		else if (n === 1) lines.push(`    public String ${pick()}() { return this.${pick()} + "${pick()}"; }`);
		else if (n === 2) lines.push(`    // ${pick()} ${pick()} ${pick()} ${pick()} ${pick()}`);
		else
			lines.push(
				`    public void ${pick()}(String ${pick()}) { if (${pick()} == null) throw new ValidationException("${pick()}"); }`,
			);
	}
	lines.push("}");
	return { source: path, text: lines.join("\n").slice(0, bytes) };
}

const OBJECTIVE =
	"Refuser la création d'un utilisateur dont le nom dépasse 50 caractères, en cohérence avec la validation de nom existante du domaine";

const ADOPTED_MANDATE = JSON.stringify(
	{
		change_id: "chg_bench",
		objective: OBJECTIVE,
		scope: ["domain/src/main/java"],
		out_of_scope: ["infrastructure/src/main/resources"],
		assumptions: ["le mécanisme ValidationException existe"],
		open_questions: [],
		allowed_paths: ["domain/src/main/java", "domain/src/test/java"],
		integration: "disabled",
		language: "fr",
	},
	null,
	2,
);

const ADOPTED_REQUIREMENTS = JSON.stringify(
	{
		change_id: "chg_bench",
		requirements: Array.from({ length: 4 }, (_, i) => ({
			requirement_id: `R${i + 1}`,
			statement: `Exigence ${i + 1} sur la longueur du nom`,
			category: "fonctionnel",
			mandatory: true,
			criterion: `Un nom de plus de 50 caractères est refusé (cas ${i + 1})`,
			source: "demande",
			contract_family: null,
			satisfied_by_reference: false,
		})),
		assumptions: [],
		contract_families: {},
	},
	null,
	2,
);

/** The prompt a role really receives, built by the product's own context builder. */
function contextFor(role: "specify" | "implement"): { system: string; user: string } {
	const built = buildContext({
		role,
		objective: OBJECTIVE,
		language: "fr",
		adopted: [
			{ kind: "mandate", artifact_id: "mnd_bench", revision: 1, digest: "sha256:bench", text: ADOPTED_MANDATE },
			{
				kind: "requirements",
				artifact_id: "req_bench",
				revision: 1,
				digest: "sha256:bench",
				text: ADOPTED_REQUIREMENTS,
			},
		],
		untrusted: [],
		feedback: null,
		tools: TOOLS_FOR_ROLE[role],
		budget_bytes: 60_000,
		controls: [
			{ control_id: "maven-test", command: ["mvn", "-B", "-q", "-o", "test"], cwd: "." },
			{ control_id: "coverage", command: ["node", "-e", ""], cwd: "." },
		],
		boundaries: ["le module simple-domain ne déclare aucune dépendance sur simple-infrastructure"],
	});
	return { system: built.system_prompt, user: built.prompt };
}

// --- tool schemas ----------------------------------------------------------------------------------

/**
 * Definitions of the shape an intervention exposes. They approximate the host's own schemas — what
 * matters for a speed measurement is that their token cost is present and identical between runs.
 */
const TOOL_SCHEMAS: Record<string, unknown> = {
	read: {
		description: "Read a file from the workspace.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "Workspace-relative path" },
				offset: { type: "number" },
				limit: { type: "number" },
			},
			required: ["path"],
		},
	},
	write: {
		description: "Write a file in the workspace, creating parent directories.",
		parameters: {
			type: "object",
			properties: { path: { type: "string" }, content: { type: "string" } },
			required: ["path", "content"],
		},
	},
	edit: {
		description: "Replace an exact string in a workspace file.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string" },
				old_string: { type: "string" },
				new_string: { type: "string" },
				replace_all: { type: "boolean" },
			},
			required: ["path", "old_string", "new_string"],
		},
	},
	bash: {
		description: "Run a shell command in the workspace. The network is denied.",
		parameters: {
			type: "object",
			properties: { command: { type: "string" }, cwd: { type: "string" }, timeout: { type: "number" } },
			required: ["command"],
		},
	},
	ls: {
		description: "List a directory of the workspace.",
		parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
	},
	find: {
		description: "Find files by glob pattern in the workspace.",
		parameters: {
			type: "object",
			properties: { pattern: { type: "string" }, path: { type: "string" } },
			required: ["pattern"],
		},
	},
	grep: {
		description: "Search file contents by regular expression in the workspace.",
		parameters: {
			type: "object",
			properties: { pattern: { type: "string" }, path: { type: "string" }, glob: { type: "string" } },
			required: ["pattern"],
		},
	},
};

function toolsFor(role: "specify" | "implement"): unknown[] {
	return TOOLS_FOR_ROLE[role].map((name) => {
		const t = TOOL_SCHEMAS[name] as { description: string; parameters: unknown };
		return { type: "function", function: { name, description: t.description, parameters: t.parameters } };
	});
}

// --- one streamed request ---------------------------------------------------------------------------

interface Measure {
	scenario: string;
	turn: number;
	ttft_ms: number | null;
	total_ms: number;
	prompt_tokens: number;
	cached_tokens: number;
	completion_tokens: number;
	/** Prompt tokens the server had to process, cache hits removed. */
	prefill_tokens: number;
	prefill_tok_s: number | null;
	decode_tok_s: number | null;
	cached_ratio: number | null;
	usage: Record<string, unknown>;
	error?: string;
}

interface Message {
	role: string;
	content: string;
	tool_calls?: unknown[];
	tool_call_id?: string;
	name?: string;
}

async function call(
	scenario: string,
	turn: number,
	messages: Message[],
	maxTokens: number,
	tools: unknown[] | null,
	thinking: boolean,
): Promise<Measure> {
	const body: Record<string, unknown> = {
		model: wantedModel,
		messages,
		max_tokens: maxTokens,
		stream: true,
		stream_options: { include_usage: true },
		chat_template_kwargs: { enable_thinking: thinking },
	};
	if (tools) body.tools = tools;
	const started = performance.now();
	let ttft: number | null = null;
	let usage: Record<string, unknown> = {};
	let text = "";
	const failed = (message: string): Measure => ({
		scenario,
		turn,
		ttft_ms: null,
		total_ms: Math.round(performance.now() - started),
		prompt_tokens: 0,
		cached_tokens: 0,
		completion_tokens: 0,
		prefill_tokens: 0,
		prefill_tok_s: null,
		decode_tok_s: null,
		cached_ratio: null,
		usage: {},
		error: message,
	});
	// Three failures that look alike in a log and call for different actions: the endpoint is not
	// there, the endpoint answered and refused, or the answer broke mid-stream. Saying "unreachable"
	// for a server that replied sends the next operator looking in the wrong place.
	let res: Response;
	try {
		res = await fetch(`${BASE}/chat/completions`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
	} catch (error) {
		return failed(`point d'accès injoignable (${BASE}) : ${(error as Error).message}`);
	}
	if (!res.ok) {
		const raw = (await res.text()).trim();
		let detail = raw;
		try {
			const parsed = JSON.parse(raw) as { error?: { message?: string; type?: string } };
			if (parsed.error?.message) detail = parsed.error.message;
		} catch {
			/* the server did not answer json; the raw body is what there is */
		}
		return failed(
			`le serveur a répondu HTTP ${res.status} — ${detail.length > 600 ? `${detail.slice(0, 600)}…` : detail}`,
		);
	}
	if (!res.body) return failed(`le serveur a répondu HTTP ${res.status} sans corps à lire`);
	try {
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
				const line = buffer.slice(0, nl).trim();
				buffer = buffer.slice(nl + 1);
				if (!line.startsWith("data:")) continue;
				const payload = line.slice(5).trim();
				if (payload === "[DONE]") continue;
				let chunk: {
					choices?: { delta?: { content?: string; reasoning_content?: string } }[];
					usage?: Record<string, unknown>;
				};
				try {
					chunk = JSON.parse(payload) as typeof chunk;
				} catch {
					continue;
				}
				const delta = chunk.choices?.[0]?.delta;
				const piece = (delta?.content ?? "") + (delta?.reasoning_content ?? "");
				// The first token the server emits, thinking included: that is when prefill ended.
				if (piece.length > 0 && ttft === null) ttft = performance.now() - started;
				text += piece;
				if (chunk.usage) usage = chunk.usage;
			}
		}
	} catch (error) {
		return failed(`flux interrompu après ${Math.round(performance.now() - started)} ms : ${(error as Error).message}`);
	}
	const total = performance.now() - started;
	const prompt = Number(usage.prompt_tokens ?? 0);
	const details = (usage.prompt_tokens_details ?? {}) as Record<string, unknown>;
	const cached = Number(details.cached_tokens ?? 0);
	const completion = Number(usage.completion_tokens ?? 0);
	const prefill = Math.max(0, prompt - cached);
	return {
		scenario,
		turn,
		ttft_ms: ttft === null ? null : Math.round(ttft),
		total_ms: Math.round(total),
		prompt_tokens: prompt,
		cached_tokens: cached,
		completion_tokens: completion,
		prefill_tokens: prefill,
		// Below a thousand tokens the time to first token is scheduling, not prompt processing:
		// reporting a rate there would look like a measurement without being one.
		prefill_tok_s: ttft !== null && ttft > 0 && prefill >= 1000 ? Math.round((prefill / ttft) * 1000) : null,
		decode_tok_s:
			ttft !== null && total > ttft && completion > 0
				? Math.round((completion / (total - ttft)) * 1000 * 10) / 10
				: null,
		cached_ratio: prompt > 0 ? Math.round((cached / prompt) * 1000) / 1000 : null,
		usage,
		...(text.length === 0 ? { error: "empty completion" } : {}),
	};
}

// --- scenarios ---------------------------------------------------------------------------------------

/** A cold prefix: the nonce sits first, so no cached prefix can be reused from an earlier run. */
async function prefillScenario(): Promise<Measure[]> {
	const ctx = contextFor("specify");
	const out: Measure[] = [];
	for (let i = 0; i < REPEAT; i++) {
		const nonce = `run-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`;
		const messages: Message[] = [
			{ role: "system", content: `[bench nonce ${nonce}]\n${ctx.system}` },
			{ role: "user", content: ctx.user },
		];
		out.push(await call("prefill", i, messages, 32, toolsFor("specify"), true));
	}
	return out;
}

/** Generation isolated: a prompt small enough that prefill is negligible, and a long answer. */
async function decodeScenario(): Promise<Measure[]> {
	const out: Measure[] = [];
	for (let i = 0; i < REPEAT; i++) {
		const messages: Message[] = [
			{ role: "system", content: "Tu es un ingénieur logiciel. Réponds en prose continue, sans listes." },
			{
				role: "user",
				content: `Décris en détail, en français, la démarche de vérification d'un changement logiciel : spécification, conception de la vérification, production, contrôle. Écris un texte long et continu. [variante ${i}]`,
			},
		];
		out.push(await call("decode", i, messages, 768, null, false));
	}
	return out;
}

/**
 * The regime an intervention lives in: a stable prefix and one tool result appended per turn. The
 * real campaign served 88 % of its prompt tokens from the prefix cache, so a benchmark that only
 * measured cold prompts would describe a workload the harness never runs.
 */
async function agenticScenario(): Promise<Measure[]> {
	const ctx = contextFor("implement");
	const tools = toolsFor("implement");
	// The prefix must be unique to this run. It is identical from one run to the next otherwise, and
	// the SSD cache outlives a run: a second measurement of the same model would inherit the blocks
	// of the first and read as faster than it is. Inside the run the prefix stays byte-identical, so
	// the cache is still exercised — which is the point of this scenario.
	const nonce = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const messages: Message[] = [
		{ role: "system", content: `[bench nonce ${nonce}]\n${ctx.system}` },
		{ role: "user", content: ctx.user },
	];
	const out: Measure[] = [];
	for (let turn = 0; turn < TURNS; turn++) {
		const m = await call("agentic", turn, messages, 64, tools, true);
		out.push(m);
		// The assistant asked for a file and the harness answered: the conversation grows by one
		// exchange, and every earlier token stays byte-identical so the prefix cache can serve it.
		const file = javaSource(100 + turn, 4000, `domain/src/main/java/io/scalastic/demo/user/domain/Read${turn}.java`);
		messages.push({ role: "assistant", content: `Je lis ${file.source}.` });
		messages.push({ role: "user", content: `[tool read ${file.source}]\n${file.text}` });
	}
	return out;
}

// --- configuration fingerprint --------------------------------------------------------------------

/** What was in force when the numbers were taken; without it a comparison names nothing. */
async function fingerprint(): Promise<Record<string, unknown>> {
	const out: Record<string, unknown> = { base_url: BASE, provider: wantedProvider, model: wantedModel };
	try {
		const res = await fetch(`${BASE.replace(/\/v1$/, "")}/admin/api/models`, { headers: HEADERS });
		if (!res.ok) return { ...out, admin: `HTTP ${res.status}` };
		const body = (await res.json()) as { models?: Record<string, unknown>[] };
		const entry = (body.models ?? []).find((m) => {
			const s = (m.settings ?? {}) as Record<string, unknown>;
			return m.id === wantedModel || s.model_alias === wantedModel;
		});
		if (!entry) return { ...out, admin: "model not found in admin listing" };
		const s = (entry.settings ?? {}) as Record<string, unknown>;
		return {
			...out,
			resolved_id: entry.id,
			engine_type: entry.engine_type,
			model_type: entry.model_type,
			active_profile_name: s.active_profile_name ?? null,
			model_alias: s.model_alias ?? null,
			settings: s,
		};
	} catch (error) {
		return { ...out, admin: (error as Error).message };
	}
}

// --- aggregation -------------------------------------------------------------------------------------

function median(values: number[]): number | null {
	const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
	if (v.length === 0) return null;
	const mid = Math.floor(v.length / 2);
	return v.length % 2 === 1 ? v[mid]! : Math.round(((v[mid - 1]! + v[mid]!) / 2) * 10) / 10;
}

function summarize(rows: Measure[]): Record<string, unknown> {
	const ok = rows.filter((r) => !r.error);
	return {
		runs: rows.length,
		errors: rows.length - ok.length,
		ttft_ms_median: median(ok.map((r) => r.ttft_ms ?? NaN)),
		prefill_tokens_median: median(ok.map((r) => r.prefill_tokens)),
		prefill_tok_s_median: median(ok.map((r) => r.prefill_tok_s ?? NaN)),
		decode_tok_s_median: median(ok.map((r) => r.decode_tok_s ?? NaN)),
		cached_ratio_median: median(ok.map((r) => r.cached_ratio ?? NaN)),
		prompt_tokens_median: median(ok.map((r) => r.prompt_tokens)),
		completion_tokens_median: median(ok.map((r) => r.completion_tokens)),
		total_ms_median: median(ok.map((r) => r.total_ms)),
	};
}

// --- run ----------------------------------------------------------------------------------------------

const wanted = SCENARIO === "all" ? ["prefill", "decode", "agentic"] : [SCENARIO];
const config = await fingerprint();
console.error(
	`endpoint ${BASE} · model ${wantedModel} · engine ${String(config.engine_type ?? "?")} · profil ${String(config.active_profile_name ?? "aucun")}`,
);

// A model the server has not loaded yet answers its first request with the load in it — on this
// machine some thirty seconds of weights and ANE warm-up. Measured, that would be charged to the
// first prompt of whichever scenario ran first, and two runs would compare a cold load with a warm
// one. One unmeasured request pays for it.
{
	const warm = await call("warmup", 0, [{ role: "user", content: "ok" }], 4, null, false);
	const loaded = Number(warm.usage.model_load_duration ?? 0);
	if (warm.error) {
		console.error(`préchauffage refusé : ${warm.error}`);
		// A model whose load failed is still listed by /v1/models and carries no flag in the admin
		// listing, so nothing short of a request reveals it. The refusal is the diagnosis.
		console.error("rien n'est mesuré : aucune ligne de ce passage ne serait comparable.");
		process.exit(1);
	}
	console.error(
		`préchauffage: ${(warm.total_ms / 1000).toFixed(1)} s${loaded > 0 ? ` dont ${loaded.toFixed(1)} s de chargement` : " (modèle déjà résident)"}`,
	);
}

const rows: Measure[] = [];
for (const name of wanted) {
	console.error(`— scénario ${name} …`);
	if (name === "prefill") rows.push(...(await prefillScenario()));
	else if (name === "decode") rows.push(...(await decodeScenario()));
	else if (name === "agentic") rows.push(...(await agenticScenario()));
	else {
		console.error(`scénario inconnu: ${name}`);
		process.exit(1);
	}
}

const summaries: Record<string, unknown> = {};
for (const name of wanted) summaries[name] = summarize(rows.filter((r) => r.scenario === name));

const report = {
	label: LABEL,
	at: new Date().toISOString(),
	config,
	parameters: { repeat: REPEAT, turns: TURNS, input_budget_bytes: 60_000 },
	summaries,
	rows,
};

const fmt = (v: unknown): string => (v === null || v === undefined ? "—" : String(v));
console.error("");
console.error("scénario  | TTFT ms | prefill tok | prefill tok/s | decode tok/s | cache | prompt tok");
console.error("----------|---------|-------------|---------------|--------------|-------|-----------");
for (const name of wanted) {
	const s = summaries[name] as Record<string, unknown>;
	console.error(
		`${name.padEnd(9)} | ${fmt(s.ttft_ms_median).padStart(7)} | ${fmt(s.prefill_tokens_median).padStart(11)} | ${fmt(s.prefill_tok_s_median).padStart(13)} | ${fmt(s.decode_tok_s_median).padStart(12)} | ${fmt(s.cached_ratio_median).padStart(5)} | ${fmt(s.prompt_tokens_median).padStart(9)}`,
	);
}
const failed = rows.filter((r) => r.error);
if (failed.length > 0)
	console.error(`\n${failed.length} requête(s) en échec : ${[...new Set(failed.map((r) => r.error))].join(" ; ")}`);
console.error("\nLe serveur impose ses propres paramètres d'échantillonnage (force_sampling) : la longueur des");
console.error("réponses varie d'un passage à l'autre, d'où les médianes plutôt que des valeurs uniques.");

if (OUT) {
	writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
	console.error(`\nrapport écrit: ${OUT}`);
} else {
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
