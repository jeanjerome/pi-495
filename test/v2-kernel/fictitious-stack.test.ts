import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { CandidateManifest, ReferenceSnapshot } from "../../src/contracts/v1/candidate.ts";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import type { StackPlugin } from "../../src/application/stacks/plugin.ts";
import { MAVEN_PLUGIN } from "../../src/adapters/stacks/maven/maven.ts";
import { NODE_PLUGIN } from "../../src/adapters/stacks/node/node.ts";
import type { ParsedReport, ReportReader } from "../../src/ports/execution.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { writeFiles } from "../helpers/fixtures.ts";
import { makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";

/**
 * The command of the fictitious test control: each line `<path>=<expected>` of a `cases/*.case` file
 * is one case, which passes when the file at `<path>` holds `<expected>`. It writes one line per case
 * to `fict-report.txt`, `PASS <case>` or `FAIL <case>: <reason>`.
 */
const FICT_RUNNER = `
const fs = require("node:fs");
const lines = [];
for (const file of fs.readdirSync("cases").filter((name) => name.endsWith(".case")).sort())
	for (const line of fs.readFileSync("cases/" + file, "utf8").split("\\n").filter(Boolean)) {
		const [path, expected] = line.split("=");
		let actual;
		try { actual = fs.readFileSync(path, "utf8").trim(); } catch { actual = "<missing>"; }
		lines.push(actual === expected ? "PASS " + path : "FAIL " + path + ": expected " + expected + ", got " + actual);
	}
fs.writeFileSync("fict-report.txt", lines.join("\\n") + "\\n");
process.exitCode = lines.some((line) => line.startsWith("FAIL")) ? 1 : 0;
`;

function incident(note: string): ParsedReport {
	return { verdict: "INDETERMINATE", facts: {}, notes: [note], failures: [] };
}

/** The reader of the `fict-lines` format: one line `PASS <case>` or `FAIL <case>: <reason>` per case. */
const FICT_LINES_READER: ReportReader = {
	id: "fict-lines",
	version: "1.0.0",
	nature: "behaviour",
	differential: false,
	located: false,
	async read(run) {
		if (run.observation.spawn_error !== null || run.observation.timed_out)
			return incident("the fictitious runner did not run");
		const [report] = await run.reports("text/plain; charset=utf-8");
		if (report === undefined) return incident("no fict-lines report");
		const cases = report.text.split("\n").filter((line) => line.length > 0);
		const failures = cases.filter((line) => line.startsWith("FAIL ")).map((line) => line.slice("FAIL ".length));
		const passed = cases.filter((line) => line.startsWith("PASS ")).length;
		if (passed + failures.length !== cases.length) return incident("a line of the report is not a case");
		return {
			verdict: failures.length > 0 ? "FAIL" : passed > 0 ? "PASS" : "INDETERMINATE",
			facts: { tests: cases.length, failures: failures.length },
			notes: [],
			failures,
		};
	},
};

/**
 * A technology 495 does not carry: a project that holds `fict.toml`, whose tests are `cases/*.case`, whose
 * tools write under `fict-out/`, whose dependencies are installed under `fict_modules/` and whose toolchain is
 * found through `FICT_HOME`. It declares its recognition, its reader, its tests and its workspace, and no
 * other capability.
 */
const FICT_PLUGIN: StackPlugin<true> = {
	id: "fict",
	signal_files: ["fict.toml"],
	recognise: (view) => (view.exists("fict.toml") ? true : null),
	readers: [FICT_LINES_READER],
	capabilities: {
		tests: {
			offer: ({ requirement_refs, node_binary }) => ({
				kind: "available",
				controls: [
					{
						control_id: "fict-tests",
						version: "1",
						title: "fictitious test cases",
						command: [node_binary, "-e", FICT_RUNNER],
						cwd: ".",
						env_allowlist: ["PATH"],
						env: {},
						timeout_ms: 30_000,
						parser: "fict-lines",
						report_path: "fict-report.txt",
						structure_rules: [],
						provides: [],
						requires: [],
						scope_argument: null,
						network: "denied",
						writable_paths: ["fict-report.txt"],
						requirement_refs,
						protected: true,
						protected_paths: ["cases/"],
					},
				],
			}),
			positiveWitness: () => ({ "cases/495-witness.case": "495-witness.txt=ok\n", "495-witness.txt": "ok\n" }),
			negativeWitness: () => ({ "495-witness.txt": "ko\n" }),
			preparationPaths: () => ["cases/"],
			isTestFile: (path: string) => path.startsWith("cases/") && path.endsWith(".case"),
		},
		workspace: { outputs: ["fict-out/"], installed_dependencies: "fict_modules", env: ["FICT_HOME"] },
	},
};

const GREETING = "Hello\n";

/** A project carrying `fict.toml`, the greeting, the case that checks it and `files`. */
function greetingProject(files: Record<string, string> = {}): string {
	return trackedProject((root) =>
		writeFiles(root, {
			"fict.toml": "[project]\nname = 'greeting'\n",
			"src/greeting.txt": GREETING,
			"cases/greeting.case": "src/greeting.txt=Hello\n",
			...files,
		}),
	);
}

/** A change on `project`, under the list of 495 followed by the fictitious technology, whose agent writes `files`. */
async function driveChange(project: string, files: Record<string, string>) {
	const t = makeHarness({
		stacks: [MAVEN_PLUGIN, NODE_PLUGIN, FICT_PLUGIN],
		defaultScript: {
			steps: [
				{
					kind: "complete",
					output: specReport({
						objective: "src/greeting.txt keeps saying Hello",
						facts: ["the greeting is in src/greeting.txt"],
						requirements: [
							{
								requirement_id: "R1",
								statement: "src/greeting.txt says Hello",
								mandatory: true,
								criterion: "the fictitious cases pass",
								category: "functional",
								satisfied_by_reference: true,
							},
						],
						design: {
							summary: "rewrite src/greeting.txt with the same greeting",
							components: ["greeting"],
							interfaces: ["src/greeting.txt"],
							risks: [],
						},
					}),
				},
			],
		},
		scripts: {
			implement: {
				steps: [
					...Object.entries(files).map(([path, content]) => ({ kind: "write" as const, path, content })),
					{
						kind: "complete",
						output: { summary: "done", changed_paths: Object.keys(files), tests_claimed: true, notes: [] },
					},
				],
			},
		},
	});
	const { change } = await t.harness.start({
		project_path: project,
		request_text: "Add a farewell next to the greeting",
		actor: HUMAN,
	});
	const result = await t.harness.advance(change.change_id);
	const state = t.ledger.loadChange(change.change_id)!.state;
	return { t, change, result, state };
}

describe("a technology declared in one file, with its own report format", () => {
	it("given a project carrying only fict.toml and the list of 495 followed by a fictitious technology, when a scripted agent drives a change, then the fictitious control is qualified by its fict-lines reader, the candidate evidence passes under 1+fict-lines@1.0.0, the change is accepted, and the diagnosis of its protocol names exactly four blind spots, the coverage, the mutation, the quality and the structure it does not offer", async () => {
		const { t, change, result, state } = await driveChange(greetingProject(), {
			"src/greeting.txt": GREETING,
			"src/farewell.txt": "Goodbye\n",
		});
		const protocol = await t.harness.artifacts.latest<Protocol>(state, "protocol");
		const qualification = protocol?.content.qualifications["fict-tests"];
		assert.deepEqual(
			qualification && {
				qualified: qualification.qualified,
				positive: qualification.positive,
				negative: qualification.negative,
			},
			{ qualified: true, positive: "PASS", negative: "FAIL" },
			`${state.stop_reason ?? ""}: ${state.stop_detail ?? ""} | ${result.steps.join(" | ")}`,
		);
		const candidate = t.ledger
			.listEvidence(change.change_id)
			.filter((e) => e.subject.kind === "candidate" && e.control_id === "fict-tests");
		assert.deepEqual(
			candidate.map((e) => [e.verdict, e.control_version]),
			[["PASS", "1+fict-lines@1.0.0"]],
		);
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(result.view.change!.outcome, "accepted");
		const notes = protocol?.content.capability_diagnosis.notes ?? [];
		assert.deepEqual(
			notes.filter((note) => note.includes(" on this target: ")).sort(),
			[
				"the coverage of the introduced lines is not measured on this target",
				"the mutation of the introduced lines is not measured on this target",
				"the quality of the code is not measured on this target",
				"no dependency direction between modules is checked on this target",
			]
				.map((blindSpot) => `${blindSpot}: the fict technology does not offer it`)
				.sort(),
			notes.join(" | "),
		);
	});

	it("un changement sur la technologie fictive, qui déclare fict-out/, dont l'agent écrit src/farewell.txt et fict-out/run.log, est accepté ; le manifeste de son candidat porte src/farewell.txt et aucune entrée sous fict-out/, et les exclusions de sa référence contiennent fict-out/ et .pi/", async () => {
		const { t, result, state } = await driveChange(greetingProject(), {
			"src/farewell.txt": "Goodbye\n",
			"fict-out/run.log": "ran\n",
		});
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(result.view.change!.outcome, "accepted");
		const candidate = (await t.harness.artifacts.latest<CandidateManifest>(state, "candidate"))!.content;
		const paths = candidate.entries.map((entry) => entry.path);
		assert.ok(paths.includes("src/farewell.txt"), paths.join(", "));
		assert.deepEqual(
			paths.filter((path) => path.startsWith("fict-out/")),
			[],
		);
		const reference = (await t.harness.artifacts.latest<ReferenceSnapshot>(state, "reference"))!.content;
		assert.ok(
			reference.exclusions.includes("fict-out/") && reference.exclusions.includes(".pi/"),
			reference.exclusions.join(", "),
		);
	});

	it("un changement sur la technologie fictive, qui déclare fict_modules, dont l'agent ajoute fict_modules/shadow.txt, n'est pas accepté, et G4 nomme fict_modules/shadow.txt parmi les chemins protégés modifiés", async () => {
		const { t, change, result } = await driveChange(greetingProject(), {
			"src/farewell.txt": "Goodbye\n",
			"fict_modules/shadow.txt": "shadow\n",
		});
		assert.notEqual(result.view.change!.outcome, "accepted", result.steps.join(" | "));
		const g4 = t.ledger
			.readChangeEvents(change.change_id)
			.flatMap((e) => (e.event.type === "gate.decided" && e.event.decision.gate === "G4" ? [e.event.decision] : []));
		assert.ok(
			g4.some(
				(decision) =>
					decision.verdict === "FAIL" &&
					decision.reasons.includes("protected path altered by the producer: fict_modules/shadow.txt"),
			),
			JSON.stringify(g4),
		);
	});

	it("given the fictitious technology, which declares FICT_HOME, then its frozen control and the producer that writes read FICT_HOME, and neither reads JAVA_HOME", async () => {
		const { t, state } = await driveChange(greetingProject(), { "src/farewell.txt": "Goodbye\n" });
		const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
		const control = protocol.controls.find((c) => c.control_id === "fict-tests")!;
		const producer = t.agent.started.find((m) => m.role === "implement")!;
		for (const allowlist of [control.env_allowlist, producer.profile.env_allowlist]) {
			assert.ok(allowlist.includes("FICT_HOME"), allowlist.join(", "));
			assert.ok(!allowlist.includes("JAVA_HOME"), allowlist.join(", "));
		}
	});

	it("sur un projet qui porte cases/greeting.case, avec une technologie fictive dont les fichiers de test sont les *.case de cases/, le diagnostic de capacité du protocole gelé a test_files à 1", async () => {
		const project = greetingProject({ "cases/README.txt": "one case per line\n" });
		const { t, state } = await driveChange(project, { "src/farewell.txt": "Goodbye\n" });
		const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
		assert.equal(protocol.capability_diagnosis.test_files, 1, protocol.capability_diagnosis.notes.join(" | "));
	});

	it("given a reference written before it recorded where dependencies are installed, then the change reads it with node_modules and fict_modules, which the technologies of the list declare", async () => {
		const t = makeHarness({ stacks: [MAVEN_PLUGIN, NODE_PLUGIN, FICT_PLUGIN] });
		const { change } = await t.harness.start({
			project_path: greetingProject(),
			request_text: "Add a farewell next to the greeting",
			actor: HUMAN,
		});
		const recorded = (await t.harness.artifacts.latest<ReferenceSnapshot>(change, "reference"))!.content;
		assert.deepEqual(recorded.installed_dependencies, ["node_modules", "fict_modules"]);
		const { installed_dependencies: _recorded, ...written } = recorded;
		const writtenRef = await t.harness.artifacts.store("reference", change.change_id, "ref_written", written, "kernel");
		const { reference: _adopted, ...adopted } = change.adopted;
		const reread = await t.harness.artifacts.reference({
			...change,
			adopted,
			proposals: { ...change.proposals, reference: [writtenRef] },
		});
		assert.equal(reread.reference_id, written.reference_id);
		assert.deepEqual(reread.installed_dependencies, ["node_modules", "fict_modules"]);
	});
});
