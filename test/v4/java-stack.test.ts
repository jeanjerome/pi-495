/**
 * V4 — second target stack (F-JAVA, EXT-03, REC-01, REC-28). Needs a JDK, Maven and a warm local
 * repository (the control runs Maven offline). Enable with HARNESS495_RUN_JAVA=1.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { detectStack } from "../../src/application/target.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { fixtureJava } from "../helpers/fixtures.ts";
import { EXECUTOR, ENV } from "../helpers/change-fixture.ts";

const enabled = process.env.HARNESS495_RUN_JAVA === "1";

describe("F-JAVA through the generic runner (EXT-03)", { skip: !enabled && "set HARNESS495_RUN_JAVA=1" }, () => {
	it("detects Maven, qualifies the Surefire and coverage controls positively/negatively/incident and reads their reports", async () => {
		mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
		const root = mkdtempSync(join(process.cwd(), "test-output", "java-"));
		try {
			const pos = join(root, "pos");
			const neg = join(root, "neg");
			const cov = join(root, "cov");
			for (const ws of [pos, neg, cov]) fixtureJava(ws, true);
			// warm the local Maven repository once, online, outside the sandbox (installation step, not a control)
			execFileSync("mvn", ["-B", "-q", "test"], { cwd: pos, stdio: "ignore", timeout: 15 * 60_000 });
			const detection = detectStack(pos, [{ requirement_id: "R1", revision: 1 }]);
			assert.equal(detection.stack, "maven");
			assert.equal(detection.facts.jacoco_report_bound, true);
			const write = (ws: string, files: Record<string, string>) => { for (const [rel, content] of Object.entries(files)) { mkdirSync(join(ws, rel, ".."), { recursive: true }); writeFileSync(join(ws, rel), content); } };
			for (const ws of [pos, neg, cov]) write(ws, detection.positive_witness);
			write(neg, detection.negative_witness);
			write(cov, detection.own_negative_witness.coverage!);
			const sandbox = selectSandbox({ allow_unconfined: process.platform !== "darwin" });
			const runner = new GenericControlRunner(sandbox.backend, new CasObjectStore(join(root, "objects")));
			const widen = (c: ControlDefinition): ControlDefinition => ({ ...c, env_allowlist: [...c.env_allowlist, "M2_HOME", "MAVEN_HOME", "JAVA_TOOL_OPTIONS", "USER"], timeout_ms: 15 * 60_000 });
			const test = widen(detection.controls.find((c) => c.control_id === "maven-test")!);
			const coverage = widen(detection.controls.find((c) => c.control_id === "coverage")!);
			const base = { protocol: { protocol_id: "p", revision: 1, content_digest: digestValue("p") }, candidate: { candidate_id: "c", manifest_digest: digestValue("c"), base_digest: digestValue("b"), workspace_id: "w" }, subject: { kind: "fixture" as const, id: "f", revision: 1, digest: digestValue("f") }, environment: { environment_id: "e", digest: ENV, profile_id: "verify" }, requirement_refs: [], producer: EXECUTOR };

			const q = await qualifyControl(runner, test, { positive_path: pos, negative_path: neg, positive_files: detection.positive_witness, negative_files: { ...detection.positive_witness, ...detection.negative_witness } }, base);
			assert.deepEqual([q.positive, q.negative, q.incident, q.qualified], ["PASS", "FAIL", "INDETERMINATE", true], JSON.stringify(q.notes));

			// The coverage sensor reads the report `mvn test` leaves behind, so the test control runs
			// first in each witness workspace — the order the frozen protocol runs them in.
			for (const ws of [pos, cov]) await runner.runControl({ ...base, control: test, workspace_path: ws });
			const negativeFiles = { ...detection.positive_witness, ...detection.own_negative_witness.coverage! };
			const qc = await qualifyControl(runner, coverage, { positive_path: pos, negative_path: cov, positive_files: detection.positive_witness, negative_files: negativeFiles }, base);
			assert.deepEqual([qc.positive, qc.negative, qc.incident, qc.qualified], ["PASS", "FAIL", "INDETERMINATE", true], JSON.stringify(qc.notes));

			// What it blocks on, named at its file, at its line and at its symbol. The two witnesses are
			// introduced together: the one the suite calls is silent, the one it never calls is not.
			const introduced = { "src/main/java/Witness495Uncovered.java": [1, 2, 3, 4, 5], "src/main/java/Witness495Covered.java": [1, 2, 3, 4, 5] };
			const run = await runner.runControl({ ...base, control: coverage, workspace_path: cov, introduced_lines: introduced });
			assert.equal(run.evidence.verdict, "FAIL");
			assert.deepEqual(run.evidence.findings.map((f) => `${f.severity} ${f.path}:${f.region?.start_line} ${f.symbol}`), [
				"blocker src/main/java/Witness495Uncovered.java:1 Witness495Uncovered.<init>",
				"blocker src/main/java/Witness495Uncovered.java:3 Witness495Uncovered.half",
			]);
			assert.deepEqual([run.evidence.facts.measured_lines, run.evidence.facts.uncovered_lines, run.evidence.facts.tolerated_uncovered_lines], [4, 2, 0]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
