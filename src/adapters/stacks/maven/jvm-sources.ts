/**
 * What a JVM source tree lays out, as the readers of its reports read it: which paths are declarations or
 * tests, which module a report under a `target/` directory measures, and which touched source a report
 * names by its package and file.
 */
/** Declarations without an executable line: no report mentions them, and none should. */
export const JVM_DECLARATION_ONLY = /(^|\/)(module-info|package-info)\.[a-z]+$/;
/** A test is what measures; it is never what is measured. */
export const JVM_TEST_SOURCE = /(^|\/)src\/test\//;

/** The module a report measures: `domain/target/site/jacoco/jacoco.xml` measures `domain`. */
export function moduleOf(reportName: string): string {
	const at = reportName.indexOf("/target/");
	return at > 0 ? reportName.slice(0, at) : "";
}

/**
 * The source path a package and a source file name. A report states neither the source root nor the
 * repository path, so the answer is looked up among the paths the candidate actually touched: one
 * match is the file, several is an ambiguity that is reported rather than guessed.
 */
export function resolveSourcePath(
	module: string,
	packageName: string,
	sourcefile: string,
	paths: readonly string[],
): { path: string | null; ambiguous: boolean } {
	const suffix = packageName ? `${packageName}/${sourcefile}` : sourcefile;
	const matches = paths.filter(
		(path) => (path === suffix || path.endsWith(`/${suffix}`)) && (module === "" || path.startsWith(`${module}/`)),
	);
	return { path: matches.length === 1 ? matches[0]! : null, ambiguous: matches.length > 1 };
}
