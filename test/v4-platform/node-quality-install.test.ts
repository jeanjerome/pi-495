/**
 * The ESLint and jscpd referential installed for real by npm, through the path an adoption takes: what
 * the install leaves in the copy is accepted when npm pruned packages the lock did not name, each
 * installed file becomes a complement with the mode the install gave it, and the copies written from
 * those complements, as the verification writes them, run both controls with jscpd's native binary
 * executable.
 */
import { strict as assert } from "node:assert";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { DEFAULT_WORKSPACE_POLICY, GitWorkspace } from "../../src/adapters/workspace/git-workspace.ts";
import { openWorkspaceWithComplements } from "../../src/application/complement.ts";
import { installInCopy, runInstall } from "../../src/application/installation.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import { detectStack } from "../../src/application/target.ts";
import type { ControlDefinition, PackageInstall } from "../../src/contracts/v1/protocol.ts";
import { invocationBase } from "../helpers/execution-fixture.ts";
import { outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import {
	CHECKSUM_A,
	CHECKSUM_B,
	NODE_GRADER,
	NODE_QUALITY_SOURCES,
	nodeLineOf,
	TREE_CONFIGURATION,
} from "../helpers/node-quality-survey.ts";

const REFS = [{ requirement_id: "QLT-01", revision: 1 }];

const BASE = invocationBase();

/** The native binary jscpd 5.4.0 runs, from the package npm installs for the platform. */
const JSCPD_BINARY = /^node_modules\/jscpd-[^/]+\/bin\/jscpd$/;

const MANIFEST = { name: "graded", version: "1.0.0", type: "module" };
/** The lock npm writes for a project that depends on nothing. */
const LOCK = { name: "graded", version: "1.0.0", lockfileVersion: 3, requires: true, packages: { "": MANIFEST } };

const executable = (path: string): boolean => (statSync(path).mode & 0o111) !== 0;

/**
 * A Node project locked by npm, with `extra` written into it, and the copy the referential its adapter
 * offers was installed into by a real npm, as the adoption installs it.
 */
async function installedReferential(root: string, extra: Record<string, string>) {
	const project = join(root, "project");
	writeFiles(project, {
		"package.json": `${JSON.stringify(MANIFEST, null, 2)}\n`,
		"package-lock.json": `${JSON.stringify(LOCK, null, 2)}\n`,
		...NODE_QUALITY_SOURCES,
		...extra,
	});
	const offer = detectStack(project, REFS).quality_referential;
	if (offer?.kind !== "proposed") throw new Error("a Node project without ESLint nor jscpd is offered the referential");
	const installs = offer.recommendations.flatMap((r): PackageInstall[] => (r.install ? [r.install] : []));
	const sandbox = selectSandbox({ allow_unconfined: process.platform !== "darwin" });
	const workspace = new GitWorkspace(join(root, "workspaces"));
	const reference = await workspace.captureReference(project, DEFAULT_WORKSPACE_POLICY);
	const copy = await workspace.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
	const installed = await installInCopy(
		{
			workspace,
			workspacePolicy: DEFAULT_WORKSPACE_POLICY,
			install: (copyPath, command, outside) => runInstall(sandbox.backend, copyPath, command, outside),
			localRepository: async () => null,
		},
		copy.path,
		installs,
		reference.entries.filter((e) => e.kind === "file").map((e) => e.path),
	);
	return { sandbox, workspace, reference, copy: copy.path, installed };
}

describe("the ESLint and jscpd referential installed for real by npm", () => {
	const cleanups = removedAfterEach();

	it("une vraie installation d'eslint 10.12.0 et de jscpd 5.4.0 dans la copie d'un projet dont le node_modules porte deux paquets absents du verrou est acceptée : npm les élague et les fichiers installés deviennent les compléments, chacun avec son mode", async () => {
		const root = outputDir("node-quality-install-", cleanups);
		const { copy, installed } = await installedReferential(root, TREE_CONFIGURATION);
		assert.equal(installed.kind, "installed", installed.kind === "failed" ? installed.reason : "");
		if (installed.kind !== "installed") return;
		for (const pruned of ["node_modules/p1/index.js", "node_modules/p2/index.js"])
			assert.throws(() => statSync(join(copy, pruned)), `npm pruned ${pruned}, which the lock did not name`);
		const paths = installed.files.map((f) => f.path);
		assert.ok(paths.includes("node_modules/eslint/bin/eslint.js"), "eslint is among the complements");
		assert.ok(paths.includes("node_modules/jscpd/run-jscpd.js"), "jscpd is among the complements");
		for (const file of installed.files)
			assert.equal(
				file.mode,
				(statSync(join(copy, file.path)).mode & 0o777).toString(8).padStart(6, "0"),
				`${file.path} keeps the mode the install gave it`,
			);
		const binary = installed.files.find((f) => JSCPD_BINARY.test(f.path));
		assert.ok(binary, `jscpd's native binary is among the complements: ${paths.filter((p) => p.includes("jscpd"))}`);
		assert.ok(executable(join(copy, binary.path)), "npm left jscpd's native binary executable");
	});

	it("sur un projet sans paquet hors du verrou, dans les copies écrites depuis les compléments d'une vraie installation, le binaire natif de jscpd est exécutable, eslint et jscpd sont qualifiés par leurs témoins, et la passe de référence rapporte la complexité 21 et la duplication entre les deux fichiers TypeScript", async () => {
		const root = outputDir("node-quality-copies-", cleanups);
		const { sandbox, workspace, reference, copy, installed } = await installedReferential(root, {});
		assert.equal(installed.kind, "installed", installed.kind === "failed" ? installed.reason : "");
		if (installed.kind !== "installed") return;
		const objects = new CasObjectStore(join(root, "objects"));
		for (const file of installed.files)
			await objects.put(new Uint8Array(readFileSync(join(copy, file.path))), "application/octet-stream");
		const complements = installed.files.map((f) => ({ ...f, test_type: "quality", tool: "eslint, jscpd" }));
		const binary = complements.find((c) => JSCPD_BINARY.test(c.path));
		assert.ok(binary, "jscpd's native binary is among the complements");
		const deps = { workspace, workspacePolicy: DEFAULT_WORKSPACE_POLICY, objects };
		const written = async (files: Record<string, string>): Promise<string> => {
			const handle = await openWorkspaceWithComplements(deps, reference, complements);
			writeFiles(handle.path, files);
			return handle.path;
		};

		const detection = detectStack(copy, REFS, process.execPath, installed.packages);
		const runner = new GenericControlRunner(sandbox.backend, objects);
		const controls: Record<string, ControlDefinition> = {};
		for (const id of ["eslint", "jscpd"]) {
			const control = detection.controls.find((c) => c.control_id === id);
			const own = detection.own_negative_witness[id];
			assert.ok(control && own, `the copy where ${id} was installed gets the control and its own witness`);
			controls[id] = control;
			const positive = await written(detection.positive_witness);
			const negative = await written({ ...detection.positive_witness, ...own });
			for (const path of [positive, negative])
				assert.ok(executable(join(path, binary.path)), `jscpd's native binary is executable in ${path}`);
			const q = await qualifyControl(
				runner,
				control,
				{
					positive_path: positive,
					negative_path: negative,
					positive_files: detection.positive_witness,
					negative_files: { ...detection.positive_witness, ...own },
				},
				BASE,
			);
			assert.deepEqual(
				[q.positive, q.negative, q.incident, q.qualified],
				["PASS", "FAIL", "INDETERMINATE", true],
				`${id}: ${JSON.stringify(q.notes)}`,
			);
		}

		const onReference = await written({});
		assert.ok(executable(join(onReference, binary.path)), "jscpd's native binary is executable in the reference copy");
		const run = async (id: string) =>
			(await runner.runControl({ ...BASE, control: controls[id]!, workspace_path: onReference })).evidence;
		const eslint = await run("eslint");
		assert.equal(eslint.verdict, "FAIL", eslint.limits.notes.join("; "));
		const located = eslint.findings.map((f) => `${f.rule_id} ${f.path}:${f.region?.start_line}`);
		assert.ok(
			located.includes(`complexity ${NODE_GRADER}:${nodeLineOf("export function grade(")}`),
			`the function of complexity 21 is reported where it sits: ${located.join(", ")}`,
		);
		const jscpd = await run("jscpd");
		assert.equal(jscpd.verdict, "FAIL", jscpd.limits.notes.join("; "));
		assert.equal(jscpd.findings.length, 1, jscpd.findings.map((f) => f.message).join("\n"));
		const message = jscpd.findings[0]!.message;
		for (const place of [`${CHECKSUM_A}:`, `${CHECKSUM_B}:`])
			assert.ok(message.includes(place), `the duplication names ${place}: ${message}`);
	});
});
