import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { formalToolingMissing } from "../helpers/check-formal.ts";
import { counterPackage, runCounterChange } from "../helpers/formal-control.ts";

/** Where the standalone jar of the TLA+ release is kept, read when `TLA2TOOLS_JAR` names none. */
const JAR = process.env.TLA2TOOLS_JAR ?? join(homedir(), ".local", "share", "tlaplus", "tla2tools.jar");
const java = (): string => spawnSync("sh", ["-c", "command -v java"], { encoding: "utf8" }).stdout.trim();

describe("the formal control under the sandbox of the platform", { skip: formalToolingMissing }, () => {
	it("the real TLC explores the adopted model in the confined copy, and the change is accepted on it", async () => {
		const pkg = counterPackage(
			{ java: java(), jar: JAR },
			{ budget: { timeout_ms: 120_000, workers: 1, heap_mb: 512 } },
		);
		const { state, steps } = await runCounterChange(pkg, { sandbox: "platform" });
		const explored = state.evidence.filter((e) => e.control_id === "formal-model" && e.valid).at(-1);
		assert.equal(explored?.verdict, "PASS", `TLC completes under the sandbox: ${steps.join(" | ")}`);
		assert.equal(state.outcome, "accepted");
	});

	it("TLC extracts its standard modules in the copy, so two explorations at once never share them", async () => {
		// TLC writes the standard modules a model extends at a fixed name in its temporary directory and deletes them at
		// exit: an exploration that reads one another exploration rewrites or removes fails to parse its model. One
		// standing there for the whole run must neither be read nor touched.
		const shared = join(realpathSync(tmpdir()), "Naturals.tla");
		const sentinel = "---- MODULE Naturals ----\n\\* left here by another exploration\n====\n";
		assert.equal(existsSync(shared), false, `${shared} is free before the run`);
		writeFileSync(shared, sentinel);
		try {
			const pkg = counterPackage(
				{ java: java(), jar: JAR },
				{ budget: { timeout_ms: 120_000, workers: 1, heap_mb: 512 } },
			);
			const { state, steps } = await runCounterChange(pkg, { sandbox: "platform" });
			assert.ok(
				state.evidence.some((e) => e.control_id === "formal-model" && e.verdict === "PASS"),
				`TLC explored the model: ${steps.join(" | ")}`,
			);
			assert.equal(
				existsSync(shared) ? readFileSync(shared, "utf8") : null,
				sentinel,
				`no exploration rewrote or removed ${shared}`,
			);
		} finally {
			rmSync(shared, { force: true });
		}
	});
});
