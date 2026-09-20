import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Data directory outside the target project (conception §7.1, decision D-03). A single
 * whitespace-free home directory on every platform: Pi exposes no storage location for an
 * extension's own state — `~/.pi/agent/` is its own configuration, which it backs up and migrates —
 * and a path without whitespace lets workspaces stay colocated instead of being displaced.
 */
export function resolveDataDir(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
	const override = env.HARNESS495_DATA_DIR;
	if (override?.trim()) return override;
	return join(home, ".495");
}

/**
 * Former default locations, still resolved when reading so that a change started before the move
 * remains readable. Nothing is ever written there.
 */
export function legacyDataDirs(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home: string = homedir()): string[] {
	if (platform === "darwin") return [join(home, "Library", "Application Support", "495")];
	if (platform === "win32") return [join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "495")];
	const xdg = env.XDG_DATA_HOME?.trim() ? env.XDG_DATA_HOME : join(home, ".local", "share");
	return [join(xdg, "495")];
}

/**
 * Mutable workspaces are kept outside a data directory whose path contains whitespace. Some build
 * tools, notably Maven Surefire when expanding an unquoted `argLine`, cannot launch forked JVMs from
 * such paths. An explicit override always wins and a whitespace-free data directory remains
 * colocated for isolated test and CI installations.
 */
export function resolveWorkspacesDir(
	dataDir: string,
	env: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform,
	home: string = homedir(),
	temporary: string = tmpdir(),
): string {
	const override = env.HARNESS495_WORKSPACES_DIR;
	if (override?.trim()) return override;
	const colocated = join(dataDir, "workspaces");
	if (!/\s/.test(colocated)) return colocated;
	const cache = platform === "darwin" ? join(home, "Library", "Caches", "495", "workspaces") : join(home, ".cache", "495", "workspaces");
	return /\s/.test(cache) ? join(temporary, "495-workspaces") : cache;
}

export interface DataLayout {
	root: string;
	database: string;
	objects: string;
	workspaces: string;
	exports: string;
	locks: string;
	logs: string;
}

export function dataLayout(root: string): DataLayout {
	// `workspaces` is the legacy colocated root. New runtimes resolve their active root separately.
	return { root, database: join(root, "state.sqlite"), objects: join(root, "objects"), workspaces: join(root, "workspaces"), exports: join(root, "exports"), locks: join(root, "locks"), logs: join(root, "logs") };
}
