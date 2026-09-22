/**
 * Composition root: builds the trusted controller with the real adapters. Started lazily on
 * `session_start`, closed on `session_shutdown` (extensions.md: no background resources in the factory).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { GenericControlRunner } from "../adapters/execution/runner.ts";
import { CasObjectStore } from "../adapters/object-store/cas.ts";
import { PiWorkerAgent } from "../adapters/pi-worker/supervisor.ts";
import type { PiModelCatalogue } from "../adapters/pi-worker/capabilities.ts";
import { ScriptedAgent, type AgentScript } from "../adapters/pi-worker/scripted-agent.ts";
import { readFileSync } from "node:fs";
import type { AgentPort } from "../ports/execution.ts";
import { dataLayout, legacyDataDirs, resolveDataDir, resolveWorkspacesDir } from "../adapters/platform/paths.ts";
import { selectSandbox } from "../adapters/sandbox/backends.ts";
import { SqliteLedger } from "../adapters/storage-sqlite/ledger.ts";
import { GitWorkspace } from "../adapters/workspace/git-workspace.ts";
import { GitIntegrator } from "../adapters/git/integrator.ts";
import { describeEnvironment } from "../application/environment.ts";
import { Harness } from "../application/harness.ts";
import { randomIds, systemClock } from "../application/ids.ts";
import type { ModelSelection } from "../ports/execution.ts";
import { loadConfig, type HarnessConfig } from "./config.ts";

export interface RuntimeInputs {
	pi_version: string;
	pi_package_dir: string;
	pi_agent_dir: string;
	model: ModelSelection;
	/** The host's model surface, from which the model retained is described before each intervention. */
	catalogue?: PiModelCatalogue | null;
	env?: NodeJS.ProcessEnv;
	dataDir?: string;
	workspacesDir?: string;
}

export interface HarnessRuntime {
	harness: Harness;
	ledger: SqliteLedger;
	objects: CasObjectStore;
	config: HarnessConfig;
	dataDir: string;
	workspacesDir: string;
	diagnostics: string[];
	sandbox_backend: string;
	sandbox_qualified: boolean;
	environment_digest: string;
	close(): void;
}

export function createRuntime(inputs: RuntimeInputs): HarnessRuntime {
	const env = inputs.env ?? process.env;
	const dataDir = inputs.dataDir ?? resolveDataDir(env);
	const layout = dataLayout(dataDir);
	const workspacesDir = inputs.workspacesDir ?? resolveWorkspacesDir(dataDir, env);
	for (const d of [layout.root, layout.objects, workspacesDir, layout.exports, layout.locks, layout.logs])
		mkdirSync(d, { recursive: true });
	const { config, diagnostics } = loadConfig(dataDir, env);
	const normative = [
		layout.database,
		`${layout.database}-wal`,
		`${layout.database}-shm`,
		layout.objects,
		layout.exports,
		layout.logs,
		layout.locks,
		join(dataDir, "config.json"),
	];
	const sandbox = selectSandbox({
		allow_unconfined: config.isolation.allow_unconfined,
		denied_read_paths: [...normative, join(inputs.pi_agent_dir, "auth.json")],
	});
	if (!sandbox.qualification.qualified)
		diagnostics.push(`sandbox ${sandbox.backend.backend} not qualified: ${sandbox.qualification.reasons.join("; ")}`);
	const ledger = new SqliteLedger(layout.database);
	const objects = new CasObjectStore(layout.objects);
	// Former workspace roots stay resolvable so a change started before the move can be resumed;
	// only `workspacesDir` is ever written to.
	const formerRoots = [
		layout.workspaces,
		...legacyDataDirs(env).flatMap((d) => [join(d, "workspaces"), resolveWorkspacesDir(d, {})]),
	];
	const workspace = new GitWorkspace(workspacesDir, formerRoots);
	const controls = new GenericControlRunner(sandbox.backend, objects);
	const environment = describeEnvironment(inputs.pi_version, sandbox.backend.backend);
	let agent: AgentPort = new PiWorkerAgent({
		config: {
			pi_package_dir: inputs.pi_package_dir,
			pi_agent_dir: inputs.pi_agent_dir,
			sandbox_backend: sandbox.backend.backend as "seatbelt" | "bubblewrap" | "unconfined",
			denied_read_paths: normative,
			heartbeat_ms: 5000,
		},
		silence_timeout_ms: Math.max(120_000, config.policy.budgets.intervention_ms / 4),
		catalogue: inputs.catalogue ?? null,
	});
	if (env.HARNESS495_SCRIPTED_AGENT) {
		// Qualification campaigns (F-PIHOST, F-AGENTS): a deterministic agent replaces the Pi worker.
		const scripts = JSON.parse(readFileSync(env.HARNESS495_SCRIPTED_AGENT, "utf8")) as {
			default: AgentScript;
			roles?: Record<string, AgentScript>;
		};
		agent = new ScriptedAgent(scripts.default, scripts.roles ?? {});
		diagnostics.push(
			`HARNESS495_SCRIPTED_AGENT: interventions are simulated from ${env.HARNESS495_SCRIPTED_AGENT}; no model is called`,
		);
	}
	const harness = new Harness({
		ledger,
		objects,
		workspace,
		controls,
		agent,
		sandbox,
		clock: systemClock,
		ids: randomIds,
		policy: config.policy,
		workspacePolicy: { exclusions: config.workspace_exclusions, max_file_bytes: 8 * 1024 * 1024, max_entries: 50_000 },
		environment: environment.ref,
		model: inputs.model,
		instance_id: randomIds.next("ins"),
		denied_read_paths: normative,
	});
	harness.integrator = new GitIntegrator(harness).step;
	return {
		harness,
		ledger,
		objects,
		config,
		dataDir,
		workspacesDir,
		diagnostics,
		sandbox_backend: sandbox.backend.backend,
		sandbox_qualified: sandbox.qualification.qualified,
		environment_digest: environment.ref.digest,
		close: () => ledger.close(),
	};
}
