/**
 * The exploration of a formal model is about the model, not the candidate: a second candidate holding the same model
 * cites the original proof instead of exploring it again, while the controls of the program run on it. What would make
 * that citation a lie — an altered proof, a changed import, another tool or environment, an input nobody can identify,
 * an exploration that proved nothing — has the model explored again.
 */
import { strict as assert } from "node:assert";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { readersOf } from "../../src/adapters/execution/common-readers.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import { DEFAULT_WORKSPACE_POLICY, GitWorkspace } from "../../src/adapters/workspace/git-workspace.ts";
import { EXECUTOR_ACTOR } from "../../src/application/actors.ts";
import { establishedExploration, formalInputsOf, uncoveredModules } from "../../src/application/formal-reuse.ts";
import { VerificationCoordinator } from "../../src/application/verification.ts";
import { digestBytes, digestValue } from "../../src/contracts/digest.ts";
import type { EnvironmentRef } from "../../src/contracts/v1/common.ts";
import { type Evidence, evidenceDigest } from "../../src/contracts/v1/evidence.ts";
import type { ControlDefinition, FormalPackage, Protocol } from "../../src/contracts/v1/protocol.ts";
import type { EvidenceFact } from "../../src/domain/change/commands.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { formalPackageDigest } from "../../src/domain/formal-package.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";
import { STACKS_OF_495 } from "../../src/extension/runtime.ts";
import { controlOf } from "../helpers/execution-fixture.ts";
import { initRepo, outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { BOUNDED, COMPTEUR, CONFIG, DIVERGENT, counterPackage, tlcStandIn } from "../helpers/formal-control.ts";

const roots = removedAfterEach();

const AT = "2026-10-10T12:00:00.000Z";
const ENVIRONMENT: EnvironmentRef = {
	environment_id: "env_formal",
	digest: digestValue({ formal: 1 }),
	profile_id: "u",
};

/** The counter model reaching its bound through a module the package does not pin. */
const MODEL = COMPTEUR.replace("EXTENDS Naturals", "EXTENDS Naturals, Bornes");
const BORNES = "---- MODULE Bornes ----\nEXTENDS Naturals\nPlafond == 3\n====\n";

function formalControl(pkg: FormalPackage): ControlDefinition {
	return controlOf({
		control_id: "formal-model",
		version: formalPackageDigest(pkg),
		title: `TLC on ${pkg.model}`,
		command: [pkg.tool.java, "-cp", pkg.tool.jar, "tlc2.TLC", "-tool", "-config", pkg.config, pkg.model],
		timeout_ms: pkg.budget.timeout_ms,
		parser: "tlc",
		writable_paths: [".495-tlc"],
		env_allowlist: ["PATH", "HOME", "TMPDIR", "JAVA_HOME"],
		protected_paths: Object.keys(pkg.files),
		formal_package: pkg,
	});
}

/** A control of the program that records each run it makes, one line per run. */
function unitControl(ran: string): ControlDefinition {
	return controlOf({
		control_id: "unit",
		command: [process.execPath, "-e", `require("node:fs").appendFileSync(${JSON.stringify(ran)}, "run\\n")`],
	});
}

function lines(path: string): number {
	try {
		return readFileSync(path, "utf8")
			.split("\n")
			.filter((l) => l !== "").length;
	} catch {
		return 0;
	}
}

interface Bench {
	verify(candidate: Record<string, string>, environment?: EnvironmentRef): Promise<Evidence>;
	objects: CasObjectStore;
	/** The jar the package names, outside the target. */
	jar: string;
	explorations(): number;
	programRuns(): number;
	/** The facts the last verification committed to the change for its candidate. */
	committed(): readonly EvidenceFact[];
}

/** A change whose protocol freezes the exploration of `model` and a program control, on a fresh ledger and store. */
function bench(model: string = MODEL, imported: Record<string, string> = { "spec/Bornes.tla": BORNES }): Bench {
	const root = outputDir("formal-reuse-", roots);
	const tool = tlcStandIn();
	const pkg = counterPackage(tool, {
		files: { "spec/Compteur.tla": digestBytes(model), "spec/Compteur.cfg": digestBytes(CONFIG) },
	});
	const unitRan = join(root, "unit-ran.txt");
	const project = join(root, "project");
	writeFiles(project, {
		"package.json": JSON.stringify({ name: "counter", version: "1.0.0", type: "module" }),
		"src/counter.js": "export function next(x, max) {\n  return x + 1;\n}\n",
		"spec/Compteur.tla": model,
		"spec/Compteur.cfg": CONFIG,
		...imported,
	});
	initRepo(project);
	const objects = new CasObjectStore(join(root, "objects"));
	const ledger = new SqliteLedger(join(root, "state.sqlite"));
	const workspace = new GitWorkspace(join(root, "workspaces"));
	const runner = new GenericControlRunner(new UnconfinedSandbox(), objects, readersOf(STACKS_OF_495.technologies));
	const formal = formalControl(pkg);
	const protocol: Protocol = {
		protocol_id: "prt_1",
		change_id: "chg_1",
		controls: [formal, unitControl(unitRan)],
		qualifications: {},
		capability_diagnosis: {
			stack: "node",
			level: "discriminating",
			test_files: 1,
			discovered: 1,
			executed: 1,
			undiscriminated_requirements: [],
			unobserved_requirements: [],
			notes: [],
		},
		obligations: [],
		required_reviews: [],
		arbitration: "human_decision",
		baseline: { compare_to_reference: false, tolerance: "block_any", instability: "none", max_confirmations: 0 },
		environment_digest: ENVIRONMENT.digest,
	};
	let next = 0;
	let committed: readonly EvidenceFact[] = [];
	return {
		objects,
		committed: () => committed,
		jar: tool.jar,
		explorations: () => lines(tool.ran),
		programRuns: () => lines(unitRan),
		async verify(files, environment = ENVIRONMENT) {
			const reference = await workspace.captureReference(project, DEFAULT_WORKSPACE_POLICY);
			const handle = await workspace.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
			writeFiles(handle.path, files);
			const manifest = await workspace.snapshotCandidate(handle, reference, DEFAULT_WORKSPACE_POLICY);
			const coordinator = new VerificationCoordinator({
				controls: runner,
				workspace,
				workspacePolicy: DEFAULT_WORKSPACE_POLICY,
				objects,
				ledger,
				environment,
				policy: DEFAULT_POLICY,
				now: () => AT,
				id: (prefix) => `${prefix}_${++next}`,
				readArtifact: async () => {
					throw new DomainError("EVIDENCE_MISSING", "no artifact in this bench");
				},
				storedFiles: async () => async () => null,
				progress: () => {},
			});
			({ facts: committed } = await coordinator.run({
				change_id: "chg_1",
				protocol,
				protocol_ref: { protocol_id: "prt_1", revision: 1, content_digest: digestValue(protocol) },
				candidate: {
					candidate_id: manifest.candidate_id,
					manifest_digest: manifest.manifest_digest,
					base_digest: reference.tree_digest,
					workspace_id: handle.workspace_id,
				},
				manifest,
				reference,
				workspace_path: handle.path,
			}));
			const explored = ledger
				.listEvidence("chg_1")
				.find((e) => e.control_id === formal.control_id && e.subject.digest === manifest.manifest_digest);
			assert.ok(explored, "the run records what it holds of the model for the candidate verified");
			return explored;
		},
	};
}

describe("a proof of the model is cited for another candidate only while it is intact and its inputs unchanged", () => {
	it("la seconde demande cite la preuve originale et sa corruption interdit cette réutilisation", async () => {
		const b = bench();
		const original = await b.verify({ "src/counter.js": BOUNDED });
		assert.equal(original.verdict, "PASS", `the model is explored: ${original.limits.notes.join(" | ")}`);
		assert.equal(b.explorations(), 1);

		const second = await b.verify({ "src/counter.js": DIVERGENT });
		assert.equal(b.explorations(), 1, "the second request explores nothing");
		assert.equal(second.facts.reused_from, original.evidence_id, "the second request cites the original proof");
		assert.equal(second.facts.run, "reused", "the citation says it is a reuse");
		assert.equal(second.facts.duration_ms, undefined, "a reuse does not present itself as an execution");
		assert.equal(second.verdict, "PASS");
		assert.equal(b.programRuns(), 2, "the controls of the program run on the second candidate");
		const held = b.committed().find((f) => f.control_id === second.control_id);
		assert.equal(held?.evidence_id, second.evidence_id, "the citation is what the verification holds of the model");
		assert.equal(held?.subject_digest, second.subject.digest, "for the second candidate");

		const stdout = original.artifacts.find((a) => a.name === "stdout");
		assert.ok(stdout, "the original exploration kept its output");
		const path = b.objects.pathFor(stdout.ref.digest);
		chmodSync(path, 0o644);
		writeFileSync(path, "an output nobody produced\n");
		const third = await b.verify({ "src/counter.js": `${BOUNDED}// third\n` });
		assert.equal(b.explorations(), 2, "a corrupted proof forbids its reuse: the model is explored again");
		assert.equal(third.facts.reused_from, undefined, "nothing cites the corrupted proof");
		assert.equal(third.facts.run, "candidate");
		assert.match(String(third.facts.rerun_because), /stdout of evd_\d+ is lost or altered/, "the evidence says why");
	});

	it("a changed import, another tool or environment, an unidentified module or an inconclusive exploration is explored again", async () => {
		const b = bench();
		await b.verify({ "src/counter.js": BOUNDED });
		const imported = await b.verify({ "spec/Bornes.tla": BORNES.replace("Plafond == 3", "Plafond == 4") });
		assert.equal(b.explorations(), 2, "a module the model imports changed: explored again");
		assert.match(String(imported.facts.rerun_because), /no earlier exploration read the same model/);
		await b.verify({ "src/counter.js": DIVERGENT }, { ...ENVIRONMENT, digest: digestValue({ formal: 2 }) });
		assert.equal(b.explorations(), 3, "another environment: explored again");
		writeFileSync(b.jar, "another tla2tools.jar at the same path\n");
		await b.verify({ "src/counter.js": `${BOUNDED}// tool\n` });
		assert.equal(b.explorations(), 4, "another jar at the same path: explored again");
		const javaHome = process.env.JAVA_HOME;
		try {
			process.env.JAVA_HOME = "/opt/jdk-21";
			await b.verify({ "src/counter.js": `${BOUNDED}// jdk 21\n` });
			await b.verify({ "src/counter.js": `${BOUNDED}// jdk 21 again\n` });
			assert.equal(b.explorations(), 5, "the same variables: cited");
			process.env.JAVA_HOME = "/opt/jdk-17";
			await b.verify({ "src/counter.js": `${BOUNDED}// jdk 17\n` });
			assert.equal(b.explorations(), 6, "a variable the control passes to TLC changed: explored again");
		} finally {
			if (javaHome === undefined) delete process.env.JAVA_HOME;
			else process.env.JAVA_HOME = javaHome;
		}

		const unknown = bench(MODEL.replace("Bornes", "Inconnu"), {});
		await unknown.verify({ "src/counter.js": BOUNDED });
		const again = await unknown.verify({ "src/counter.js": DIVERGENT });
		assert.equal(unknown.explorations(), 2, "a module neither in the tree nor shipped by TLC forbids reuse");
		assert.equal(again.facts.reused_from, undefined);
		assert.match(String(again.facts.rerun_because), /inputs not identified: spec\/Inconnu\.tla/);

		const hanging = bench();
		const interrupted = await hanging.verify({ ".495-hang": "" });
		assert.equal(interrupted.verdict, "INDETERMINATE", "the exploration is interrupted by its budget");
		const after = await hanging.verify({ "src/counter.js": BOUNDED });
		assert.equal(hanging.explorations(), 2, "an interrupted exploration is not reused");
		assert.equal(after.verdict, "PASS");
		assert.match(String(after.facts.rerun_because), /ended INDETERMINATE, which concludes nothing/);
	});

	it("a module at the root of the copy, where TLC looks before the model's directory, has the model explored again", async () => {
		const b = bench();
		await b.verify({ "src/counter.js": BOUNDED });
		const shadowed = await b.verify({ "Bornes.tla": BORNES.replace("Plafond == 3", "Plafond == 5") });
		assert.equal(b.explorations(), 2, "a Bornes.tla TLC reads in place of spec/Bornes.tla changes the key");
		assert.equal(shadowed.facts.reused_from, undefined, "nothing cites the exploration of spec/Bornes.tla");
		await b.verify({ "Naturals.tla": "---- MODULE Naturals ----\nNat == {0, 1}\n====\n" });
		assert.equal(b.explorations(), 3, "a file at the root named after a module TLC ships changes the key");
	});
});

/** Sealed explorations of one key under one protocol revision, and the context a lookup runs in. */
function sealedExplorations() {
	const control = formalControl(counterPackage(tlcStandIn()));
	const inputs = {
		"spec/Compteur.cfg": digestBytes(CONFIG),
		"spec/Compteur.tla": digestBytes(MODEL),
		"spec/Bornes.tla": digestBytes(BORNES),
	};
	const key = digestValue({ read: inputs });
	const protocol = { protocol_id: "prt_1", revision: 1, content_digest: digestValue("prt_1") };
	/** A sealed, conclusive exploration of that key, in which TLC reports processing `modules`. */
	const explored = (modules: string[], over: Partial<Evidence> = {}): Evidence => {
		const evidence: Evidence = {
			evidence_id: "evd_1",
			requirement_refs: [],
			control_id: control.control_id,
			control_version: control.version,
			subject: { kind: "candidate", id: "cnd_1", revision: 1, digest: digestValue("cnd_1") },
			protocol_revision: protocol,
			environment_digest: ENVIRONMENT.digest,
			inputs_digest: key,
			started_at: AT,
			ended_at: AT,
			verdict: "PASS",
			facts: { run: "candidate", tlc: { modules } },
			findings: [],
			artifacts: [],
			limits: { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] },
			baseline: null,
			producer: EXECUTOR_ACTOR,
			integrity: { content_digest: "", chained_to: null },
			...over,
		};
		evidence.integrity.content_digest = evidenceDigest(evidence);
		return evidence;
	};
	const context = {
		environment_digest: ENVIRONMENT.digest,
		protocol,
		objects: new CasObjectStore(join(outputDir("formal-reuse-", roots), "objects")),
	};
	return { control, inputs, key, protocol, explored, context };
}

describe("an exploration that read a module its identity does not cover is never cited", () => {
	it("a module TLC reports it processed outside the closure read has the model explored again", async () => {
		const { control, inputs, key, explored, context } = sealedExplorations();

		const covered = await establishedExploration(
			[explored(["Naturals", "Bornes", "Compteur"])],
			control,
			inputs,
			key,
			context,
		);
		assert.ok("original" in covered, "an exploration whose every processed module was read is cited");
		const missed = await establishedExploration(
			[explored(["Naturals", "Bornes", "Cache", "Compteur"])],
			control,
			inputs,
			key,
			context,
		);
		assert.ok("rerun_because" in missed, "a module read outside the closure forbids the citation");
		assert.match(missed.rerun_because, /Cache/, "the reason names the module the identity missed");

		const tool = "/opt/java/bin/java";
		const named = await establishedExploration(
			[explored(["Naturals", "Bornes", "java", "Compteur"])],
			control,
			{ ...inputs, [tool]: digestBytes("java 21") },
			key,
			context,
		);
		assert.ok("rerun_because" in named, "a module named like a tool the exploration ran is no module it read");
		assert.match(named.rerun_because, /java/);
	});

	it("only the sealed execution of the same protocol revision is cited, never a citation nor an altered record", async () => {
		const { control, inputs, key, protocol, explored, context } = sealedExplorations();
		const modules = ["Naturals", "Bornes", "Compteur"];
		const lookup = (evidence: Evidence[]) => establishedExploration(evidence, control, inputs, key, context);

		const execution = explored(modules);
		const citation = explored(modules, {
			evidence_id: "evd_2",
			facts: { run: "reused", reused_from: "evd_1", tlc: { modules } },
		});
		const found = await lookup([execution, citation]);
		assert.equal("original" in found && found.original.evidence_id, "evd_1", "the citation names the execution");
		const alone = await lookup([citation]);
		assert.ok("rerun_because" in alone, "a citation alone is no proof to cite");

		const otherProtocol = { ...protocol, protocol_id: "prt_0" };
		assert.ok("rerun_because" in (await lookup([explored(modules, { protocol_revision: otherProtocol })])));
		const otherRevision = { ...protocol, revision: 2 };
		assert.ok(
			"rerun_because" in (await lookup([explored(modules, { protocol_revision: otherRevision })])),
			"an exploration a revision of the protocol invalidated is not cited",
		);

		const altered = { ...execution, verdict: "FAIL" as const };
		const refused = await lookup([altered]);
		assert.ok("rerun_because" in refused, "a record altered after it was sealed is not cited");
		assert.match(refused.rerun_because, /the record of evd_1 is altered/);
	});

	it("a module TLC processed is covered by a module file of the closure, never by a tool or a variable of its name", () => {
		const inputs = { "spec/Compteur.tla": "d1", "Bornes.tla": "d2", "/opt/java/bin/java": "d3", "env:Cache": "d4" };
		const processed = ["Naturals", "Bornes", "Compteur", "Cache", "java"];
		assert.deepEqual(uncoveredModules(processed, inputs), ["Cache", "java"], "a shipped module is covered by the jar");
	});

	it("a file of the model's directory named after a module TLC ships enters the identity, imported or not", async () => {
		const root = outputDir("formal-reuse-", roots);
		writeFiles(root, { "spec/Compteur.tla": COMPTEUR, "spec/Compteur.cfg": CONFIG, "spec/TLC.tla": BORNES });
		const reads = { model: "spec/Compteur.tla", config: "spec/Compteur.cfg", cwd: ".", tools: [], env_allowlist: [] };
		const inputs = await formalInputsOf(reads, root);
		assert.equal(inputs["spec/TLC.tla"], digestBytes(BORNES), "TLC reads it before the module its jar ships");
	});

	it("a module found where TLC runs and absent from the model's directory is identified, so the model can be cited", async () => {
		const root = outputDir("formal-reuse-", roots);
		writeFiles(root, { "spec/Compteur.tla": MODEL, "spec/Compteur.cfg": CONFIG, "Bornes.tla": BORNES });
		const reads = { model: "spec/Compteur.tla", config: "spec/Compteur.cfg", cwd: ".", tools: [], env_allowlist: [] };
		const inputs = await formalInputsOf(reads, root);
		assert.equal(inputs["Bornes.tla"], digestBytes(BORNES), "TLC reads Bornes where it runs");
		assert.deepEqual(
			Object.keys(inputs).filter((name) => inputs[name] === null),
			[],
			"the model's directory, where TLC never had to look for Bornes, leaves nothing unidentified",
		);
	});
});
