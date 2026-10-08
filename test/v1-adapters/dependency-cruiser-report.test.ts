/**
 * The JSON output of dependency-cruiser 18.5.0, read by the runner: one finding per violation, whatever its
 * severity, with the rule of the map it breaks, the file relative to the copy and the line of the import, which
 * the output does not give and which is found at the import of the path the file writes. A cycle is given at a file of the cycle,
 * a source no part covers at its file. The whole tree is judged, not only the lines a change introduces; an
 * output where dependency-cruiser read no source, an absent one or an unreadable one concludes nothing.
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

const REPORT = "target/495-dependency-cruiser.json";
const SERVICE = "src/admin/service/admin-service.ts";
const DAO = "src/admin/data/admin-dao.ts";
const PAGE = "src/admin/web/admin-page.ts";
const ORDER = "src/orders/domain/order.ts";
const LEGACY = "src/legacy/old.cjs";

beforeEach(() => {
	root = tempDir("495-dependency-cruiser-report-", cleanups);
	workspace = join(root, "ws");
	writeFiles(workspace, {
		"package.json": "{}\n",
		// The alias of `orders` is imported on line 3, after a line that only mentions it.
		[SERVICE]:
			'// reads "@orders/domain/order.ts" for the admin\nimport { money } from "../../shared/money.ts";\nimport type { Order } from "@orders/domain/order.ts";\nexport const total = (o: Order) => money;\n',
		[DAO]:
			"import { money } from '../../shared/money.ts';\n\nimport {\n  page,\n} from '../web/admin-page.ts';\nexport const dao = page + money;\n",
		[PAGE]: 'import { dao } from "../data/admin-dao.ts";\nexport const page = dao;\n',
		[ORDER]: "export interface Order {}\n",
		[LEGACY]: 'module.exports = require("../shared/money.ts");\n',
	});
});

const module = (source: string) => ({ source, dependencies: [], dependents: [], valid: true });

/** The JSON dependency-cruiser 18.5.0 writes, with the modules it read and the violations of the rules it was given. */
function cruised(violations: readonly unknown[], sources = [SERVICE, DAO, PAGE, ORDER, LEGACY]): string {
	return JSON.stringify(
		{
			modules: sources.map(module),
			summary: {
				violations,
				error: violations.length,
				warn: 0,
				info: 0,
				ignore: 0,
				totalCruised: sources.length,
				totalDependenciesCruised: 4,
				optionsUsed: { parser: "swc", tsPreCompilationDeps: true },
			},
		},
		null,
		2,
	);
}

const rule = (name: string) => ({ severity: "error", name });

/** The architecture control, reading the output its run left; dependency-cruiser exits 0 when it writes JSON. */
async function readArchitecture() {
	const control = controlOf({
		control_id: "architecture",
		parser: "dependency-cruiser-json",
		report_path: REPORT,
		command: [process.execPath, "-e", ""],
	});
	const runner = new GenericControlRunner(
		new UnconfinedSandbox(),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);
	return (
		await runner.runControl({
			...invocationBase(),
			control,
			workspace_path: workspace,
			// Nothing is introduced: the structure of the whole tree is measured all the same.
			introduced_lines: {},
		})
	).evidence;
}

const located = (
	findings: readonly { rule_id: string; path: string | null; region: { start_line: number } | null }[],
) => findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);

describe("the output of dependency-cruiser is read violation by violation", () => {
	it("une sortie de dependency-cruiser donne un constat par violation, avec la règle de la carte, le fichier relatif à la copie et la ligne de l'import retrouvée dans ce fichier", async () => {
		writeFiles(workspace, {
			[REPORT]: cruised([
				{
					type: "dependency",
					from: SERVICE,
					to: ORDER,
					unresolvedTo: "@orders/domain/order.ts",
					dependencyTypes: ["undetermined", "import", "type-only"],
					rule: rule("part admin may not depend on part orders"),
				},
				{
					type: "dependency",
					from: DAO,
					to: PAGE,
					unresolvedTo: "../web/admin-page.ts",
					dependencyTypes: ["local", "import"],
					rule: rule("part admin keeps the calls between its layers"),
				},
			]),
		});
		const evidence = await readArchitecture();
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.deepEqual(located(evidence.findings), [
			`part admin may not depend on part orders | ${SERVICE}:3`,
			`part admin keeps the calls between its layers | ${DAO}:5`,
		]);
		assert.ok(
			evidence.findings[0]!.message.includes(ORDER),
			`each finding says what is imported: ${evidence.findings[0]!.message}`,
		);
		assert.ok(
			evidence.findings.every((f) => f.category === "structure"),
			"a violation of the map is a finding about the structure",
		);
	});

	it("un cycle est rapporté à un fichier du cycle et une source sans partie à son fichier", async () => {
		writeFiles(workspace, {
			[REPORT]: cruised([
				{
					type: "cycle",
					from: PAGE,
					to: DAO,
					unresolvedTo: "../data/admin-dao.ts",
					dependencyTypes: ["local", "import"],
					rule: rule("no cycle between the folders of the map"),
					cycle: [
						{ name: DAO, dependencyTypes: ["local", "import"] },
						{ name: PAGE, dependencyTypes: ["local", "import"] },
					],
				},
				{ type: "module", from: LEGACY, to: LEGACY, rule: rule("every source belongs to a part") },
			]),
		});
		const evidence = await readArchitecture();
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.deepEqual(located(evidence.findings), [
			`no cycle between the folders of the map | ${PAGE}:1`,
			`every source belongs to a part | ${LEGACY}:-`,
		]);
		assert.ok(evidence.findings[0]!.message.includes(DAO), `the cycle is named: ${evidence.findings[0]!.message}`);
	});

	it("une violation que dependency-cruiser classe en sévérité ignore, comme il classe une violation connue, reste un constat", async () => {
		writeFiles(workspace, {
			[REPORT]: cruised([
				{
					type: "dependency",
					from: DAO,
					to: PAGE,
					unresolvedTo: "../web/admin-page.ts",
					dependencyTypes: ["local", "import"],
					rule: { severity: "ignore", name: "part admin keeps the calls between its layers" },
				},
			]),
		});
		const evidence = await readArchitecture();
		assert.equal(evidence.verdict, "FAIL", "a violation the package declares known still breaks the map");
		assert.deepEqual(located(evidence.findings), [`part admin keeps the calls between its layers | ${DAO}:5`]);
	});

	it("une sortie où dependency-cruiser n'a lu aucune source rend INDETERMINATE avec cette raison, et non PASS", async () => {
		writeFiles(workspace, { [REPORT]: cruised([], []) });
		const evidence = await readArchitecture();
		assert.equal(evidence.verdict, "INDETERMINATE", "a pass that read no source never passes");
		assert.match(evidence.limits.notes.join("; "), /dependency-cruiser read no source/);
		assert.deepEqual(evidence.findings, []);
	});

	it("une sortie absente ou illisible rend INDETERMINATE", async () => {
		const absent = await readArchitecture();
		assert.equal(absent.verdict, "INDETERMINATE");
		assert.match(absent.limits.notes.join("; "), /no output of dependency-cruiser/);

		writeFiles(workspace, { [REPORT]: cruised([]).slice(0, 40) });
		const unreadable = await readArchitecture();
		assert.equal(unreadable.verdict, "INDETERMINATE");
		assert.match(unreadable.limits.notes.join("; "), /output of dependency-cruiser .* cannot be read/);
		assert.deepEqual(unreadable.findings, []);

		writeFiles(workspace, { [REPORT]: '{ "modules": [] }' });
		const shapeless = await readArchitecture();
		assert.equal(shapeless.verdict, "INDETERMINATE", "an output without its summary concludes nothing");
	});
});
