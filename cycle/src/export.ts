/**
 * The dossier of a landed story, written once under `specs/verifications/<story>/`: the journal,
 * and the objects it cites that fit in a repository — findings, outputs of controls, accounts. A
 * transcript of several megabytes stays in `~/.495/cycle/objects`, cited by its digest. An object the
 * store no longer holds is named in an `objets-absents` event, so the dossier says what it lacks.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Journal } from "./journal.ts";

const TAILLE_MAX_EXPORTEE = 256 * 1024;

interface Ref {
	digest: string;
	size_bytes: number;
}

function refs(value: unknown, found: Ref[] = []): Ref[] {
	if (Array.isArray(value)) for (const v of value) refs(v, found);
	else if (value && typeof value === "object") {
		const o = value as Record<string, unknown>;
		if (o.algorithm === "sha256" && typeof o.digest === "string" && typeof o.size_bytes === "number")
			found.push({ digest: o.digest, size_bytes: o.size_bytes });
		else for (const v of Object.values(o)) refs(v, found);
	}
	return found;
}

export async function exporterDossier(journal: Journal, root: string): Promise<string> {
	const dir = join(root, "specs", "verifications", journal.story);
	mkdirSync(join(dir, "objets"), { recursive: true });
	const seen = new Set<string>();
	const absents: string[] = [];
	for (const ref of refs(journal.lire())) {
		if (seen.has(ref.digest)) continue;
		seen.add(ref.digest);
		if (ref.size_bytes > TAILLE_MAX_EXPORTEE) {
			if (!(await journal.objets.has(ref.digest))) absents.push(ref.digest);
			continue;
		}
		const bytes = await journal.objets.get(ref.digest);
		if (bytes) writeFileSync(join(dir, "objets", ref.digest.replace("sha256:", "")), bytes);
		else absents.push(ref.digest);
	}
	if (absents.length > 0) journal.inscrire("versement", "objets-absents", { digests: absents });
	writeFileSync(
		join(dir, "journal.jsonl"),
		`${journal
			.lire()
			.map((e) => JSON.stringify(e))
			.join("\n")}\n`,
	);
	return dir;
}
