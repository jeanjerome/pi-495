/** The packages the main sources of a Maven reactor declare, read from their `package` declarations without compiling them. */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import { readDeclarations } from "../project/java-declarations.ts";
import type { MavenReactor } from "../project/reactor.ts";

/** The Java files under `directory`, at any depth, by their path relative to the copy. */
function javaFiles(view: ProjectView, directory: string): string[] {
	return view.list(directory).flatMap((entry) => {
		const path = `${directory}${entry.name}`;
		if (entry.directory) return javaFiles(view, `${path}/`);
		return path.endsWith(".java") ? [path] : [];
	});
}

/** Every package a source under a main source root of the reactor declares, sorted, each once. */
export function mainPackages(view: ProjectView, reactor: MavenReactor): string[] {
	const declared = reactor.module_info.flatMap((module) =>
		module.source_root === null
			? []
			: javaFiles(view, module.source_root).flatMap((path) => {
					const name = readDeclarations(path, view.read(path) ?? "").package_name;
					return name === null ? [] : [name];
				}),
	);
	return [...new Set(declared)].sort();
}
