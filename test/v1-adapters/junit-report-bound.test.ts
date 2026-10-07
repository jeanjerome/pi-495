import { strict as assert } from "node:assert";
import { mkdirSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { MAX_REPORT_BYTES } from "../../src/adapters/execution/parsers.ts";
import type { EvidenceCandidate } from "../../src/contracts/v1/evidence.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("junit-bound-", cleanups);
});

const GREEN =
	'<testsuite name="Domain" tests="1" failures="0" errors="0" skipped="0"><testcase name="works" classname="Domain"/></testsuite>';

/** Writes a green report at `relative` under a fresh workspace, then brings the file to `bytes` with `truncateSync`. */
function workspaceWith(relative: string, bytes: number): string {
	const ws = join(root, "ws");
	const file = join(ws, relative);
	mkdirSync(join(file, ".."), { recursive: true });
	writeFileSync(file, GREEN);
	truncateSync(file, bytes);
	return ws;
}

async function runJUnit(ws: string, reportPath: string): Promise<EvidenceCandidate> {
	const runner = new GenericControlRunner(
		new UnconfinedSandbox(),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);
	const control = controlOf({
		control_id: "unit",
		command: [process.execPath, "-e", "process.exit(0)"],
		parser: "junit-xml",
		report_path: reportPath,
	});
	const { evidence } = await runner.runControl({ ...invocationBase(), control, workspace_path: ws });
	return evidence;
}

function unreadableNote(evidence: EvidenceCandidate): string {
	const note = evidence.limits.notes.find((n) => n.startsWith("a JUnit report is not readable"));
	assert.ok(note, `a note says "a JUnit report is not readable": ${JSON.stringify(evidence.limits.notes)}`);
	return note;
}

describe("a JUnit report past the read bound", () => {
	it("a declared report one byte past the bound is not readable, named with its size and the bound, and not kept", async () => {
		const ws = workspaceWith("reports/junit.xml", MAX_REPORT_BYTES + 1);
		const evidence = await runJUnit(ws, "reports/junit.xml");
		assert.equal(evidence.verdict, "INDETERMINATE");
		const note = unreadableNote(evidence);
		assert.ok(note.includes("reports/junit.xml"), `the note names the report path: ${note}`);
		assert.ok(note.includes(String(MAX_REPORT_BYTES + 1)), `the note names the report size: ${note}`);
		assert.ok(note.includes(String(MAX_REPORT_BYTES)), `the note names the read bound: ${note}`);
		assert.deepEqual(
			evidence.artifacts.map((a) => a.name).filter((name) => name.startsWith("report:")),
			[],
			"no report: artifact is kept for an unread report",
		);
	});

	it("a declared report larger than a string can hold is not readable, and is not said to be missing", async () => {
		const ws = workspaceWith("reports/junit.xml", 3 * 1024 * 1024 * 1024);
		const evidence = await runJUnit(ws, "reports/junit.xml");
		assert.equal(evidence.verdict, "INDETERMINATE");
		assert.ok(
			!evidence.limits.notes.includes("no JUnit report found at the declared report path"),
			`a report that is there is not said to be missing: ${JSON.stringify(evidence.limits.notes)}`,
		);
		const note = unreadableNote(evidence);
		assert.ok(note.includes("reports/junit.xml"), `the note names the report path: ${note}`);
		assert.ok(note.includes("3221225472"), `the note names the report size: ${note}`);
	});

	it("a Surefire report found by a reactor scan one byte past the bound is not readable, named, and not kept", async () => {
		const ws = workspaceWith("m/target/surefire-reports/TEST-a.xml", MAX_REPORT_BYTES + 1);
		const evidence = await runJUnit(ws, "**/target/surefire-reports");
		assert.equal(evidence.verdict, "INDETERMINATE");
		const note = unreadableNote(evidence);
		assert.ok(note.includes("m/target/surefire-reports/TEST-a.xml"), `the note names the report path: ${note}`);
		assert.ok(note.includes(String(MAX_REPORT_BYTES + 1)), `the note names the report size: ${note}`);
		assert.deepEqual(
			evidence.artifacts.map((a) => a.name).filter((name) => name.startsWith("report:")),
			[],
			"no report: artifact is kept for an unread report",
		);
	});

	it("a green report of exactly the bound is read as before and kept", async () => {
		const ws = join(root, "ws");
		mkdirSync(join(ws, "reports"), { recursive: true });
		const padding = "x".repeat(MAX_REPORT_BYTES - Buffer.byteLength(GREEN) - "<!---->".length);
		const report = `${GREEN}<!--${padding}-->`;
		assert.equal(Buffer.byteLength(report), MAX_REPORT_BYTES);
		writeFileSync(join(ws, "reports", "junit.xml"), report);
		const evidence = await runJUnit(ws, "reports/junit.xml");
		assert.equal(evidence.verdict, "PASS", JSON.stringify(evidence.limits.notes));
		assert.deepEqual(
			evidence.artifacts.map((a) => a.name).filter((name) => name.startsWith("report:")),
			["report:reports/junit.xml"],
		);
	});
});
