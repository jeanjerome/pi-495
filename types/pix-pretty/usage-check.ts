/**
 * What `src/presentation/tui/review/diff-view.ts` asks of `@xynogen/pix-pretty`, written against the
 * package itself instead of against the declarations beside this file.
 *
 * Those declarations are ours — the package ships sources and no build — so nothing would notice if
 * the version moved under them: the compiler would keep reading what we wrote and agree with itself.
 * This file is compiled without the `paths` mapping, so the specifiers below resolve to the
 * installed package, and the shapes the review builds are checked against the real ones.
 *
 * It is not compiled into `dist/` and is not part of the review: it exists to be refused.
 * `scripts/check-declarations.ts` runs it, and `npm run check` runs that.
 *
 * Keep it a mirror of the calls `diff-view.ts` makes. A drift here is the warning; a drift that this
 * file does not exercise is a call it forgot to copy.
 */
import type { ParsedDiff } from "@xynogen/pix-pretty/diff";
import { renderUnified } from "@xynogen/pix-pretty/diff-render";
import { lang } from "@xynogen/pix-pretty/lang";

/** The rows the review builds from its own segments, one of each kind it emits. */
const rows: ParsedDiff = {
	lines: [
		{ type: "ctx", oldNum: 1, newNum: 1, content: "unchanged" },
		{ type: "del", oldNum: 2, newNum: null, content: "was" },
		{ type: "add", oldNum: null, newNum: 2, content: "is" },
	],
	added: 1,
	removed: 1,
	chars: 16,
};

/** The language is read from the path, and handed straight through — undefined is a valid answer. */
const language: string | undefined = lang("src/greet.ts");

/** The call the reader makes, and the string it expects back. */
export async function drawnAsTheReviewDrawsIt(): Promise<string[]> {
	const drawn: string = await renderUnified(rows, language);
	return drawn.split("\n");
}
