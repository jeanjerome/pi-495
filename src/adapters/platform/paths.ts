import { homedir } from "node:os";
import { join } from "node:path";

/** Data directory outside the target project (conception §7.1, decision D-03). */
export function resolveDataDir(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
	const override = env.HARNESS495_DATA_DIR;
	if (override && override.trim()) return override;
	if (platform === "darwin") return join(homedir(), "Library", "Application Support", "495");
	if (platform === "win32") return join(env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "495");
	const xdg = env.XDG_DATA_HOME && env.XDG_DATA_HOME.trim() ? env.XDG_DATA_HOME : join(homedir(), ".local", "share");
	return join(xdg, "495");
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
	return { root, database: join(root, "state.sqlite"), objects: join(root, "objects"), workspaces: join(root, "workspaces"), exports: join(root, "exports"), locks: join(root, "locks"), logs: join(root, "logs") };
}
