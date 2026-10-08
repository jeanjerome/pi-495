/**
 * The folders of the main sources of a Node package, which play for its architecture map the part the
 * packages of a Java reactor play: a folder that holds a JavaScript or TypeScript file that is not a test.
 */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import { isScriptUnderTest, NODE_OUTPUTS } from "../shared.ts";

/**
 * The directories no folder of the sources is looked for under: the installed packages, what the tools of the
 * package write, and the hidden directories, Git's among them.
 */
function outsideTheSources(path: string): boolean {
	const directory = `${path}/`;
	return (
		directory === "node_modules/" ||
		NODE_OUTPUTS.some((output) => directory.startsWith(output)) ||
		path.split("/").some((name) => name.startsWith("."))
	);
}

/**
 * Every folder under `directory`, at any depth, that holds a source file which is not a test, by its path
 * relative to the copy. A file at the root of the package is its configuration or its entry point, which no
 * part of a map divides, so the root itself is never a folder of the sources.
 */
function foldersUnder(view: ProjectView, directory: string): string[] {
	const entries = view.list(directory);
	const here =
		directory !== "" && entries.some((e) => !e.directory && isScriptUnderTest(`${directory}/${e.name}`))
			? [directory]
			: [];
	return [
		...here,
		...entries.flatMap((entry) => {
			const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
			return entry.directory && !outsideTheSources(path) ? foldersUnder(view, path) : [];
		}),
	];
}

/** Every folder of the main sources of the package, sorted. */
export function sourceFolders(view: ProjectView): string[] {
	return foldersUnder(view, "").sort();
}
