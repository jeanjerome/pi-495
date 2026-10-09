import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import type { EvidenceCandidate } from "../../src/contracts/v1/evidence.ts";
import type { ProcessObservation } from "../../src/ports/execution.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { ReplayedSandbox } from "../helpers/replayed-sandbox.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

// What TLC 2.19 (rev 5a47802) printed in its `-tool` mode on the models below, replayed instead of run.
const FIXTURES = join(import.meta.dirname, "..", "fixtures", "tlc");
const printed = (name: string): string => readFileSync(join(FIXTURES, `tlc-2.19-${name}.out`), "utf8");
/** The completed output, one of TLC's messages taken out. */
const completedWithout = (code: number): string =>
	printed("completed").replace(
		new RegExp(`@!@!@STARTMSG ${code}:\\d+ @!@!@\\n[\\s\\S]*?@!@!@ENDMSG ${code} @!@!@\\n`),
		"",
	);
/** The completed output, an exception TLC reports as an error-class message printed before its end. */
const COMPLETED_WITH_AN_EXCEPTION = printed("completed").replace(
	"@!@!@STARTMSG 2186:",
	"@!@!@STARTMSG 1000:1 @!@!@\nTLC threw an unexpected exception.\n@!@!@ENDMSG 1000 @!@!@\n@!@!@STARTMSG 2186:",
);

const COMPTEUR = `---- MODULE Compteur ----
EXTENDS Naturals
CONSTANT Max
VARIABLE x
Init == x = 0
Next == x < Max /\\ x' = x + 1
Borne == x <= Max
====
`;
const WITH_INVARIANT = "CONSTANT Max = 3\nINIT Init\nNEXT Next\nINVARIANT Borne\nCHECK_DEADLOCK FALSE\n";
const WITHOUT_PROPERTY = "CONSTANT Max = 3\nINIT Init\nNEXT Next\nCHECK_DEADLOCK FALSE\n";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("tlc-result-", cleanups);
});

interface TlcFacts {
	outcome: string;
	scope: string;
	exhaustive: boolean;
	properties: { name: string; kind: string; verified: boolean }[];
	bounds: Record<string, string>;
	assumptions: string[];
	tool: { name: string; version: string | null };
	modules: string[];
	states: { generated: number; distinct: number } | null;
	depth: number | null;
	counterexample: { property: string; trace: { step: number; action: string; state: string }[] } | null;
	reasons: string[];
}

/** Runs the TLC control on a copy holding the model and its configuration, the sandbox replaying `stdout`. */
async function readTlc(
	stdout: string,
	config: string,
	over: Partial<ProcessObservation> = {},
	options: readonly string[] = [],
): Promise<{ evidence: EvidenceCandidate; tlc: TlcFacts | undefined }> {
	const ws = join(root, "ws");
	writeFiles(ws, { "Compteur.tla": COMPTEUR, "Compteur.cfg": config });
	const runner = new GenericControlRunner(
		new ReplayedSandbox(stdout, over),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);
	const control = controlOf({
		control_id: "tlc-compteur",
		command: [
			"java",
			"-cp",
			"tla2tools.jar",
			"tlc2.TLC",
			"-tool",
			...options,
			"-config",
			"Compteur.cfg",
			"Compteur.tla",
		],
		parser: "tlc",
	});
	const { evidence } = await runner.runControl({ ...invocationBase(), control, workspace_path: ws });
	return { evidence, tlc: evidence.facts.tlc as TlcFacts | undefined };
}

describe("the result of a TLC exploration", () => {
	it("an exhaustive exploration that ends with its invariant activated is completed, names the properties verified and the bounds, and is PASS for the model only", async () => {
		const { evidence, tlc } = await readTlc(printed("completed"), WITH_INVARIANT);
		assert.equal(tlc?.outcome, "completed", `the result is completed: ${JSON.stringify(evidence.limits.notes)}`);
		assert.equal(evidence.verdict, "PASS");
		assert.deepEqual(tlc.properties, [{ name: "Borne", kind: "invariant", verified: true }]);
		assert.deepEqual(tlc.bounds, { Max: "3" });
		assert.equal(tlc.exhaustive, true);
		assert.equal(tlc.scope, "model", "the PASS holds for the finite model, not for the program");
		assert.deepEqual(tlc.tool, { name: "TLC", version: "2.19 of 08 August 2024 (rev: 5a47802)" });
		assert.deepEqual(tlc.modules, ["Naturals", "Compteur"]);
		assert.deepEqual(tlc.states, { generated: 4, distinct: 4 });
		assert.equal(tlc.depth, 4);
		assert.equal(tlc.counterexample, null);
	});

	it("a violated invariant keeps its counterexample, state by state, and concludes counterexample", async () => {
		const { evidence, tlc } = await readTlc(printed("counterexample"), WITH_INVARIANT, { exit_code: 12 });
		assert.equal(
			tlc?.outcome,
			"counterexample",
			`the result is counterexample: ${JSON.stringify(evidence.limits.notes)}`,
		);
		assert.equal(evidence.verdict, "FAIL");
		assert.equal(tlc.counterexample?.property, "Borne");
		assert.deepEqual(
			tlc.counterexample?.trace.map((s) => [s.step, s.state]),
			[
				[1, "x = 0"],
				[2, "x = 2"],
				[3, "x = 4"],
			],
		);
		assert.match(tlc.counterexample?.trace[1]?.action ?? "", /^Next line 6/);
		assert.deepEqual(
			tlc.properties.map((p) => [p.name, p.verified]),
			[["Borne", false]],
		);
	});

	describe("the interrupted output and the one without property are not PASS", () => {
		/** Each case, and the reason that says why it is not completed: each check of the reader is the only one some case reaches. */
		const cases: [string, () => Promise<{ evidence: EvidenceCandidate; tlc: TlcFacts | undefined }>, RegExp][] = [
			[
				"a run killed at its timeout before the end of the exploration",
				() => readTlc(printed("interrupted"), WITH_INVARIANT, { exit_code: null, signal: "SIGKILL", timed_out: true }),
				/^the run was interrupted: timeout/,
			],
			[
				"a Java run ended by SIGTERM, which exits 143 after its shutdown hooks",
				() => readTlc(printed("interrupted"), WITH_INVARIANT, { exit_code: 143, signal: null }),
				/^the output ends before TLC said it finished$/,
			],
			[
				"a complete output cut at the output bound",
				() => readTlc(printed("completed"), WITH_INVARIANT, { stdout_truncated: true }),
				/^the output was cut at its bound$/,
			],
			[
				"an exhaustive exploration whose configuration activates no property",
				() => readTlc(printed("completed"), WITHOUT_PROPERTY),
				/^the configuration activates no INVARIANT nor PROPERTY/,
			],
			["a random simulation", () => readTlc(printed("simulation"), WITH_INVARIANT), /^a random simulation/],
			[
				"a depth-first search stopped at its depth",
				() => readTlc(printed("depth-first"), WITH_INVARIANT),
				/^a depth-first search stops at its depth/,
			],
			["an output that is not TLC's", () => readTlc("hello\n", WITH_INVARIANT), /^the output holds no TLC message/],
			[
				"a model that does not parse",
				() => readTlc(printed("parse-error"), WITH_INVARIANT, { exit_code: 150 }),
				/^TLC reported error 3002: Parsing or semantic analysis failed/,
			],
			[
				"a complete output whose process exits non-zero",
				() => readTlc(printed("completed"), WITH_INVARIANT, { exit_code: 1 }),
				/^TLC exited 1 without naming a violation$/,
			],
			[
				"a complete output that reports an exception of TLC",
				() => readTlc(COMPLETED_WITH_AN_EXCEPTION, WITH_INVARIANT),
				/^TLC reported error 1000: TLC threw an unexpected exception/,
			],
			[
				"a complete output that names no search mode",
				() => readTlc(completedWithout(2187), WITH_INVARIANT),
				/^the output names no breadth-first model checking$/,
			],
			[
				"an output where TLC finished without saying that model checking completed",
				() => readTlc(completedWithout(2193), WITH_INVARIANT),
				/^TLC did not say that model checking completed$/,
			],
			[
				"an output that never says TLC finished",
				() => readTlc(completedWithout(2186), WITH_INVARIANT),
				/^the output ends before TLC said it finished$/,
			],
			[
				"an output without TLC's version",
				() => readTlc(completedWithout(2262), WITH_INVARIANT),
				/^the output holds no TLC message/,
			],
		];
		for (const [name, run, reason] of cases) {
			it(name, async () => {
				const { evidence, tlc } = await run();
				assert.notEqual(evidence.verdict, "PASS", `${name} is not PASS`);
				assert.ok(
					tlc?.outcome === "inconclusive" || tlc?.outcome === "error",
					`${name} is inconclusive or error, got ${tlc?.outcome}: ${JSON.stringify(evidence.limits.notes)}`,
				);
				assert.ok(
					tlc.properties.every((p) => !p.verified),
					`no property is verified: ${JSON.stringify(tlc.properties)}`,
				);
				assert.match(tlc.reasons.join("\n"), reason, "the result says why it is not completed");
			});
		}
	});

	it("names the substituted constants among the bounds and what else of the configuration limits the claim", async () => {
		const restricted =
			"CONSTANTS Max = 3 Procs <- ProcSet\nINIT Init\nNEXT Next\nINVARIANT Borne\nCONSTRAINT Petit\nSYMMETRY Perms\nVIEW Vue\nCHECK_DEADLOCK FALSE\n";
		const { tlc } = await readTlc(printed("completed"), restricted);
		assert.deepEqual(tlc?.bounds, { Max: "3", Procs: "<- ProcSet" });
		assert.deepEqual(tlc?.assumptions, [
			"the state constraint Petit bounds the exploration",
			"the exploration is reduced by the symmetry Perms",
			"states are told apart by the view Vue only",
			"deadlock is not checked",
		]);
	});

	it("an unchecked deadlock is an assumption once, whether the configuration or the -deadlock option leaves it", async () => {
		const checked = "CONSTANT Max = 3\nINIT Init\nNEXT Next\nINVARIANT Borne\n";
		assert.deepEqual((await readTlc(printed("completed"), checked)).tlc?.assumptions, []);
		assert.deepEqual((await readTlc(printed("completed"), checked, {}, ["-deadlock"])).tlc?.assumptions, [
			"deadlock is not checked",
		]);
		assert.deepEqual((await readTlc(printed("completed"), WITH_INVARIANT, {}, ["-deadlock"])).tlc?.assumptions, [
			"deadlock is not checked",
		]);
	});

	it("a temporal property is claimed only once its check has finished", async () => {
		const vivace = "CONSTANT Max = 3\nINIT Init\nNEXT Next\nINVARIANT Borne\nPROPERTY Termine\n";
		const ended = await readTlc(printed("liveness"), vivace);
		assert.deepEqual(ended.tlc?.properties, [
			{ name: "Borne", kind: "invariant", verified: true },
			{ name: "Termine", kind: "temporal", verified: true },
		]);
		const unchecked = await readTlc(printed("completed"), vivace);
		assert.equal(unchecked.tlc?.outcome, "inconclusive", "a temporal property whose check never ran is not claimed");
		assert.notEqual(unchecked.evidence.verdict, "PASS");
	});
});
