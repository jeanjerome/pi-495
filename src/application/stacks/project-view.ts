/**
 * What a technology reads of the project it detects (CMP-TGT). The project judged is an untrusted input,
 * read before any control runs, so a technology reads it only through this view, which the common layer
 * opens on the copy: every path is relative to the copy, nothing is written and nothing is executed.
 */

/** One entry of a directory of the copy. */
export interface ProjectEntry {
	name: string;
	/** Whether the entry is a directory itself; a link is not one, wherever it leads. */
	directory: boolean;
}

/**
 * The copy as a technology reads it. A path whose real path leaves the copy, its text or a link the
 * project wrote leading out of it, and a file past the read bound throw a `ProjectViewRefusal` naming the
 * path: what a technology has not read, it does not conclude on.
 */
export interface ProjectView {
	/** Whether the copy holds a file or a directory at `path`. */
	exists(path: string): boolean;
	/** The text of the file at `path`, or null when the copy holds no file it can read there. */
	read(path: string): string | null;
	/** The entries of the directory at `path`, sorted by name; none when the copy holds no directory it can read there. */
	list(path: string): ProjectEntry[];
}

/** A read the view refused; its message names the path and why it was not read. */
export class ProjectViewRefusal extends Error {}

/** Opens the view of the copy at `projectPath`. */
export type OpenProjectView = (projectPath: string) => ProjectView;
