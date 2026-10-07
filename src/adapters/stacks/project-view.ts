/**
 * The view of a copy a technology reads the project through (CMP-TGT): the one module of the technologies
 * that touches the file system. A path is resolved against the copy and then to its real path, links
 * included, and refused when either leaves the copy; a file is refused past the read bound of a report.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { type ProjectEntry, type ProjectView, ProjectViewRefusal } from "../../application/stacks/project-view.ts";
import { MAX_REPORT_BYTES } from "../execution/parsers.ts";

export function openProjectView(projectPath: string): ProjectView {
	const root = resolve(projectPath);
	let realRoot: string | undefined;
	const within = (base: string, path: string) => path === base || path.startsWith(`${base}${sep}`);
	/** The real path of `path`, or null when nothing is there; refused when it leaves the copy. */
	const realPathOf = (path: string): string | null => {
		const absolute = resolve(root, path);
		if (!within(root, absolute)) throw new ProjectViewRefusal(`${path} escapes the copy and was not read`);
		let real: string;
		try {
			real = realpathSync(absolute);
		} catch {
			return null; // nothing to read there: a missing path, or a link that leads nowhere
		}
		realRoot ??= realpathSync(root);
		if (!within(realRoot, real)) throw new ProjectViewRefusal(`${path} escapes the copy and was not read`);
		return real;
	};
	return {
		exists: (path) => realPathOf(path) !== null,
		read(path) {
			const real = realPathOf(path);
			const size = real === null ? null : (statSync(real, { throwIfNoEntry: false })?.size ?? null);
			if (real === null || size === null) return null;
			if (size > MAX_REPORT_BYTES)
				throw new ProjectViewRefusal(
					`${path} is ${size} bytes, past the read bound of ${MAX_REPORT_BYTES}: it was not read`,
				);
			try {
				return readFileSync(real, "utf8");
			} catch {
				return null; // a directory or an unreadable file holds no text to read
			}
		},
		list(path) {
			const real = realPathOf(path);
			if (real === null) return [];
			try {
				return readdirSync(real, { withFileTypes: true })
					.map((entry): ProjectEntry => ({ name: entry.name, directory: entry.isDirectory() }))
					.sort((a, b) => a.name.localeCompare(b.name));
			} catch {
				return []; // a file or an unreadable directory lists nothing
			}
		},
	};
}
