/**
 * The prompt of a step, read from `cycle/prompts/<nom>.md` with its `{{champ}}` placeholders filled.
 * The prompts are the doctrine each session receives; they live beside the tool so a change to the
 * cycle is a change to a file the owner reads, never a string buried in code.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");

export function invite(nom: string, champs: Record<string, string | number>): string {
	const text = readFileSync(join(PROMPTS, `${nom}.md`), "utf8");
	const filled = text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
		const value = champs[key];
		if (value === undefined) throw new Error(`prompt ${nom}: no value for {{${key}}}`);
		return String(value);
	});
	return filled;
}
