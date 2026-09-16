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
import { fixtureJava } from "../helpers/fixtures.ts";
import { EXECUTOR, ENV } from "../helpers/change-fixture.ts";

const enabled = process.env.HARNESS495_RUN_JAVA === "1";

describe("F-JAVA through the generic runner (EXT-03)", { skip: !enabled && "set HARNESS495_RUN_JAVA=1" }, () => {
	it("detects Maven, qualifies the Surefire control positively/negatively/incident and reads JUnit XML", async () => {
		mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
		const root = mkdtempSync(join(process.cwd(), "test-output", "java-"));
		try {
			const pos = join(root, "pos");
			const neg = join(root, "neg");
			fixtureJava(pos);
			fixtureJava(neg);
			// warm the local Maven repository once, online, outside the sandbox (installation step, not a control)
			execFileSync("mvn", ["-B", "-q", "test"], { cwd: pos, stdio: "ignore", timeout: 15 * 60_000 });
			const detection = detectStack(pos, [{ requirement_id: "R1", revision: 1 }]);
			assert.equal(detection.stack, "maven");
			for (const [rel, content] of Object.entries(detection.negative_witness)) { mkdirSync(join(neg, rel, ".."), { recursive: true }); writeFileSync(join(neg, rel), content); }
			for (const [rel, content] of Object.entries(detection.positive_witness)) for (const ws of [pos, neg]) { mkdirSync(join(ws, rel, ".."), { recursive: true }); writeFileSync(join(ws, rel), content); }
			const sandbox = selectSandbox({ allow_unconfined: process.platform !== "darwin" });
			const runner = new GenericControlRunner(sandbox.backend, new CasObjectStore(join(root, "objects")));
			const control = { ...detection.controls[0]!, env_allowlist: [...detection.controls[0]!.env_allowlist, "M2_HOME", "MAVEN_HOME", "JAVA_TOOL_OPTIONS", "USER"], timeout_ms: 15 * 60_000 };
			const q = await qualifyControl(runner, control, { positive_path: pos, negative_path: neg }, { protocol: { protocol_id: "p", revision: 1, content_digest: digestValue("p") }, candidate: { candidate_id: "c", manifest_digest: digestValue("c"), base_digest: digestValue("b"), workspace_id: "w" }, subject: { kind: "fixture", id: "f", revision: 1, digest: digestValue("f") }, environment: { environment_id: "e", digest: ENV, profile_id: "verify" }, requirement_refs: [], producer: EXECUTOR });
			assert.deepEqual([q.positive, q.negative, q.incident, q.qualified], ["PASS", "FAIL", "INDETERMINATE", true], JSON.stringify(q.notes));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
