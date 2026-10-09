/**
 * The package `users` of the story about the dependencies of an npm package, copied and adopted as an adoption of
 * its map leaves it: dependency-cruiser, swc and Knip installed for real in the copy, the dependencies control
 * qualified by its witnesses through the generic runner and the platform sandbox, then passed on the reference.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import type { ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import { invocationBase } from "./execution-fixture.ts";
import { NO_QUALIFIED_SANDBOX, writeFiles } from "./fixtures.ts";
import { NODE_DOMAIN_MAP, NODE_DOMAIN_SOURCES } from "./node-architecture-survey.ts";
import { READERS_OF_495, STACKS_OF_495 } from "./technologies.ts";

const REFS = [{ requirement_id: "ARC-01", revision: 1 }];
export const BASE = invocationBase();
const MAP: ArchitectureMap = NODE_DOMAIN_MAP;

export const REPOSITORY = "src/adapters/db/sql-user-repository.ts";

/** What `package.json` of the package `users` declares: `lodash`, and TypeScript 7.0.2 for its development. */
export const USERS_MANIFEST = {
	name: "users",
	version: "1.0.0",
	type: "module",
	scripts: { test: "node --test" },
	dependencies: { lodash: "4.17.21" },
	devDependencies: { typescript: "7.0.2" },
};

/**
 * The package `users`, which declares neither `main`, nor `exports`, nor `bin`: its adapter imports `pg`, which
 * `package.json` does not declare, through an alias of `tsconfig.json` to the domain, and `package.json` declares
 * `lodash`, which no source uses.
 */
const USERS: Record<string, string> = {
	"package.json": `${JSON.stringify(USERS_MANIFEST, null, 2)}\n`,
	"tsconfig.json": `${JSON.stringify(
		{
			compilerOptions: {
				module: "nodenext",
				strict: true,
				noEmit: true,
				allowImportingTsExtensions: true,
				paths: { "@domain/*": ["./src/domain/*"] },
			},
		},
		null,
		2,
	)}\n`,
	...NODE_DOMAIN_SOURCES,
	[REPOSITORY]:
		'import type { UserRepository } from "@domain/port/user-repository.ts";\nimport pg from "pg";\n\nexport const pool = (): unknown => new pg.Pool();\nexport const repository: UserRepository = { find: () => undefined };\n',
	"test/user.test.js": 'import { test } from "node:test";\n\ntest("a user", () => {});\n',
};

/** The line of the repository that imports `pg`, counted from 1. */
export const PG_LINE = USERS[REPOSITORY]!.split("\n").findIndex((l) => l.includes('"pg"')) + 1;

/**
 * The copy of the package under `root` where the controls run, with what `extra` adds, where dependency-cruiser,
 * swc and Knip were installed as an adoption installs them: each at its exact version, as a development
 * dependency, without install scripts. The install, the one step that opens the network, runs once outside the
 * sandbox.
 */
export function adoptedCopy(root: string, extra: Record<string, string> = {}): string {
	const reference = join(root, "reference");
	writeFiles(reference, { ...USERS, ...extra });
	execFileSync(
		"npm",
		[
			"install",
			"--save-dev",
			"--save-exact",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"dependency-cruiser@18.5.0",
			"@swc/core@1.16.13",
			"knip@6.40.0",
		],
		{ cwd: reference, stdio: "ignore", timeout: 10 * 60_000 },
	);
	return reference;
}

function runnerFor(root: string): GenericControlRunner {
	const sandbox = selectSandbox({ allow_unconfined: NO_QUALIFIED_SANDBOX });
	return new GenericControlRunner(sandbox.backend, new CasObjectStore(join(root, "objects")), READERS_OF_495, {
		workspace_of: (workspacePath) => STACKS_OF_495.workspaceOf(workspacePath),
	});
}

/** The dependencies control of the copy, its qualification by its witnesses, and its pass on the reference. */
export async function qualifiedAndPassed(root: string, reference: string) {
	const detection = STACKS_OF_495.recognise(reference, REFS, process.execPath, [], MAP);
	const dependencies = detection.controls.find((c) => c.control_id === "dependencies");
	assert.ok(
		dependencies,
		`the copy that carries Knip gets the dependencies control: ${detection.controls.map((c) => c.control_id).join(", ")}; ${detection.capability_missing.join("; ")}`,
	);
	assert.equal(dependencies.network, "denied", "the dependencies control runs with the network closed");
	const own = detection.own_negative_witness.dependencies;
	assert.ok(own, "the dependencies control has a negative witness of its own");
	const runner = runnerFor(root);
	const positive = join(root, "dependencies-positive");
	const negative = join(root, "dependencies-negative");
	for (const workspace of [positive, negative]) {
		cpSync(reference, workspace, { recursive: true });
		writeFiles(workspace, detection.positive_witness);
	}
	writeFiles(negative, own);
	const qualification = await qualifyControl(
		runner,
		dependencies,
		{
			positive_path: positive,
			negative_path: negative,
			positive_files: detection.positive_witness,
			negative_files: { ...detection.positive_witness, ...own },
		},
		BASE,
	);
	const pass = (await runner.runControl({ ...BASE, control: dependencies, workspace_path: reference })).evidence;
	return { qualification, pass, detection, runner, own, positive, negative };
}

export const located = (
	findings: readonly { rule_id: string; path: string | null; region: { start_line: number } | null }[],
) => findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);

export const USED_UNDECLARED = "the package declares in package.json the dependencies its code uses";
const UNUSED_DECLARED = "the package uses the dependencies it declares in package.json";

/** The line of the reference's `package.json`, as npm rewrote it, that declares `name`. */
const declarationLine = (reference: string, name: string) =>
	readFileSync(join(reference, "package.json"), "utf8")
		.split("\n")
		.findIndex((l) => l.includes(`"${name}":`)) + 1;

/** The two gaps of the story: the use of `pg` at the line of its import, and the unused declaration of `lodash`. */
export function assertStoryGaps(
	reference: string,
	pass: { verdict: string; findings: Parameters<typeof located>[0]; limits: { notes: string[] } },
) {
	assert.equal(pass.verdict, "FAIL", pass.limits.notes.join("; "));
	assert.deepEqual(located(pass.findings).sort(), [
		`${USED_UNDECLARED} | ${REPOSITORY}:${PG_LINE}`,
		`${UNUSED_DECLARED} | package.json:${declarationLine(reference, "lodash")}`,
	]);
}
