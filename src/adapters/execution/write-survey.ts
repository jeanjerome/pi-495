/**
 * The survey of a control's writes: the profile it runs under, and what it writes in its copy, read from the copy
 * itself: it is listed before and after the run, never through a link, and what was created or changed is named
 * relative to it (D-92).
 */
import { lstat, readdir, rename } from "node:fs/promises";
import { join, relative } from "node:path";
import type { SandboxProfile } from "../../ports/execution.ts";
import { realPathOf } from "../sandbox/backends.ts";

interface ListedEntry {
	directory: boolean;
	/** What changes when the entry is rewritten: its kind and inode, its size and the time it was last modified. */
	signature: string;
}

/** Each entry of a copy by its path relative to the copy, `/`-separated. */
type CopyListing = ReadonlyMap<string, ListedEntry>;

/**
 * Lists the copy without following links: a link is an entry by its own name, so a link to the host lists nothing
 * beyond it.
 */
export async function listCopy(copy: string): Promise<CopyListing> {
	const listing = new Map<string, ListedEntry>();
	const walk = async (directory: string): Promise<void> => {
		const names = await readdir(join(copy, directory)).catch((error: NodeJS.ErrnoException) => {
			// A directory the run left unreadable is still listed, by its own entry.
			if (error.code === "EACCES" || error.code === "EPERM") return [];
			throw error;
		});
		for (const name of names) {
			const path = directory === "" ? name : `${directory}/${name}`;
			const entry = await lstat(join(copy, path), { bigint: true });
			listing.set(path, {
				directory: entry.isDirectory(),
				signature: `${entry.mode}:${entry.ino}:${entry.size}:${entry.mtimeNs}`,
			});
			if (entry.isDirectory()) await walk(path);
		}
	};
	await walk("");
	return listing;
}

/**
 * The paths created between two listings, and those changed that are not directories, in order. A directory changes
 * whenever an entry is added to it or removed from it, which is said by that entry itself.
 */
function writtenBetween(before: CopyListing, after: CopyListing): string[] {
	return [...after]
		.filter(([path, entry]) => {
			const was = before.get(path);
			return was === undefined || (!entry.directory && was.signature !== entry.signature);
		})
		.map(([path]) => path)
		.sort();
}

/**
 * The profile of a surveyed run on the copy standing at `surveyedPath`: everything under it writable by its real path,
 * so that a link in the copy leads no write out of it, for the run alone, nothing removable in it, so that what the
 * run creates then removes is still there to be listed where the backend can deny removal, and the rest of the
 * control's profile as it is.
 */
export function surveyProfile(profile: SandboxProfile, surveyedPath: string): SandboxProfile {
	const copy = realPathOf(surveyedPath);
	return { ...profile, write_paths: [], write_files: [], run_scoped_paths: [copy] };
}

/** Where the copy at `workspacePath` stands while its surveyed run writes in it. */
export function surveyedPathOf(workspacePath: string): string {
	return `${workspacePath}.surveyed`;
}

/**
 * Runs `run` on the copy moved where its surveyed run is given it, and moves it back once the run has ended: the right
 * to write in the copy is scoped to a path the copy then leaves, so that no process of the run, even one it detached,
 * writes in the copy after the run nor creates that path again (D-92).
 */
export async function onSurveyedPath<T>(workspacePath: string, run: (surveyedPath: string) => Promise<T>): Promise<T> {
	const surveyed = surveyedPathOf(workspacePath);
	await rename(workspacePath, surveyed);
	try {
		return await run(surveyed);
	} finally {
		await rename(surveyed, workspacePath);
	}
}

/**
 * The paths of the copy written since `before` was listed, less those under a path the control is already given; null
 * for a run that was not surveyed.
 */
export async function writtenSince(
	before: CopyListing | null,
	workspacePath: string,
	granted: readonly string[],
): Promise<string[] | null> {
	if (before === null) return null;
	const given = granted.map((p) => relative(workspacePath, p));
	return writtenBetween(before, await listCopy(workspacePath)).filter(
		(path) => !given.some((g) => path === g || path.startsWith(`${g}/`)),
	);
}
