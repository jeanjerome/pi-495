/**
 * A change's journal and projection as a version before the phases took the name of their step wrote
 * them: `clarifying`, `specifying`, `verification_design`, `designing`, `implementing`, `integrating`.
 */
import { join } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { canonicalize } from "../../src/contracts/canonical.ts";
import { sha256Hex } from "../../src/contracts/digest.ts";

/** The identifier a version before the rename wrote for each step it names today. */
const WRITTEN_BEFORE: Record<string, string> = {
	scoping: "clarifying",
	specification: "specifying",
	qualification: "verification_design",
	design: "designing",
	implementation: "implementing",
	integration: "integrating",
};

export const OLD_IDS = Object.values(WRITTEN_BEFORE);

export interface EventRow {
	event_id: string;
	payload: string;
	previous_hash: string | null;
	hash: string;
}

/** The change's journal rows, in the order they were appended. */
function eventRows(db: DatabaseSync, changeId: string): EventRow[] {
	const text = (value: SQLOutputValue | undefined): string => String(value);
	return db
		.prepare(
			"SELECT event_id, payload, previous_hash, hash FROM events WHERE aggregate_kind = 'change' AND aggregate_id = ? ORDER BY sequence",
		)
		.all(changeId)
		.map((row) => ({
			event_id: text(row.event_id),
			payload: text(row.payload),
			previous_hash: row.previous_hash === null ? null : text(row.previous_hash),
			hash: text(row.hash),
		}));
}

/**
 * Rewrites the change's journal and projection, in the data directory `root`, as a version before the
 * rename wrote them: the phase of `phase.entered` and `resume_point.saved`, the `rollback_phase` of
 * `artifact.revised`, and the phase of the projection carry the old identifiers, under a hash chain
 * recomputed over those bytes. Returns the rows as stored.
 */
export function writtenBeforeTheRename(root: string, changeId: string): EventRow[] {
	const old = (phase: string): string => WRITTEN_BEFORE[phase] ?? phase;
	const db = new DatabaseSync(join(root, "state.sqlite"));
	try {
		const stored = eventRows(db, changeId);
		let previous: string | null = null;
		const rewritten: EventRow[] = [];
		for (const row of stored) {
			const event = JSON.parse(row.payload) as Record<string, unknown>;
			if (event.type === "phase.entered" || event.type === "resume_point.saved") event.phase = old(String(event.phase));
			if (event.type === "artifact.revised") event.rollback_phase = old(String(event.rollback_phase));
			const payload = canonicalize(event);
			const hash: string = `sha256:${sha256Hex(`${previous ?? ""}${payload}`)}`;
			db.prepare("UPDATE events SET payload = ?, previous_hash = ?, hash = ? WHERE event_id = ?").run(
				payload,
				previous,
				hash,
				row.event_id,
			);
			rewritten.push({ event_id: row.event_id, payload, previous_hash: previous, hash });
			previous = hash;
		}
		db.prepare("UPDATE aggregates SET last_hash = ? WHERE aggregate_kind = 'change' AND aggregate_id = ?").run(
			previous,
			changeId,
		);
		const projected = db.prepare("SELECT state FROM changes WHERE change_id = ?").get(changeId) as { state: string };
		const state = JSON.parse(projected.state) as { phase: string; resume_point: { phase: string } | null };
		state.phase = old(state.phase);
		if (state.resume_point) state.resume_point.phase = old(state.resume_point.phase);
		db.prepare("UPDATE changes SET phase = ?, state = ? WHERE change_id = ?").run(
			state.phase,
			JSON.stringify(state),
			changeId,
		);
		return rewritten;
	} finally {
		db.close();
	}
}

/** The change's journal rows as stored in the data directory `root`. */
export function storedRows(root: string, changeId: string): EventRow[] {
	const db = new DatabaseSync(join(root, "state.sqlite"), { readOnly: true });
	try {
		return eventRows(db, changeId);
	} finally {
		db.close();
	}
}
