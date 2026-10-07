/** Where the witnesses of a Maven target are written: their package, and the module they go in (VER-05). */
import type { MavenReactor } from "./reactor.ts";

/**
 * The package the witnesses of a Maven target are written in, on both sides of the source root.
 * None of them sits in the default package: a mutation engine scopes the tests it runs to the
 * packages its test tree declares, so a witness test outside every package is never executed, and a
 * sensor proved on a witness nothing ran is not proved at all (VER-05).
 */
export const WITNESS_PACKAGE = "witness495";
export const WITNESS_SOURCE_ROOT = `src/main/java/${WITNESS_PACKAGE}/`;
export const WITNESS_TEST_ROOT = `src/test/java/${WITNESS_PACKAGE}/`;

/** A witness class of one method, whose body is the single expression the mutators rewrite. */
export function witnessClass(name: string, method: string, body: string): string {
	return `package ${WITNESS_PACKAGE};\n\npublic final class ${name} {\n    public int ${method}(int n) {\n        return ${body};\n    }\n}\n`;
}

/** The directory of the module the witnesses go in, before their source roots: a leaf module of the reactor, or its root. */
export function witnessPrefix(reactor: MavenReactor): string {
	return reactor.witness_module ? `${reactor.witness_module}/` : "";
}
