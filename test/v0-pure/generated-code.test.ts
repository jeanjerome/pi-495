import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { declaresGenerated } from "../../src/domain/generated-code.ts";

const ANNOTATIONS = ["javax.annotation.processing.Generated", "jakarta.annotation.Generated"];

describe("a Java compilation unit that declares itself generated", () => {
	it("is marked by an annotation on a top-level type, written qualified or imported, its class or its package", () => {
		for (const source of [
			'package a;\n\n@javax.annotation.processing.Generated("g")\npublic class A {}\n',
			'package a;\n\nimport jakarta.annotation.Generated;\n\n@Generated("g")\npublic class A {}\n',
			'package a;\n\nimport jakarta.annotation.*;\n\n@Generated(value = {"g", "h"})\nfinal class A {}\n',
			'package a;\n\nclass B {}\n\n@ jakarta . annotation . Generated("g")\nrecord A() {}\n',
		])
			assert.equal(declaresGenerated(source, ANNOTATIONS), true, source);
	});

	it("is not marked by an annotation on a member, in a comment or a string, of another package, or not imported", () => {
		for (const source of [
			'package a;\n\npublic class A {\n    @javax.annotation.processing.Generated("g")\n    void m() {}\n}\n',
			'package a;\n\n// @javax.annotation.processing.Generated("g")\n/* @jakarta.annotation.Generated */\npublic class A {}\n',
			'package a;\n\n@Deprecated(since = "@javax.annotation.processing.Generated")\npublic class A {}\n',
			'package a;\n\nimport javax.annotation.Generated;\n\n@Generated("g")\npublic class A {}\n',
			'package a;\n\n@Generated("g")\npublic class A {}\n',
			"package a;\n\npublic class A {}\n",
		])
			assert.equal(declaresGenerated(source, ANNOTATIONS), false, source);
		assert.equal(declaresGenerated('@jakarta.annotation.Generated("g")\nclass A {}\n', []), false, "no annotation");
	});
});
