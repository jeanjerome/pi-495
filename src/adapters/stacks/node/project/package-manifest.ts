/** What the Node technology reads of a `package.json`: its scripts, and the packages it declares. */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";

/** What the technology reads of a `package.json`: its scripts, and the dependencies it declares. */
export interface PackageManifest {
	scripts?: Record<string, unknown>;
	dependencies?: Record<string, unknown>;
	devDependencies?: Record<string, unknown>;
	optionalDependencies?: Record<string, unknown>;
	peerDependencies?: Record<string, unknown>;
}

/** Every package `package.json` declares, whatever the kind of dependency, sorted. */
export function declaredPackages(pkg: PackageManifest): string[] {
	const maps = [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.peerDependencies];
	return [...new Set(maps.flatMap((map) => (map && typeof map === "object" ? Object.keys(map) : [])))].sort();
}

/** The `package.json` of the project; an invalid one is a fact, read as declaring nothing, not an error. */
export function readManifest(view: ProjectView): PackageManifest {
	const text = view.read("package.json");
	if (text === null) return {};
	try {
		return JSON.parse(text) as PackageManifest;
	} catch {
		return {};
	}
}
