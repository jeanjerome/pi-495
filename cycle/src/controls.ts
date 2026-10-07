/**
 * The controls of the cycle — Preflight, the command that holds a task, the replay of a red at its
 * test-only commit — run through the kernel's own control runner: the same sandbox, the same
 * parsers, the same evidence shape, the outputs kept in the same object store. What the tool adds
 * is the reading of a red: which tests failed, not only that the command did.
 */
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type { EvidenceCandidate } from "../../src/contracts/v1/evidence.ts";
import type { ObjectRef } from "../../src/contracts/v1/common.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { ObjectStorePort } from "../../src/ports/object-store.ts";
import type { ControlExecutionPort, SandboxPort } from "../../src/ports/execution.ts";
import { basename, join } from "node:path";
import { EXIT_CODE_READER } from "../../src/adapters/execution/parsers.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { NODE_TEST_READER } from "../../src/adapters/stacks/node/node-test-reader.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { arbreDetache, retirerArbre, revision } from "./git.ts";

export interface Controle {
	id: string;
	commande: string[];
	/** Preflight forks workers that talk to it over a socket; a task's test does not. */
	reseau: "denied" | "loopback";
	timeout_ms: number;
}

export interface Preuve {
	controle: string;
	commande: string[];
	revision: string;
	verdict: EvidenceCandidate["verdict"];
	started_at: string;
	ended_at: string;
	facts: Record<string, unknown>;
	/** The failing tests the parser read, when the command is a node:test run. */
	echecs: string[];
	artifacts: { name: string; ref: ObjectRef }[];
	sandbox: string;
}

export const PREFLIGHT: Controle = {
	id: "preflight",
	commande: ["npm", "run", "check"],
	reseau: "loopback",
	timeout_ms: 900_000,
};

/** `node` by any path, so a test that names the running binary is still read as a node:test run. */
function estNodeTest(commande: string[]): boolean {
	return basename(commande[0] ?? "") === "node" && commande.includes("--test");
}

/** The command of a task, made to report TAP when it is a node:test run, so its failures are read. */
export function controleDeTache(numero: number, commande: string[]): Controle {
	// A node option after the entry file is the file's argument, not node's: the reporter goes right after `--test`.
	const at = commande.indexOf("--test") + 1;
	const withTap =
		estNodeTest(commande) && !commande.some((a) => a.startsWith("--test-reporter"))
			? [...commande.slice(0, at), "--test-reporter=tap", ...commande.slice(at)]
			: commande;
	return { id: `tache-${numero}`, commande: withTap, reseau: "denied", timeout_ms: 600_000 };
}

function definition(controle: Controle, arbre: string): ControlDefinition {
	const parser =
		estNodeTest(controle.commande) && controle.commande.includes("--test-reporter=tap") ? "node-test" : "exit-code";
	return {
		control_id: controle.id,
		version: "1",
		title: controle.id,
		command: controle.commande,
		cwd: ".",
		env_allowlist: ["PATH", "HOME", "TMPDIR", "LANG"],
		// The user's git configuration stays out: a suite that commits in a scratch repository must not
		// reach a signing key the sandbox denies.
		env: { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
		timeout_ms: controle.timeout_ms,
		parser,
		report_path: null,
		structure_rules: [],
		provides: [],
		requires: [],
		scope_argument: null,
		network: controle.reseau,
		writable_paths: [arbre],
		requirement_refs: [],
		protected: false,
		protected_paths: [],
	};
}

export class Executeur {
	private readonly runner: ControlExecutionPort;
	private readonly backend: string;

	constructor(sandbox: SandboxPort, objets: ObjectStorePort) {
		this.runner = new GenericControlRunner(sandbox, objets, [EXIT_CODE_READER, NODE_TEST_READER], {
			max_output_bytes: 16 * 1024 * 1024,
		});
		this.backend = sandbox.backend;
	}

	/**
	 * Runs `controle` on the tree at `arbre`. `dossier` names the run the proof belongs to — a story,
	 * a refactoring, or the run of refactorings — and keys the protocol and the candidate digest.
	 */
	async executer(controle: Controle, arbre: string, dossier: string): Promise<Preuve> {
		const rev = revision(arbre);
		const digest = digestValue({ story: dossier, rev });
		const { evidence } = await this.runner.runControl({
			control: definition(controle, arbre),
			protocol: { protocol_id: `cycle:${dossier}`, revision: 1, content_digest: digestValue(controle) },
			candidate: { candidate_id: rev, manifest_digest: digest, base_digest: digest, workspace_id: arbre },
			subject: { kind: "candidate", id: rev, revision: 1, digest },
			workspace_path: arbre,
			environment: { environment_id: "cycle", digest: digestValue({ node: process.version }), profile_id: "cycle" },
			requirement_refs: [],
			producer: {
				actor_id: "cycle",
				actor_type: "executor",
				role: "executor",
				origin: "executor",
				authentication_level: "host_qualified",
			},
		});
		return {
			controle: controle.id,
			commande: controle.commande,
			revision: rev,
			verdict: evidence.verdict,
			started_at: evidence.started_at,
			ended_at: evidence.ended_at,
			facts: evidence.facts,
			echecs: evidence.findings.map((f) => f.message),
			artifacts: evidence.artifacts,
			sandbox: this.backend,
		};
	}

	/** Runs `controle` at `sha` in a detached tree of `depot`, which is removed afterwards. */
	async executerA(controle: Controle, depot: string, sha: string, dossier: string): Promise<Preuve> {
		const arbre = arbreDetache(depot, sha);
		try {
			return await this.executer(controle, arbre, dossier);
		} finally {
			retirerArbre(depot, arbre);
		}
	}
}

/** The executor of the cycle's controls, its outputs kept in the object store under `racine`. */
export function executeurNonConfine(racine: string): Executeur {
	// The suite of this repository qualifies Seatbelt itself, and a sandbox does not nest: the
	// controls run unconfined through the kernel's runner, and every evidence says so.
	return new Executeur(new UnconfinedSandbox(), new CasObjectStore(join(racine, "objects")));
}

/**
 * A red is a test that fails on its assertion: the TAP summary counts at least one failure. A
 * command that fails without one — a missing file, an import error — is not that red.
 */
export function estUnRouge(preuve: Preuve): boolean {
	const fail = preuve.facts.fail;
	return preuve.verdict === "FAIL" && typeof fail === "number" && fail > 0;
}
