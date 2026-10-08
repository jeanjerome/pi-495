import { strict as assert } from "node:assert";
import { mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { SeatbeltSandbox } from "../../src/adapters/sandbox/backends.ts";
import { darwinOnly, outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = realpathSync(outputDir("writable-sbx-", cleanups));
});

// No temporary directory is granted: the test tree may itself live under $TMPDIR, where a write would
// succeed whatever the control declares writable.
const runner = () =>
	new GenericControlRunner(
		new SeatbeltSandbox({ temp_paths: [] }),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);

/** A command that runs each step on its own, so that a refused step does not keep the next from being tried. */
const eachOf = (...steps: string[]) => steps.map((step) => `try { ${step} } catch {}`).join("\n");

describe("a control's command under Seatbelt", darwinOnly, () => {
	it("a control that writes lines.txt and creates target/495-vitest leaves outside.txt at « untouched » and outdir empty", async () => {
		const copy = join(root, "copy");
		mkdirSync(copy);
		writeFileSync(join(root, "outside.txt"), "untouched");
		mkdirSync(join(root, "outdir"));
		symlinkSync(join(root, "outside.txt"), join(copy, "lines.txt"));
		symlinkSync(join(root, "outdir"), join(copy, "target"));
		const writes = eachOf(
			"require('fs').writeFileSync('lines.txt', 'written');",
			"require('fs').mkdirSync('target/495-vitest');",
		);
		await runner().runControl({
			...invocationBase(),
			control: controlOf({
				command: [process.execPath, "-e", writes],
				writable_paths: ["lines.txt", "target/495-vitest"],
			}),
			workspace_path: copy,
		});
		assert.deepEqual(
			{ "outside.txt": readFileSync(join(root, "outside.txt"), "utf8"), outdir: readdirSync(join(root, "outdir")) },
			{ "outside.txt": "untouched", outdir: [] },
		);
	});

	it("a control that writes report.txt, an ordinary file of the copy, writes it and gives PASS", async () => {
		const copy = join(root, "copy");
		mkdirSync(copy);
		writeFileSync(join(copy, "report.txt"), "");
		const { evidence } = await runner().runControl({
			...invocationBase(),
			control: controlOf({
				command: [process.execPath, "-e", "require('fs').writeFileSync('report.txt', 'written')"],
				writable_paths: ["report.txt"],
			}),
			workspace_path: copy,
		});
		assert.equal(readFileSync(join(copy, "report.txt"), "utf8"), "written");
		assert.equal(evidence.verdict, "PASS");
	});
});
