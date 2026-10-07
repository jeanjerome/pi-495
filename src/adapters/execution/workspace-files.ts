/**
 * The reading of the files of a workspace that the runner offers a report reader. A report is written
 * by the project judged, so it is an untrusted input: a path outside the copy is never read, whether its
 * text or a link the project wrote in the copy leads out of it, no file past the read bound is handed to
 * a reader, and each report read is kept as evidence.
 */
import type { Dirent } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { messageOf } from "../../domain/errors.ts";
import type { ReportDocument, ReportReading, SourceTree, WorkspaceFiles } from "../../ports/execution.ts";
import { MAX_REPORT_BYTES } from "./parsers.ts";

/** Keeps a report a reader read, under the media type the reader names. */
export type ReportKeeper = (document: ReportDocument, mediaType: string) => Promise<void>;

/** The files of `workspace` as a reader reads them, the reports being those at `reportPath`. */
export function workspaceFiles(
	workspace: string,
	reportPath: string | null = null,
	keep: ReportKeeper = async () => {},
): WorkspaceFiles {
	return {
		async reports(mediaType: string, reading: ReportReading = {}): Promise<ReportDocument[]> {
			const docs = reading.single_file
				? await readBoundedReport(workspace, reportPath)
				: await readReports(workspace, reportPath, reading.oversized_unread ?? false);
			for (const doc of docs) if (doc.oversized_bytes === undefined) await keep(doc, mediaType);
			return docs;
		},
		sources: (paths) => introducedSources(workspace, paths),
		text: (path) => readInside(workspace, path),
		tree: (roots, suffix) => readTree(workspace, roots, suffix),
	};
}

/**
 * The text of the introduced source files a reader looks into, keyed by path. A file the change deleted
 * has nothing to read; one over the bound is not read, and that is an error rather than a silent gap.
 */
async function introducedSources(workspace: string, paths: readonly string[]): Promise<Map<string, string>> {
	const root = resolve(workspace);
	const sources = new Map<string, string>();
	for (const path of paths) {
		const absolute = resolve(root, path);
		if (!absolute.startsWith(`${root}${sep}`)) continue;
		const real = await realPathInside(root, absolute).catch(() => null);
		if (real === null) continue;
		const stats = await stat(real).catch(() => null);
		if (!stats?.isFile()) continue;
		sources.set(path, await readBoundedText(real, path));
	}
	return sources;
}

/** One file of the workspace; a path outside it, or a file past the read bound, is refused before anything is read. */
async function readInside(workspace: string, path: string): Promise<string> {
	const root = resolve(workspace);
	const absolute = resolve(root, path);
	if (!absolute.startsWith(`${root}${sep}`)) throw new Error(`${path} escapes the workspace`);
	const real = await realPathInside(root, absolute);
	if (real === null) throw new Error(`${path} escapes the workspace`);
	return readBoundedText(real, path);
}

/** The text of one file at its real path, its size read first: one past the read bound is refused, naming it. */
async function readBoundedText(real: string, path: string): Promise<string> {
	const { size } = await stat(real);
	if (size > MAX_REPORT_BYTES)
		throw new Error(`${path} is ${size} bytes, past the read bound of ${MAX_REPORT_BYTES}: it was not read`);
	return readFile(real, "utf8");
}

/**
 * The real path of `absolute`, its links resolved, or null when it lies outside the real path of the
 * copy: a link the project judged wrote in the copy is never followed out of it. It throws when the
 * path does not exist.
 */
async function realPathInside(workspace: string, absolute: string): Promise<string | null> {
	const root = await realpath(workspace);
	const real = await realpath(absolute);
	return real === root || real.startsWith(`${root}${sep}`) ? real : null;
}

/** A report past the read bound that its reader did not ask to be handed unread: the reading fails on it. */
class OversizedReport extends Error {}

/**
 * The report files a control declares. A file past the read bound is never loaded: when `oversizedUnread`,
 * it is returned unread with its size, as `readBoundedReport` does; otherwise its reading fails, naming it.
 */
async function readReports(
	workspace: string,
	reportPath: string | null,
	oversizedUnread: boolean,
): Promise<ReportDocument[]> {
	if (!reportPath) return [];
	if (reportPath.startsWith("**/")) return readRecursiveReports(workspace, reportPath.slice(3), oversizedUnread);
	const abs = resolve(workspace, reportPath);
	if (!abs.startsWith(resolve(workspace))) return [];
	try {
		const st = await stat(abs);
		if (st.isFile()) return inCopy([await readReportFile(workspace, abs, reportPath, oversizedUnread)]);
		const out: (ReportDocument | null)[] = [];
		for (const f of (await readdir(abs)).sort())
			if (f.endsWith(".xml"))
				out.push(await readReportFile(workspace, join(abs, f), `${reportPath}/${f}`, oversizedUnread));
		return inCopy(out);
	} catch (error) {
		if (error instanceof OversizedReport) throw error;
		return []; // a missing or unreadable report path yields no report, which the parser judges as such
	}
}

/**
 * One report file, its size read first: a file past the bound is not read, and is returned with its size
 * when `oversizedUnread`, its reading failing otherwise. A file whose real path is outside the copy is
 * not read at all, and null stands for it.
 */
async function readReportFile(
	workspace: string,
	absolute: string,
	name: string,
	oversizedUnread: boolean,
): Promise<ReportDocument | null> {
	const real = await realPathInside(workspace, absolute);
	if (real === null) return null;
	const { size } = await stat(real);
	if (size > MAX_REPORT_BYTES) {
		if (oversizedUnread) return { name, text: "", oversized_bytes: size };
		throw new OversizedReport(
			`the report ${name} is ${size} bytes, past the read bound of ${MAX_REPORT_BYTES}: it was not read`,
		);
	}
	return { name, text: await readFile(real, "utf8") };
}

/** The reports read, without those whose real path lies outside the copy. */
function inCopy(docs: readonly (ReportDocument | null)[]): ReportDocument[] {
	return docs.filter((doc): doc is ReportDocument => doc !== null);
}

/**
 * The single report file a control declares, or none when it is absent. A file past the read bound is
 * returned unread with its size: the reader then says it could not check it, instead of this function
 * loading what the project judged chose to write.
 */
async function readBoundedReport(workspace: string, reportPath: string | null): Promise<ReportDocument[]> {
	if (!reportPath) return [];
	const absolute = resolve(workspace, reportPath);
	if (!absolute.startsWith(`${resolve(workspace)}${sep}`)) return [];
	const stats = await stat(absolute).catch(() => null);
	if (!stats?.isFile()) return [];
	return inCopy([await readReportFile(workspace, absolute, reportPath, true)]);
}

/** The bound on the XML files a recursive scan reads; it escapes the catch that skips unreadable directories. */
class ScanBound extends Error {}

async function readRecursiveReports(
	workspace: string,
	directorySuffix: string,
	oversizedUnread: boolean,
): Promise<ReportDocument[]> {
	const root = resolve(workspace);
	const out: (ReportDocument | null)[] = [];
	const stack: { absolute: string; relative: string }[] = [{ absolute: root, relative: "" }];
	let visited = 0;
	while (stack.length > 0) {
		const current = stack.pop()!;
		visited++;
		if (visited > 10_000) throw new Error("JUnit report scan exceeded 10000 directories");
		let entries: Dirent[];
		try {
			entries = await readdir(current.absolute, { withFileTypes: true });
		} catch {
			continue; // an unreadable directory is not scanned; the reports found elsewhere still count
		}
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			if (!entry.isDirectory() || entry.name === ".git" || entry.name === "node_modules") continue;
			const rel = current.relative ? `${current.relative}/${entry.name}` : entry.name;
			const abs = join(current.absolute, entry.name);
			if (rel === directorySuffix || rel.endsWith(`/${directorySuffix}`)) {
				try {
					for (const file of (await readdir(abs)).sort()) {
						if (!file.endsWith(".xml")) continue;
						if (out.length >= 500) throw new ScanBound("JUnit report scan exceeded 500 XML files");
						out.push(await readReportFile(workspace, join(abs, file), `${rel}/${file}`, oversizedUnread));
					}
				} catch (error) {
					if (error instanceof ScanBound || error instanceof OversizedReport) throw error;
					/* a missing or unreadable report directory produces no report */
				}
				continue;
			}
			stack.push({ absolute: abs, relative: rel });
		}
	}
	return inCopy(out).sort((a, b) => a.name.localeCompare(b.name));
}

/** Directories no source tree of the project is under: build output and tool caches. */
const SKIPPED_DIRECTORIES = new Set([".git", "target", "build", "out", "bin", "node_modules", ".idea"]);

const MAX_SOURCE_FILES = 5000;
const MAX_SOURCE_BYTES = 1024 * 1024;

/** Every file ending with `suffix` under the given roots, read once, sorted by path. */
async function readTree(workspace: string, roots: readonly string[], suffix: string): Promise<SourceTree> {
	const root = resolve(workspace);
	const notes: string[] = [];
	const byPath = new Map<string, string>();
	for (const scope of [...new Set(roots)].sort()) {
		const base = resolve(root, scope);
		let real: string | null = null;
		try {
			if (base === root || base.startsWith(`${root}/`)) real = await realPathInside(root, base);
			if (real !== null && !(await stat(real)).isDirectory()) continue;
		} catch {
			// A scope no tree holds is a fact of this tree, not a defect: a module may not carry sources.
			continue;
		}
		if (real === null) {
			notes.push(`scope ${scope} escapes the workspace and was not read`);
			continue;
		}
		const relativeBase = scope.replace(/\/*$/, "");
		const stack: { absolute: string; relative: string }[] = [{ absolute: real, relative: relativeBase }];
		while (stack.length > 0) {
			const current = stack.pop()!;
			let entries: Dirent[];
			try {
				entries = await readdir(current.absolute, { withFileTypes: true });
			} catch (error) {
				notes.push(`unreadable directory ${current.relative}: ${messageOf(error)}`);
				continue;
			}
			for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
				const rel = current.relative ? `${current.relative}/${entry.name}` : entry.name;
				if (entry.isDirectory()) {
					if (!SKIPPED_DIRECTORIES.has(entry.name))
						stack.push({ absolute: join(current.absolute, entry.name), relative: rel });
					continue;
				}
				if (!entry.isFile() || !entry.name.endsWith(suffix) || byPath.has(rel)) continue;
				if (byPath.size >= MAX_SOURCE_FILES) {
					notes.push(`source limit ${MAX_SOURCE_FILES} reached: the declarations of the remaining files were not read`);
					stack.length = 0;
					break;
				}
				let text: string;
				try {
					text = await readFile(join(current.absolute, entry.name), "utf8");
				} catch (error) {
					notes.push(`unreadable source ${rel}: ${messageOf(error)}`);
					continue;
				}
				if (text.length > MAX_SOURCE_BYTES) {
					notes.push(`${rel} exceeds ${MAX_SOURCE_BYTES} bytes: its declarations were not read`);
					continue;
				}
				byPath.set(rel, text);
			}
		}
	}
	return {
		files: [...byPath.entries()].map(([path, text]) => ({ path, text })).sort((a, b) => a.path.localeCompare(b.path)),
		notes,
	};
}
