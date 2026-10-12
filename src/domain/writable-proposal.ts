/**
 * The directories of the copy the owner may be offered to give a control, read from the paths its suite wrote in a
 * disposable copy. Those names are chosen by confined code, so what may be offered is bounded here, whatever produced
 * the paths, and only the owner's answer grants anything (D-90, D-92).
 */

/**
 * The first level under the copy of each path written in it, as a directory, each once, less those `given` already
 * names. A path outside the copy, absolute, is never offered (D-76), nor the root of the copy, nor its parent a path
 * starting with `..` names; a file at the root of the copy is offered as a directory, since the policy gives nothing
 * else.
 */
export function offeredWritableDirectories(written: readonly string[], given: readonly string[]): string[] {
	const held = new Set(given.map((p) => p.replace(/\/+$/, "")));
	const first = written.filter((p) => !p.startsWith("/")).map((p) => p.split("/")[0] ?? "");
	return [...new Set(first)].filter((d) => d !== "" && d !== "." && d !== ".." && !held.has(d)).map((d) => `${d}/`);
}
