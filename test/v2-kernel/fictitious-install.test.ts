/**
 * A survey of the quality of a project of a technology 495 does not carry, whose quality referential
 * `fict-style 1.0.0` is brought by its own package manager `fictpm`: the owner is asked to adopt it with
 * the phrases the technology declares, and the files `fictpm` writes under `fict_modules/fict-style/` are
 * adopted only when the inspection the technology declares accepts them. `fictpm` and its store are fakes.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import type { ControlDefinition, PackageInstall, Protocol, QualityRule } from "../../src/contracts/v1/protocol.ts";
import type { StackPlugin } from "../../src/application/stacks/plugin.ts";
import type { Clock } from "../../src/application/ids.ts";
import { BASE_ENV } from "../../src/application/stacks/stack.ts";
import { MAVEN_PLUGIN } from "../../src/adapters/stacks/maven/maven.ts";
import { NODE_PLUGIN } from "../../src/adapters/stacks/node/node.ts";
import type { ExecutableRequest, ProcessObservation, SandboxPort, SandboxProfile } from "../../src/ports/execution.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { FICT_PLUGIN, greetingProject, linesReader } from "../helpers/fictitious-technology.ts";
import { makeHarness, type TestHarness } from "../helpers/harness-fixture.ts";
import { answer, latestSurvey, QUALITY_QUESTION, QUALITY_SPEC, treeDigest } from "../helpers/quality-survey.ts";

const STYLE = "fict-style";
const STYLE_VERSION = "1.0.0";
const STYLE_DIRECTORY = `fict_modules/${STYLE}`;
/** Where `fictpm` says it writes outside the copy. */
const FICT_STORE = "/machine/fict-store";

/**
 * The checker `fictpm` installs: one line per file under `src/`, `FAIL <path>: carries a TODO` when the
 * file holds `TODO`, `PASS <path>` otherwise, written to `fict-out/style.txt`.
 */
const STYLE_CHECKER = `
const fs = require("node:fs");
const lines = [];
const walk = (dir) => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const path = dir + "/" + entry.name;
		if (entry.isDirectory()) walk(path);
		else lines.push(fs.readFileSync(path, "utf8").includes("TODO") ? "FAIL " + path + ": carries a TODO" : "PASS " + path);
	}
};
walk("src");
fs.mkdirSync("fict-out", { recursive: true });
fs.writeFileSync("fict-out/style.txt", lines.join("\\n") + "\\n");
process.exitCode = lines.some((line) => line.startsWith("FAIL")) ? 1 : 0;
`;

const STYLE_RULE: QualityRule = {
	rule_id: "todo",
	nature: "dead_code",
	control_id: STYLE,
	reference: null,
	threshold: "any occurrence",
	properties: {},
	tool: `${STYLE} ${STYLE_VERSION}`,
	source: "fict.example/style/todo",
	established_on: "2026-10-03",
};

const STYLE_INSTALL: PackageInstall = { package: STYLE, version: STYLE_VERSION, manager: "fictpm" };

function styleControl(requirementRefs: ControlDefinition["requirement_refs"], nodeBinary: string): ControlDefinition {
	return {
		control_id: STYLE,
		version: "1",
		title: "files under src/ that carry a TODO",
		command: [nodeBinary, `${STYLE_DIRECTORY}/style.cjs`],
		cwd: ".",
		env_allowlist: ["PATH"],
		env: {},
		timeout_ms: 30_000,
		parser: "fict-style-lines",
		report_path: "fict-out/style.txt",
		structure_rules: [],
		provides: [],
		requires: [],
		scope_argument: null,
		network: "denied",
		writable_paths: ["fict-out"],
		requirement_refs: requirementRefs,
		protected: true,
		protected_paths: ["fict_modules/"],
	};
}

/** What the fictitious technology tells the owner `fictpm` does, in French and in English. */
const FICT_PHRASES = {
	fr: {
		complementLabel: (names: string) => `range ${names} sous fict_modules/`,
		complementDoes: (names: string) => `range ${names} sous fict_modules/ d'une copie du projet avec fictpm`,
		runsNothing: "sans exécuter aucun crochet de fictpm",
		complementInspected: "la copie n'est acceptée que si fictpm n'y a ajouté que des fichiers sous fict_modules/",
		referentialLabel: (names: string) => `range ${names} sous fict_modules/ d'une copie`,
		referentialDoes: (names: string) => `range ${names} sous fict_modules/ d'une copie du projet avec fictpm`,
		referentialInspected: "la copie n'est acceptée que si fictpm n'y a ajouté que des fichiers sous fict_modules/",
	},
	en: {
		complementLabel: (names: string) => `files ${names} under fict_modules/`,
		complementDoes: (names: string) => `files ${names} under fict_modules/ of a copy of the project with fictpm`,
		runsNothing: "running no hook of fictpm",
		complementInspected: "the copy is accepted only if fictpm added files under fict_modules/ and nothing else",
		referentialLabel: (names: string) => `files ${names} under fict_modules/ of a copy`,
		referentialDoes: (names: string) => `files ${names} under fict_modules/ of a copy of the project with fictpm`,
		referentialInspected: "the copy is accepted only if fictpm added files under fict_modules/ and nothing else",
	},
};

type Files = Readonly<Record<string, string>>;

/**
 * The fictitious technology with a quality capability, which offers the `fict-style` control once `fictpm`
 * installed it and proposes it otherwise, and an install capability: `fictpm add` installs in the copy, says
 * through `fictpm where` the store it writes outside it, reads `FICTPM_TOKEN`, and its inspection accepts
 * files added under `fict_modules/` and nothing else.
 */
const FICT_WITH_STYLE: StackPlugin<true> = {
	...FICT_PLUGIN,
	readers: [...FICT_PLUGIN.readers, linesReader("fict-style-lines", "style")],
	capabilities: {
		...FICT_PLUGIN.capabilities,
		quality: {
			offer: ({ requirement_refs, node_binary, referential_packages }) =>
				referential_packages.some((p) => p.name === STYLE)
					? {
							kind: "available",
							controls: [styleControl(requirement_refs, node_binary)],
							own_negative_witness: { [STYLE]: { "src/495-style-witness.txt": "TODO\n" } },
						}
					: { kind: "missing", reason: `${STYLE} is not installed in this copy` },
			referential: ({ referential_packages }) =>
				referential_packages.some((p) => p.name === STYLE)
					? undefined
					: {
							kind: "proposed",
							rules: [STYLE_RULE],
							perimeter: { measured: [{ module: ".", root: "src" }], generated_annotations: [], unmeasured: [] },
							recommendations: [
								{
									test_type: "quality",
									tool: STYLE,
									version: STYLE_VERSION,
									established_on: "2026-10-03",
									source: "fict.example/style",
									change: `install ${STYLE}@${STYLE_VERSION} with fictpm`,
									install: STYLE_INSTALL,
								},
							],
						},
		},
		install: {
			manager: "fictpm",
			title: "fictpm",
			form: "install",
			plan: (_files: readonly string[], installs: readonly PackageInstall[]) => ({
				kind: "command" as const,
				command: ["fictpm", "add", ...installs.map((i) => `${i.package}@${i.version}`)],
			}),
			inspect: (before: { files: Files }, after: { files: Files }, installs: readonly PackageInstall[]) => {
				const paths = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort();
				const changed = paths.filter((path) => before.files[path] !== after.files[path]);
				const outside = changed.find((path) => path in before.files || !path.startsWith("fict_modules/"));
				if (outside !== undefined)
					return {
						kind: "refused" as const,
						reason: `fictpm touched ${outside}, and only files it adds under fict_modules/ are accepted`,
					};
				return {
					kind: "accepted" as const,
					files: changed,
					packages: installs.map((i) => ({
						name: i.package,
						version: i.version,
						integrity: after.files[`fict_modules/${i.package}/fict.json`] ?? "none",
					})),
				};
			},
			outside_write: {
				command: ["fictpm", "where"],
				read: (stdout: string) => stdout.trim() || null,
				unsaid: "fictpm did not say its store",
			},
			env: { names: ["FICTPM_TOKEN"] },
			failure_output: "stderr",
			phrases: FICT_PHRASES,
		},
	},
};

function observation(exit_code: number, stdout = ""): ProcessObservation {
	return {
		exit_code,
		signal: null,
		timed_out: false,
		spawn_error: null,
		stdout: new TextEncoder().encode(stdout),
		stderr: new Uint8Array(),
		stdout_truncated: false,
		stderr_truncated: false,
		started_at: "2026-10-03T00:00:00.000Z",
		ended_at: "2026-10-03T00:00:01.000Z",
		duration_ms: 1000,
	};
}

/** A run of `fictpm` as the sandbox was asked for it. */
interface FictpmRun {
	command: string[];
	cwd: string;
	network: SandboxProfile["network"];
	write_paths: string[];
	env_allowlist: string[];
}

/**
 * Stands for `fictpm` and its store: `fictpm where` names the store, and `fictpm add` writes the checker
 * and its manifest under `fict_modules/<package>/`, and rewrites `src/greeting.txt` too when told to. Every
 * other command runs on the sandbox it wraps.
 */
class FakeFictpm implements SandboxPort {
	readonly backend: string;
	readonly runs: FictpmRun[] = [];
	private readonly inner: SandboxPort;
	private readonly rewritesGreeting: boolean;
	constructor(inner: SandboxPort, rewritesGreeting: boolean) {
		this.inner = inner;
		this.backend = inner.backend;
		this.rewritesGreeting = rewritesGreeting;
	}
	qualify(profile: SandboxProfile): ReturnType<SandboxPort["qualify"]> {
		return this.inner.qualify(profile);
	}
	async run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		if (request.command[0] !== "fictpm") return this.inner.run(profile, request, signal);
		this.runs.push({
			command: request.command,
			cwd: request.cwd,
			network: profile.network,
			write_paths: profile.write_paths,
			env_allowlist: profile.env_allowlist,
		});
		if (request.command[1] === "where") return observation(0, `${FICT_STORE}\n`);
		const write = (path: string, text: string) => {
			mkdirSync(dirname(join(request.cwd, path)), { recursive: true });
			writeFileSync(join(request.cwd, path), text);
		};
		for (const spec of request.command.slice(2)) {
			const [name = "", version = ""] = spec.split("@");
			write(`fict_modules/${name}/style.cjs`, STYLE_CHECKER);
			write(`fict_modules/${name}/fict.json`, `${JSON.stringify({ name, version })}\n`);
		}
		if (this.rewritesGreeting) write("src/greeting.txt", "Hello, rewritten\n");
		return observation(0);
	}
}

/**
 * A survey of the quality of `project` under the list of 495 followed by the fictitious technology,
 * conducted until it stops, at the time `clock` reads when given.
 */
async function surveyed(project: string, options: { rewritesGreeting?: boolean; clock?: Clock } = {}) {
	let fictpm: FakeFictpm | undefined;
	const t = makeHarness({
		stacks: [MAVEN_PLUGIN, NODE_PLUGIN, FICT_WITH_STYLE],
		...(options.clock ? { clock: options.clock } : {}),
		defaultScript: { steps: [{ kind: "complete", output: QUALITY_SPEC }] },
		backend: (real) => {
			fictpm = new FakeFictpm(real, options.rewritesGreeting ?? false);
			return fictpm;
		},
	});
	const { change } = await t.harness.start({
		project_path: project,
		request_text: QUALITY_QUESTION,
		actor: HUMAN,
		deliverable: "state",
	});
	const first = await t.harness.advance(change.change_id, { max_steps: 40 });
	return { t, fictpm: fictpm!, changeId: change.change_id, first };
}

/** The question that proposes the referential, if one is pending. */
function referentialQuestion(t: TestHarness, changeId: string) {
	return t.harness
		.pendingDecisions(changeId)
		.find((d) => d.interaction === "IH-04" && d.options.some((o) => o.id === "adopt_referential"));
}

/** What the pending decisions and the survey say, for a failed assertion to show. */
async function whereItStands(t: TestHarness, changeId: string): Promise<string> {
	const pending = t.harness.pendingDecisions(changeId).map((d) => d.interaction);
	const state = t.ledger.loadChange(changeId)!.state;
	const survey = await t.harness.artifacts.latest<{ requirements: { blind_spot?: string }[] }>(state, "survey");
	return `pending: ${pending.join(", ") || "none"}; blind spots: ${(survey?.content.requirements ?? []).map((r) => r.blind_spot).join(" | ")}`;
}

async function frozenProtocol(t: TestHarness, changeId: string): Promise<Protocol> {
	const state = t.ledger.loadChange(changeId)!.state;
	assert.equal(state.gates.G2?.verdict, "PASS", state.gates.G2?.reasons.join("; ") ?? state.stop_detail ?? "");
	return (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
}

describe("a complement brought by the package manager of a technology 495 does not carry", () => {
	it("un état des lieux d'un projet fictif, dont la technologie apporte fict-style 1.0.0 par fictpm, reçoit une décision IH-04 dont l'issue d'adoption porte la phrase de la technologie fictive ; adoptée, le protocole gelé porte le référentiel daté de la décision et le contrôle fict-style, les compléments adoptés sont les fichiers de fict_modules/fict-style/, et le digest du projet n'a pas changé", async () => {
		const project = greetingProject();
		const before = treeDigest(project);
		// The owner answers just before midnight, and the protocol is frozen the next day.
		let at = Date.parse("2026-10-05T23:59:00.000Z");
		const clock = {
			now: () => {
				at += 1;
				return new Date(at).toISOString();
			},
		};
		const { t, changeId } = await surveyed(project, { clock });
		const asked = referentialQuestion(t, changeId);
		assert.ok(asked, `an IH-04 decision proposes to adopt the referential: ${await whereItStands(t, changeId)}`);
		const adopt = asked.options.find((o) => o.id === "adopt_referential")!;
		const said = `${adopt.label} ${adopt.effect}`;
		assert.ok(
			said.includes(FICT_PHRASES.fr.referentialDoes(`${STYLE} ${STYLE_VERSION}`)),
			`the phrase the fictitious technology declares: ${said}`,
		);
		assert.match(said, /réseau ouvert pour cette seule étape/);
		assert.match(said, /rien n'est écrit dans le projet/);

		answer(t, changeId, "adopt_referential");
		at = Date.parse("2026-10-06T00:00:01.000Z");
		const after = await t.harness.advance(changeId, { max_steps: 40 });
		assert.equal(after.stopped_because, "decision_required", after.steps.join(" | "));
		const protocol = await frozenProtocol(t, changeId);
		const adoption = t.ledger
			.loadChange(changeId)!
			.state.human_decisions.find((d) => d.option_id === "adopt_referential");
		assert.ok(adoption, "the adoption is recorded");
		assert.equal(adoption.recorded_at.slice(0, 10), "2026-10-05");
		assert.equal(
			protocol.quality_referential?.adopted_on,
			"2026-10-05",
			"the referential, with the date of the decision",
		);
		assert.deepEqual(
			protocol.quality_referential?.rules.map((r) => r.rule_id),
			["todo"],
		);
		assert.ok(
			protocol.controls.some((c) => c.control_id === STYLE),
			protocol.controls.map((c) => c.control_id).join(", "),
		);
		assert.deepEqual(
			(protocol.complements ?? []).map((c) => c.path).sort(),
			[`${STYLE_DIRECTORY}/fict.json`, `${STYLE_DIRECTORY}/style.cjs`],
			"the files fictpm wrote under fict_modules/fict-style/",
		);
		assert.equal(treeDigest(project), before, "the project keeps its digest");
	});
	it("quand fictpm réécrit aussi src/greeting.txt, l'adoption du référentiel fictif n'adopte rien : le protocole gelé ne porte ni référentiel ni contrôle fict-style, et l'angle mort de l'exigence porte la raison de l'inspection fictive, qui nomme src/greeting.txt", async () => {
		const { t, changeId } = await surveyed(greetingProject(), { rewritesGreeting: true });
		if (referentialQuestion(t, changeId) !== undefined) {
			answer(t, changeId, "adopt_referential");
			await t.harness.advance(changeId, { max_steps: 40 });
		}
		const protocol = await frozenProtocol(t, changeId);
		assert.equal(protocol.quality_referential, undefined, "nothing is adopted");
		assert.ok(!protocol.controls.some((c) => c.control_id === STYLE), "no fict-style control is declared");
		const survey = await latestSurvey(t, changeId);
		const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
		assert.match(
			quality?.blind_spot ?? "",
			/fictpm touched src\/greeting\.txt, and only files it adds under fict_modules\/ are accepted/,
			"the blind spot carries the reason the fictitious inspection gave",
		);
	});
	it("à l'adoption du référentiel fictif, la requête de fictpm tourne réseau fermé et sans chemin inscriptible, puis l'installation tourne réseau ouvert avec pour seuls chemins inscriptibles la copie et le répertoire fict-store qu'a nommé la requête ; les deux reçoivent FICTPM_TOKEN et aucune de NPM_TOKEN ni JAVA_HOME", async () => {
		const { t, fictpm, changeId } = await surveyed(greetingProject());
		if (referentialQuestion(t, changeId) !== undefined) {
			answer(t, changeId, "adopt_referential");
			await t.harness.advance(changeId, { max_steps: 40 });
		}
		const ran = fictpm.runs.map((r) => r.command.join(" "));
		assert.deepEqual(
			ran,
			["fictpm where", `fictpm add ${STYLE}@${STYLE_VERSION}`],
			"the query runs before the install",
		);
		const [query, install] = fictpm.runs as [FictpmRun, FictpmRun];
		assert.equal(query.network, "denied", "the query runs with the network closed");
		assert.deepEqual(query.write_paths, [], "and no writable path");
		assert.equal(install.network, "allowed", "the install runs with the network open");
		assert.deepEqual(install.write_paths, [install.cwd, FICT_STORE], "writing the copy and the store the query named");
		for (const run of [query, install]) {
			assert.deepEqual(run.env_allowlist, [...BASE_ENV, "FICTPM_TOKEN"], run.command.join(" "));
			for (const name of ["NPM_TOKEN", "JAVA_HOME"]) assert.ok(!run.env_allowlist.includes(name), name);
		}
	});
});
