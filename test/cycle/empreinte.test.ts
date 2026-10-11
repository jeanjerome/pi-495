import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { empreinte } from "../../cycle/src/empreinte.ts";
import { removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

function construction(): string {
	const dossier = tempDir("495-", cleanups);
	mkdirSync(join(dossier, "extension"));
	writeFileSync(join(dossier, "extension", "index.js"), "export default () => {};\n");
	writeFileSync(join(dossier, "stack.d.ts"), "export {};\n");
	return dossier;
}

describe("the identity of the controller's build", () => {
	it("holds while no file changes, and changes with the content, the name or the number of its files", () => {
		const [a, b] = [construction(), construction()];
		assert.equal(empreinte(a), empreinte(b), "two identical builds in two places have one identity");

		const avant = empreinte(a);
		writeFileSync(join(a, "extension", "index.js"), "export default () => 1;\n");
		assert.notEqual(empreinte(a), avant, "a rewritten file changes the identity");

		const avantRenommage = empreinte(b);
		renameSync(join(b, "stack.d.ts"), join(b, "pile.d.ts"));
		assert.notEqual(empreinte(b), avantRenommage, "a renamed file changes the identity");

		const avantAjout = empreinte(b);
		writeFileSync(join(b, "extension", "vide.js"), "");
		assert.notEqual(empreinte(b), avantAjout, "an added empty file changes the identity");
	});
});
