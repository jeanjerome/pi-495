import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	arbreDetache,
	arbrePropre,
	brancheCourante,
	commitsEntre,
	contenuA,
	estCommitDeTestSeul,
	fichiersChanges,
	retirerArbre,
	revision,
	versementEcrase,
} from "../../cycle/src/git.ts";
import { gitCmd, writeFiles } from "../helpers/fixtures.ts";
import { depotDe } from "../helpers/cycle.ts";

function depot(): string {
	return depotDe((root) => {
		writeFiles(root, { "src/a.js": "export const a = 1;\n", "node_modules/.keep": "" });
		writeFileSync(join(root, ".gitignore"), "node_modules/\n");
	});
}

describe("the git operations of the cycle", () => {
	it("lists the commits of a branch with the paths each touched, and tells a test-only commit apart", () => {
		const root = depot();
		const base = revision(root);
		gitCmd(root, ["checkout", "-q", "-b", "story"]);
		writeFiles(root, { "test/a.test.js": "// red\n" });
		gitCmd(root, ["add", "-A"]);
		gitCmd(root, ["commit", "-q", "-m", "test: a fails"]);
		writeFiles(root, { "src/a.js": "export const a = 2;\n", "test/a.test.js": "// green\n" });
		gitCmd(root, ["add", "-A"]);
		gitCmd(root, ["commit", "-q", "-m", "feat: a is 2"]);
		assert.equal(brancheCourante(root), "story");
		assert.equal(arbrePropre(root), true);
		const commits = commitsEntre(root, base);
		assert.deepEqual(
			commits.map((c) => [c.sujet, c.fichiers, estCommitDeTestSeul(c)]),
			[
				["test: a fails", ["test/a.test.js"], true],
				["feat: a is 2", ["src/a.js", "test/a.test.js"], false],
			],
		);
		assert.deepEqual(fichiersChanges(root, "main").sort(), ["src/a.js", "test/a.test.js"]);
		assert.deepEqual(commitsEntre(root, "HEAD"), []);
	});

	it("does not take for a test-only commit the code a story keeps under test/, committed as feat", () => {
		const root = depot();
		const base = revision(root);
		gitCmd(root, ["checkout", "-q", "-b", "story"]);
		writeFiles(root, { "test/support/reader.ts": "export const read = 1;\n" });
		gitCmd(root, ["add", "-A"]);
		gitCmd(root, ["commit", "-q", "-m", "feat: the reader reads"]);
		assert.deepEqual(
			commitsEntre(root, base).map((c) => [c.sujet, estCommitDeTestSeul(c)]),
			[["feat: the reader reads", false]],
		);
	});

	it("opens a detached tree at a commit with node_modules linked, and removes it", () => {
		const root = depot();
		const sha = revision(root);
		const tree = arbreDetache(root, sha);
		assert.equal(readFileSync(join(tree, "src/a.js"), "utf8"), "export const a = 1;\n");
		assert.equal(existsSync(join(tree, "node_modules", ".keep")), true);
		retirerArbre(root, tree);
		assert.equal(existsSync(tree), false);
	});

	it("reads a file as a commit holds it, and null for a path the commit does not hold", () => {
		const root = depot();
		const sha = revision(root);
		writeFiles(root, { "src/a.js": "export const a = 2;\n" });
		assert.equal(contenuA(root, sha, "src/a.js"), "export const a = 1;");
		assert.equal(contenuA(root, sha, "src/b.js"), null);
	});

	it("lands a branch on main as one squashed commit and keeps the branch", () => {
		const root = depot();
		gitCmd(root, ["checkout", "-q", "-b", "story"]);
		for (const n of [1, 2]) {
			writeFiles(root, { [`src/${n}.js`]: "" });
			gitCmd(root, ["add", "-A"]);
			gitCmd(root, ["commit", "-q", "-m", `feat: ${n}`]);
		}
		const sha = versementEcrase(root, "story", "main", "feat: one and two");
		assert.equal(brancheCourante(root), "main");
		assert.equal(gitCmd(root, ["log", "--format=%s", "-2"]).trim(), "feat: one and two\nchore: base");
		assert.equal(revision(root), sha);
		assert.equal(gitCmd(root, ["branch", "--list", "story"]).trim(), "story");
	});
});
