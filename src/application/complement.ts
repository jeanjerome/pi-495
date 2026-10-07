/**
 * Applying the edit of a recommended complement to the text of a file of the target, by the rule the
 * technology that recommends it declares, or by replacing the one place the current value occurs. The value
 * is replaced where it stands in the text, so that the file stays byte for byte what it was around it and the
 * diff the owner reads shows that change only. Once adopted, a complement is written into the copies where a
 * control runs.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { digestBytes } from "../contracts/digest.ts";
import type { ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type { AdoptedComplement, FileEdit, RecommendedComplement } from "../contracts/v1/protocol.ts";
import type { WorkspaceHandle, WorkspacePolicy, WorkspacePort } from "../ports/execution.ts";
import type { ObjectStorePort } from "../ports/object-store.ts";
import { writeStoredFiles } from "./artifacts.ts";

/** How the text of a file is changed by a recommended edit, or null when the edit does not apply to it. */
export type EditRule = (text: string, edit: FileEdit) => string | null;

/**
 * The text with the one place `edit.current` occurs replaced by `edit.wanted`, or null when it does not
 * occur exactly once: with no single place to replace, the edit is not applied.
 */
function applyExactEdit(text: string, edit: FileEdit): string | null {
	const parts = text.split(edit.current);
	if (edit.current === "" || parts.length !== 2) return null;
	return `${parts[0]}${edit.wanted}${parts[1]}`;
}

/**
 * The text `edit` makes of the file it names under `projectPath` by `rule`, the rule of the technology that
 * recommends it when it declares one, or null when the edit does not apply to it.
 */
export function editedFile(projectPath: string, edit: FileEdit, rule: EditRule = applyExactEdit): string | null {
	const file = join(projectPath, edit.path);
	if (!existsSync(file)) return null;
	return rule(readFileSync(file, "utf8"), edit);
}

/**
 * Writes into the copy at `projectPath` the edit of each recommended complement that has one and
 * that applies by `rule`, and returns the complements as the protocol carries them, with the digest of
 * each file written.
 */
export function applyRecommendedEdits(
	projectPath: string,
	recommendations: readonly RecommendedComplement[],
	rule?: EditRule,
): AdoptedComplement[] {
	const complements: AdoptedComplement[] = [];
	for (const r of recommendations) {
		if (r.edit === undefined) continue;
		const text = editedFile(projectPath, r.edit, rule);
		if (text === null) continue;
		writeFileSync(join(projectPath, r.edit.path), text);
		complements.push({ path: r.edit.path, digest: digestBytes(text), test_type: r.test_type, tool: r.tool });
	}
	return complements;
}

/**
 * A copy of the reference that carries the adopted complements, written from the object store before
 * anything else is put in it: a control that needs a complement to run finds it in every copy it runs in.
 */
export async function openWorkspaceWithComplements(
	deps: { workspace: WorkspacePort; workspacePolicy: WorkspacePolicy; objects: ObjectStorePort },
	reference: ReferenceSnapshot,
	complements: readonly AdoptedComplement[],
): Promise<WorkspaceHandle> {
	const handle = await deps.workspace.createWorkspace(reference, deps.workspacePolicy);
	try {
		await writeStoredFiles(deps.objects, complements, handle.path);
	} catch (error) {
		await deps.workspace.closeWorkspace(handle.workspace_id, "delete");
		throw error;
	}
	return handle;
}
