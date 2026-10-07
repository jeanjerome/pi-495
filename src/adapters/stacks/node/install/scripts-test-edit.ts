/**
 * The rule the Node technology applies a recommended edit of `package.json` by: the value of `scripts.test` is
 * replaced where it stands in the text, so that the file stays byte for byte what it was around it and the
 * diff the owner reads shows that change only.
 */
import type { FileEdit } from "../../../../contracts/v1/protocol.ts";

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
		return null; // a manifest that is not JSON has no scripts.test to replace
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
