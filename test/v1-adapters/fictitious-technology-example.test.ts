import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { PACKAGE_ROOT } from "../helpers/built-package.ts";

const EXAMPLE = join(PACKAGE_ROOT, "examples", "fictitious-technology");
const GUIDE = "examples/fictitious-technology/README.md";

/** The modules `file` imports, statically, for their side effects alone, dynamically or by `require`. */
function importsOf(file: string): string[] {
	const text = readFileSync(file, "utf8");
	return [...text.matchAll(/(?:\bfrom|\bimport\s*\(?|\brequire\s*\()\s*["']([^"']+)["']/g)].map((match) => match[1]!);
}

describe("the example technology, documented, employs only the published interface", () => {
	it("given the example technology of the repository, each of its modules imports of 495 only pi-495/stack, beside node: modules and its own files", () => {
		const modules = readdirSync(EXAMPLE, { recursive: true, encoding: "utf8" }).filter((path) =>
			/\.[cm]?[jt]s$/.test(path),
		);
		assert.ok(modules.includes("fict.ts"), "the example technology is read");
		for (const module of modules) {
			const file = join(EXAMPLE, module);
			for (const specifier of importsOf(file)) {
				const own = specifier.startsWith(".") && !relative(EXAMPLE, resolve(dirname(file), specifier)).startsWith("..");
				assert.ok(
					specifier === "pi-495/stack" || specifier.startsWith("node:") || own,
					`${module} imports ${specifier}, which is neither pi-495/stack, a node: module nor a file of the example`,
				);
			}
		}
	});

	it("given the guide beside the example technology, it has a section for each capability and says how to run the conformance test", () => {
		const sections = readFileSync(join(PACKAGE_ROOT, GUIDE), "utf8")
			.split("\n")
			.filter((line) => line.startsWith("### "))
			.join("\n")
			.toLowerCase();
		for (const capability of [
			"recognition",
			"readers",
			"tests",
			"coverage",
			"mutation",
			"quality",
			"structure",
			"workspace",
			"install",
		])
			assert.match(sections, new RegExp(`\\b${capability}\\b`), `the guide has a section on ${capability}`);
		assert.ok(
			readFileSync(join(PACKAGE_ROOT, GUIDE), "utf8").includes("node examples/fictitious-technology/conformance.ts"),
			"the guide says how to run the conformance test",
		);
	});

	it('given the README, its "Other languages" line links to the guide of the example technology', () => {
		const line = readFileSync(join(PACKAGE_ROOT, "README.md"), "utf8")
			.split("\n")
			.find((row) => row.startsWith("| **Other languages** |"));
		assert.ok(line?.includes(`](${GUIDE})`), `the "Other languages" line links to ${GUIDE}: ${line}`);
		assert.ok(existsSync(join(PACKAGE_ROOT, GUIDE)), `${GUIDE} exists`);
	});
});
