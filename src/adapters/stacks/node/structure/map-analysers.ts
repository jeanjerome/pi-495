/**
 * The analysers 495 installs in a copy to verify an adopted map on a Node package (`specs/adr/D-87`), at the
 * versions their rules and their output were read against, and whether a copy carries them.
 */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";

/** An analyser, by its npm package and the exact version 495 installs. */
export interface MapAnalyser {
	readonly package: string;
	readonly version: string;
}

/** The analyser of the map and its parser. */
export const MAP_ANALYSERS = [
	{ package: "dependency-cruiser", version: "18.5.0" },
	{ package: "@swc/core", version: "1.16.13" },
] as const satisfies readonly MapAnalyser[];

/** The analyser of the dependencies `package.json` declares against those the code uses. */
export const DEPENDENCIES_ANALYSER = { package: "knip", version: "6.40.0" } as const satisfies MapAnalyser;

/** Every package 495 installs in the copy, none of them a dependency of the project. */
export const INSTALLED_BY_495: readonly string[] = [...MAP_ANALYSERS, DEPENDENCIES_ANALYSER].map((a) => a.package);

/** Whether the copy carries each analyser at its version, under `node_modules`. */
export function analysersInstalledIn(view: ProjectView, analysers: readonly MapAnalyser[]): boolean {
	return analysers.every((analyser) => {
		const text = view.read(`node_modules/${analyser.package}/package.json`);
		try {
			return text !== null && (JSON.parse(text) as { version?: unknown }).version === analyser.version;
		} catch {
			return false; // a manifest that cannot be read installs nothing 495 can run
		}
	});
}
