/**
 * The string literals of a Java compilation unit, read without compiling it: each literal and text block at the line
 * it opens on, nothing from a comment, no literal opened by a character literal.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { stringLiterals } from "../../src/adapters/stacks/maven/project/java-strings.ts";

describe("the string literals of a Java source", () => {
	it("a source with no literal gives none, the empty source included", () => {
		assert.deepEqual(stringLiterals(""), []);
		assert.deepEqual(stringLiterals("class A {}\n"), []);
	});

	it("a string literal and a text block are each given at the line they open on, the text block with its lines", () => {
		const source = 'class A {\n    String s = "io.demo.A";\n    String b = """\n        io.demo.B\n        """;\n}\n';
		assert.deepEqual(stringLiterals(source), [
			{ text: "io.demo.A", line: 2 },
			{ text: "\n        io.demo.B\n        ", line: 3 },
		]);
	});

	it("a line comment and a block comment hold no literal, and the lines they span are still counted", () => {
		const source = '// "io.demo.A"\n/* "io.demo.B"\n */\nString s = "io.demo.C";\n';
		assert.deepEqual(stringLiterals(source), [{ text: "io.demo.C", line: 4 }]);
	});

	it("a character literal holding a quote opens no string, and an escaped quote stays inside its literal", () => {
		const source = "char q = '\"'; char e = '\\''; String s = \"say \\\"hi\\\"\";\n";
		assert.deepEqual(stringLiterals(source), [{ text: 'say \\"hi\\"', line: 1 }]);
	});

	it("an unterminated literal ends at its line, and the next line is read on", () => {
		const source = 'String s = "io.demo.A;\nString t = "io.demo.B";\n';
		assert.deepEqual(stringLiterals(source), [
			{ text: "io.demo.A;", line: 1 },
			{ text: "io.demo.B", line: 2 },
		]);
	});
});
