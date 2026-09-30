/**
 * Applying the edit of a recommended complement to the text of a target's `package.json`. The value
 * is replaced where it stands in the text, so that the file stays byte for byte what it was around it
 * and the diff the owner reads shows that line only. Once adopted, a complement is written into the
 * copies where a control runs.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { digestBytes } from "../contracts/digest.ts";
import type { ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type { AdoptedComplement, FileEdit, RecommendedComplement } from "../contracts/v1/protocol.ts";
import type { WorkspaceHandle, WorkspacePolicy, WorkspacePort } from "../ports/execution.ts";
import type { ObjectStorePort } from "../ports/object-store.ts";
import { writeStoredFiles } from "./artifacts.ts";

interface Member {
	key: string;
	start: number;
	end: number;
}

function skipSpace(text: string, from: number): number {
	let i = from;
	while (/\s/.test(text[i] ?? "")) i++;
	return i;
}

/** The index after the string literal that opens at `from`. */
function stringEnd(text: string, from: number): number {
	let i = from + 1;
	while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
	return i + 1;
}

/** The index after the JSON value that starts at `from`; the text is known to be well-formed. */
function valueEnd(text: string, from: number): number {
	const first = text[from];
	if (first === '"') return stringEnd(text, from);
	if (first !== "{" && first !== "[") {
		let i = from;
		while (!/[\s,}\]]/.test(text[i] ?? " ")) i++;
		return i;
	}
	const close = first === "{" ? "}" : "]";
	let i = from + 1;
	for (;;) {
		i = skipSpace(text, i);
		if (text[i] === close) return i + 1;
		i = text[i] === "," || text[i] === ":" ? i + 1 : valueEnd(text, i);
	}
}

/** The members of the object that opens at `from`, each with the span of its value. */
function membersOf(text: string, from: number): Member[] {
	const members: Member[] = [];
	let i = from + 1;
	for (;;) {
		i = skipSpace(text, i);
		if (text[i] === "}") return members;
		if (text[i] === ",") {
			i++;
			continue;
		}
		const keyEnd = stringEnd(text, i);
		const start = skipSpace(text, skipSpace(text, keyEnd) + 1);
		const end = valueEnd(text, start);
		members.push({ key: JSON.parse(text.slice(i, keyEnd)) as string, start, end });
		i = end;
	}
}

/**
 * The text of `packageJson` with the value of `scripts.test` replaced by the one the edit wants, or
 * null when the edit describes something else: the current value is not the one the edit names, or
 * `scripts` or `test` is absent or written twice, so that no one place is the value to replace.
 */
export function applyScriptsTestEdit(packageJson: string, edit: FileEdit): string | null {
	try {
		JSON.parse(packageJson);
	} catch {
		return null;
	}
	const root = skipSpace(packageJson, 0);
	if (packageJson[root] !== "{") return null;
	const scripts = membersOf(packageJson, root).filter((m) => m.key === "scripts");
	if (scripts.length !== 1 || packageJson[scripts[0]!.start] !== "{") return null;
	const tests = membersOf(packageJson, scripts[0]!.start).filter((m) => m.key === "test");
	if (tests.length !== 1) return null;
	const { start, end } = tests[0]!;
	if (packageJson[start] !== '"' || JSON.parse(packageJson.slice(start, end)) !== edit.current) return null;
	return packageJson.slice(0, start) + JSON.stringify(edit.wanted) + packageJson.slice(end);
}

/** The text `edit` makes of the file it names under `projectPath`, or null when the edit does not apply to it. */
export function editedFile(projectPath: string, edit: FileEdit): string | null {
	const file = join(projectPath, edit.path);
	return existsSync(file) ? applyScriptsTestEdit(readFileSync(file, "utf8"), edit) : null;
}

/**
 * Writes into the copy at `projectPath` the edit of each recommended complement that has one and
 * that applies, and returns the complements as the protocol carries them, with the digest of each
 * file written.
 */
export function applyRecommendedEdits(
	projectPath: string,
	recommendations: readonly RecommendedComplement[],
): AdoptedComplement[] {
	const complements: AdoptedComplement[] = [];
	for (const r of recommendations) {
		if (r.edit === undefined) continue;
		const text = editedFile(projectPath, r.edit);
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
