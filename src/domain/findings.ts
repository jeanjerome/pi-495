/**
 * Identity and location of a finding (VER-08, QLT-04).
 *
 * A control names a defect in the words of the tool that observed it: an absolute path inside the
 * workspace the run happened to use, a line and a column. None of the three is a property of the
 * defect. The workspace is an accident of the run — the reference and the candidate are two
 * different directories — and a line moves when anything above it is edited. What is left once they
 * are set aside is what two passes can compare, and it is what the fingerprint digests.
 */
import { digestValue } from "../contracts/digest.ts";
import type { Region } from "../contracts/v1/evidence.ts";

/** A file path as tools write it: no whitespace, no punctuation that delimits a location, one extension. */
const PATH = String.raw`([^\s:()\[\],;"'\`]+\.[A-Za-z][A-Za-z0-9_+-]*)`;

/** `A.java:[47,44]`, `A.cs(47,44)`, `a.ts:47:44`, `a.js:47` — in that order, longest form first. */
const LOCATIONS: { re: RegExp; col: boolean }[] = [
	{ re: new RegExp(`${PATH}:\\[(\\d+),(\\d+)\\]`), col: true },
	{ re: new RegExp(`${PATH}\\((\\d+),(\\d+)\\)`), col: true },
	{ re: new RegExp(`${PATH}:(\\d+):(\\d+)`), col: true },
	{ re: new RegExp(`${PATH}:(\\d+)(?!\\d)`), col: false },
];

/** One path segment. It excludes `/`, so a path of several segments has a single reading. */
const SEGMENT = String.raw`[^\s:()\[\],;"'\`/]+`;

/** A bare path, kept only when it is unambiguously one: a directory separator and an extension. */
const BARE_PATH = new RegExp(`(?:^|[\\s(\\[])((?:${SEGMENT}/)+${SEGMENT}\\.[A-Za-z][A-Za-z0-9_+-]*)`);

export interface FindingLocation {
	path: string | null;
	region: Region | null;
	/** The message with its location removed: what survives a move and a rename. */
	text: string;
}

/**
 * Removes the absolute paths of the executed tree from a message. `/tmp/ws_a/src/A.java` and
 * `/tmp/ws_b/src/A.java` name the same file of the same project; without this, no finding of the
 * reference could ever match a finding of the candidate.
 */
export function relativize(text: string, ...workspacePaths: string[]): string {
	let out = text;
	for (const raw of workspacePaths) {
		if (!raw) continue;
		const path = raw.endsWith("/") ? raw.slice(0, -1) : raw;
		out = out.split(`${path}/`).join("").split(path).join("");
	}
	return out;
}

function squeeze(text: string): string {
	return text.replace(/\s+/g, " ").trim().replace(/^[\s:,\-–—]+/, "").trim();
}

function normalizePath(path: string): string {
	return path.replace(/^\.\//, "");
}

/**
 * How far into a message a location is looked for. A tool names the file it is talking about at the
 * head of its line; scanning a whole truncated log for one would cost more than it is worth.
 */
const MAX_SCAN = 4096;

/** Splits a message into the file it points at, the line it points at, and the rest. */
export function locate(message: string): FindingLocation {
	const head = message.length > MAX_SCAN ? message.slice(0, MAX_SCAN) : message;
	for (const { re, col } of LOCATIONS) {
		const m = re.exec(head);
		if (!m) continue;
		const line = Number.parseInt(m[2]!, 10);
		if (!Number.isFinite(line) || line < 1) continue;
		const column = col ? Number.parseInt(m[3]!, 10) : null;
		const region: Region = { start_line: line, end_line: line, start_col: column !== null && Number.isFinite(column) ? column : null, end_col: null };
		return { path: normalizePath(m[1]!), region, text: squeeze(message.slice(0, m.index) + message.slice(m.index + m[0].length)) };
	}
	const bare = BARE_PATH.exec(head);
	if (bare) return { path: normalizePath(bare[1]!), region: null, text: squeeze(message.split(bare[1]!).join(" ")) };
	return { path: null, region: null, text: squeeze(message) };
}

export interface FindingIdentity {
	tool: string;
	rule_id: string;
	symbol: string | null;
	path: string | null;
	text: string;
}

/**
 * Identity of a finding: the tool, the rule, the file and what the tool said, with the line left
 * out. Two passes over the same defect agree on it even when the code around it moved.
 */
export function fingerprintOf(identity: FindingIdentity): string {
	return digestValue({ tool: identity.tool, rule_id: identity.rule_id, symbol: identity.symbol, path: identity.path, text: squeeze(identity.text) });
}
