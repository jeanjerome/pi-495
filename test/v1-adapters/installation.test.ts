/**
 * Installing the complement a recommendation describes: the plan is decided from the files of the
 * reference alone, and what npm leaves behind is accepted only when it is what was asked for.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { detectStack } from "../../src/application/target.ts";
import { digestBytes } from "../../src/contracts/digest.ts";
import type { CandidateManifest, ManifestEntry } from "../../src/contracts/v1/candidate.ts";
import { protectedPathsChanged } from "../../src/domain/gates/g4.ts";
import { fixtureJava, fixtureTs, tempDir, removedAfterEach } from "../helpers/fixtures.ts";
import {
	inspectInstall,
	inspectResolution,
	planInstall,
	readLocalRepository,
	runInstall,
} from "../../src/application/installation.ts";
import type { InstallState } from "../../src/application/installation.ts";
import type { PackageInstall } from "../../src/contracts/v1/protocol.ts";
import type {
	ExecutableRequest,
	ProcessObservation,
	QualificationResult,
	SandboxPort,
	SandboxProfile,
} from "../../src/ports/execution.ts";

const INSTALL: PackageInstall = { package: "@vitest/coverage-v8", version: "3.2.4", manager: "npm" };
const BASE_FILES = ["package.json", "src/index.ts"];

const cleanups = removedAfterEach();

describe("planning the install of a recommended package", () => {
	it("given package-lock.json alone, then the plan is the npm command for the exact version, and given pnpm-lock.yaml, yarn.lock, bun.lock or no lock, then the plan is a refusal naming the file or its absence, and given a .npmrc, then the plan is still the npm command", () => {
		const plan = planInstall([...BASE_FILES, "package-lock.json"], [INSTALL]);
		assert.deepEqual(plan, {
			kind: "command",
			command: [
				"npm",
				"install",
				"--save-dev",
				"--save-exact",
				"--ignore-scripts",
				"--no-audit",
				"--no-fund",
				"@vitest/coverage-v8@3.2.4",
			],
		});
		assert.deepEqual(planInstall([...BASE_FILES, "package-lock.json", ".npmrc"], [INSTALL]), plan);
		for (const lock of ["pnpm-lock.yaml", "yarn.lock", "bun.lock"]) {
			const refused = planInstall([...BASE_FILES, lock], [INSTALL]);
			assert.equal(refused.kind, "refused", lock);
			assert.match(refused.kind === "refused" ? refused.reason : "", new RegExp(lock.replace(".", "\\.")), lock);
		}
		const noLock = planInstall(BASE_FILES, [INSTALL]);
		assert.equal(noLock.kind, "refused");
		assert.match(noLock.kind === "refused" ? noLock.reason : "", /no package-lock\.json/);
		assert.equal(planInstall([...BASE_FILES, "package-lock.json", "yarn.lock"], [INSTALL]).kind, "refused");
	});
});

const PROVIDER = "@vitest/coverage-v8";
const PACKAGE_JSON_BEFORE = JSON.stringify({ name: "target", devDependencies: { vitest: "3.2.4" } });
const PACKAGE_JSON_AFTER = JSON.stringify({
	name: "target",
	devDependencies: { vitest: "3.2.4", [PROVIDER]: "3.2.4" },
});
const LOCK_BEFORE = JSON.stringify({
	lockfileVersion: 3,
	packages: {
		"": { name: "target" },
		"node_modules/vitest": { version: "3.2.4", integrity: "sha512-vitest" },
	},
});
const LOCK_AFTER = JSON.stringify({
	lockfileVersion: 3,
	packages: {
		"": { name: "target" },
		"node_modules/vitest": { version: "3.2.4", integrity: "sha512-vitest" },
		"node_modules/@vitest/coverage-v8": { version: "3.2.4", integrity: "sha512-provider" },
		"node_modules/@vitest/coverage-v8/node_modules/istanbul-lib-report": {
			version: "3.0.1",
			integrity: "sha512-report",
		},
	},
});

const BEFORE: InstallState = {
	files: {
		"package.json": "sha256:pj0",
		"package-lock.json": "sha256:lock0",
		"src/index.ts": "sha256:src",
		"node_modules/vitest/package.json": "sha256:vitest",
	},
	package_json: PACKAGE_JSON_BEFORE,
	package_lock: LOCK_BEFORE,
};
/** What a clean install leaves: the two manifests rewritten and files added under node_modules/. */
const AFTER: InstallState = {
	files: {
		...BEFORE.files,
		"package.json": "sha256:pj1",
		"package-lock.json": "sha256:lock1",
		"node_modules/.package-lock.json": "sha256:hidden",
		"node_modules/@vitest/coverage-v8/package.json": "sha256:provider",
		"node_modules/@vitest/coverage-v8/node_modules/istanbul-lib-report/package.json": "sha256:report",
	},
	package_json: PACKAGE_JSON_AFTER,
	package_lock: LOCK_AFTER,
};

function refusalOf(result: ReturnType<typeof inspectInstall>): string {
	assert.equal(result.kind, "refused");
	return result.kind === "refused" ? result.reason : "";
}

describe("inspecting what an install left in the copy", () => {
	it("given an install that only added files, then the inspection returns the added packages, and given a modified existing node_modules file, a file outside package.json, package-lock.json and node_modules, or another entry in package.json, then it refuses naming the culprit", () => {
		const accepted = inspectInstall(BEFORE, AFTER, [INSTALL]);
		assert.deepEqual(accepted, {
			kind: "accepted",
			files: [
				"package.json",
				"package-lock.json",
				"node_modules/.package-lock.json",
				"node_modules/@vitest/coverage-v8/package.json",
				"node_modules/@vitest/coverage-v8/node_modules/istanbul-lib-report/package.json",
			],
			packages: [
				{ name: PROVIDER, version: "3.2.4", integrity: "sha512-provider" },
				{ name: "istanbul-lib-report", version: "3.0.1", integrity: "sha512-report" },
			],
		});

		const modified = { ...AFTER, files: { ...AFTER.files, "node_modules/vitest/package.json": "sha256:changed" } };
		assert.match(refusalOf(inspectInstall(BEFORE, modified, [INSTALL])), /node_modules\/vitest\/package\.json/);

		const removed = { ...AFTER, files: { ...AFTER.files } };
		delete (removed.files as Record<string, string>)["node_modules/vitest/package.json"];
		assert.match(refusalOf(inspectInstall(BEFORE, removed, [INSTALL])), /node_modules\/vitest\/package\.json/);

		for (const path of ["src/index.ts", "scripts/postinstall.sh"]) {
			const outside = { ...AFTER, files: { ...AFTER.files, [path]: "sha256:written" } };
			assert.match(refusalOf(inspectInstall(BEFORE, outside, [INSTALL])), new RegExp(path.replace(".", "\\.")), path);
		}

		const another = {
			...AFTER,
			package_json: JSON.stringify({
				name: "target",
				devDependencies: { vitest: "3.2.4", [PROVIDER]: "3.2.4", "left-pad": "1.3.0" },
			}),
		};
		assert.match(refusalOf(inspectInstall(BEFORE, another, [INSTALL])), /left-pad/);

		const ranged = {
			...AFTER,
			package_json: JSON.stringify({ name: "target", devDependencies: { vitest: "3.2.4", [PROVIDER]: "^3.2.4" } }),
		};
		assert.match(refusalOf(inspectInstall(BEFORE, ranged, [INSTALL])), /\^3\.2\.4/);

		const scripted = {
			...AFTER,
			package_json: JSON.stringify({ ...JSON.parse(PACKAGE_JSON_AFTER), scripts: { test: "x" } }),
		};
		assert.match(refusalOf(inspectInstall(BEFORE, scripted, [INSTALL])), /scripts/);
	});
});

describe("what npm rewrites of its own bookkeeping", () => {
	it("given an install that rewrote the hidden lock npm keeps under node_modules, then it is accepted and the rewritten file is listed with the added ones", () => {
		const hidden = "node_modules/.package-lock.json";
		const before = { ...BEFORE, files: { ...BEFORE.files, [hidden]: "sha256:hidden0" } };
		const after = { ...AFTER, files: { ...AFTER.files, [hidden]: "sha256:hidden1" } };
		const result = inspectInstall(before, after, [INSTALL]);
		assert.equal(result.kind, "accepted", result.kind === "refused" ? result.reason : "");
		assert.ok(result.kind === "accepted" && result.files.includes(hidden));
		assert.ok(
			result.kind === "accepted" && !result.files.includes("node_modules/vitest/package.json"),
			"a file the install left as it was is not listed",
		);
	});
});

describe("what npm prunes of the packages the lock did not name", () => {
	it("given an install that removed the files of packages the lock did not name, top-level, scoped or nested, then it is accepted, and given one that removed a file of a scoped package the lock named or changed a file of a package the lock did not name, then it refuses naming that file", () => {
		const stray = [
			"node_modules/stray/index.js",
			"node_modules/@scope/stray/index.js",
			"node_modules/vitest/node_modules/stray/index.js",
		];
		const before = {
			...BEFORE,
			files: { ...BEFORE.files, ...Object.fromEntries(stray.map((path) => [path, "sha256:stray"])) },
		};
		const pruned = inspectInstall(before, AFTER, [INSTALL]);
		assert.equal(pruned.kind, "accepted", pruned.kind === "refused" ? pruned.reason : "");
		assert.ok(
			pruned.kind === "accepted" && stray.every((path) => !pruned.files.includes(path)),
			"a pruned file is not a file to keep",
		);
		const changed = { ...AFTER, files: { ...AFTER.files, "node_modules/stray/index.js": "sha256:changed" } };
		assert.match(refusalOf(inspectInstall(before, changed, [INSTALL])), /node_modules\/stray\/index\.js/);

		const kept = "node_modules/@scope/kept/index.js";
		const lockedBefore = {
			...BEFORE,
			files: { ...BEFORE.files, [kept]: "sha256:kept" },
			package_lock: JSON.stringify({
				lockfileVersion: 3,
				packages: {
					...JSON.parse(LOCK_BEFORE).packages,
					"node_modules/@scope/kept": { version: "1.0.0", integrity: "sha512-kept" },
				},
			}),
		};
		assert.match(refusalOf(inspectInstall(lockedBefore, AFTER, [INSTALL])), /node_modules\/@scope\/kept\/index\.js/);
	});

	it("given a package-lock.json in lockfileVersion 1 that names vitest under dependencies and tinyspy under vitest, then an install that removes node_modules/vitest/index.js, or node_modules/vitest/node_modules/tinyspy/index.js, is refused naming that file, and given a package-lock.json that carries neither packages nor dependencies, then removing a file under node_modules is refused naming that file", () => {
		const top = "node_modules/vitest/index.js";
		const nested = "node_modules/vitest/node_modules/tinyspy/index.js";
		const before = {
			...BEFORE,
			files: { ...BEFORE.files, [top]: "sha256:top", [nested]: "sha256:nested" },
			package_lock: JSON.stringify({
				lockfileVersion: 1,
				dependencies: {
					vitest: {
						version: "3.2.4",
						integrity: "sha512-vitest",
						dependencies: { tinyspy: { version: "4.0.3", integrity: "sha512-tinyspy" } },
					},
				},
			}),
		};
		for (const removed of [top, nested]) {
			const kept = Object.fromEntries(
				Object.entries({ ...AFTER.files, [top]: "sha256:top", [nested]: "sha256:nested" }).filter(
					([path]) => path !== removed,
				),
			);
			const reason = refusalOf(inspectInstall(before, { ...AFTER, files: kept }, [INSTALL]));
			assert.match(reason, new RegExp(removed.replaceAll(".", "\\.")), removed);
		}

		const stray = "node_modules/stray/index.js";
		const unnamed = {
			...BEFORE,
			files: { ...BEFORE.files, [stray]: "sha256:stray" },
			package_lock: JSON.stringify({ name: "target", lockfileVersion: 2 }),
		};
		assert.match(refusalOf(inspectInstall(unnamed, AFTER, [INSTALL])), /node_modules\/stray\/index\.js/);
	});
});

/** How npm ends when asked for its cache and when run to install. */
interface NpmEnd {
	exit_code: number;
	stdout?: string;
	stderr?: string;
	timed_out?: boolean;
}
interface NpmOutcome {
	cache?: NpmEnd;
	install?: NpmEnd;
}

/** Answers what npm answers about its cache and records every command with the profile it ran under. */
class RecordingSandbox implements SandboxPort {
	readonly backend = "recording";
	readonly runs: { profile: SandboxProfile; request: ExecutableRequest }[] = [];
	private readonly cache: string;
	private readonly outcome: NpmOutcome;
	constructor(cache: string, outcome: NpmOutcome = {}) {
		this.cache = cache;
		this.outcome = outcome;
	}
	qualify(): QualificationResult {
		throw new Error("not asked");
	}
	async run(profile: SandboxProfile, request: ExecutableRequest): Promise<ProcessObservation> {
		this.runs.push({ profile, request });
		const asksCache = request.command.join(" ") === "npm config get cache";
		const ended = asksCache ? this.outcome.cache : this.outcome.install;
		const stdout = ended?.stdout ?? (asksCache ? `${this.cache}\n` : "");
		return {
			exit_code: ended?.exit_code ?? 0,
			signal: null,
			timed_out: ended?.timed_out ?? false,
			spawn_error: null,
			stdout: new TextEncoder().encode(stdout),
			stderr: new TextEncoder().encode(ended?.stderr ?? ""),
			stdout_truncated: false,
			stderr_truncated: false,
			started_at: "2026-09-30T00:00:00.000Z",
			ended_at: "2026-09-30T00:00:01.000Z",
			duration_ms: 1000,
		};
	}
}

describe("running the install in the copy", () => {
	it("given a plan, then the install runs under a profile allowing the network, writing only the copy and the cache directory as npm announced it, and a control profile still denies the network", async () => {
		const plan = planInstall([...BASE_FILES, "package-lock.json"], [INSTALL]);
		assert.equal(plan.kind, "command");
		const command = plan.kind === "command" ? plan.command : [];
		const sandbox = new RecordingSandbox("/machine/npm-cache");
		const run = await runInstall(sandbox, "/copies/w1", command);
		assert.deepEqual(run, { kind: "installed" });
		assert.equal(sandbox.runs.length, 2);
		const [asked, installed] = sandbox.runs;
		assert.deepEqual(asked?.request.command, ["npm", "config", "get", "cache"]);
		assert.equal(asked?.request.cwd, "/copies/w1");
		assert.equal(asked?.profile.network, "denied", "the cache is asked offline");
		assert.deepEqual(installed?.request.command, command);
		assert.equal(installed?.request.cwd, "/copies/w1");
		assert.equal(installed?.profile.network, "allowed");
		assert.deepEqual(installed?.profile.write_paths, ["/copies/w1", "/machine/npm-cache"]);

		const target = tempDir("495-install-target-", cleanups);
		fixtureTs(target);
		const controls = detectStack(target, []).controls;
		assert.notEqual(controls.length, 0);
		for (const control of controls)
			assert.equal(new GenericControlRunner(sandbox, null as never).profileFor(control, target).network, "denied");
	});

	it("given npm that does not say its cache, or an install that exits with an error or times out, then nothing is installed and the reason names what npm answered", async () => {
		const command = ["npm", "install", `${PROVIDER}@3.2.4`];
		const noCache = new RecordingSandbox("", { cache: { exit_code: 1, stderr: "npm error config broken" } });
		const first = await runInstall(noCache, "/copies/w1", command);
		assert.equal(first.kind, "failed");
		assert.match(first.kind === "failed" ? first.reason : "", /cache directory.*config broken/);
		assert.equal(noCache.runs.length, 1, "the install is not run without a cache directory to allow");

		const emptyCache = new RecordingSandbox("", { cache: { exit_code: 0, stdout: "\n" } });
		assert.equal((await runInstall(emptyCache, "/copies/w1", command)).kind, "failed");
		assert.equal(emptyCache.runs.length, 1);

		const refused = new RecordingSandbox("/machine/npm-cache", { install: { exit_code: 1, stderr: "npm error 404" } });
		const second = await runInstall(refused, "/copies/w1", command);
		assert.equal(second.kind, "failed");
		assert.match(second.kind === "failed" ? second.reason : "", /exited 1: npm error 404/);

		const slow = new RecordingSandbox("/machine/npm-cache", { install: { exit_code: 1, timed_out: true } });
		const third = await runInstall(slow, "/copies/w1", command);
		assert.match(third.kind === "failed" ? third.reason : "", /timed out/);
	});
});

const MAVEN_INSTALL: PackageInstall = {
	package: "org.jacoco:jacoco-maven-plugin",
	version: "0.8.15",
	manager: "maven",
};

describe("planning the resolution of a Maven plugin, reading where Maven keeps its files and inspecting what it left", () => {
	const POM = { path: "pom.xml", digest: "sha256:pom1" };
	const BEFORE_COPY = { "pom.xml": "sha256:pom0", "src/main/java/A.java": "sha256:a" };
	const refusedFor = (result: ReturnType<typeof inspectResolution>): string =>
		result.kind === "refused" ? result.reason : `accepted: ${JSON.stringify(result)}`;

	it("given a maven recommendation, then the plan resolves the plugins of the copy with the pinned dependency plugin and runs no goal of the adopted plugin, given the output announcing a local repository, then that path is read as is, and given none, then it is not established, and given a copy where a file other than pom.xml changed, then the inspection refuses naming it", () => {
		const plan = planInstall(["pom.xml", "src/main/java/A.java"], [MAVEN_INSTALL]);
		assert.equal(plan.kind, "command", plan.kind === "refused" ? plan.reason : "");
		const command = plan.kind === "command" ? plan.command : [];
		assert.equal(command[0], "mvn");
		assert.ok(command.includes("-B"), "batch mode: no prompt");
		assert.ok(!command.includes("-o"), "the resolution reaches the repositories");
		assert.ok(
			command.some((part) =>
				/^org\.apache\.maven\.plugins:maven-dependency-plugin:\d+\.\d+\.\d+:resolve-plugins$/.test(part),
			),
			command.join(" "),
		);
		assert.ok(
			command.every((part) => !part.includes("jacoco")),
			"no goal of the adopted plugin is run",
		);
		assert.deepEqual(planInstall(["pom.xml", "package-lock.json", "yarn.lock"], [MAVEN_INSTALL]), plan);
		assert.ok(
			command.every((part) => !part.includes("fluido")),
			"no site skin is fetched for a plugin whose goals do not load one",
		);
		const pmdPlan = planInstall(
			["pom.xml"],
			[{ package: "org.apache.maven.plugins:maven-pmd-plugin", version: "3.28.0", manager: "maven" }],
		);
		const pmdCommand = pmdPlan.kind === "command" ? pmdPlan.command : [];
		assert.ok(
			pmdCommand
				.filter((part) => !part.startsWith("-") && part !== "mvn")
				.every((goal) => goal.startsWith("org.apache.maven.plugins:maven-dependency-plugin:")),
			`every goal of the PMD resolution is one of the dependency plugin: ${pmdCommand.join(" ")}`,
		);
		assert.ok(
			pmdCommand.includes("-Dartifact=org.apache.maven.skins:maven-fluido-skin:2.0.0-M9"),
			`the site skin the PMD report goals load is fetched: ${pmdCommand.join(" ")}`,
		);

		assert.equal(
			readLocalRepository(
				"[INFO] Scanning\n[DEBUG] Using local repository at /home/dev x/.m2/repository\n[DEBUG] Using manager EnhancedLocalRepositoryManager with priority 10.0 for /home/dev x/.m2/repository\n",
			),
			"/home/dev x/.m2/repository",
		);
		assert.equal(readLocalRepository("[DEBUG] Using local repository at /srv/m2\r\n"), "/srv/m2");
		assert.equal(readLocalRepository("[INFO] BUILD SUCCESS\n"), null);
		assert.equal(readLocalRepository("[DEBUG] Using local repository at \n"), null);
		assert.equal(readLocalRepository(""), null);

		const written = { ...BEFORE_COPY, "pom.xml": POM.digest };
		assert.deepEqual(inspectResolution(BEFORE_COPY, written, [POM]), { kind: "accepted" });
		assert.match(
			refusedFor(inspectResolution(BEFORE_COPY, { ...written, "pom.xml": "sha256:other" }, [POM])),
			/pom\.xml/,
		);
		assert.match(
			refusedFor(inspectResolution(BEFORE_COPY, { ...written, "src/main/java/A.java": "sha256:changed" }, [POM])),
			/src\/main\/java\/A\.java/,
		);
		assert.match(
			refusedFor(inspectResolution(BEFORE_COPY, { ...written, "target/classes/A.class": "sha256:built" }, [POM])),
			/target\/classes\/A\.class/,
		);
		const { "src/main/java/A.java": _removed, ...without } = written;
		assert.match(refusedFor(inspectResolution(BEFORE_COPY, without, [POM])), /src\/main\/java\/A\.java/);
	});
});

/** What Maven answers when asked for its local repository offline, and when run to resolve. */
class RecordingMavenSandbox implements SandboxPort {
	readonly backend = "recording";
	readonly runs: { profile: SandboxProfile; request: ExecutableRequest }[] = [];
	private readonly announcement: string;
	private readonly announcementExit: number;
	private readonly resolution: NpmEnd | undefined;
	constructor(announcement: string, announcementExit = 0, resolution?: NpmEnd) {
		this.announcement = announcement;
		this.announcementExit = announcementExit;
		this.resolution = resolution;
	}
	qualify(): QualificationResult {
		throw new Error("not asked");
	}
	async run(profile: SandboxProfile, request: ExecutableRequest): Promise<ProcessObservation> {
		this.runs.push({ profile, request });
		const asks = request.command.join(" ") === "mvn -X -o -B validate";
		return {
			exit_code: asks ? this.announcementExit : (this.resolution?.exit_code ?? 0),
			signal: null,
			timed_out: false,
			spawn_error: null,
			stdout: new TextEncoder().encode(
				asks ? this.announcement : (this.resolution?.stdout ?? "[INFO] Downloaded jacoco-maven-plugin-0.8.15.pom\n"),
			),
			stderr: new TextEncoder().encode(asks ? "" : (this.resolution?.stderr ?? "")),
			stdout_truncated: false,
			stderr_truncated: false,
			started_at: "2026-09-30T00:00:00.000Z",
			ended_at: "2026-09-30T00:00:01.000Z",
			duration_ms: 1000,
		};
	}
}

describe("running the resolution in the copy", () => {
	const plan = planInstall(["pom.xml"], [MAVEN_INSTALL]);
	const command = plan.kind === "command" ? plan.command : [];

	it("given a maven plan and a copy whose maven announces a local repository, then the step runs with the network allowed and writes only the copy and that path as announced, and keeps maven's output, given no announcement, then the step does not run, while a control profile still denies the network", async () => {
		const sandbox = new RecordingMavenSandbox("[DEBUG] Using local repository at /machine/m2 repo/repository\n");
		const run = await runInstall(sandbox, "/copies/w1", command);
		assert.deepEqual(run, { kind: "installed", output: "[INFO] Downloaded jacoco-maven-plugin-0.8.15.pom\n" });
		assert.equal(sandbox.runs.length, 2);
		const [asked, resolved] = sandbox.runs;
		assert.deepEqual(asked?.request.command, ["mvn", "-X", "-o", "-B", "validate"]);
		assert.equal(asked?.request.cwd, "/copies/w1");
		assert.equal(asked?.profile.network, "denied", "the local repository is asked offline");
		assert.deepEqual(asked?.profile.write_paths, [], "and with no write outside the copy");
		assert.deepEqual(resolved?.request.command, command);
		assert.equal(resolved?.request.cwd, "/copies/w1");
		assert.equal(resolved?.profile.network, "allowed");
		assert.deepEqual(resolved?.profile.write_paths, ["/copies/w1", "/machine/m2 repo/repository"]);
		assert.ok(
			resolved?.profile.env_allowlist.includes("HOME"),
			"maven reads its configuration from the home of the machine",
		);

		for (const [label, silent] of [
			["an answer without the line", new RecordingMavenSandbox("[INFO] BUILD SUCCESS\n")],
			["a command that fails", new RecordingMavenSandbox("[DEBUG] Using local repository at /machine/m2\n", 1)],
		] as const) {
			const refused = await runInstall(silent, "/copies/w1", command);
			assert.equal(refused.kind, "failed", label);
			assert.match(refused.kind === "failed" ? refused.reason : "", /local repository/, label);
			assert.equal(silent.runs.length, 1, `${label}: the resolution is not run`);
			assert.ok(silent.runs.every((r) => r.profile.network === "denied"));
		}

		const target = tempDir("495-resolve-target-", cleanups);
		fixtureJava(target, true);
		const controls = detectStack(target, []).controls;
		assert.notEqual(controls.length, 0);
		for (const control of controls)
			assert.equal(new GenericControlRunner(sandbox, null as never).profileFor(control, target).network, "denied");
	});
});

describe("the reason a resolution that fails gives", () => {
	const jvmWarning =
		"WARNING: A terminally deprecated method in sun.misc.Unsafe has been called\nWARNING: Please consider reporting this to the maintainers";
	const announcement = "[DEBUG] Using local repository at /machine/m2/repository\n";
	const mavenCommand = planInstall(["pom.xml"], [MAVEN_INSTALL]);
	const command = mavenCommand.kind === "command" ? mavenCommand.command : [];

	const reasonOf = async (sandbox: SandboxPort, failing: readonly string[]): Promise<string> => {
		const run = await runInstall(sandbox, "/copies/w1", failing);
		assert.equal(run.kind, "failed");
		return run.kind === "failed" ? run.reason : "";
	};

	it("given a maven resolution that fails with a JVM warning on its error output and its cause on its standard output, then the reason carries the cause for an unreachable network, a refused access and an unknown version and not the warning, given an empty standard output, then the reason carries the error output, and given npm failing on its error output, then the reason is still that output", async () => {
		const causes = [
			"[ERROR] Could not transfer artifact org.jacoco:jacoco-maven-plugin:pom:0.8.15 from/to recette (http://127.0.0.1:9/): Connect to 127.0.0.1:9 failed",
			"[ERROR] Could not transfer artifact org.jacoco:jacoco-maven-plugin:pom:0.8.15 from/to recette (http://127.0.0.1:1/): status code: 403, reason phrase: Forbidden (403)",
			"[ERROR] Plugin org.jacoco:jacoco-maven-plugin:0.8.15 or one of its dependencies could not be resolved: Could not find artifact org.jacoco:jacoco-maven-plugin:jar:0.8.15 in recette",
		];
		for (const cause of causes) {
			const sandbox = new RecordingMavenSandbox(announcement, 0, {
				exit_code: 1,
				stdout: `[INFO] Scanning for projects...\n${cause}\n`,
				stderr: jvmWarning,
			});
			const reason = await reasonOf(sandbox, command);
			assert.ok(reason.includes(cause), `the reason carries "${cause}", got: ${reason}`);
			assert.ok(!reason.includes("sun.misc.Unsafe"), "and not the warning of the JVM");
		}

		const silent = new RecordingMavenSandbox(announcement, 0, { exit_code: 1, stdout: "", stderr: jvmWarning });
		assert.match(await reasonOf(silent, command), /sun\.misc\.Unsafe/);

		const npm = new RecordingSandbox("/machine/npm-cache", {
			install: { exit_code: 1, stdout: "npm notice a newer version", stderr: "npm error 404 Not Found" },
		});
		const npmReason = await reasonOf(npm, ["npm", "install", `${PROVIDER}@3.2.4`]);
		assert.match(npmReason, /exited 1: npm error 404 Not Found/);
		assert.ok(!npmReason.includes("newer version"));
	});
});

describe("the pom.xml an adopted complement wrote, judged at G4", () => {
	const entry = (path: string, baseline_state: ManifestEntry["baseline_state"], digest: string): ManifestEntry => ({
		path,
		kind: "file",
		content_digest: digest as ManifestEntry["content_digest"],
		size: 1,
		mode: "000644",
		symlink_target: null,
		baseline_state,
		origin: "agent",
		limits: null,
	});
	const manifestOf = (...entries: ManifestEntry[]): CandidateManifest => ({
		candidate_id: "cnd_1",
		workspace_id: "wsp_1",
		base_reference_id: "ref_1",
		base_digest: `sha256:${"b".repeat(64)}`,
		selected_paths: [],
		exclusions: [],
		entries,
		metadata_policy: "content_and_mode",
		manifest_digest: `sha256:${"c".repeat(64)}`,
		frozen_at: "2026-09-30T12:00:00.000Z",
		limits: { truncated: false, bytes_read: 0, bytes_total: null, exclusions: [], unstable: false, notes: [] },
	});

	it("given a complement adopted on pom.xml, then a candidate keeping it as the complement wrote it passes, and one whose producer put back the pom.xml of the reference is refused naming pom.xml", () => {
		const target = tempDir("495-g4-pom-", cleanups);
		fixtureJava(target);
		const test = detectStack(target, []).controls.find((c) => c.control_id === "maven-test");
		assert.ok(test, "the detection declares the Maven test control");
		assert.ok(test.protected_paths.includes("pom.xml"), "the POM is a protected path");
		const written = digestBytes("<project>with the declaration</project>");
		const complement = {
			path: "pom.xml",
			digest: written,
			test_type: "coverage",
			tool: "org.jacoco:jacoco-maven-plugin",
		};
		const kept = protectedPathsChanged(
			manifestOf(entry("pom.xml", "modified", written)),
			test.protected_paths,
			[],
			() => false,
			[complement],
		);
		assert.deepEqual(kept.altered, []);
		assert.deepEqual(kept.allowed, ["pom.xml"]);
		const restored = protectedPathsChanged(
			manifestOf(entry("pom.xml", "unchanged", digestBytes("<project>the reference</project>"))),
			test.protected_paths,
			[],
			() => false,
			[complement],
		);
		assert.deepEqual(restored.altered, ["pom.xml"]);
	});
});
