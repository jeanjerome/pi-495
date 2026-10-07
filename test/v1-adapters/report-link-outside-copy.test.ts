import { strict as assert } from "node:assert";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
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
	root = outputDir("report-link-", cleanups);
});

/** A reader a technology brings: INDETERMINATE when it is handed no report, PASS unless a line says FAIL. */
const LINES_READER: ReportReader = {
	id: "lines",
	version: "1.0.0",
	nature: "behaviour",
	differential: false,
	located: false,
	async read(run) {
		const docs = await run.reports("text/plain; charset=utf-8");
		if (docs.length === 0) return { verdict: "INDETERMINATE", facts: {}, notes: ["no report"], failures: [] };
		const failed = docs.some((d) => d.text.split("\n").some((line) => line.startsWith("FAIL")));
		return { verdict: failed ? "FAIL" : "PASS", facts: {}, notes: [], failures: [] };
	},
};

/**
 * A copy at `<root>/ws` where the project judged wrote its report `lines.txt` as a link to a file outside
 * the copy, and `linked` as a link to a directory outside it that holds `r.txt`.
 */
function copyLinkedOutside(): string {
	const ws = join(root, "ws");
	mkdirSync(ws, { recursive: true });
	mkdirSync(join(root, "outside", "dir"), { recursive: true });
	writeFileSync(join(root, "outside", "secret.txt"), "PASS read-from-outside-the-copy\n");
	writeFileSync(join(root, "outside", "dir", "r.txt"), "PASS read-from-outside-the-copy\n");
	symlinkSync(join(root, "outside", "secret.txt"), join(ws, "lines.txt"));
	symlinkSync(join(root, "outside", "dir"), join(ws, "linked"));
	return ws;
}

describe("a report written as a link out of the copy", () => {
	it("leaves the control INDETERMINATE, with no report:lines.txt artifact", async () => {
		const ws = copyLinkedOutside();
		const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")), [
			LINES_READER,
		]);
		const control = controlOf({ parser: "lines", report_path: "lines.txt" });
		const { evidence } = await runner.runControl({ ...invocationBase(), control, workspace_path: ws });
		assert.equal(evidence.verdict, "INDETERMINATE");
		assert.deepEqual(
			evidence.artifacts.map((a) => a.name).filter((name) => name.startsWith("report:")),
			[],
			"no report: artifact is kept for a report linked out of the copy",
		);
	});

	it("is neither returned nor kept by reports(), with or without single_file", async () => {
		const kept: string[] = [];
		const files = workspaceFiles(copyLinkedOutside(), "lines.txt", async (doc) => {
			kept.push(doc.name);
		});
		assert.deepEqual(await files.reports("text/plain"), []);
		assert.deepEqual(await files.reports("text/plain", { single_file: true }), []);
		assert.deepEqual(kept, [], "no report linked out of the copy is kept");
	});

	it("nor through a linked directory, a report directory or a recursive report path", async () => {
		const ws = copyLinkedOutside();
		writeFileSync(join(root, "outside", "dir", "TEST-a.xml"), "<testsuite/>");
		mkdirSync(join(ws, "m", "target", "surefire-reports"), { recursive: true });
		symlinkSync(join(root, "outside", "dir", "TEST-a.xml"), join(ws, "m", "target", "surefire-reports", "TEST-a.xml"));
		const kept: string[] = [];
		const keep = async (doc: { name: string }) => {
			kept.push(doc.name);
		};
		assert.deepEqual(await workspaceFiles(ws, "linked", keep).reports("application/xml"), []);
		assert.deepEqual(await workspaceFiles(ws, "linked/r.txt", keep).reports("text/plain", { single_file: true }), []);
		assert.deepEqual(await workspaceFiles(ws, "m/target/surefire-reports", keep).reports("application/xml"), []);
		assert.deepEqual(await workspaceFiles(ws, "**/target/surefire-reports", keep).reports("application/xml"), []);
		assert.deepEqual(kept, []);
	});
});

describe("a file or a root linked out of the copy, as a reader reaches it", () => {
	it("has nothing to read through sources()", async () => {
		const sources = await workspaceFiles(copyLinkedOutside()).sources(["lines.txt", "linked/r.txt"]);
		assert.deepEqual([...sources.keys()], []);
	});

	it("yields no file through tree(), its root noted as escaping the workspace", async () => {
		const tree = await workspaceFiles(copyLinkedOutside()).tree(["linked"], ".txt");
		assert.deepEqual(tree.files, []);
		assert.deepEqual(tree.notes, ["scope linked escapes the workspace and was not read"]);
	});

	it("is refused by text() with escapes the workspace", async () => {
		const files = workspaceFiles(copyLinkedOutside());
		await assert.rejects(files.text("lines.txt"), /lines\.txt escapes the workspace/);
		await assert.rejects(files.text("linked/r.txt"), /linked\/r\.txt escapes the workspace/);
	});

	it("is read as before when the link stays inside the copy", async () => {
		const ws = join(root, "ws");
		mkdirSync(join(ws, "real"), { recursive: true });
		writeFileSync(join(ws, "real", "r.txt"), "PASS inside\n");
		symlinkSync(join(ws, "real", "r.txt"), join(ws, "lines.txt"));
		symlinkSync(join(ws, "real"), join(ws, "linked"));
		const files = workspaceFiles(ws, "lines.txt");
		assert.deepEqual(await files.reports("text/plain"), [{ name: "lines.txt", text: "PASS inside\n" }]);
		assert.deepEqual([...(await files.sources(["linked/r.txt"])).values()], ["PASS inside\n"]);
		assert.equal(await files.text("linked/r.txt"), "PASS inside\n");
		assert.deepEqual(
			(await files.tree(["linked"], ".txt")).files.map((f) => f.path),
			["linked/r.txt"],
		);
	});
});
