/**
 * The JSON output of Knip 6.40.0 (`--reporter json`), read by the runner: one finding per gap, with its rule and
 * the dependency. A use `package.json` does not declare is located at the file and the line Knip gives; a
 * declaration no source uses, whether among `dependencies`, `devDependencies` or the optional peer dependencies,
 * at its line of `package.json`, found there when Knip gives none. The whole tree is judged; an output that is
 * absent or cannot be read concludes nothing.
 */
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let workspace: string;
let root: string;
const cleanups = removedAfterEach();

const REPOSITORY = "src/adapters/db/sql-user-repository.ts";

const FILES: Record<string, string> = {
	"package.json": `{
  "name": "users",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "test": "node --test" },
  "dependencies": {
    "zod": "4.1.0",
    "lodash": "4.17.21"
  },
  "devDependencies": {
    "chai": "6.2.0",
    "typescript": "7.0.2"
  },
  "peerDependencies": {
    "react": "*"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true }
  }
}
`,
	[REPOSITORY]:
		'import type { User } from "../../domain/user.ts";\nimport { Pool } from "pg";\n\nexport const pool = new Pool();\nexport const load = (): User[] => [];\n',
	"src/domain/user.ts": "export interface User {\n  id: string;\n}\n",
};

beforeEach(() => {
	root = tempDir("495-knip-report-", cleanups);
	workspace = join(root, "ws");
	writeFiles(workspace, FILES);
});

/** The line of `path` that holds `text`, counted from 1. */
const lineOf = (path: string, text: string) => FILES[path]!.split("\n").findIndex((l) => l.includes(text)) + 1;

/** The dependencies control, reading what Knip wrote on its standard output; Knip exits 1 when it finds a gap. */
async function readDependencies(output: string, exitCode = 1) {
	const outputFile = join(root, "knip.out");
	writeFiles(root, { "knip.out": output });
	const control = controlOf({
		control_id: "dependencies",
		parser: "knip-json",
		command: [
			process.execPath,
			"-e",
			`process.stdout.write(require("node:fs").readFileSync(${JSON.stringify(outputFile)}, "utf8")); process.exit(${exitCode})`,
		],
	});
	const runner = new GenericControlRunner(
		new UnconfinedSandbox(),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);
	return (await runner.runControl({ ...invocationBase(), control, workspace_path: workspace, introduced_lines: {} }))
		.evidence;
}

/** A row of the output of Knip for one file, with the gaps of each type it reports there. */
const row = (
	file: string,
	gaps: Partial<Record<"dependencies" | "devDependencies" | "optionalPeerDependencies" | "unlisted", unknown[]>>,
) => ({
	file,
	dependencies: [],
	devDependencies: [],
	optionalPeerDependencies: [],
	unlisted: [],
	...gaps,
});

const knipOutput = (rows: readonly unknown[]) => `${JSON.stringify({ issues: rows })}\n`;

const located = (
	findings: readonly { rule_id: string; path: string | null; region: { start_line: number } | null }[],
) => findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);

const USED_UNDECLARED = "the package declares in package.json the dependencies its code uses";
const UNUSED_DECLARED = "the package uses the dependencies it declares in package.json";

describe("the output of Knip is read gap by gap", () => {
	it("la sortie de Knip donne un constat pour l'usage de pg sans déclaration, à src/adapters/db/sql-user-repository.ts et à la ligne de l'import, et un pour la déclaration inutilisée de lodash, à sa ligne de package.json", async () => {
		const lodash = lineOf("package.json", '"lodash"');
		const pg = lineOf(REPOSITORY, '"pg"');
		const evidence = await readDependencies(
			knipOutput([
				row("package.json", { dependencies: [{ name: "lodash", line: lodash, col: 5, pos: 140 }] }),
				row(REPOSITORY, { unlisted: [{ name: "pg", line: pg, col: 22, pos: 71 }] }),
			]),
		);
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.deepEqual(located(evidence.findings), [
			`${UNUSED_DECLARED} | package.json:${lodash}`,
			`${USED_UNDECLARED} | ${REPOSITORY}:${pg}`,
		]);
		assert.match(evidence.findings[0]!.message, /declares lodash without using it/);
		assert.match(evidence.findings[1]!.message, /uses pg without declaring it/);
		assert.ok(
			evidence.findings.every((f) => f.category === "structure"),
			"a gap between the declared and the used dependencies is a finding about the structure",
		);
	});

	it("une déclaration dont Knip ne donne pas la ligne est localisée à sa ligne de package.json", async () => {
		const evidence = await readDependencies(
			knipOutput([
				row("package.json", {
					dependencies: [{ name: "lodash" }],
					devDependencies: [{ name: "chai" }],
					optionalPeerDependencies: [{ name: "react" }],
				}),
			]),
		);
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.deepEqual(located(evidence.findings), [
			`${UNUSED_DECLARED} | package.json:${lineOf("package.json", '"lodash"')}`,
			`${UNUSED_DECLARED} | package.json:${lineOf("package.json", '"chai"')}`,
			// The optional peer is declared among `peerDependencies`, not in its `peerDependenciesMeta`.
			`${UNUSED_DECLARED} | package.json:${lineOf("package.json", '"react": "*"')}`,
		]);

		writeFiles(workspace, { "package.json": `${JSON.stringify(JSON.parse(FILES["package.json"]!))}\n` });
		const oneLine = await readDependencies(knipOutput([row("package.json", { dependencies: [{ name: "lodash" }] })]));
		assert.deepEqual(located(oneLine.findings), [`${UNUSED_DECLARED} | package.json:1`]);
	});

	it("une sortie absente ou illisible rend INDETERMINATE", async () => {
		const absent = await readDependencies("", 2);
		assert.equal(absent.verdict, "INDETERMINATE");
		assert.match(absent.limits.notes.join("; "), /no output of Knip/);

		const unreadable = await readDependencies(
			knipOutput([row(REPOSITORY, { unlisted: [{ name: "pg" }] })]).slice(0, 40),
		);
		assert.equal(unreadable.verdict, "INDETERMINATE");
		assert.match(unreadable.limits.notes.join("; "), /output of Knip cannot be read/);
		assert.deepEqual(unreadable.findings, []);

		const shapeless = await readDependencies('{ "files": [] }\n');
		assert.equal(shapeless.verdict, "INDETERMINATE", "an output that lists no issues concludes nothing");

		const clean = await readDependencies(knipOutput([]), 0);
		assert.equal(clean.verdict, "PASS", "an output that lists no gap is a package that declares what it uses");
	});
});
