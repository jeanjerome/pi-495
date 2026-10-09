/**
 * The rules of an adopted architecture map checked by dependency-cruiser 18.5.0 and its swc parser on a real npm
 * package under TypeScript 7.0.2, through the generic runner and the platform sandbox: once a copy carries both,
 * installed as an adoption installs them, the architecture control is qualified by its own witnesses although the
 * package already breaks its map, the pass on the reference reports each violation at its file and the line of
 * the import, an alias of `tsconfig.json` included, and no file of the package silences a rule. The tests of the
 * package do not run the rules.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import type { ArchitectureHint, ArchitectureMap, ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { invocationBase } from "../helpers/execution-fixture.ts";
import { NO_QUALIFIED_SANDBOX, outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { READERS_OF_495, STACKS_OF_495 } from "../helpers/technologies.ts";

const REFS = [{ requirement_id: "ARC-01", revision: 1 }];
const BASE = invocationBase();

const ADMIN_SERVICE = "src/admin/service/admin-service.ts";
const ADMIN_DAO = "src/admin/data/admin-dao.ts";
const OLD_ADMIN = "src/legacy/old-admin.js";

/** The package of `orders`, `admin` and `shared`: `admin` imports `orders` through its alias, its `data` layer imports its `web` layer, and `src/legacy` belongs to no part. */
const MIXED: Record<string, string> = {
	"package.json": `${JSON.stringify({ name: "mixed", version: "1.0.0", type: "module", scripts: { test: "node --test" }, devDependencies: { typescript: "7.0.2" } }, null, 2)}\n`,
	"tsconfig.json": `${JSON.stringify(
		{
			compilerOptions: {
				module: "nodenext",
				strict: true,
				noEmit: true,
				allowImportingTsExtensions: true,
				paths: { "@orders/*": ["./src/orders/*"] },
			},
		},
		null,
		2,
	)}\n`,
	"src/orders/domain/order.ts": "export interface Order {\n  readonly id: string;\n}\n",
	"src/orders/service/order-service.ts":
		'import type { Order } from "../domain/order.ts";\n\nexport const open = (): Order => ({ id: "o1" });\n',
	"src/orders/store/order-store.ts":
		'import type { Order } from "../domain/order.ts";\n\nexport const stored: Order[] = [];\n',
	"src/admin/web/admin-page.ts":
		'import { name } from "../service/admin-service.ts";\n\nexport const show = (): string => name();\n',
	[ADMIN_SERVICE]:
		'import { find } from "../data/admin-dao.ts";\nimport { money } from "../../shared/money.ts";\nimport type { Order } from "@orders/domain/order.ts";\n\nexport const name = (): string => find() + money;\nexport const total = (order: Order): string => order.id;\n',
	[ADMIN_DAO]:
		'import { show } from "../web/admin-page.ts";\n\nexport const find = (): string => "admin";\nexport const page = (): string => show();\n',
	"src/shared/money.ts": "export const money = 1;\n",
	[OLD_ADMIN]: "export const old = 1;\n",
	"test/admin.test.js": 'import { test } from "node:test";\n\ntest("an admin", () => {});\n',
};

/** The line of `path` in the package that holds `text`, counted from 1. */
const lineOf = (path: string, text: string) => MIXED[path]!.split("\n").findIndex((l) => l.includes(text)) + 1;

const at = (path: string): ArchitectureHint[] => [{ path, line: 1, says: "a source of the folder" }];
const role = (folder: string, name: string, file: string, calledBy?: string[]) => ({
	package: folder,
	role: name,
	...(calledBy ? { called_by: calledBy } : {}),
	hints: at(file),
});

/** `orders` in onion, `admin` in the layers web, service and data, `shared` simple; both may depend on `shared` alone. */
const MAP: ArchitectureMap = {
	parts: [
		{
			name: "orders",
			perimeter: ["src/orders"],
			style: "onion",
			roles: [
				role("src/orders/domain", "domain model", "src/orders/domain/order.ts"),
				role("src/orders/service", "domain services", "src/orders/service/order-service.ts"),
				role("src/orders/store", "adapter persistence", "src/orders/store/order-store.ts"),
			],
			hints: at("src/orders/domain/order.ts"),
		},
		{
			name: "admin",
			perimeter: ["src/admin"],
			style: "layered",
			roles: [
				role("src/admin/web", "web", "src/admin/web/admin-page.ts", []),
				role("src/admin/service", "service", ADMIN_SERVICE, ["web"]),
				role("src/admin/data", "data", ADMIN_DAO, ["service"]),
			],
			hints: at(ADMIN_SERVICE),
		},
		{
			name: "shared",
			perimeter: ["src/shared"],
			style: "simple",
			roles: [role("src/shared", "shared kernel", "src/shared/money.ts")],
			hints: at("src/shared/money.ts"),
		},
	],
	relations: [
		{ from: "orders", to: "shared", hints: at("src/orders/domain/order.ts") },
		{ from: "admin", to: "shared", hints: at(ADMIN_SERVICE) },
	],
};

/** A configuration of dependency-cruiser the package carries itself, with no rule, and the violations it declares known. */
const OWN_CONFIGURATION: Record<string, string> = {
	".dependency-cruiser.cjs": "module.exports = { forbidden: [], options: {} };\n",
	".dependency-cruiser-known-violations.json": `${JSON.stringify([
		{
			type: "dependency",
			from: ADMIN_SERVICE,
			to: "src/orders/domain/order.ts",
			rule: { severity: "error", name: "part admin may not depend on part orders" },
		},
		{
			type: "dependency",
			from: ADMIN_DAO,
			to: "src/admin/web/admin-page.ts",
			rule: { severity: "error", name: "part admin keeps the calls between its layers" },
		},
		{
			type: "module",
			from: OLD_ADMIN,
			to: OLD_ADMIN,
			rule: { severity: "error", name: "every source belongs to a part" },
		},
	])}\n`,
};

/**
 * The copy of the package under `root` where the controls run, with what `extra` adds, where dependency-cruiser
 * and swc were installed as an adoption installs them: each at its exact version, as a development dependency,
 * without install scripts. The install, the one step that opens the network, runs once outside the sandbox.
 */
function adoptedCopy(root: string, extra: Record<string, string> = {}): string {
	const reference = join(root, "reference");
	writeFiles(reference, { ...MIXED, ...extra });
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

/** The architecture control of the copy, its qualification by its witnesses, and its pass on the reference. */
async function qualifiedAndPassed(root: string, reference: string) {
	const detection = STACKS_OF_495.recognise(reference, REFS, process.execPath, [], MAP);
	const architecture = detection.controls.find((c) => c.control_id === "architecture");
	assert.ok(
		architecture,
		`the copy that carries dependency-cruiser gets the architecture control: ${detection.controls.map((c) => c.control_id).join(", ")}; ${detection.capability_missing.join("; ")}`,
	);
	assert.equal(architecture.network, "denied", "the architecture control runs with the network closed");
	assert.deepEqual(architecture.architecture_map, MAP, "its rules are written from the adopted map");
	const own = detection.own_negative_witness.architecture;
	assert.ok(own, "the architecture control has a negative witness of its own");
	const runner = runnerFor(root);
	const positive = join(root, "architecture-positive");
	const negative = join(root, "architecture-negative");
	for (const workspace of [positive, negative]) {
		cpSync(reference, workspace, { recursive: true });
		writeFiles(workspace, detection.positive_witness);
	}
	writeFiles(negative, own);
	const qualification = await qualifyControl(
		runner,
		architecture,
		{
			positive_path: positive,
			negative_path: negative,
			positive_files: detection.positive_witness,
			negative_files: { ...detection.positive_witness, ...own },
		},
		BASE,
	);
	const pass = (await runner.runControl({ ...BASE, control: architecture, workspace_path: reference })).evidence;
	return { qualification, pass, detection, runner };
}

const located = (
	findings: readonly { rule_id: string; path: string | null; region: { start_line: number } | null }[],
) => findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);

/** The findings of the pass on the reference the story names: the relation, the call between layers and the source without a part. */
function assertStoryFindings(pass: {
	verdict: string;
	findings: Parameters<typeof located>[0];
	limits: { notes: string[] };
}) {
	assert.equal(pass.verdict, "FAIL", pass.limits.notes.join("; "));
	const found = located(pass.findings);
	for (const expected of [
		`part admin may not depend on part orders | ${ADMIN_SERVICE}:${lineOf(ADMIN_SERVICE, "@orders/")}`,
		`part admin keeps the calls between its layers | ${ADMIN_DAO}:${lineOf(ADMIN_DAO, "../web/admin-page.ts")}`,
		`every source belongs to a part | ${OLD_ADMIN}:-`,
	])
		assert.ok(found.includes(expected), `${expected} in\n${found.join("\n")}`);
	assert.deepEqual(
		[...new Set(found.filter((l) => l.startsWith("part admin keeps the calls between its layers |")))],
		[`part admin keeps the calls between its layers | ${ADMIN_DAO}:${lineOf(ADMIN_DAO, "../web/admin-page.ts")}`],
		"the layers of admin report the call of data on web alone, not the calls of web on service and of service on data the map permits",
	);
	assert.deepEqual(
		found.filter((l) => / part shared\b|\| src\/shared\//.test(l)),
		[],
		"no finding is about shared, neither in it nor on a relation towards it",
	);
	assert.deepEqual(
		found.filter((l) => l.includes("| src/orders/")),
		[],
		"no finding is in orders, whose model, services and adapter keep the rings of its onion",
	);
}

describe("dependency-cruiser checks the adopted map on an npm package that already breaks it", () => {
	const cleanups = removedAfterEach();

	it("sur le paquet des parties orders, admin et shared sous TypeScript 7.0.2, le contrôle d'architecture est qualifié par ses témoins bien que le projet viole sa carte, et la passe de référence rapporte la relation d'admin vers orders importée par l'alias @orders/ et l'appel de data vers web à leur fichier et à la ligne de l'import, et la source de src/legacy à son fichier, sans constat sur shared", async () => {
		const root = outputDir("node-architecture-", cleanups);
		const { qualification: q, pass } = await qualifiedAndPassed(root, adoptedCopy(root));
		assert.deepEqual(
			[q.positive, q.negative, q.incident, q.qualified],
			["PASS", "FAIL", "INDETERMINATE", true],
			JSON.stringify(q.notes),
		);
		assertStoryFindings(pass);
	});

	it("un .dependency-cruiser.cjs du projet sans règle et un .dependency-cruiser-known-violations.json qui liste ses violations laissent le contrôle qualifié, et la passe de référence rapporte les mêmes constats", async () => {
		const root = outputDir("node-architecture-own-", cleanups);
		const { qualification: q, pass, detection } = await qualifiedAndPassed(root, adoptedCopy(root, OWN_CONFIGURATION));
		assert.deepEqual([q.positive, q.negative, q.qualified], ["PASS", "FAIL", true], JSON.stringify(q.notes));
		assertStoryFindings(pass);
		// The reader reports a violation dependency-cruiser classes as known too: the command alone says none is.
		const command = detection.controls.find((c) => c.control_id === "architecture")!.command;
		assert.ok(!command.includes("--ignore-known"), `no known violation is ignored: ${command.join(" ")}`);
	});

	it("sur ce paquet, le contrôle des tests du projet rend PASS", async () => {
		const root = outputDir("node-architecture-tests-", cleanups);
		const { detection, runner } = await qualifiedAndPassed(root, adoptedCopy(root));
		const unit: ControlDefinition | undefined = detection.controls.find((c) => c.control_id === "unit");
		assert.ok(unit, "the suite of the package is a control");
		const suite = (await runner.runControl({ ...BASE, control: unit, workspace_path: join(root, "reference") }))
			.evidence;
		assert.equal(suite.verdict, "PASS", suite.limits.notes.join("; "));
		assert.equal(suite.facts.tests, 1, "the one test of the package, and no rule of the map");
	});

	it("sur une copie dont toutes les sources sont en .mts, dependency-cruiser ne lit aucune source, et la détection ne donne aucun contrôle d'architecture mais nomme pourquoi", async () => {
		const root = outputDir("node-architecture-mts-", cleanups);
		const reference = adoptedCopy(root);
		const architecture = STACKS_OF_495.recognise(reference, REFS, process.execPath, [], MAP).controls.find(
			(c) => c.control_id === "architecture",
		);
		assert.ok(architecture, "the package of .ts sources gets the architecture control");
		const mts = join(root, "mts");
		cpSync(reference, mts, { recursive: true });
		rmSync(join(mts, "src"), { recursive: true });
		writeFiles(
			mts,
			Object.fromEntries(
				Object.entries(MIXED)
					.filter(([path]) => path.startsWith("src/"))
					.map(([path, text]) => [path.replace(/\.[jt]s$/, ".mts"), text.replaceAll('.ts"', '.mts"')]),
			),
		);
		const pass = (await runnerFor(root).runControl({ ...BASE, control: architecture, workspace_path: mts })).evidence;
		assert.equal(pass.verdict, "INDETERMINATE", JSON.stringify(pass.facts));
		assert.match(pass.limits.notes.join("; "), /dependency-cruiser read no source/);
		const detection = STACKS_OF_495.recognise(mts, REFS, process.execPath, [], MAP);
		assert.deepEqual(
			detection.controls.filter((c) => c.control_id === "architecture"),
			[],
		);
		assert.ok(
			detection.capability_missing.some((m) =>
				m.includes("dependency-cruiser 18.5.0 reads none of the sources of its folders"),
			),
			detection.capability_missing.join("\n"),
		);
	});
});
