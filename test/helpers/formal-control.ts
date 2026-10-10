/**
 * A target that adopts a TLA+ model of its counter, explored by a `java` standing for TLC 2.19: it prints the
 * output TLC printed of the counter model, a completed exploration of the approved model or the counterexample of a
 * model whose step is unguarded, it records each run, and it explores without end in a copy holding `.495-hang`.
 * The change adds the bound of the counter, driven through the kernel by a scripted agent.
 */
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { digestBytes } from "../../src/contracts/digest.ts";
import type { AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import type { FormalPackage } from "../../src/contracts/v1/protocol.ts";
import type { ChangeState } from "../../src/domain/change/state.ts";
import { HUMAN } from "./change-fixture.ts";
import { outputDir, removedAfterEach, writeFiles } from "./fixtures.ts";
import { type HarnessOptions, makeHarness, specReport, trackedProject, type TestHarness } from "./harness-fixture.ts";

export const COMPTEUR = `---- MODULE Compteur ----
EXTENDS Naturals
CONSTANT Max
VARIABLE x
Init == x = 0
Next == x < Max /\\ x' = x + 1
Borne == x <= Max
====
`;
/** The step without its guard: the counter passes Max, and Borne is violated. */
export const COMPTEUR_SANS_GARDE = COMPTEUR.replace("x < Max /\\ x' = x + 1", "x' = x + 1");
export const CONFIG = "CONSTANT Max = 3\nINIT Init\nNEXT Next\nINVARIANT Borne\nCHECK_DEADLOCK FALSE\n";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "tlc");

/** The bounded counter the change delivers, and one that diverges from the model past its first step. */
export const BOUNDED = "export function next(x, max) {\n  return x < max ? x + 1 : x;\n}\n";
export const DIVERGENT = "export function next(x, max) {\n  return x < max ? x + 2 : x;\n}\n";

export const REPLAY_CASE = "R1 replays the traces of Compteur";

/** The tests a preparation writes: the bound, and, unless `replay` is false, the replay of the model's traces. */
function counterTest(replay: boolean): string {
	const bound = 'test("R1 next stops at max", () => {\n  assert.equal(next(3, 3), 3);\n});\n';
	const traces = `test(${JSON.stringify(REPLAY_CASE)}, () => {\n  for (let x = 0; x < 3; x++) assert.equal(next(x, 3), x + 1);\n});\n`;
	return `import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { next } from "../src/counter.js";\n\n${bound}${replay ? traces : ""}`;
}

/** A `java` that stands for TLC: it records its run in `ran`, then prints what TLC printed of the model it is given. */
function standInForTlc(ran: string): string {
	return [
		'const fs = process.getBuiltinModule("node:fs");',
		`fs.appendFileSync(${JSON.stringify(ran)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
		"const model = fs.readFileSync(process.argv.at(-1), 'utf8');",
		'if (fs.existsSync(".495-hang")) {',
		`  process.stdout.write(${JSON.stringify(readFileSync(join(FIXTURES, "tlc-2.19-interrupted.out"), "utf8").split("\n").slice(0, 6).join("\n"))} + "\\n");`,
		"  setTimeout(() => {}, 60000);",
		"} else {",
		`  const out = model.includes("x < Max") ? ${JSON.stringify(join(FIXTURES, "tlc-2.19-completed.out"))} : ${JSON.stringify(join(FIXTURES, "tlc-2.19-counterexample.out"))};`,
		"  process.stdout.write(fs.readFileSync(out, 'utf8'));",
		"}",
	].join("\n");
}

const toolRoots = removedAfterEach();

export interface TlcStandIn {
	java: string;
	jar: string;
	/** Where the stand-in records each run, one line of arguments per run. */
	ran: string;
}

/** The `java` standing for TLC, outside the target: the tool is the owner's, never a file of the project. */
export function tlcStandIn(): TlcStandIn {
	const dir = outputDir("formal-tool-", toolRoots);
	const ran = join(dir, "ran.jsonl");
	writeFiles(dir, { "bin/java": `#!${process.execPath}\n${standInForTlc(ran)}\n`, "tla2tools.jar": "stand-in\n" });
	chmodSync(join(dir, "bin", "java"), 0o755);
	return { java: join(dir, "bin", "java"), jar: join(dir, "tla2tools.jar"), ran };
}

/** The package the owner adopts for the counter: every file pinned by digest, explored by the TLC of `tool`. */
export function counterPackage(
	tool: Pick<TlcStandIn, "java" | "jar">,
	over: Partial<FormalPackage> = {},
): FormalPackage {
	return {
		model: "spec/Compteur.tla",
		config: "spec/Compteur.cfg",
		files: {
			"spec/Compteur.tla": digestBytes(COMPTEUR),
			"spec/Compteur.cfg": digestBytes(CONFIG),
			"spec/mutants/Compteur.tla": digestBytes(COMPTEUR_SANS_GARDE),
		},
		required_properties: ["Borne"],
		expected_violation: { mutant: "spec/mutants/Compteur.tla", replaces: "spec/Compteur.tla" },
		tool: { name: "TLC", version: "2.19 of 08 August 2024 (rev: 5a47802)", java: tool.java, jar: tool.jar },
		budget: { timeout_ms: 2000, workers: 1, heap_mb: 256 },
		requirement_ids: ["R1"],
		correspondence: [{ control_id: "unit", cases: [REPLAY_CASE] }],
		...over,
	};
}

/** The counter before the change, without its bound, with the adopted model beside it. */
export function counterTarget(root: string): void {
	writeFiles(root, {
		"package.json": JSON.stringify({
			name: "counter",
			version: "1.0.0",
			type: "module",
			scripts: { test: "node --test" },
		}),
		"src/counter.js": "export function next(x, max) {\n  return x + 1;\n}\n",
		"spec/Compteur.tla": COMPTEUR,
		"spec/Compteur.cfg": CONFIG,
		"spec/mutants/Compteur.tla": COMPTEUR_SANS_GARDE,
		"README.md": "# counter\n",
	});
}

const spec = specReport({
	objective: "bound the counter at max, as the adopted model Compteur says",
	requirements: [
		{
			requirement_id: "R1",
			statement: "next(x, max) never takes the counter past max",
			mandatory: true,
			criterion: "the counter tests pass and replay the traces of the model",
			category: "functional",
			satisfied_by_reference: false,
		},
	],
	design: { summary: "guard the step of next", components: ["counter"], interfaces: ["next(x, max)"], risks: [] },
});
const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: false, notes: [] });

/** What the producer writes beside the counter and what it contests of the frozen cases of R1, and who examines it. */
interface CounterProducer {
	writes?: Record<string, string>;
	contests?: { case: string; observation: string }[];
	examiner?: AgentScript;
}

export interface FormalRun {
	t: TestHarness;
	state: ChangeState;
	steps: string[];
	stopped_because: string;
	project: string;
}

interface CounterRound {
	replay?: boolean;
	implementation?: string;
	sandbox?: "platform";
	producer?: CounterProducer;
}

/**
 * The session that conducts the change bounding the counter: the preparation writes its tests, with the replay of
 * the model's traces unless `replay` is false, and the producer writes `implementation`, then what `producer` adds.
 * `formal` is the package the profile adopts.
 */
export function counterSession(
	formal: FormalPackage | null,
	{ replay = true, implementation = BOUNDED, sandbox, producer = {} }: CounterRound = {},
): HarnessOptions {
	return {
		...(sandbox ? { sandbox } : {}),
		policy: { formal_control: formal },
		defaultScript: { steps: [{ kind: "complete", output: spec }] },
		scripts: {
			prepare: {
				steps: [
					{ kind: "write", path: "test/counter.test.js", content: counterTest(replay) },
					{ kind: "complete", output: report(["test/counter.test.js"]) },
				],
			},
			implement: {
				steps: [
					{ kind: "write", path: "src/counter.js", content: implementation },
					...Object.entries(producer.writes ?? {}).map(([path, content]) => ({
						kind: "write" as const,
						path,
						content,
					})),
					{
						kind: "complete",
						output: {
							...report(["src/counter.js", ...Object.keys(producer.writes ?? {})]),
							contestations: (producer.contests ?? []).map((c) => ({ requirement_id: "R1", ...c })),
						},
					},
				],
			},
			...(producer.examiner ? { review: producer.examiner } : {}),
		},
	};
}

/** Runs the change that bounds the counter in the session `counterSession` describes. */
export async function runCounterChange(formal: FormalPackage | null, round: CounterRound = {}): Promise<FormalRun> {
	const project = trackedProject(counterTarget);
	const t = makeHarness(counterSession(formal, round));
	const { change } = await t.harness.start({ project_path: project, request_text: "bound the counter", actor: HUMAN });
	const result = await t.harness.advance(change.change_id, { max_steps: 40 });
	return {
		t,
		state: t.ledger.loadChange(change.change_id)!.state,
		steps: result.steps,
		stopped_because: result.stopped_because,
		project,
	};
}
