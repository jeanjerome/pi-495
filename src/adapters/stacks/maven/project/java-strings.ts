/** The string literals of a Java compilation unit, read without compiling it, comments and character literals aside. */

/** One string literal or text block, its content as written between its quotes, at the line it opens on. */
interface JavaString {
	text: string;
	line: number;
}

/** The index past the end of a literal opened at `start` and closed by `quote`, an escaped quote kept inside it. */
function closingOf(text: string, start: number, quote: string, stopAtNewline: boolean): number {
	let i = start;
	while (i < text.length) {
		if (text[i] === "\\") {
			i += 2;
			continue;
		}
		if (text.startsWith(quote, i)) return i;
		if (stopAtNewline && text[i] === "\n") return i;
		i++;
	}
	return text.length;
}

/** The index `found`, or `otherwise` when nothing was found. */
const endOf = (found: number, otherwise: number) => (found < 0 ? otherwise : found);

/**
 * Every string literal and text block of `text`, in order. A comment holds no literal, and a character literal is
 * skipped so that `'"'` opens none; an unterminated literal ends at its line, as the compiler would refuse it there.
 */
export function stringLiterals(text: string): JavaString[] {
	const strings: JavaString[] = [];
	let line = 1;
	const advance = (from: number, to: number) => {
		for (let k = from; k < to; k++) if (text[k] === "\n") line++;
	};
	let i = 0;
	while (i < text.length) {
		const at = text[i];
		let end: number;
		if (text.startsWith("//", i)) end = endOf(text.indexOf("\n", i), text.length);
		else if (text.startsWith("/*", i)) end = endOf(text.indexOf("*/", i + 2), text.length - 2) + 2;
		else if (text.startsWith('"""', i)) {
			const close = closingOf(text, i + 3, '"""', false);
			strings.push({ text: text.slice(i + 3, close), line });
			end = Math.min(close + 3, text.length);
		} else if (at === '"') {
			const close = closingOf(text, i + 1, '"', true);
			strings.push({ text: text.slice(i + 1, close), line });
			end = Math.min(close + 1, text.length);
		} else if (at === "'") end = Math.min(closingOf(text, i + 1, "'", true) + 1, text.length);
		else end = i + 1;
		advance(i, end);
		i = end;
	}
	return strings;
}
