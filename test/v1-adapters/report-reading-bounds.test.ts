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
	root = outputDir("report-reading-", cleanups);
});

/** A reader a technology brings: PASS unless a line of its report says FAIL, the bound left to the runner. */
const LINES_READER: ReportReader = {
	id: "lines",
	version: "1.0.0",
	nature: "behaviour",
	differential: false,
	located: false,
	async read(run) {
		const docs = await run.reports("text/plain; charset=utf-8");
		const failed = docs.some((d) => d.text.split("\n").some((line) => line.startsWith("FAIL")));
		return { verdict: failed ? "FAIL" : "PASS", facts: {}, notes: [], failures: [] };
	},
};

describe("a report a technology's reader reads past the read bound", () => {
	it("is not read: the control is INDETERMINATE, named with its path, its size and the bound, and nothing is kept", async () => {
		const ws = join(root, "ws");
		mkdirSync(ws, { recursive: true });
		writeFileSync(join(ws, "lines.txt"), "PASS one\n");
		truncateSync(join(ws, "lines.txt"), MAX_REPORT_BYTES + 7);
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")), [
			LINES_READER,
		]);
		const control = controlOf({ parser: "lines", report_path: "lines.txt" });
		const { evidence } = await runner.runControl({ ...invocationBase(), control, workspace_path: ws });
		assert.equal(evidence.verdict, "INDETERMINATE");
		const note = evidence.limits.notes.join("\n");
		assert.ok(note.includes("lines.txt"), `the note names the report path: ${note}`);
		assert.ok(note.includes(String(MAX_REPORT_BYTES + 7)), `the note names the report size: ${note}`);
		assert.ok(note.includes(`bound of ${MAX_REPORT_BYTES}`), `the note names the read bound: ${note}`);
		assert.deepEqual(
			evidence.artifacts.map((a) => a.name).filter((name) => name.startsWith("report:")),
			[],
			"no report: artifact is kept for an unread report",
		);
	});

	it("under a recursive report path fails the reading, naming it, rather than handing the reader the others", async () => {
		const reports = join(root, "ws", "module", "target", "surefire-reports");
		mkdirSync(reports, { recursive: true });
		writeFileSync(join(reports, "a.xml"), "<testsuite/>");
		writeFileSync(join(reports, "b.xml"), "");
		truncateSync(join(reports, "b.xml"), MAX_REPORT_BYTES + 7);
		const kept: string[] = [];
		const files = workspaceFiles(join(root, "ws"), "**/target/surefire-reports", async (doc) => {
			kept.push(doc.name);
		});
		await assert.rejects(files.reports("application/xml"), /surefire-reports\/b\.xml .*past the read bound/);
		assert.deepEqual(kept, [], "no report is kept from a reading that failed");
	});
});

describe("a path outside the copy, as a reader reaches it", () => {
	/** A copy at `<root>/ws`, and a file beside it that a path climbing out of the copy names. */
	function copyBesideASecret(): string {
		const ws = join(root, "ws");
		mkdirSync(ws, { recursive: true });
		mkdirSync(join(root, "outside"), { recursive: true });
		writeFileSync(join(root, "outside", "r.txt"), "PASS secret\n");
		return ws;
	}

	it("a declared report path outside the copy reads no report and keeps none", async () => {
		const kept: string[] = [];
		const files = workspaceFiles(copyBesideASecret(), "../outside/r.txt", async (doc) => {
			kept.push(doc.name);
		});
		assert.deepEqual(await files.reports("text/plain"), []);
		assert.deepEqual(await files.reports("text/plain", { single_file: true }), []);
		assert.deepEqual(kept, []);
	});

	it("an introduced source outside the copy has nothing to read", async () => {
		const sources = await workspaceFiles(copyBesideASecret()).sources(["../outside/r.txt"]);
		assert.deepEqual([...sources.keys()], []);
	});

	it("one file outside the copy is refused before it is read", async () => {
		await assert.rejects(workspaceFiles(copyBesideASecret()).text("../outside/r.txt"), /escapes the workspace/);
	});
});
