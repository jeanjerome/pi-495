import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
	ControlExecutionPort,
	ExecutableRequest,
	ProcessObservation,
	SandboxPort,
	SandboxProfile,
} from "../../src/ports/execution.ts";

export type NpmMode = "installs" | "fails" | "modifies-an-existing-file";

export const PROVIDER = "@vitest/coverage-v8";
export const PROVIDER_INTEGRITY = "sha512-fake-provider";
/** The files a clean install of the provider adds under node_modules/, with the bytes it writes. */
export const PROVIDER_FILES: Record<string, string> = {
	"node_modules/.package-lock.json": '{"packages":{}}\n',
	"node_modules/@vitest/coverage-v8/package.json": '{"name":"@vitest/coverage-v8","version":"3.2.4"}\n',
	"node_modules/@vitest/coverage-v8/index.js": "export const provider = 'v8';\n",
};

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
		started_at: "2026-09-30T00:00:00.000Z",
		ended_at: "2026-09-30T00:00:01.000Z",
		duration_ms: 1000,
	};
}

function write(root: string, path: string, text: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

/**
 * Stands for the network and the package repository: it answers what npm answers about its cache, and
 * leaves in the copy what an install of the provider leaves, or fails like a repository that refuses
 * the version. Every other command runs on the sandbox it wraps. Each command is recorded with the
 * network its profile granted.
 */
export class FakeNpmSandbox implements SandboxPort {
	readonly backend: string;
	readonly runs: { command: string[]; network: SandboxProfile["network"]; write_paths: string[] }[] = [];
	private readonly inner: SandboxPort;
	private readonly mode: NpmMode;
	private readonly cache: string;
	constructor(inner: SandboxPort, mode: NpmMode, cache = "/machine/npm-cache") {
		this.inner = inner;
		this.backend = inner.backend;
		this.mode = mode;
		this.cache = cache;
	}
	qualify(profile: SandboxProfile): ReturnType<SandboxPort["qualify"]> {
		return this.inner.qualify(profile);
	}
	installs(): number {
		return this.runs.filter((r) => r.command[0] === "npm" && r.command[1] === "install").length;
	}
	async run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		this.runs.push({ command: request.command, network: profile.network, write_paths: profile.write_paths });
		if (request.command[0] !== "npm") return this.inner.run(profile, request, signal);
		if (request.command[1] === "config") return observation(0, `${this.cache}\n`);
		if (this.mode === "fails")
			return observation(1, "", "npm error 404 Not Found - GET https://registry.npmjs.org/@vitest%2fcoverage-v8");
		this.writeInstall(request.cwd);
		return observation(0);
	}
	private writeInstall(cwd: string): void {
		const manifest = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
			devDependencies?: Record<string, string>;
		};
		manifest.devDependencies = { ...manifest.devDependencies, [PROVIDER]: "3.2.4" };
		write(cwd, "package.json", `${JSON.stringify(manifest, null, 2)}\n`);
		write(
			cwd,
			"package-lock.json",
			JSON.stringify({
				lockfileVersion: 3,
				packages: {
					"": { name: "f-vitest" },
					"node_modules/vitest": { version: "3.2.4", integrity: "sha512-fake-vitest" },
					[`node_modules/${PROVIDER}`]: { version: "3.2.4", integrity: PROVIDER_INTEGRITY },
				},
			}),
		);
		for (const [path, text] of Object.entries(PROVIDER_FILES)) write(cwd, path, text);
		if (this.mode === "modifies-an-existing-file")
			write(cwd, "node_modules/vitest/package.json", '{"name":"vitest","version":"3.2.4","tampered":true}\n');
	}
}

/**
 * Stands for a vitest that is not installed on the machine running the suite: the control runner runs
 * for real, and the verdict of the qualification witnesses is set from the tree they were given, the
 * negative witnesses being the ones that carry a failing test or a function nothing calls.
 */
export class FakeVitestControls implements ControlExecutionPort {
	private readonly real: ControlExecutionPort;
	constructor(real: ControlExecutionPort) {
		this.real = real;
	}
	async runControl(
		invocation: Parameters<ControlExecutionPort["runControl"]>[0],
		signal?: AbortSignal,
	): ReturnType<ControlExecutionPort["runControl"]> {
		const out = await this.real.runControl(invocation, signal);
		if (invocation.control.command.some((part) => part.includes("495-broken-runner"))) return out;
		const has = (path: string): boolean => {
			try {
				readFileSync(join(invocation.workspace_path, path));
				return true;
			} catch {
				return false;
			}
		};
		const negative =
			["test", "tests"].some((d) => has(`${d}/495-negative-witness.test.ts`)) || has("src/witness495/uncovered.mjs");
		return { ...out, evidence: { ...out.evidence, verdict: negative ? "FAIL" : "PASS" } };
	}
}
