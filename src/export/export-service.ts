/**
 * Export service (CMP-EXP, §7.5, EVD-01, SA-036): writes a self-contained dossier readable
 * without Pi or a model, with a manifest of every file (size, type, SHA-256), the event stream,
 * the referenced objects and, when redacted, an explicit `redactions.json`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalize } from "../contracts/canonical.ts";
import { digestBytes } from "../contracts/digest.ts";
import type { LedgerPort } from "../ports/ledger.ts";
import type { ObjectStorePort } from "../ports/object-store.ts";
import { CONTRACTS } from "../contracts/registry.ts";

export interface ExportOptions {
	change_id: string;
	destination: string;
	redact: boolean;
	/** Sentinel patterns (regular expressions) removed from textual objects in a redacted export. */
	secret_patterns?: RegExp[];
	now: string;
	producer: string;
}

export interface ExportResult {
	path: string;
	files: number;
	bytes: number;
	redactions: number;
	missing: string[];
	manifest_digest: string;
}

const DEFAULT_SECRETS = [/sk-[A-Za-z0-9_-]{8,}/g, /(?:api[_-]?key|token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{8,}/gi, /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g];

export async function exportChange(ledger: LedgerPort, objects: ObjectStorePort, options: ExportOptions): Promise<ExportResult> {
	const loaded = ledger.loadChange(options.change_id);
	if (!loaded) throw new Error(`change ${options.change_id} not found`);
	const state = loaded.state;
	const program = ledger.loadProgram(state.program_id)?.state ?? null;
	const root = options.destination;
	const files: { path: string; bytes: Uint8Array }[] = [];
	const redactions: { path: string; count: number; kind: string }[] = [];
	const missing: string[] = [];
	const patterns = options.secret_patterns ?? DEFAULT_SECRETS;
	const add = (path: string, content: string | Uint8Array) => files.push({ path, bytes: typeof content === "string" ? new TextEncoder().encode(content) : content });
	const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
	const redactText = (path: string, text: string): string => {
		if (!options.redact) return text;
		let count = 0;
		let out = text;
		for (const re of patterns) out = out.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`), () => { count++; return "[REDACTED-BY-495]"; });
		if (count > 0) redactions.push({ path, count, kind: "secret-sentinel" });
		return out;
	};
	add("program.json", json(program));
	add(`changes/${state.change_id}/state.json`, json(state));
	add("events.jsonl", `${ledger.readChangeEvents(state.change_id).map((e) => canonicalize(e)).join("\n")}\n`);
	if (program) add("program-events.jsonl", `${ledger.readProgramEvents(program.program_id).map((e) => canonicalize(e)).join("\n")}\n`);
	for (const [name, schema] of Object.entries(CONTRACTS)) add(`schemas/${name}.json`, json(schema));
	const objectDigests = new Set<string>();
	const artifacts = ledger.listArtifacts(state.change_id);
	add(`changes/${state.change_id}/artifacts/index.json`, json(artifacts));
	for (const a of artifacts) {
		objectDigests.add(a.object.digest);
		if (a.kind === "candidate" && a.ref.artifact_id.startsWith("files_")) {
			const bytes = await objects.get(a.object);
			if (bytes) for (const f of Object.values(JSON.parse(new TextDecoder().decode(bytes)) as Record<string, { digest: string }>)) objectDigests.add(f.digest);
		}
	}
	const evidence = ledger.listEvidence(state.change_id);
	for (const ev of evidence) {
		add(`changes/${state.change_id}/evidence/${ev.evidence_id}.json`, json(ev));
		for (const att of ev.artifacts) objectDigests.add(att.ref.digest);
	}
	const decisions = ledger.listHumanDecisions(state.change_id);
	add(`changes/${state.change_id}/decisions/index.json`, json({ pending: state.pending_decisions.map((d) => ledger.getDecisionRequest(d.decision_id)), recorded: decisions }));
	for (const a of artifacts) if (a.kind === "candidate" || a.kind === "reference") add(`changes/${state.change_id}/candidates/${a.ref.artifact_id}.r${a.ref.revision}.json`, json(a.ref));
	for (const a of artifacts) if (a.kind === "integration") add(`changes/${state.change_id}/integration/${a.ref.artifact_id}.json`, json(a.ref));
	for (const digest of [...objectDigests].sort()) {
		const bytes = await objects.get(digest);
		if (!bytes) { missing.push(digest); continue; }
		if (digestBytes(bytes) !== digest) { missing.push(`${digest} (corrupted)`); continue; }
		const hex = digest.slice(7);
		const path = `objects/sha256/${hex.slice(0, 2)}/${hex.slice(2)}`;
		const isText = !bytes.subarray(0, 8000).includes(0);
		if (options.redact && isText) {
			const text = new TextDecoder().decode(bytes);
			const red = redactText(path, text);
			add(path, red);
		} else add(path, bytes);
	}
	if (options.redact) add("redactions.json", json({ profile: "redacted", note: "objects listed here were altered; their digest no longer matches the original", redactions }));
	const manifest = { schema_version: 1, exported_at: options.now, producer: options.producer, change_id: state.change_id, program_id: state.program_id, profile: options.redact ? "redacted" : "full", complete: missing.length === 0, missing, files: files.map((f) => ({ path: f.path, size_bytes: f.bytes.byteLength, media_type: f.path.endsWith(".json") ? "application/json" : f.path.endsWith(".jsonl") ? "application/jsonl" : "application/octet-stream", sha256: digestBytes(f.bytes) })) };
	const manifestBytes = new TextEncoder().encode(json(manifest));
	const verify = { schema_version: 1, algorithm: "sha256", manifest_sha256: digestBytes(manifestBytes), how_to_verify: "recompute the SHA-256 of every file listed in manifest.json and compare; recompute each event hash as sha256(previous_hash || canonical(event)) along events.jsonl" };
	await mkdir(root, { recursive: true });
	let bytes = 0;
	for (const f of files) {
		await mkdir(join(root, f.path, ".."), { recursive: true });
		await writeFile(join(root, f.path), f.bytes);
		bytes += f.bytes.byteLength;
	}
	await writeFile(join(root, "manifest.json"), manifestBytes);
	await writeFile(join(root, "verify-integrity.json"), json(verify));
	return { path: root, files: files.length + 2, bytes, redactions: redactions.reduce((n, r) => n + r.count, 0), missing, manifest_digest: verify.manifest_sha256 };
}

/** Offline verification of an exported dossier (RM-072). */
export async function verifyExport(root: string): Promise<{ ok: boolean; problems: string[] }> {
	const { readFile } = await import("node:fs/promises");
	const problems: string[] = [];
	const manifestBytes = await readFile(join(root, "manifest.json"));
	const verify = JSON.parse(await readFile(join(root, "verify-integrity.json"), "utf8")) as { manifest_sha256: string };
	if (digestBytes(manifestBytes) !== verify.manifest_sha256) problems.push("manifest digest mismatch");
	const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as { files: { path: string; sha256: string }[] };
	for (const f of manifest.files) {
		try {
			if (digestBytes(await readFile(join(root, f.path))) !== f.sha256) problems.push(`digest mismatch: ${f.path}`);
		} catch {
			problems.push(`missing file: ${f.path}`);
		}
	}
	const events = (await readFile(join(root, "events.jsonl"), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l) as { hash: string; previous_hash: string | null; event: unknown });
	let previous: string | null = null;
	for (const e of events) {
		const { createHash } = await import("node:crypto");
		const expected: string = `sha256:${createHash("sha256").update(`${previous ?? ""}${canonicalize(e.event)}`).digest("hex")}`;
		if (e.previous_hash !== previous || e.hash !== expected) problems.push(`chain broken at ${e.hash}`);
		previous = e.hash;
	}
	return { ok: problems.length === 0, problems };
}
