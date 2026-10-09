import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";

const REPOSITORY = join(import.meta.dirname, "..", "..");
const WITNESSES = join(REPOSITORY, "specs", "formal", "fixtures", "tlc");
const CHECK_FORMAL = join(REPOSITORY, "scripts", "check-formal.ts");
/** Where the standalone jar of the TLA+ release is kept, read when `TLA2TOOLS_JAR` names none. */
const LOCAL_JAR = join(homedir(), ".local", "share", "tlaplus", "tla2tools.jar");
const JAR = process.env.TLA2TOOLS_JAR ?? LOCAL_JAR;
/** The standalone `tla2tools.jar` of TLC 2.19 (release v1.7.4), which runs on a native ARM or x86 JVM. */
const STANDALONE_JAR_SHA256 = "sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88";
const javaAvailable = spawnSync("java", ["-version"]).status === 0;

let store: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	store = outputDir("tlc-qualification-", cleanups);
});

interface FormalReport {
	outcome: string;
	tool: { jar_sha256: string };
	pass: boolean;
	reasons: string[];
	result: {
		properties: { name: string; kind: string; verified: boolean }[];
		bounds: Record<string, string>;
		tool: { version: string | null };
		counterexample: { property: string; trace: { step: number; state: string }[] } | null;
	} | null;
}

/** Runs the control on a witness with the real TLC, and reads back the report it kept in the object store. */
async function explore(witness: string): Promise<{ status: number | null; output: string; report: FormalReport }> {
	const run = spawnSync(
		process.execPath,
		[CHECK_FORMAL, join(WITNESSES, witness, "manifest.json"), "--jar", JAR, "--store", store],
		{ encoding: "utf8" },
	);
	const output = run.stdout + run.stderr;
	const digest = /^report: (sha256:\w+)$/m.exec(output)?.[1];
	assert.ok(digest, `the control names the report it kept: ${output}`);
	const bytes = await new CasObjectStore(store).get(digest);
	assert.ok(bytes, "the report is in the object store");
	return { status: run.status, output, report: JSON.parse(new TextDecoder().decode(bytes)) as FormalReport };
}

describe("the qualification of the TLC control on its three witnesses", {
	skip:
		(!existsSync(JAR) && `no tla2tools.jar at ${JAR}: set TLA2TOOLS_JAR to the jar of TLC 2.19`) ||
		(!javaAvailable && "java is not on PATH"),
}, () => {
	describe("the three witnesses render completed, counterexample, and error or inconclusive respectively", () => {
		it("the valid model is completed, its safety property and the reachability of its valid end verified under its bounds", async () => {
			const { status, output, report } = await explore("valide");
			assert.equal(report.outcome, "completed", output);
			assert.equal(status, 0);
			assert.equal(report.pass, true);
			assert.deepEqual(report.result?.properties, [
				{ name: "Borne", kind: "invariant", verified: true },
				{ name: "Termine", kind: "temporal", verified: true },
			]);
			assert.deepEqual(report.result?.bounds, { Max: "3" });
			assert.equal(report.result?.tool.version, "2.19 of 08 August 2024 (rev: 5a47802)");
			assert.equal(report.tool.jar_sha256, STANDALONE_JAR_SHA256);
		});

		it("the mutant is a counterexample to the expected invariant, not a syntax error, its path kept", async () => {
			const { status, output, report } = await explore("mutant");
			assert.equal(report.outcome, "counterexample", output);
			assert.equal(status, 1);
			assert.equal(report.pass, false);
			assert.equal(report.result?.counterexample?.property, "Borne");
			assert.deepEqual(
				report.result?.counterexample?.trace.map((s) => s.state),
				["x = 0", "x = 2", "x = 4"],
			);
		});

		it("the incident is error or inconclusive, and no PASS comes out of it", async () => {
			const { status, output, report } = await explore("incident");
			assert.ok(report.outcome === "inconclusive" || report.outcome === "error", output);
			assert.ok(status === 2 || status === 3, `exit ${status}`);
			assert.equal(report.pass, false);
			assert.ok(
				report.result?.properties.every((p) => !p.verified),
				"no property is verified",
			);
		});
	});
});
