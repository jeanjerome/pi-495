/**
 * The package of this repository as an installation resolves it: `pi-495/<path>` names a module of `dist/`,
 * which the repository does not version. A test that imports one reads the build; in a tree that holds no
 * build yet, such as a copy checked out at one commit, the build is made from the sources of that tree first.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PACKAGE_ROOT = join(import.meta.dirname, "..", "..");

/** The manifest of the package, as an installation reads it. */
export function packageManifest(): {
	exports?: Record<string, { types?: string; default?: string }>;
	pi: { extensions: string[] };
} {
	return JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
}

/** Builds `dist/` from `src/` when the file `built`, relative to the package root, is absent from it. */
export function buildUnlessPresent(built: string): void {
	if (existsSync(join(PACKAGE_ROOT, built))) return;
	execFileSync(
		process.execPath,
		[join(PACKAGE_ROOT, "node_modules/typescript/bin/tsc"), "-p", join(PACKAGE_ROOT, "tsconfig.build.json")],
		{ cwd: PACKAGE_ROOT, stdio: "pipe" },
	);
}
