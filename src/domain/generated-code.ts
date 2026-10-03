/**
 * Whether a Java compilation unit declares itself generated code. Only the declaration counts: a
 * generator says so with an annotation on the type it writes, and a file that merely looks generated
 * is code like any other, which an exclusion with an adopted justification alone could set apart (QLT-04).
 */

/** Comments, text blocks, strings and characters, which no declaration is written in. */
const NOT_CODE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g;

const IMPORT = /^\s*import\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*(?:\s*\.\s*\*)?)\s*;/gm;

/** A brace, or an annotation with its name as written, qualified or not. */
const BRACE_OR_ANNOTATION = /[{}]|@\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)/g;

/**
 * Whether a top-level type of `source` carries one of `annotations`, each fully qualified, written as is
 * or under the simple name its import or the import of its package brings into scope. An annotation on
 * a member marks that member and not the file.
 */
export function declaresGenerated(source: string, annotations: readonly string[]): boolean {
	const code = source.replace(NOT_CODE, " ");
	const imports = new Set([...code.matchAll(IMPORT)].map((m) => m[1]!.replace(/\s+/g, "")));
	const marks = (written: string) =>
		annotations.some((annotation) => {
			const dot = annotation.lastIndexOf(".");
			return (
				written === annotation ||
				(written === annotation.slice(dot + 1) &&
					(imports.has(annotation) || imports.has(`${annotation.slice(0, dot)}.*`)))
			);
		});
	let depth = 0;
	for (const match of code.matchAll(BRACE_OR_ANNOTATION)) {
		if (match[0] === "{") depth++;
		else if (match[0] === "}") depth--;
		else if (depth === 0 && marks(match[1]!.replace(/\s+/g, ""))) return true;
	}
	return false;
}
