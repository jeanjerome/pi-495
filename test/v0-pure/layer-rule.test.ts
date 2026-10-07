import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const SCRIPT = join(process.cwd(), "scripts", "check-layers.ts");
const cleanups = removedAfterEach();

/** Runs the layer check on a tree whose only source is `src/presentation/view.ts`. */
function check(source: string): { status: number | null; output: string } {
	const root = tempDir("495-layers-", cleanups);
	mkdirSync(join(root, "src", "presentation"), { recursive: true });
	writeFileSync(join(root, "src", "presentation", "view.ts"), source);
	const run = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" });
	return { status: run.status, output: `${run.stdout}${run.stderr}` };
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
