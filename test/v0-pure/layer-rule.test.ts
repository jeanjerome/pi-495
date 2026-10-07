import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const SCRIPT = join(process.cwd(), "scripts", "check-layers.ts");
const cleanups = removedAfterEach();

/** Runs the layer check on a tree whose sources are `files`, by their path under `src/`. */
function checkTree(files: Record<string, string>): { status: number | null; output: string } {
	const root = tempDir("495-layers-", cleanups);
	for (const [path, source] of Object.entries(files)) {
		mkdirSync(dirname(join(root, "src", path)), { recursive: true });
		writeFileSync(join(root, "src", path), source);
	}
	const run = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" });
	return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

/** Runs the layer check on a tree whose only source is `src/presentation/view.ts`. */
function check(source: string): { status: number | null; output: string } {
	return checkTree({ "presentation/view.ts": source });
}

/** Each form of import, the source that uses it across a layer, and the module the refusal names. */
const FORMS: [string, string, string][] = [
	[
		"an import spread over several lines",
		'import type {\n\tExtensionAPI,\n\tExtensionContext,\n} from "@earendil-works/pi-coding-agent";\n',
		"@earendil-works/pi-coding-agent",
	],
	[
		"an import kept for its side effects",
		'import "@earendil-works/pi-coding-agent";\n',
		"@earendil-works/pi-coding-agent",
	],
	[
		"a dynamic import",
		'export async function load() {\n\treturn import("@earendil-works/pi-ai");\n}\n',
		"@earendil-works/pi-ai",
	],
	[
		"a re-export spread over several lines",
		'export {\n\trun,\n} from "../extension/index.ts";\n',
		"../extension/index.ts",
	],
];

describe("the layer rule reads every import of a file", () => {
	for (const [form, source, module] of FORMS)
		it(`refuses ${form} across a layer, naming the module`, () => {
			const { status, output } = check(source);
			assert.equal(status, 1, output);
			assert.match(output, new RegExp(`src/presentation/view\\.ts: ${module.replace(/[./]/g, "\\$&")}`));
		});

	it("lets presentation import pi-tui, on one line or several", () => {
		const { status, output } = check(
			'import { truncateToWidth } from "@earendil-works/pi-tui";\nimport {\n\tvisibleWidth,\n} from "@earendil-works/pi-tui";\n',
		);
		assert.equal(status, 0, output);
	});
});

describe("the layer rule keeps each technology to its own directory", () => {
	it("la règle des couches refuse, en nommant le module et l'import, un module de src/adapters/execution/ qui importe ../stacks/node/node.ts, et un module de src/adapters/stacks/maven/ qui importe ../node/node.ts ; elle laisse passer src/extension/runtime.ts qui importe ../adapters/stacks/maven/maven.ts", () => {
		const technologies = {
			"adapters/stacks/node/node.ts": "export const NODE_PLUGIN = {};\n",
			"adapters/stacks/maven/maven.ts": "export const MAVEN_PLUGIN = {};\n",
			"adapters/stacks/project-view.ts": "export const openView = () => ({});\n",
		};
		const generic = checkTree({
			...technologies,
			"adapters/execution/probe.ts":
				'import { NODE_PLUGIN } from "../stacks/node/node.ts";\nexport const probe = NODE_PLUGIN;\n',
		});
		assert.equal(generic.status, 1, generic.output);
		assert.match(generic.output, /src\/adapters\/execution\/probe\.ts: \.\.\/stacks\/node\/node\.ts/);

		const crossed = checkTree({
			...technologies,
			"adapters/stacks/maven/probe.ts":
				'import { NODE_PLUGIN } from "../node/node.ts";\nexport const probe = NODE_PLUGIN;\n',
		});
		assert.equal(crossed.status, 1, crossed.output);
		assert.match(crossed.output, /src\/adapters\/stacks\/maven\/probe\.ts: \.\.\/node\/node\.ts/);

		const mounted = checkTree({
			...technologies,
			"extension/runtime.ts":
				'import { MAVEN_PLUGIN } from "../adapters/stacks/maven/maven.ts";\nimport { NODE_PLUGIN } from "../adapters/stacks/node/node.ts";\nexport const STACKS = [MAVEN_PLUGIN, NODE_PLUGIN];\n',
			"adapters/execution/common.ts":
				'import { openView } from "../stacks/project-view.ts";\nexport const view = openView;\n',
			"adapters/stacks/maven/quality.ts":
				'import { MAVEN_PLUGIN } from "./maven.ts";\nexport const own = MAVEN_PLUGIN;\n',
		});
		assert.equal(mounted.status, 0, mounted.output);
	});
});
