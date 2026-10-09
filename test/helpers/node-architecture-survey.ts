/**
 * A survey of the architecture of an npm package under TypeScript 7.0.2: the model answers the question with
 * one requirement about the architecture, then proposes the maps a test gives it. The suite of the package
 * runs for real under `node --test`; npm and its registry are fakes, and so are dependency-cruiser and Knip, whose
 * outputs the real readers read.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, join, posix } from "node:path";
import { dependencyCruiserRules } from "../../src/adapters/stacks/node/structure/dependency-cruiser-rules.ts";
import { knipConfiguration } from "../../src/adapters/stacks/node/structure/knip-configuration.ts";
import { emptyTrigger } from "../../src/application/stacks/stack.ts";
import type { ArchitectureHint, ArchitectureMap, ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type {
	ControlExecutionPort,
	ExecutableRequest,
	ProcessObservation,
	SandboxPort,
	SandboxProfile,
} from "../../src/ports/execution.ts";
import { HUMAN } from "./change-fixture.ts";
import { ARCHITECTURE_QUESTION, ArchitectureMapAgent } from "./architecture-survey.ts";
import { writeFiles } from "./fixtures.ts";
import { makeHarness, type TestHarness, trackedProject } from "./harness-fixture.ts";

/** What the manifest of the surveyed package declares: TypeScript 7.0.2 as its one development dependency. */
const DECLARED = { devDependencies: { typescript: "7.0.2" } };

/** A lock of the packages the manifest declares, as npm writes it. */
const LOCK = {
	name: "users",
	version: "1.0.0",
	lockfileVersion: 3,
	packages: {
		"": { name: "users", version: "1.0.0", ...DECLARED },
		"node_modules/typescript": { version: "7.0.2", integrity: "sha512-fake-typescript", dev: true },
	},
};

/** The sources of the package of the story: a model, services and a port in `src/domain`, an adapter in `src/adapters/db`, and `src/legacy`. */
export const NODE_DOMAIN_SOURCES: Record<string, string> = {
	"src/domain/model/user.ts": "export interface User {\n  readonly id: string;\n}\n",
	"src/domain/service/user-service.ts":
		'import type { User } from "../model/user.ts";\n\nexport function rename(user: User): User {\n  return user;\n}\n',
	"src/domain/port/user-repository.ts":
		'import type { User } from "../model/user.ts";\n\nexport interface UserRepository {\n  find(id: string): User | undefined;\n}\n',
	"src/adapters/db/sql-user-repository.ts":
		'import type { UserRepository } from "../../domain/port/user-repository.ts";\n\nexport const repository: UserRepository = { find: () => undefined };\n',
	"src/legacy/old-users.js": "module.exports = { all: () => [] };\n",
};

/** What a package carries besides its sources: a passing test, a helper of its tests and an installed package, none of them a source. */
const NOT_SOURCES: Record<string, string> = {
	"test/user.test.js": 'import { test } from "node:test";\n\ntest("a user", () => {});\n',
	"test/helpers/users.js": "export const someone = { id: 'u1' };\n",
	"node_modules/left-pad/index.js": "module.exports = (s) => s;\n",
	"node_modules/left-pad/package.json": '{ "name": "left-pad", "version": "1.3.0" }\n',
};

/** An npm package under TypeScript 7.0.2, tracked by Git and locked by npm, carrying `sources`. */
export function nodePackage(sources: Record<string, string>): string {
	return trackedProject((root) =>
		writeFiles(root, {
			"package.json": `${JSON.stringify({ name: "users", version: "1.0.0", type: "module", scripts: { test: "node --test" }, ...DECLARED }, null, 2)}\n`,
			"package-lock.json": `${JSON.stringify(LOCK, null, 2)}\n`,
			"tsconfig.json": `${JSON.stringify({ compilerOptions: { module: "nodenext", strict: true, noEmit: true } }, null, 2)}\n`,
			...NOT_SOURCES,
			...sources,
		}),
	);
}

const hint = (path: string, line: number, says: string): ArchitectureHint => ({ path, line, says });

/** The map a model proposes of the package of the story, which leaves `src/legacy` to no part. */
export const NODE_DOMAIN_MAP: ArchitectureMap = {
	parts: [
		{
			name: "domain",
			perimeter: ["src/domain"],
			style: "onion",
			roles: [
				{
					package: "src/domain/model",
					role: "domain model",
					hints: [hint("src/domain/model/user.ts", 1, "an entity of the model")],
				},
				{
					package: "src/domain/service",
					role: "domain services",
					hints: [hint("src/domain/service/user-service.ts", 3, "a service of the model")],
				},
				{
					package: "src/domain/port",
					role: "domain services",
					hints: [hint("src/domain/port/user-repository.ts", 3, "an interface the adapters implement")],
				},
			],
			hints: [hint("package.json", 2, "the package")],
		},
		{
			name: "adapters",
			perimeter: ["src/adapters"],
			style: "onion",
			roles: [
				{
					package: "src/adapters/db",
					role: "adapter persistence",
					hints: [hint("src/adapters/db/sql-user-repository.ts", 3, "implements a port")],
				},
			],
			hints: [hint("src/adapters/db/sql-user-repository.ts", 1, "imports the port of the domain")],
		},
	],
	relations: [
		{
			from: "adapters",
			to: "domain",
			hints: [hint("src/adapters/db/sql-user-repository.ts", 1, "the adapter imports the domain")],
		},
	],
};

/** What npm says when the registry cannot be reached. */
const UNREACHABLE_REGISTRY =
	"npm error code ENOTFOUND\nnpm error network request to the registry failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org";

function observation(exit_code: number, stdout = "", stderr = ""): ProcessObservation {
	return {
		exit_code,
		signal: null,
		timed_out: false,
		spawn_error: null,
		stdout: new TextEncoder().encode(stdout),
		stderr: new TextEncoder().encode(stderr),
		stdout_truncated: false,
		stderr_truncated: false,
		started_at: "2026-10-08T00:00:00.000Z",
		ended_at: "2026-10-08T00:00:01.000Z",
		duration_ms: 1000,
	};
}

/**
 * Stands for npm and its registry: it answers what npm answers about its cache, and leaves in the copy what an
 * install of the packages it is asked for leaves there, each at the version asked, or fails like a registry that
 * cannot be reached. Every other command runs on the sandbox it wraps. Each command is recorded with the network
 * its profile granted.
 */
class FakeCruiserNpm implements SandboxPort {
	readonly backend: string;
	readonly runs: { command: string[]; network: SandboxProfile["network"] }[] = [];
	private readonly inner: SandboxPort;
	private readonly reachable: boolean;
	constructor(inner: SandboxPort, reachable: boolean) {
		this.inner = inner;
		this.backend = inner.backend;
		this.reachable = reachable;
	}
	qualify(profile: SandboxProfile): ReturnType<SandboxPort["qualify"]> {
		return this.inner.qualify(profile);
	}
	installs(): { command: string[]; network: SandboxProfile["network"] }[] {
		return this.runs.filter((r) => r.command[0] === "npm" && r.command[1] === "install");
	}
	async run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		this.runs.push({ command: request.command, network: profile.network });
		if (request.command[0] !== "npm") return this.inner.run(profile, request, signal);
		if (request.command[1] === "config") return observation(0, "/machine/npm-cache\n");
		if (!this.reachable) return observation(1, "", UNREACHABLE_REGISTRY);
		const write = (path: string, text: string) => {
			mkdirSync(dirname(join(request.cwd, path)), { recursive: true });
			writeFileSync(join(request.cwd, path), text);
		};
		const read = (path: string) => JSON.parse(readFileSync(join(request.cwd, path), "utf8"));
		const manifest = read("package.json");
		const lock = read("package-lock.json");
		for (const asked of request.command.slice(2).filter((arg) => !arg.startsWith("--"))) {
			const at = asked.lastIndexOf("@");
			const [name, version] = [asked.slice(0, at), asked.slice(at + 1)];
			manifest.devDependencies = { ...manifest.devDependencies, [name]: version };
			lock.packages = {
				...lock.packages,
				[`node_modules/${name}`]: { version, integrity: `sha512-fake-${name}`, dev: true },
			};
			write(`node_modules/${name}/package.json`, `${JSON.stringify({ name, version })}\n`);
		}
		write("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
		write("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
		write("node_modules/.package-lock.json", `${JSON.stringify(lock)}\n`);
		return observation(0);
	}
}

/** The files of the tree under `root`, by their path relative to it, `.git` aside. */
function filesOf(root: string, relative = ""): string[] {
	return readdirSync(join(root, relative), { withFileTypes: true }).flatMap((entry) => {
		const path = relative ? `${relative}/${entry.name}` : entry.name;
		if (entry.name === ".git") return [];
		return entry.isDirectory() ? filesOf(root, path) : [path];
	});
}

/** The path each source of `sources` imports, as it writes it, with the source it resolves to among them. */
function importsOf(root: string, source: string, sources: readonly string[]) {
	const text = readFileSync(join(root, source), "utf8");
	return [...text.matchAll(/(?:\bfrom|\bimport|\brequire\s*\()\s*\(?\s*["'`]([^"'`]+)["'`]/g)].flatMap(
		([, written]) => {
			const resolved = written!.startsWith(".") ? posix.join(posix.dirname(source), written!) : null;
			return resolved !== null && sources.includes(resolved) ? [{ written: written!, resolved }] : [];
		},
	);
}

/**
 * The JSON dependency-cruiser writes when it applies the rules 495 writes from the map of `control` to the tree
 * at `root`: the sources it reads, each import that breaks a rule that forbids it, and each source a rule
 * requires to be in a part. Cycles are not looked for.
 */
function cruised(root: string, control: ControlDefinition): string {
	const rules = JSON.parse(dependencyCruiserRules(control.architecture_map!)) as {
		forbidden: { name: string; from: { path: string }; to: { path?: string } }[];
		required: { name: string; module: { path: string; pathNot: string[] } }[];
		options: { exclude: { path: string } };
	};
	const excluded = new RegExp(rules.options.exclude.path);
	const sources = filesOf(root).filter((path) => /\.[cm]?[jt]sx?$/.test(path) && !excluded.test(path));
	const rule = (name: string) => ({ severity: "error", name });
	const violations = [
		...sources.flatMap((from) =>
			importsOf(root, from, sources).flatMap(({ written, resolved }) =>
				rules.forbidden
					.filter((r) => r.to.path !== undefined)
					.filter((r) => new RegExp(r.from.path).test(from) && new RegExp(r.to.path!).test(resolved))
					.map((r) => ({ type: "dependency", from, to: resolved, unresolvedTo: written, rule: rule(r.name) })),
			),
		),
		...sources.flatMap((from) =>
			rules.required
				.filter(
					(r) => new RegExp(r.module.path).test(from) && !r.module.pathNot.some((not) => new RegExp(not).test(from)),
				)
				.map((r) => ({ type: "module", from, to: from, rule: rule(r.name) })),
		),
	];
	return JSON.stringify({
		modules: sources.map((source) => ({ source, dependencies: [], dependents: [], valid: true })),
		summary: { violations, error: violations.length, warn: 0, info: 0, ignore: 0, totalCruised: sources.length },
	});
}

/** The package a bare specifier names: its scope and name, without the path inside it. */
const packageOf = (specifier: string) =>
	specifier
		.split("/")
		.slice(0, specifier.startsWith("@") ? 2 : 1)
		.join("/");

/**
 * The JSON Knip writes on its standard output when it compares, under the configuration 495 writes, the
 * dependencies `package.json` of the tree at `root` declares to the packages its sources import: each import of a
 * package it does not declare, at its line, and each declared package no source imports, at its line of
 * `package.json`, the packages the configuration ignores aside. A `tsconfig.json` uses `typescript`, as the
 * plugin of Knip for TypeScript says.
 */
function knipOutput(root: string): string {
	const { ignoreDependencies } = JSON.parse(knipConfiguration()) as { ignoreDependencies: string[] };
	const manifestText = readFileSync(join(root, "package.json"), "utf8");
	const manifest = JSON.parse(manifestText) as Record<string, Record<string, string> | undefined>;
	const declared = new Set(
		["dependencies", "devDependencies", "peerDependencies"].flatMap((s) => Object.keys(manifest[s] ?? {})),
	);
	const sources = filesOf(root).filter(
		(path) => /\.[cm]?[jt]sx?$/.test(path) && !/^(node_modules|target)\//.test(path),
	);
	const used = new Set(existsSync(join(root, "tsconfig.json")) ? ["typescript"] : []);
	const rows = sources.flatMap((file) => {
		const unlisted = readFileSync(join(root, file), "utf8")
			.split("\n")
			.flatMap((text, index) =>
				[...text.matchAll(/(?:\bfrom|\bimport|\brequire\s*\()\s*\(?\s*["'`]([^"'`.][^"'`]*)["'`]/g)].map(
					([, specifier]) => ({ name: packageOf(specifier!), line: index + 1 }),
				),
			)
			.filter(({ name }) => !isBuiltin(name))
			.filter(({ name }) => {
				used.add(name);
				return !declared.has(name) && !ignoreDependencies.includes(name);
			});
		return unlisted.length > 0 ? [{ file, dependencies: [], devDependencies: [], unlisted }] : [];
	});
	const lineOfDeclaration = (name: string) =>
		manifestText.split("\n").findIndex((text) => text.includes(`"${name}":`)) + 1;
	const unused = (section: string) =>
		Object.keys(manifest[section] ?? {})
			.filter((name) => !used.has(name) && !ignoreDependencies.includes(name))
			.map((name) => ({ name, line: lineOfDeclaration(name) }));
	const manifestRow = {
		file: "package.json",
		dependencies: unused("dependencies"),
		devDependencies: unused("devDependencies"),
		unlisted: [],
	};
	const issues = [
		...(manifestRow.dependencies.length + manifestRow.devDependencies.length > 0 ? [manifestRow] : []),
		...rows,
	];
	return `${JSON.stringify({ issues })}\n`;
}

/**
 * Stands for a dependency-cruiser and a Knip that the machine running the suite need not have installed: each
 * leaves the output it would write from the tree, which the real reader then reads. Every other control, and the
 * broken command of an incident witness, runs for real.
 */
class FakeCruiserControls implements ControlExecutionPort {
	private readonly real: ControlExecutionPort;
	get readers(): ControlExecutionPort["readers"] {
		return this.real.readers;
	}
	constructor(real: ControlExecutionPort) {
		this.real = real;
	}
	async runControl(
		invocation: Parameters<ControlExecutionPort["runControl"]>[0],
		signal?: AbortSignal,
	): ReturnType<ControlExecutionPort["runControl"]> {
		const { parser, report_path, command } = invocation.control;
		if (parser === "knip-json" && !command.some((part) => part.includes("495-broken-runner"))) {
			const output = knipOutput(invocation.workspace_path);
			const printed = {
				...invocation.control,
				command: [process.execPath, "-e", `process.stdout.write(${JSON.stringify(output)})`],
			};
			return this.real.runControl({ ...invocation, control: printed }, signal);
		}
		if (
			parser !== "dependency-cruiser-json" ||
			report_path === null ||
			command.some((part) => part.includes("495-broken-runner"))
		)
			return this.real.runControl(invocation, signal);
		writeFiles(invocation.workspace_path, { [report_path]: cruised(invocation.workspace_path, invocation.control) });
		const control = { ...invocation.control, command: emptyTrigger(process.execPath) };
		return this.real.runControl({ ...invocation, control }, signal);
	}
}

/**
 * A survey of the architecture of `project`, conducted until it stops, the model proposing `maps` in turn, with
 * a registry that `reachable` says can be reached. The fake npm is returned with what it ran.
 */
export async function nodeSurveyedArchitecture(
	project: string,
	maps: readonly unknown[],
	reachable = true,
): Promise<{
	t: TestHarness;
	agent: ArchitectureMapAgent;
	npm: FakeCruiserNpm;
	changeId: string;
	stopped_because: string;
	steps: string[];
}> {
	const agent = new ArchitectureMapAgent(maps);
	let npm: FakeCruiserNpm | undefined;
	const t = makeHarness({
		agent,
		backend: (real) => {
			npm = new FakeCruiserNpm(real, reachable);
			return npm;
		},
		controls: (real) => new FakeCruiserControls(real),
	});
	const { change } = await t.harness.start({
		project_path: project,
		request_text: ARCHITECTURE_QUESTION,
		actor: HUMAN,
		deliverable: "state",
	});
	const first = await t.harness.advance(change.change_id, { max_steps: 40 });
	return {
		t,
		agent,
		npm: npm!,
		changeId: change.change_id,
		stopped_because: first.stopped_because,
		steps: first.steps,
	};
}
