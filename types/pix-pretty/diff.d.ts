/** Declared here, not by the package: see README.md beside this file. */

export interface DiffLine {
	type: "add" | "del" | "ctx" | "sep";
	oldNum: number | null;
	newNum: number | null;
	content: string;
}

export interface ParsedDiff {
	lines: DiffLine[];
	added: number;
	removed: number;
	chars: number;
}

/** `baseLine` shifts the gutter numbers from snippet-relative to absolute; 0 leaves them relative. */
export declare function parseDiff(
	oldContent: string,
	newContent: string,
	ctx?: number,
	baseLine?: number,
): ParsedDiff;
