import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contenuLu, dejaVerte, retenirVerte } from "../../cycle/src/preflight.ts";
import { depot } from "../helpers/cycle.ts";
import { gitCmd, removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

function commit(root: string, rel: string, content: string): void {
	mkdirSync(join(root, rel, ".."), { recursive: true });
	writeFileSync(join(root, rel), content);
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", `change ${rel}`]);
}

describe("what a green Preflight holds for", () => {
	it("names the same content after a commit that touches only a decision, the plan, the registry or a record", () => {
		const root = depot();
		const avant = contenuLu(root);
		commit(root, "specs/adr/D-01-greet.md", "# D-01\n");
		commit(root, "specs/plan.yaml", "epics: []\n");
		commit(root, "specs/bugs/registry.yaml", "bugs: []\n");
		commit(root, "specs/verifications/e01s05/README.md", "record\n");
		assert.notEqual(avant, null);
		assert.equal(contenuLu(root), avant);
	});

	it("names another content after a commit to the code, a test, a story, the normative corpus or the README", () => {
		for (const rel of ["src/greet.js", "test/x.test.js", "specs/stories/e01/x.md", "specs/amont/a.md", "README.md"]) {
			const root = depot();
			const avant = contenuLu(root);
			commit(root, rel, "changed\n");
			assert.notEqual(contenuLu(root), avant, rel);
		}
	});

	it("names nothing while the working tree differs from HEAD", () => {
		const root = depot();
		writeFileSync(join(root, "src", "greet.js"), "// edited, not committed\n");
		assert.equal(contenuLu(root), null);
	});

	it("remembers a green content for every story kept under the same directory", () => {
		const racine = tempDir("495-", cleanups);
		assert.equal(dejaVerte(racine, "abc"), false);
		retenirVerte(racine, "abc");
		assert.equal(dejaVerte(racine, "abc"), true);
		assert.equal(dejaVerte(racine, "abd"), false);
	});
});
