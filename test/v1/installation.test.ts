/**
 * Installing the complement a recommendation describes: the plan is decided from the files of the
 * reference alone, and what npm leaves behind is accepted only when it is what was asked for.
 */
import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { detectStack } from "../../src/application/target.ts";
import { fixtureTs, tempDir } from "../helpers/fixtures.ts";
import { inspectInstall, planInstall, runInstall } from "../../src/application/installation.ts";
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

describe("planning the install of a recommended package", () => {
	it("given package-lock.json alone, then the plan is the npm command for the exact version, and given pnpm-lock.yaml, yarn.lock, bun.lock or no lock, then the plan is a refusal naming the file or its absence, and given a .npmrc, then the plan is still the npm command", () => {
		const plan = planInstall([...BASE_FILES, "package-lock.json"], INSTALL);
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
		assert.deepEqual(planInstall([...BASE_FILES, "package-lock.json", ".npmrc"], INSTALL), plan);
		for (const lock of ["pnpm-lock.yaml", "yarn.lock", "bun.lock"]) {
			const refused = planInstall([...BASE_FILES, lock], INSTALL);
			assert.equal(refused.kind, "refused", lock);
			assert.match(refused.kind === "refused" ? refused.reason : "", new RegExp(lock.replace(".", "\\.")), lock);
		}
		const noLock = planInstall(BASE_FILES, INSTALL);
		assert.equal(noLock.kind, "refused");
		assert.match(noLock.kind === "refused" ? noLock.reason : "", /no package-lock\.json/);
		assert.equal(planInstall([...BASE_FILES, "package-lock.json", "yarn.lock"], INSTALL).kind, "refused");
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
		const accepted = inspectInstall(BEFORE, AFTER, INSTALL);
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
		assert.match(refusalOf(inspectInstall(BEFORE, modified, INSTALL)), /node_modules\/vitest\/package\.json/);

		const removed = { ...AFTER, files: { ...AFTER.files } };
		delete (removed.files as Record<string, string>)["node_modules/vitest/package.json"];
		assert.match(refusalOf(inspectInstall(BEFORE, removed, INSTALL)), /node_modules\/vitest\/package\.json/);

		for (const path of ["src/index.ts", "scripts/postinstall.sh"]) {
			const outside = { ...AFTER, files: { ...AFTER.files, [path]: "sha256:written" } };
			assert.match(refusalOf(inspectInstall(BEFORE, outside, INSTALL)), new RegExp(path.replace(".", "\\.")), path);
		}

		const another = {
			...AFTER,
			package_json: JSON.stringify({
				name: "target",
				devDependencies: { vitest: "3.2.4", [PROVIDER]: "3.2.4", "left-pad": "1.3.0" },
			}),
		};
		assert.match(refusalOf(inspectInstall(BEFORE, another, INSTALL)), /left-pad/);

		const ranged = {
			...AFTER,
			package_json: JSON.stringify({ name: "target", devDependencies: { vitest: "3.2.4", [PROVIDER]: "^3.2.4" } }),
		};
		assert.match(refusalOf(inspectInstall(BEFORE, ranged, INSTALL)), /\^3\.2\.4/);

		const scripted = {
			...AFTER,
			package_json: JSON.stringify({ ...JSON.parse(PACKAGE_JSON_AFTER), scripts: { test: "x" } }),
		};
		assert.match(refusalOf(inspectInstall(BEFORE, scripted, INSTALL)), /scripts/);
	});
});

describe("what npm rewrites of its own bookkeeping", () => {
	it("given an install that rewrote the hidden lock npm keeps under node_modules, then it is accepted and the rewritten file is listed with the added ones", () => {
		const hidden = "node_modules/.package-lock.json";
		const before = { ...BEFORE, files: { ...BEFORE.files, [hidden]: "sha256:hidden0" } };
		const after = { ...AFTER, files: { ...AFTER.files, [hidden]: "sha256:hidden1" } };
		const result = inspectInstall(before, after, INSTALL);
		assert.equal(result.kind, "accepted", result.kind === "refused" ? result.reason : "");
		assert.ok(result.kind === "accepted" && result.files.includes(hidden));
		assert.ok(
			result.kind === "accepted" && !result.files.includes("node_modules/vitest/package.json"),
			"a file the install left as it was is not listed",
		);
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
		const plan = planInstall([...BASE_FILES, "package-lock.json"], INSTALL);
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

		const target = tempDir("495-install-target-");
		try {
			fixtureTs(target);
			const controls = detectStack(target, []).controls;
			assert.notEqual(controls.length, 0);
			for (const control of controls)
				assert.equal(new GenericControlRunner(sandbox, null as never).profileFor(control, target).network, "denied");
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
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
