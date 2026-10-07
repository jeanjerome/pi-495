/** The `package` and `import` declarations of a Java compilation unit, read without compiling it. */

/** One import declaration, at the line it is written on. */
export interface JavaImport {
	/** The imported name as written, a trailing `.*` removed: `a.b.C`, `a.b` or `a.b.C.member`. */
	name: string;
	line: number;
}

export interface JavaSource {
	/** Workspace-relative path, which is what a finding names. */
	path: string;
	package_name: string | null;
	imports: JavaImport[];
}

const PACKAGE_DECLARATION = /^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/;
const IMPORT_DECLARATION = /^\s*import\s+(?:static\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\.\*)?)\s*;/;

/**
 * The package and import declarations of one compilation unit, read line by line. Java requires
 * both before the first type declaration, so an anchored reading of every line finds them all; what
 * it would also find is the same text inside a comment or a text block, which changes no import.
 */
export function readDeclarations(path: string, text: string): JavaSource {
	const source: JavaSource = { path, package_name: null, imports: [] };
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const declared = PACKAGE_DECLARATION.exec(line);
		if (declared && source.package_name === null) {
			source.package_name = declared[1]!;
			continue;
		}
		const imported = IMPORT_DECLARATION.exec(line);
		if (imported) source.imports.push({ name: imported[1]!.replace(/\.\*$/, ""), line: i + 1 });
	}
	return source;
}
