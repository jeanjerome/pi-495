/**
 * The rule that an npm package declares in `package.json` the dependencies its code uses, and uses those it
 * declares, checked by Knip 6.40.0 on a real package under TypeScript 7.0.2, through the generic runner and the
 * platform sandbox: once a copy carries Knip beside dependency-cruiser and swc, installed as an adoption installs
 * them, the dependencies control is qualified by its own witness although the package already breaks the rule,
 * and the pass on the reference reports each gap at its file and line, every source read, the packages 495
 * installs left out, and no configuration of Knip the package carries read or run. The tests of the package do
 * not run Knip.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import {
	adoptedCopy,
	assertStoryGaps,
	BASE,
	located,
	PG_LINE,
	qualifiedAndPassed,
	REPOSITORY,
	USED_UNDECLARED,
} from "../helpers/node-dependencies-copy.ts";

const OLD_USERS = "src/legacy/old-users.js";
/** What `knip.ts` writes when Knip loads it. */
const KNIP_TS_TRACE = "knip-ts-loaded.txt";

/** The configuration of Knip the package carries itself, which ignores the two gaps, and whose code writes a file when loaded. */
const OWN_CONFIGURATION: Record<string, string> = {
	"knip.json": `${JSON.stringify({ ignoreDependencies: ["lodash", "pg"] }, null, 2)}\n`,
	"knip.ts": `import { writeFileSync } from "node:fs";\n\nwriteFileSync(new URL("./${KNIP_TS_TRACE}", import.meta.url), "loaded\\n");\n\nexport default { ignoreDependencies: ["lodash"] };\n`,
};

describe("Knip compares the dependencies an npm package declares to those its code uses", () => {
	const cleanups = removedAfterEach();

	it("sur le paquet users sous TypeScript 7.0.2, sans main ni exports, le contrôle des dépendances est qualifié par ses témoins bien que le paquet enfreigne la règle, et la passe de référence rapporte l'usage de pg à la ligne de son import dans src/adapters/db/sql-user-repository.ts et la déclaration inutilisée de lodash à sa ligne de package.json, sans constat sur dependency-cruiser, @swc/core ni Knip", async () => {
		const root = outputDir("node-dependencies-", cleanups);
		const reference = adoptedCopy(root);
		const { qualification: q, pass, own } = await qualifiedAndPassed(root, reference);
		assert.deepEqual(
			[q.positive, q.negative, q.incident, q.qualified],
			["PASS", "FAIL", "INDETERMINATE", true],
			JSON.stringify(q.notes),
		);
		assert.ok(
			Object.keys(own).every((path) => /(^|\/)tests?\//.test(path)),
			`the witness is a source of test: ${Object.keys(own).join(", ")}`,
		);
		assertStoryGaps(reference, pass);
		const installed = JSON.parse(readFileSync(join(reference, "package.json"), "utf8")) as {
			devDependencies: Record<string, string>;
		};
		assert.deepEqual(
			["dependency-cruiser", "@swc/core", "knip"].map((name) => installed.devDependencies[name]),
			["18.5.0", "1.16.13", "6.40.0"],
			"the copy declares the three packages 495 installs, none of them a gap of the project",
		);
	});

	it("une dépendance que seule src/legacy/old-users.js charge n'est pas donnée comme inutilisée", async () => {
		const root = outputDir("node-dependencies-legacy-", cleanups);
		const { pass } = await qualifiedAndPassed(
			root,
			adoptedCopy(root, { [OLD_USERS]: 'import _ from "lodash";\n\nexport const all = () => _.uniq([]);\n' }),
		);
		assert.equal(pass.verdict, "FAIL", pass.limits.notes.join("; "));
		assert.deepEqual(located(pass.findings), [`${USED_UNDECLARED} | ${REPOSITORY}:${PG_LINE}`]);
	});

	it("un knip.json et un knip.ts du projet qui font ignorer lodash et pg laissent le contrôle qualifié, la passe de référence rapporte les deux écarts et le fichier que knip.ts écrirait n'existe pas", async () => {
		const root = outputDir("node-dependencies-own-", cleanups);
		const reference = adoptedCopy(root, OWN_CONFIGURATION);
		const { qualification: q, pass, positive, negative, detection, runner } = await qualifiedAndPassed(root, reference);
		assert.deepEqual([q.positive, q.negative, q.qualified], ["PASS", "FAIL", true], JSON.stringify(q.notes));
		assertStoryGaps(reference, pass);
		for (const workspace of [reference, positive, negative])
			assert.equal(existsSync(join(workspace, KNIP_TS_TRACE)), false, `knip.ts is not run in ${workspace}`);

		// Knip runs only the first configuration it finds, knip.json before knip.ts: without knip.json, it would run knip.ts.
		rmSync(join(reference, "knip.json"));
		const dependencies = detection.controls.find((c) => c.control_id === "dependencies");
		assert.ok(dependencies, "the copy still gets the dependencies control");
		const alone = (await runner.runControl({ ...BASE, control: dependencies, workspace_path: reference })).evidence;
		assert.equal(existsSync(join(reference, KNIP_TS_TRACE)), false, "a knip.ts the package carries alone is not run");
		assertStoryGaps(reference, alone);
	});

	it("sur ce paquet, le contrôle des tests du projet rend PASS", async () => {
		const root = outputDir("node-dependencies-tests-", cleanups);
		const reference = adoptedCopy(root);
		const { detection, runner } = await qualifiedAndPassed(root, reference);
		const unit: ControlDefinition | undefined = detection.controls.find((c) => c.control_id === "unit");
		assert.ok(unit, "the suite of the package is a control");
		assert.ok(
			!unit.command.some((arg) => arg.includes("knip")),
			`the suite does not run Knip: ${unit.command.join(" ")}`,
		);
		const suite = (await runner.runControl({ ...BASE, control: unit, workspace_path: reference })).evidence;
		assert.equal(suite.verdict, "PASS", suite.limits.notes.join("; "));
		assert.equal(suite.facts.tests, 1, "the one test of the package, and no check of its dependencies");
	});
});
