import { strict as assert } from "node:assert";
import { mkdirSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { MAX_REPORT_BYTES } from "../../src/adapters/execution/parsers.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { workspaceFiles } from "../../src/adapters/execution/workspace-files.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import type { ReportReader } from "../../src/ports/execution.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("report-text-", cleanups);
});

/** A reader a technology brings that reads its report through `text()` instead of `reports()`. */
const TEXT_READER: ReportReader = {
	id: "lines",
	version: "1.0.0",
	nature: "behaviour",
	differential: false,
	located: false,
	async read(run) {
		const text = await run.text(run.control.report_path ?? "");
		const failed = text.split("\n").some((line) => line.startsWith("FAIL"));
		return { verdict: failed ? "FAIL" : "PASS", facts: {}, notes: [], failures: [] };
	},
};

describe("a report a reader reads through text() past the read bound", () => {
	it("is not read: the control is INDETERMINATE, named with its path, its size and the bound, and nothing is kept", async () => {
		const ws = join(root, "ws");
		mkdirSync(ws, { recursive: true });
		writeFileSync(join(ws, "lines.txt"), "PASS one\n");
		truncateSync(join(ws, "lines.txt"), MAX_REPORT_BYTES + 7);
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")), [
			TEXT_READER,
		]);
		const control = controlOf({ parser: "lines", report_path: "lines.txt" });
		const { evidence } = await runner.runControl({ ...invocationBase(), control, workspace_path: ws });
		assert.equal(evidence.verdict, "INDETERMINATE");
		const note = evidence.limits.notes.join("\n");
		assert.ok(note.includes("lines.txt"), `the note names the report path: ${note}`);
		assert.ok(note.includes(String(MAX_REPORT_BYTES + 7)), `the note names the report size: ${note}`);
		assert.ok(note.includes(`past the read bound of ${MAX_REPORT_BYTES}`), `the note names the read bound: ${note}`);
		assert.deepEqual(
			evidence.artifacts.map((a) => a.name).filter((name) => name.startsWith("report:")),
			[],
			"no report: artifact is kept for an unread report",
		);
	});

	it("is refused by text() and sources() alike, naming its path, its size and the bound", async () => {
		const ws = join(root, "ws");
		mkdirSync(ws, { recursive: true });
		writeFileSync(join(ws, "big.txt"), "");
		truncateSync(join(ws, "big.txt"), MAX_REPORT_BYTES + 7);
		const refusal = new RegExp(
			`big\\.txt is ${MAX_REPORT_BYTES + 7} bytes, past the read bound of ${MAX_REPORT_BYTES}`,
		);
		await assert.rejects(workspaceFiles(ws).text("big.txt"), refusal);
		await assert.rejects(workspaceFiles(ws).sources(["big.txt"]), refusal);
	});
});
