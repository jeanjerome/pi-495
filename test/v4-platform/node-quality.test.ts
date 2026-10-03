/**
 * ESLint and jscpd on a real Node project, through the generic runner and the platform sandbox: each is
 * qualified by its own witnesses although the project already violates the referential, the pass on the
 * reference reports the project's violations where they sit, and no file of the analysed tree changes
 * the rules or the thresholds they apply.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { qualifyControl } from "../../src/application/qualification.ts";
import { detectStack } from "../../src/application/target.ts";
import type { ControlDefinition, InstalledPackage } from "../../src/contracts/v1/protocol.ts";
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

/**
 * A copy of a Node project in which the referential's offer was installed, as an adoption installs it:
 * each recommended package at its exact version, without install scripts. The install, the one step that
 * opens the network, runs once outside the sandbox.
 */
function adoptedCopy(root: string, extra: Record<string, string> = {}): string {
	const project = join(root, "project");
	writeFiles(project, {
		"package.json": `${JSON.stringify({ name: "graded", version: "1.0.0", type: "module" }, null, 2)}\n`,
		...NODE_QUALITY_SOURCES,
	});
	const offer = detectStack(project, REFS).quality_referential;
	assert.equal(offer?.kind, "proposed", "a Node project without ESLint nor jscpd is offered the referential");
	if (offer?.kind !== "proposed") throw new Error("no referential is proposed");
	const reference = join(root, "reference");
	cpSync(project, reference, { recursive: true });
	const packages = offer.recommendations.flatMap((r) =>
		r.install ? [`${r.install.package}@${r.install.version}`] : [],
	);
	execFileSync(
		"npm",
		["install", "--save-dev", "--save-exact", "--ignore-scripts", "--no-audit", "--no-fund", ...packages],
		{ cwd: reference, stdio: "ignore", timeout: 10 * 60_000 },
	);
	writeFiles(reference, extra);
	return reference;
}

/** The analysers npm added to the copy, as its lock names them: what the adopted install tells the detection that follows. */
function lockedAnalysers(reference: string): InstalledPackage[] {
	const lock = JSON.parse(readFileSync(join(reference, "package-lock.json"), "utf8")) as {
		packages: Record<string, { version: string; integrity: string }>;
	};
	return ["eslint", "jscpd"].flatMap((name) => {
		const entry = lock.packages[`node_modules/${name}`];
		return entry ? [{ name, version: entry.version, integrity: entry.integrity }] : [];
	});
}

function qualityControls(reference: string): {
	eslint: ControlDefinition;
	jscpd: ControlDefinition;
	detection: ReturnType<typeof detectStack>;
} {
	const detection = detectStack(reference, REFS, process.execPath, lockedAnalysers(reference));
	const eslint = detection.controls.find((c) => c.control_id === "eslint");
	const jscpd = detection.controls.find((c) => c.control_id === "jscpd");
	assert.ok(
		eslint && jscpd,
		`the copy where eslint and jscpd were installed gets both controls: ${detection.controls.map((c) => c.control_id)}`,
	);
	return { eslint, jscpd, detection };
}

function runnerFor(root: string): GenericControlRunner {
	const sandbox = selectSandbox({ allow_unconfined: process.platform !== "darwin" });
	return new GenericControlRunner(sandbox.backend, new CasObjectStore(join(root, "objects")));
}

async function referencePasses(root: string, reference: string, eslint: ControlDefinition, jscpd: ControlDefinition) {
	const runner = runnerFor(root);
	const onReference = async (control: ControlDefinition) =>
		(await runner.runControl({ ...BASE, control, workspace_path: reference })).evidence;
	return { eslint: await onReference(eslint), jscpd: await onReference(jscpd) };
}

describe("ESLint and jscpd on a Node project that already violates the referential", () => {
	const cleanups = removedAfterEach();

	it("sur un projet Node dont une fonction a une complexité de 21 et dont deux fichiers TypeScript dupliquent un bloc, eslint et jscpd sont qualifiés par leurs témoins et la passe de référence rapporte la complexité et la duplication à leur place", async () => {
		const root = outputDir("node-quality-", cleanups);
		const reference = adoptedCopy(root);
		const { eslint, jscpd, detection } = qualityControls(reference);
		for (const control of [eslint, jscpd])
			assert.equal(control.network, "denied", `${control.control_id} runs with the network closed`);
		assert.deepEqual(
			[...detection.lint_control_ids].sort(),
			["eslint", "jscpd"],
			"both are the quality controls of the target",
		);

		const runner = runnerFor(root);
		for (const control of [eslint, jscpd]) {
			const own = detection.own_negative_witness[control.control_id];
			assert.ok(own, `${control.control_id} has a negative witness of its own`);
			const positive = join(root, `${control.control_id}-positive`);
			const negative = join(root, `${control.control_id}-negative`);
			for (const workspace of [positive, negative]) {
				cpSync(reference, workspace, { recursive: true });
				writeFiles(workspace, detection.positive_witness);
			}
			writeFiles(negative, own);
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
				`${control.control_id}: ${JSON.stringify(q.notes)}`,
			);
		}

		const passes = await referencePasses(root, reference, eslint, jscpd);
		assert.equal(passes.eslint.verdict, "FAIL", passes.eslint.limits.notes.join("; "));
		const located = passes.eslint.findings.map((f) => `${f.rule_id} ${f.path}:${f.region?.start_line}`);
		assert.deepEqual(
			located.sort(),
			[
				`complexity ${NODE_GRADER}:${nodeLineOf("export function grade(")}`,
				`no-unused-private-class-members ${NODE_GRADER}:${nodeLineOf("#unread")}`,
				`no-unused-vars ${NODE_GRADER}:${nodeLineOf("function neverCalled(")}`,
			],
			"each violation where it sits",
		);
		assert.equal(passes.jscpd.verdict, "FAIL", passes.jscpd.limits.notes.join("; "));
		assert.equal(passes.jscpd.findings.length, 1, passes.jscpd.findings.map((f) => f.message).join("\n"));
		const message = passes.jscpd.findings[0]!.message;
		for (const place of [`${CHECKSUM_A}:`, `${CHECKSUM_B}:`])
			assert.ok(message.includes(place), `${place} is named: ${message}`);
	});

	it("un eslint.config.js qui désactive complexity, un .jscpd.json qui porte minTokens à 5000 et un bloc dupliqué sous node_modules ne changent rien aux constats de la passe de référence, dont aucun ne nomme node_modules", async () => {
		const root = outputDir("node-quality-tree-", cleanups);
		const reference = adoptedCopy(root, TREE_CONFIGURATION);
		const { eslint, jscpd } = qualityControls(reference);
		const passes = await referencePasses(root, reference, eslint, jscpd);
		const located = passes.eslint.findings.map((f) => `${f.rule_id} ${f.path}:${f.region?.start_line}`);
		assert.ok(
			located.includes(`complexity ${NODE_GRADER}:${nodeLineOf("export function grade(")}`),
			`the function of complexity 21 is still reported: ${located.join(", ")} ${passes.eslint.limits.notes.join("; ")}`,
		);
		assert.equal(passes.jscpd.findings.length, 1, passes.jscpd.findings.map((f) => f.message).join("\n"));
		const message = passes.jscpd.findings[0]!.message;
		for (const place of [`${CHECKSUM_A}:`, `${CHECKSUM_B}:`])
			assert.ok(
				message.includes(place),
				`the duplication between the two TypeScript files is still reported: ${message}`,
			);
		for (const finding of [...passes.eslint.findings, ...passes.jscpd.findings])
			assert.ok(!finding.message.includes("node_modules"), `no finding names node_modules: ${finding.message}`);
	});
});
