/**
 * Manual campaign instrument (not part of the deterministic suites): reads two dossiers back from
 * their own ledger and object store — read-only, and without opening Pi — then says whether the
 * same contract case was rendered on both.
 *
 * What decides, and what is only told apart:
 *
 *  - The contract rendered decides: the outcome, the gates decided and their verdicts, the
 *    reference the candidate stands on, the paths that candidate changed, and the verdict of every
 *    control. A difference in any of them means the recipe is not held, and the exit code says so.
 *  - The path taken is stated and held against neither side: interventions, tool calls, durations,
 *    tokens, attempts, what the output schema refused, what the host rewrote of the context, how
 *    each requirement was worded, and what each changed file ended up containing. Two models do not
 *    write the same code, and a comparison demanding they did would refuse every pair of providers
 *    rather than the ones that actually disagree.
 *
 * Usage: node scripts/compare-dossiers.ts --local <dossier dir> --distant <dossier dir>
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CandidateManifest } from "../src/contracts/v1/candidate.ts";
import type { ChangeState } from "../src/domain/change/state.ts";
import type { InterventionEvent } from "../src/ports/execution.ts";

interface ChangedEntry {
	path: string;
	baseline_state: string;
	content_digest: string;
	size: number;
}

interface Refusal {
	role: string;
	detail: string;
}

interface Compaction {
	role: string;
	reason: string;
	tokens_before: number | null;
	tokens_after: number | null;
	summary_tokens: number;
	unwritten: string | null;
}

interface Dossier {
	label: string;
	root: string;
	state: ChangeState;
	models: string[];
	base_digest: string | null;
	changed: ChangedEntry[];
	refusals: Refusal[];
	compactions: Compaction[];
}

/** The output artifact an intervention leaves behind: its terminal transition and its kept events. */
interface OutputArtifact {
	intervention_id: string;
	role: string;
	terminal: InterventionEvent;
	events: InterventionEvent[];
}

function fail(message: string): never {
	console.error(message);
	process.exit(2);
}

function argument(name: string): string {
	const at = process.argv.indexOf(`--${name}`);
	const value = at >= 0 ? process.argv[at + 1] : undefined;
	if (value === undefined || value.startsWith("--"))
		fail("usage: node scripts/compare-dossiers.ts --local <dossier dir> --distant <dossier dir>");
	return value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
}

/** A path under the home directory is shown the way the owner writes it. */
function tilde(path: string): string {
	return path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path;
}

/** Thousands are separated, because these numbers are read rather than computed with. */
function count(value: number): string {
	return value.toLocaleString("en-US");
}

/** A digest is shown by its first bytes: enough to tell two apart, short enough to read in a column. */
function shortDigest(digest: string | null): string {
	if (!digest) return "none";
	const [algorithm, hex] = digest.split(":");
	return hex === undefined ? digest : `${algorithm}:${hex.slice(0, 8)}…`;
}

function readObject(root: string, digest: string): unknown {
	const [algorithm, hex] = digest.split(":");
	if (algorithm === undefined || hex === undefined) fail(`${root}: ${digest} is not a digest`);
	const path = join(root, "objects", algorithm, hex.slice(0, 2), hex.slice(2));
	if (!existsSync(path)) fail(`${root}: the object store holds nothing at ${digest}`);
	return JSON.parse(readFileSync(path, "utf8"));
}

function readDossier(label: string, root: string): Dossier {
	if (!existsSync(join(root, "state.sqlite"))) fail(`${root}: no state.sqlite, so no dossier to read here`);
	const db = new DatabaseSync(join(root, "state.sqlite"), { readOnly: true });
	try {
		const changes = db.prepare("SELECT change_id, state FROM changes").all() as { change_id: string; state: string }[];
		if (changes.length !== 1)
			fail(
				`${root}: ${changes.length} changes in this dossier (${changes.map((c) => c.change_id).join(", ") || "none"}); ` +
					"a campaign is one change in its own data directory",
			);
		const state = JSON.parse(changes[0]!.state) as ChangeState;
		const artifacts = db
			.prepare("SELECT artifact_id, kind, content_digest FROM artifacts WHERE change_id = ? ORDER BY created_at")
			.all(state.change_id) as { artifact_id: string; kind: string; content_digest: string }[];

		const manifestRow = artifacts.find(
			(a) => a.kind === "candidate" && a.artifact_id === state.candidate?.candidate_id,
		);
		const manifest = manifestRow ? (readObject(root, manifestRow.content_digest) as CandidateManifest) : null;
		const changed = (manifest?.entries ?? [])
			.filter((e) => e.baseline_state !== "unchanged")
			.map((e) => ({
				path: e.path,
				baseline_state: e.baseline_state,
				content_digest: e.content_digest ?? "none",
				size: e.size ?? 0,
			}));

		const refusals: Refusal[] = [];
		const compactions: Compaction[] = [];
		for (const row of artifacts.filter((a) => a.kind === "output")) {
			const output = readObject(root, row.content_digest) as OutputArtifact;
			const terminal = output.terminal;
			if (terminal.type !== "completed") refusals.push({ role: output.role, detail: `intervention ${terminal.type}` });
			else if (!terminal.output_valid)
				refusals.push({ role: output.role, detail: "the output schema refused the report" });
			else if (terminal.truncated === true) refusals.push({ role: output.role, detail: "a budget ended the session" });
			for (const event of output.events)
				if (event.type === "context_compacted")
					compactions.push({
						role: output.role,
						reason: event.reason,
						tokens_before: event.tokens_before,
						tokens_after: event.tokens_after,
						summary_tokens: event.summary_tokens,
						unwritten: event.unwritten,
					});
		}

		return {
			label,
			root,
			state,
			models: [...new Set(state.interventions.map((i) => `${i.model.provider_id}/${i.model.model_id}`))],
			base_digest: state.candidate?.base_digest ?? null,
			changed,
			refusals,
			compactions,
		};
	} finally {
		db.close();
	}
}

const left = readDossier("local", argument("local"));
const right = readDossier("distant", argument("distant"));

// --- what each dossier says, side by side --------------------------------------------------------

type Line = { kind: "head"; text: string } | { kind: "row"; label: string; left: string; right: string };

const lines: Line[] = [];
const head = (text: string): void => {
	lines.push({ kind: "head", text });
};
const row = (label: string, a: string, b: string): void => {
	lines.push({ kind: "row", label, left: a, right: b });
};

const gateIds = [...new Set([...Object.keys(left.state.gates), ...Object.keys(right.state.gates)])].sort();
const verdictOf = (d: Dossier, gate: string): string =>
	d.state.gates[gate as keyof ChangeState["gates"]]?.verdict ?? "not decided";
const controlIds = [
	...new Set([...left.state.evidence, ...right.state.evidence].filter((e) => e.valid).map((e) => e.control_id)),
].sort();
const controlVerdict = (d: Dossier, control: string): string => {
	const entries = d.state.evidence.filter((e) => e.valid && e.control_id === control);
	return entries.length === 0 ? "no evidence" : entries[entries.length - 1]!.verdict;
};
const paths = [...new Set([...left.changed, ...right.changed].map((e) => e.path))].sort();
const entryOf = (d: Dossier, path: string): ChangedEntry | undefined => d.changed.find((e) => e.path === path);
const totals = (d: Dossier) =>
	d.state.interventions.reduce(
		(sum, i) => ({
			tool_calls: sum.tool_calls + i.counters.tool_calls,
			duration_ms: sum.duration_ms + i.counters.duration_ms,
			tokens_known: sum.tokens_known + i.counters.tokens_known,
		}),
		{ tool_calls: 0, duration_ms: 0, tokens_known: 0 },
	);

head("dossier");
row("directory", tilde(left.root), tilde(right.root));
row("change", left.state.change_id, right.state.change_id);
row("model", left.models.join(", ") || "none", right.models.join(", ") || "none");
row("phase / status", `${left.state.phase} / ${left.state.status}`, `${right.state.phase} / ${right.state.status}`);
row("outcome", left.state.outcome, right.state.outcome);
row("stopped on", left.state.stop_reason ?? "nothing", right.state.stop_reason ?? "nothing");
row("environment", shortDigest(left.state.environment_digest), shortDigest(right.state.environment_digest));

head("contract rendered");
for (const gate of gateIds) row(gate, verdictOf(left, gate), verdictOf(right, gate));
row("base reference", shortDigest(left.base_digest), shortDigest(right.base_digest));
row("candidate", left.state.candidate?.candidate_id ?? "none", right.state.candidate?.candidate_id ?? "none");
for (const control of controlIds)
	row(`control ${control}`, controlVerdict(left, control), controlVerdict(right, control));
row("paths changed", String(left.changed.length), String(right.changed.length));
for (const path of paths) {
	const a = entryOf(left, path);
	const b = entryOf(right, path);
	const show = (e: ChangedEntry | undefined): string =>
		e ? `${e.baseline_state}, ${shortDigest(e.content_digest)}, ${e.size} B` : "absent";
	row(`  ${path}`, show(a), show(b));
}

head("path taken");
row(
	"interventions",
	left.state.interventions.map((i) => i.role).join(" → "),
	right.state.interventions.map((i) => i.role).join(" → "),
);
row(
	"attempts used",
	`${left.state.budgets.attempts_used} of ${left.state.budgets.max_attempts}`,
	`${right.state.budgets.attempts_used} of ${right.state.budgets.max_attempts}`,
);
row(
	"technical retries",
	String(Object.keys(left.state.budgets.retries).length),
	String(Object.keys(right.state.budgets.retries).length),
);
row("tool calls", count(totals(left).tool_calls), count(totals(right).tool_calls));
row(
	"duration",
	`${Math.round(totals(left).duration_ms / 1000)} s`,
	`${Math.round(totals(right).duration_ms / 1000)} s`,
);
row("tokens known", count(totals(left).tokens_known), count(totals(right).tokens_known));
row("schema refusals", String(left.refusals.length), String(right.refusals.length));
for (const dossier of [left, right])
	for (const refusal of dossier.refusals)
		row(`  ${refusal.role}`, dossier === left ? refusal.detail : "", dossier === right ? refusal.detail : "");
row("context rewrites", String(left.compactions.length), String(right.compactions.length));
for (const dossier of [left, right])
	for (const compaction of dossier.compactions) {
		const text = compaction.unwritten
			? `${compaction.reason}, not written: ${compaction.unwritten}`
			: `${compaction.reason}, ${compaction.tokens_before ?? "?"} → ${compaction.tokens_after ?? "?"} tokens, summary ${compaction.summary_tokens}`;
		row(`  ${compaction.role}`, dossier === left ? text : "", dossier === right ? text : "");
	}
row("requirements", left.state.requirement_ids.join(", ") || "none", right.state.requirement_ids.join(", ") || "none");
row(
	"mandatory",
	String(left.state.mandatory_requirement_ids.length),
	String(right.state.mandatory_requirement_ids.length),
);

const LABEL_WIDTH = Math.max(...lines.map((l) => (l.kind === "row" ? l.label.length : 0))) + 2;
const COLUMN_WIDTH = Math.max(...lines.map((l) => (l.kind === "row" ? l.left.length : 0))) + 2;
console.log(`\n495 — the same contract case, read back from two dossiers\n`);
console.log(`${"".padEnd(LABEL_WIDTH)}${left.label.padEnd(COLUMN_WIDTH)}${right.label}`);
for (const line of lines) {
	if (line.kind === "head") console.log(`\n${line.text}`);
	else console.log(`${line.label.padEnd(LABEL_WIDTH)}${line.left.padEnd(COLUMN_WIDTH)}${line.right}`);
}

// --- what the recipe rests on --------------------------------------------------------------------

const contractGaps: string[] = [];
const pathGaps: string[] = [];

if (left.state.outcome !== right.state.outcome || left.state.status !== right.state.status)
	contractGaps.push(
		`the outcome differs: ${left.state.status}/${left.state.outcome} against ${right.state.status}/${right.state.outcome}`,
	);
for (const gate of gateIds)
	if (verdictOf(left, gate) !== verdictOf(right, gate))
		contractGaps.push(
			`${gate} was decided ${verdictOf(left, gate)} on one side and ${verdictOf(right, gate)} on the other`,
		);
if (left.base_digest !== right.base_digest)
	contractGaps.push("the two candidates do not stand on the same reference, so they are not the same case");
for (const path of paths) {
	const a = entryOf(left, path);
	const b = entryOf(right, path);
	if (!a || !b) contractGaps.push(`${path} was changed on one side only (${a ? left.label : right.label})`);
	else if (a.baseline_state !== b.baseline_state)
		contractGaps.push(`${path} is ${a.baseline_state} on one side and ${b.baseline_state} on the other`);
	else if (a.content_digest !== b.content_digest)
		pathGaps.push(`${path} ends up with different content (${a.size} B against ${b.size} B)`);
}
for (const control of controlIds)
	if (controlVerdict(left, control) !== controlVerdict(right, control))
		contractGaps.push(
			`control ${control} returned ${controlVerdict(left, control)} against ${controlVerdict(right, control)}`,
		);

const roles = (d: Dossier): string => d.state.interventions.map((i) => i.role).join(" → ") || "no intervention";
if (roles(left) !== roles(right))
	pathGaps.push(`the interventions do not follow the same order: ${roles(left)} against ${roles(right)}`);
if (left.state.budgets.attempts_used !== right.state.budgets.attempts_used)
	pathGaps.push(
		`${left.state.budgets.attempts_used} attempt(s) were spent on one side and ${right.state.budgets.attempts_used} on the other`,
	);
if (left.state.requirement_ids.join() !== right.state.requirement_ids.join())
	pathGaps.push(
		"the two specifications do not name the same requirements, which the contract case does not fix: " +
			`${left.state.requirement_ids.join(", ") || "none"} against ${right.state.requirement_ids.join(", ") || "none"}`,
	);
for (const dossier of [left, right]) {
	for (const refusal of dossier.refusals) pathGaps.push(`${dossier.label}: ${refusal.role} — ${refusal.detail}`);
	for (const compaction of dossier.compactions)
		pathGaps.push(
			compaction.unwritten
				? `${dossier.label}: the host did not rewrite the context of ${compaction.role} — ${compaction.unwritten}`
				: `${dossier.label}: the host rewrote the context of ${compaction.role} (${compaction.reason}), the summary costing ${compaction.summary_tokens} tokens`,
		);
}

console.log("\npath taken — stated, held against neither dossier");
if (pathGaps.length === 0) console.log("  nothing separates the two paths");
for (const gap of pathGaps) console.log(`  - ${gap}`);

console.log("\nverdict");
if (contractGaps.length === 0) {
	console.log(
		"  the same contract case was rendered on both providers: same gates, same reference, same paths changed, same controls",
	);
	process.exit(0);
}
console.log("  the recipe is not held. What the two dossiers do not render alike:");
for (const gap of contractGaps) console.log(`  - ${gap}`);
process.exit(1);
