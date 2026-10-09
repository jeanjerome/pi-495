import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import type { EvidenceCandidate } from "../../src/contracts/v1/evidence.ts";
import type { SandboxPort } from "../../src/ports/execution.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { ReplayedSandbox } from "../helpers/replayed-sandbox.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

const COMPTEUR = `---- MODULE Compteur ----
EXTENDS Naturals
CONSTANT Max
VARIABLE x
Init == x = 0
Next == x < Max /\\ x' = x + 1
Borne == x <= Max
====
`;
const CONFIG = "CONSTANT Max = 3\nINIT Init\nNEXT Next\nINVARIANT Borne\n";
const TLC_ARGUMENTS = ["-cp", "tla2tools.jar", "tlc2.TLC", "-tool", "-config", "Compteur.cfg", "Compteur.tla"];

/** What a French-speaking Java 25 prints when the class path holds no TLC, measured with `-cp /nonexistent/tla2tools.jar`. */
const NO_TLC_ON_THE_CLASS_PATH =
	"Erreur : impossible de trouver ou de charger la classe principale tlc2.TLC\nCausé par : java.lang.ClassNotFoundException: tlc2.TLC\n";

/** A process that prints TLC's version and its start, then explores for a minute. */
const EXPLORES_FOR_A_MINUTE = [
	"-e",
	[
		'console.log("@!@!@STARTMSG 2262:0 @!@!@\\nTLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)\\n@!@!@ENDMSG 2262 @!@!@");',
		'console.log("@!@!@STARTMSG 2187:0 @!@!@\\nRunning breadth-first search Model-Checking\\n@!@!@ENDMSG 2187 @!@!@");',
		"setTimeout(() => {}, 60000);",
	].join("\n"),
];

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("tlc-execution-", cleanups);
});

interface TlcFacts {
	outcome: string;
	properties: { verified: boolean }[];
	counterexample: unknown;
	reasons: string[];
}

async function runTlc(
	sandbox: SandboxPort,
	command: string[],
	timeout_ms = 30000,
): Promise<{ evidence: EvidenceCandidate; tlc: TlcFacts | undefined }> {
	const ws = join(root, "ws");
	writeFiles(ws, { "Compteur.tla": COMPTEUR, "Compteur.cfg": CONFIG });
	const runner = new GenericControlRunner(sandbox, new CasObjectStore(join(root, "objects")), READERS_OF_495);
	const control = controlOf({ control_id: "tlc-compteur", command, parser: "tlc", timeout_ms });
	const { evidence } = await runner.runControl({ ...invocationBase(), control, workspace_path: ws });
	return { evidence, tlc: evidence.facts.tlc as TlcFacts | undefined };
}

/** Neither the PASS of a completed exploration nor the FAIL of a violated rule of the model. */
function assertNeitherSuccessNorViolation(evidence: EvidenceCandidate, tlc: TlcFacts | undefined): void {
	assert.notEqual(evidence.verdict, "PASS", "not a success");
	assert.notEqual(evidence.verdict, "FAIL", "not a violation of a rule of the model");
	assert.deepEqual(evidence.findings, [], "no finding stands for a violated rule");
	assert.equal(tlc?.counterexample, null, "no counterexample");
	assert.ok(
		tlc?.properties.every((p) => !p.verified),
		"no property is verified",
	);
}

describe("a TLC run that cannot explore", () => {
	describe("an absent tool or a timeout is neither a success nor a violation of a business rule", () => {
		it("an absent Java runtime is an error naming the missing capability", async () => {
			const { evidence, tlc } = await runTlc(new UnconfinedSandbox(), [
				join(root, "absent", "bin", "java"),
				...TLC_ARGUMENTS,
			]);
			assertNeitherSuccessNorViolation(evidence, tlc);
			assert.equal(tlc?.outcome, "error");
			assert.match(tlc.reasons[0] ?? "", /^capability missing: no Java runtime at .*absent\/bin\/java/);
		});

		it("a class path without TLC is an error naming the missing capability, not an unreadable output", async () => {
			const sandbox = new ReplayedSandbox("", {
				exit_code: 1,
				stderr: new TextEncoder().encode(NO_TLC_ON_THE_CLASS_PATH),
			});
			const { evidence, tlc } = await runTlc(sandbox, ["java", ...TLC_ARGUMENTS]);
			assertNeitherSuccessNorViolation(evidence, tlc);
			assert.equal(tlc?.outcome, "error");
			assert.match(tlc.reasons[0] ?? "", /^capability missing: the class path tla2tools\.jar holds no tlc2\.TLC/);
		});

		it("an exploration stopped at its timeout is inconclusive", async () => {
			const { evidence, tlc } = await runTlc(
				new UnconfinedSandbox(),
				[process.execPath, ...EXPLORES_FOR_A_MINUTE, "--", "-config", "Compteur.cfg", "Compteur.tla"],
				500,
			);
			assertNeitherSuccessNorViolation(evidence, tlc);
			assert.equal(tlc?.outcome, "inconclusive");
			assert.match(tlc.reasons[0] ?? "", /timeout/);
		});
	});

	describe("the development control of an approved model", () => {
		const CHECK_FORMAL = join(import.meta.dirname, "..", "..", "scripts", "check-formal.ts");
		const FAKE_JAR = "not the TLC jar\n";
		const COMPLETED = readFileSync(
			join(import.meta.dirname, "..", "fixtures", "tlc", "tlc-2.19-completed.out"),
			"utf8",
		);
		const sha256 = (text: string): string => `sha256:${createHash("sha256").update(text).digest("hex")}`;

		/** A model pinned by its manifest, a jar the manifest approves, and a `java` that runs `script`. */
		function approvedModel({
			timeout_ms = 30000,
			max_output_bytes = 1048576,
			heap_mb = 256,
			required_properties = ["Borne"],
			script = EXPLORES_FOR_A_MINUTE[1],
		}: {
			timeout_ms?: number;
			max_output_bytes?: number;
			heap_mb?: number;
			required_properties?: string[];
			script?: string;
		} = {}): {
			manifest: string;
			jar: string;
			java: string;
		} {
			const dir = join(root, "model");
			const java = join(root, "bin", "java");
			writeFiles(root, {
				"model/Compteur.tla": COMPTEUR,
				"model/Compteur.cfg": CONFIG,
				"model/manifest.json": JSON.stringify({
					model: "Compteur.tla",
					config: "Compteur.cfg",
					files: { "Compteur.tla": sha256(COMPTEUR), "Compteur.cfg": sha256(CONFIG) },
					required_properties,
					tool: { name: "TLC", version: "2.19 of 08 August 2024 (rev: 5a47802)", jar_sha256: sha256(FAKE_JAR) },
					budget: { timeout_ms, max_output_bytes, workers: 1, heap_mb },
				}),
				"tla2tools.jar": FAKE_JAR,
				"bin/java": `#!${process.execPath}\n${script}\n`,
			});
			chmodSync(java, 0o755);
			return { manifest: join(dir, "manifest.json"), jar: join(root, "tla2tools.jar"), java };
		}

		/** A `java` that records where it ran and with which arguments, creates TLC's metadir there, and prints a completed exploration. */
		function recordsItsRunAndCompletes(ran: string): string {
			return [
				'const fs = process.getBuiltinModule("node:fs");',
				'fs.mkdirSync("states");',
				`fs.writeFileSync(${JSON.stringify(ran)}, JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2) }));`,
				`process.stdout.write(${JSON.stringify(COMPLETED)});`,
			].join("\n");
		}

		function checkFormal(...args: string[]): { status: number | null; stdout: string } {
			const run = spawnSync(process.execPath, [CHECK_FORMAL, ...args, "--store", join(root, "store")], {
				encoding: "utf8",
			});
			return { status: run.status, stdout: run.stdout + run.stderr };
		}

		it("an absent jar is an error that says which jar to name, and nothing runs", () => {
			const { manifest, java } = approvedModel();
			const { status, stdout } = checkFormal(manifest, "--jar", join(root, "absent.jar"), "--java", java);
			assert.equal(status, 3, stdout);
			assert.match(stdout, /error — not PASS/);
			assert.match(
				stdout,
				/capability missing: no tla2tools\.jar at .*absent\.jar: pass --jar <path> to the jar of TLC 2\.19/,
			);
			assert.doesNotMatch(stdout, /raw stdout/, "TLC did not run");
		});

		it("a jar other than the approved one is an error naming both digests, and nothing runs", () => {
			const { manifest, jar, java } = approvedModel();
			writeFiles(root, { "tla2tools.jar": "another tla2tools.jar\n" });
			const { status, stdout } = checkFormal(manifest, "--jar", jar, "--java", java);
			assert.equal(status, 3, stdout);
			assert.match(stdout, /error — not PASS/);
			assert.match(
				stdout,
				new RegExp(
					`capability missing: the jar at .*tla2tools\\.jar is ${sha256("another tla2tools.jar\n")}, not the approved TLC 2\\.19 .*, ${sha256(FAKE_JAR)}`,
				),
			);
			assert.doesNotMatch(stdout, /raw stdout/, "TLC did not run");
		});

		it("a model that differs from the approved one is an error, and nothing runs", () => {
			const { manifest, jar, java } = approvedModel();
			writeFiles(root, { "model/Compteur.cfg": "CONSTANT Max = 3\nINIT Init\nNEXT Next\n" });
			const { status, stdout } = checkFormal(manifest, "--jar", jar, "--java", java);
			assert.equal(status, 3, stdout);
			assert.match(stdout, /the model is not the approved one: Compteur\.cfg is sha256:\w+, the manifest approves/);
			assert.doesNotMatch(stdout, /raw stdout/, "TLC did not run");
		});

		it("a manifest that names no required property is an error naming the field to provide, and nothing runs", () => {
			const { manifest, jar, java } = approvedModel({ required_properties: [] });
			const { status, stdout } = checkFormal(manifest, "--jar", jar, "--java", java);
			assert.equal(status, 3, stdout);
			assert.match(stdout, /the manifest does not hold: required_properties: .* at least one/);
			assert.doesNotMatch(stdout, /raw stdout/, "TLC did not run");
		});

		it("a completed exploration whose configuration leaves a required property out is an error, not PASS", () => {
			const { manifest, jar, java } = approvedModel({
				required_properties: ["Borne", "Termine"],
				script: `process.stdout.write(${JSON.stringify(COMPLETED)});`,
			});
			const { status, stdout } = checkFormal(manifest, "--jar", jar, "--java", java);
			assert.equal(status, 3, stdout);
			assert.match(stdout, /error — not PASS/);
			assert.match(stdout, /the configuration does not activate the required Termine/);
		});

		it("TLC runs in a disposable copy of the model, removed after the run, and writes nothing beside the approved model", () => {
			const ran = join(root, "ran.json");
			const { manifest, jar, java } = approvedModel({ script: recordsItsRunAndCompletes(ran) });
			const { status, stdout } = checkFormal(manifest, "--jar", jar, "--java", java);
			assert.equal(status, 0, stdout);
			const { cwd, argv } = JSON.parse(readFileSync(ran, "utf8")) as { cwd: string; argv: string[] };
			assert.deepEqual(
				readdirSync(join(root, "model")).sort(),
				["Compteur.cfg", "Compteur.tla", "manifest.json"],
				"the metadir of TLC is not written beside the approved model",
			);
			assert.ok(
				argv.some((a) => a.startsWith("-Djava.io.tmpdir=") && a.endsWith(join(basename(cwd), "tmp"))),
				`the standard modules TLC extracts stay in the copy: ${argv.join(" ")}`,
			);
			assert.equal(existsSync(cwd), false, `the copy ${cwd} is removed after the run`);
		});

		it("TLC runs with the heap of the manifest, and an output past the bound of the manifest is inconclusive", () => {
			const ran = join(root, "ran.json");
			const { manifest, jar, java } = approvedModel({
				max_output_bytes: 512,
				heap_mb: 300,
				script: recordsItsRunAndCompletes(ran),
			});
			const { status, stdout } = checkFormal(manifest, "--jar", jar, "--java", java);
			assert.equal(status, 2, stdout);
			assert.match(stdout, /inconclusive — not PASS/);
			assert.match(stdout, /the output was cut at its bound/);
			const { argv } = JSON.parse(readFileSync(ran, "utf8")) as { argv: string[] };
			assert.ok(argv.includes("-Xmx300m"), `the heap of the manifest bounds the JVM: ${argv.join(" ")}`);
		});

		it("a run whose output cannot be read for want of its configuration is an error, not PASS", () => {
			const { manifest, jar, java } = approvedModel({
				script: [
					'process.getBuiltinModule("node:fs").rmSync("Compteur.cfg");',
					`process.stdout.write(${JSON.stringify(COMPLETED)});`,
				].join("\n"),
			});
			const { status, stdout } = checkFormal(manifest, "--jar", jar, "--java", java);
			assert.equal(status, 3, stdout);
			assert.match(stdout, /error — not PASS/);
			assert.match(stdout, /the TLC configuration .*Compteur\.cfg cannot be read/);
		});

		it("a run stopped at the budget of the manifest is inconclusive, and its raw output is kept", () => {
			const { manifest, jar, java } = approvedModel({ timeout_ms: 1000 });
			const { status, stdout } = checkFormal(manifest, "--jar", jar, "--java", java);
			assert.equal(status, 2, stdout);
			assert.match(stdout, /inconclusive — not PASS/);
			assert.match(stdout, /the run was interrupted: timeout/);
			assert.match(stdout, /raw stdout: sha256:/);
			assert.match(stdout, /report: sha256:/);
		});
	});
});
