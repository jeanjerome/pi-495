/**
 * What the campaign instruments share when they read a dossier: its one change, from its own
 * ledger, opened read-only so that a campaign still running is followed without being written to.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ChangeState } from "../../src/domain/change/state.ts";

export function fail(message: string): never {
	console.error(message);
	process.exit(2);
}

/** A path the owner quoted, so that the shell left its `~` alone. */
export function expandHome(path: string): string {
	return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

/** A path under the home directory is shown the way the owner writes it. */
export function tilde(path: string): string {
	return path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path;
}

/** Hands the dossier's one change and its ledger to `read`, then closes the ledger. */
export function readChange<T>(root: string, read: (db: DatabaseSync, state: ChangeState) => T): T {
	if (!existsSync(join(root, "state.sqlite"))) fail(`${root}: no state.sqlite, so no dossier to read here`);
	const db = new DatabaseSync(join(root, "state.sqlite"), { readOnly: true });
	try {
		const changes = db.prepare("SELECT change_id, state FROM changes").all() as { change_id: string; state: string }[];
		if (changes.length !== 1)
			fail(
				`${root}: ${changes.length} changes in this dossier (${changes.map((c) => c.change_id).join(", ") || "none"}); ` +
					"a campaign is one change in its own data directory",
			);
		return read(db, JSON.parse(changes[0]!.state) as ChangeState);
	} finally {
		db.close();
	}
}
