import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { Executeur, controleDeTache, estUnRouge, PREFLIGHT } from "../../cycle/src/controls.ts";
import { revision } from "../../cycle/src/git.ts";
import { fixtureTs, gitCmd, tempDir, writeFiles, removedAfterEach } from "../helpers/fixtures.ts";
import { depotDe } from "../helpers/cycle.ts";

const cleanups = removedAfterEach();

const NODE = process.execPath;

function depot(): string {
	return depotDe(fixtureTs);
}

function executeur(): Executeur {
	return new Executeur(new UnconfinedSandbox(), new CasObjectStore(join(tempDir("495-", cleanups), "objects")));
}

describe("the controls of the cycle", () => {
	it("makes a node:test command report TAP so its failures are read, and leaves any other command alone", () => {
		assert.deepEqual(controleDeTache(1, ["node", "--test", "test/a.test.js"]).commande, [
			"node",
			"--test",
			"--test-reporter=tap",
			"test/a.test.js",
		]);
		assert.deepEqual(controleDeTache(2, ["npm", "run", "check"]).commande, ["npm", "run", "check"]);
		assert.equal(PREFLIGHT.reseau, "loopback");
	});

	it("records a passing task command as PASS with its outputs kept, at the revision it ran on", async () => {
		const root = depot();
		const preuve = await executeur().executer(
			controleDeTache(1, [NODE, "--test", "test/greet.test.js"]),
			root,
			"e01s05",
		);
		assert.equal(preuve.verdict, "PASS");
		assert.equal(preuve.revision, revision(root));
		assert.deepEqual(preuve.echecs, []);
		assert.equal(preuve.sandbox, "unconfined");
		assert.ok(preuve.artifacts.some((a) => a.name === "stdout"));
		assert.equal(estUnRouge(preuve), false);
	});

	it("reads which test fails at a test-only commit, replayed in a detached tree, and tells a missing file from a red", async () => {
		const root = depot();
		writeFiles(root, {
			"test/shout.test.js":
				'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { greet } from "../src/greet.js";\n\ntest("greet shouts", () => {\n  assert.equal(greet("x"), "HELLO, X");\n});\n',
		});
		gitCmd(root, ["add", "-A"]);
		gitCmd(root, ["commit", "-q", "-m", "test: greet shouts"]);
		const red = revision(root);
		writeFiles(root, {
			"src/greet.js": "export function greet(name) {\n  return `Hello, ${name}`.toUpperCase();\n}\n",
		});
		gitCmd(root, ["add", "-A"]);
		gitCmd(root, ["commit", "-q", "-m", "feat: greet shouts"]);
		const run = executeur();
		const control = controleDeTache(1, [NODE, "--test", "test/shout.test.js"]);
		const atRed = await run.executerA(control, root, red, "e01s05");
		assert.equal(atRed.verdict, "FAIL");
		assert.ok(
			atRed.echecs.some((e) => e.includes("greet shouts")),
			atRed.echecs.join("; "),
		);
		assert.equal(estUnRouge(atRed), true);
		assert.equal(atRed.revision, red);
		const atGreen = await run.executer(control, root, "e01s05");
		assert.equal(atGreen.verdict, "PASS");
		const absent = await run.executer(controleDeTache(2, [NODE, "--test", "test/absent.test.js"]), root, "e01s05");
		assert.equal(absent.verdict, "FAIL");
		assert.equal(estUnRouge(absent), false);
	});
});
