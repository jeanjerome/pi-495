import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import type { StackPlugin } from "../../src/application/stacks/plugin.ts";
import type { ReportReader } from "../../src/ports/execution.ts";
import { judgeTechnology } from "../../src/adapters/stacks/conformance.ts";
import { declaredSandbox } from "../helpers/declared-sandbox.ts";
import { FICT_PLUGIN, linesReader } from "../../examples/fictitious-technology/fict.ts";
import { greetingProject } from "../helpers/fictitious-technology.ts";
import { removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";

/**
 * The report of `technology` on `projects`, its commands run by the unconfined backend declared qualified: the
 * judgement `stackConformance` makes under the sandbox of the platform, without nesting a sandbox.
 */
function judged(technology: StackPlugin<true>, projects: string[]) {
	return judgeTechnology(technology, projects, declaredSandbox(true));
}

/** The fictitious technology whose negative witness leaves the greeting as the positive one wrote it. */
const PASSING_NEGATIVE: StackPlugin<true> = {
	...FICT_PLUGIN,
	capabilities: {
		...FICT_PLUGIN.capabilities,
		tests: { ...FICT_PLUGIN.capabilities.tests, negativeWitness: () => ({}) },
	},
};

/** A `fict-lines` reader that concludes `PASS` where the control left no report. */
function concludingOnAbsence(): ReportReader {
	const lines = linesReader("fict-lines", "behaviour");
	return {
		...lines,
		async read(run) {
			const [report] = await run.reports("text/plain; charset=utf-8");
			return report === undefined ? { verdict: "PASS", facts: {}, notes: [], failures: [] } : lines.read(run);
		},
	};
}

/** A `fict-lines` reader that concludes `PASS` on a report it left unread because it passed the read bound. */
function concludingPastTheBound(): ReportReader {
	const lines = linesReader("fict-lines", "behaviour");
	return {
		...lines,
		async read(run) {
			const [report] = await run.reports("text/plain; charset=utf-8", { oversized_unread: true });
			return report?.oversized_bytes !== undefined
				? { verdict: "PASS", facts: {}, notes: [], failures: [] }
				: lines.read(run);
		},
	};
}

/**
 * The fictitious technology whose reader scopes the run as a mutation reader does, adding a scope argument the
 * command of its control accepts after `--`, and reads a run that exits non-zero without a report as a build
 * that broke, so `FAIL`.
 */
const SCOPING_READER: StackPlugin<true> = (() => {
	const lines = linesReader("fict-lines", "behaviour");
	const tests = FICT_PLUGIN.capabilities.tests;
	return {
		...FICT_PLUGIN,
		readers: [
			{
				...lines,
				prepare: async () => ({ arguments: ["--mutate=495-witness.txt"] }),
				async read(run) {
					const [report] = await run.reports("text/plain; charset=utf-8");
					if (report === undefined && run.observation.exit_code !== 0)
						return { verdict: "FAIL", facts: {}, notes: ["the build broke"], failures: [] };
					return lines.read(run);
				},
			},
		],
		capabilities: {
			...FICT_PLUGIN.capabilities,
			tests: {
				...tests,
				offer: (question) => {
					const offer = tests.offer(question);
					if (offer.kind !== "available") return offer;
					return {
						...offer,
						controls: offer.controls.map((control) => ({ ...control, command: [...control.command, "--"] })),
					};
				},
			},
		},
	};
})();

/** What git sees of `project`, ignored files included: its commit and every path it does not hold as committed. */
function gitState(project: string): string {
	const git = (...args: string[]) => execFileSync("git", args, { cwd: project, encoding: "utf8" });
	return git("rev-parse", "HEAD") + git("status", "--porcelain", "--ignored", "--untracked-files=all");
}

const cleanups = removedAfterEach();

describe("stackConformance judges a technology on projects of its own", () => {
	it("given a project the fictitious technology recognises, stackConformance gives a report without finding, which names fict-tests qualified by its witnesses and fict-lines INDETERMINATE on an absent report and on a report past the read bound", async () => {
		const project = greetingProject();
		const before = gitState(project);
		const report = await judged(FICT_PLUGIN, [project]);
		assert.deepEqual(report.findings, [], "the report carries no finding");
		assert.equal(gitState(project), before, "the project judged is left as it was: the judgement works in copies");
		assert.deepEqual(
			report.projects.map((judgement) => ({
				project: judgement.project,
				controls: judgement.controls.map((c) => [c.control_id, c.positive, c.negative, c.incident, c.qualified]),
				readers: judgement.readers.map((r) => [r.reader_id, r.absent, r.oversized]),
			})),
			[
				{
					project,
					controls: [["fict-tests", "PASS", "FAIL", "INDETERMINATE", true]],
					readers: [["fict-lines", "INDETERMINATE", "INDETERMINATE"]],
				},
			],
		);
	});

	it('given a variant whose negative witness passes, the report carries a finding that names fict-tests and "negative witness gave PASS"', async () => {
		const report = await judged(PASSING_NEGATIVE, [greetingProject()]);
		assert.equal(report.findings.length, 1, report.findings.join("\n"));
		assert.match(report.findings[0]!, /fict-tests/);
		assert.match(report.findings[0]!, /negative witness gave PASS/);
	});

	it("given a variant whose reader gives PASS where no report was written, the report carries a finding that names that reader and the absent report it concluded on", async () => {
		const report = await judged({ ...FICT_PLUGIN, readers: [concludingOnAbsence()] }, [greetingProject()]);
		assert.equal(report.findings.length, 1, report.findings.join("\n"));
		assert.match(report.findings[0]!, /reader fict-lines gave PASS/);
		assert.match(report.findings[0]!, /no report at fict-report\.txt/);
	});

	it("given a variant whose reader gives PASS on a report past the read bound, the report carries a finding that names that reader and the bound it concluded past", async () => {
		const report = await judged({ ...FICT_PLUGIN, readers: [concludingPastTheBound()] }, [greetingProject()]);
		assert.equal(report.findings.length, 1, report.findings.join("\n"));
		assert.match(report.findings[0]!, /reader fict-lines gave PASS/);
		assert.match(report.findings[0]!, /with a report past the read bound of \d+ bytes/);
	});

	it("given a variant whose reader adds a scope argument to the command of the control and reads a non-zero exit without a report as FAIL, the report carries no finding and names that reader INDETERMINATE on an absent report and on a report past the read bound", async () => {
		const report = await judged(SCOPING_READER, [greetingProject()]);
		assert.deepEqual(report.findings, [], "the report carries no finding");
		assert.deepEqual(
			report.projects.flatMap((judgement) => judgement.readers.map((r) => [r.reader_id, r.absent, r.oversized])),
			[["fict-lines", "INDETERMINATE", "INDETERMINATE"]],
		);
	});

	it("given a project the fictitious technology does not recognise, the report carries a finding that names it rather than nothing", async () => {
		const project = tempDir("495-not-fict-", cleanups);
		writeFiles(project, { "README.md": "no fict.toml here\n" });
		const report = await judged(FICT_PLUGIN, [project]);
		assert.equal(report.findings.length, 1, report.findings.join("\n"));
		assert.ok(report.findings[0]!.includes(project), `the finding names ${project}: ${report.findings[0]}`);
		assert.match(report.findings[0]!, /not recognised by fict/);
	});

	it("given a sandbox declared not qualified, stackConformance rejects with the code CAPABILITY_MISSING and the reason of the sandbox, and the execution engine received no command", async () => {
		const sandbox = declaredSandbox(false, "bwrap cannot confine a command on this machine");
		await assert.rejects(judgeTechnology(FICT_PLUGIN, [greetingProject()], sandbox), (error: Error) => {
			assert.equal((error as Error & { code?: string }).code, "CAPABILITY_MISSING", error.message);
			assert.match(error.message, /bwrap cannot confine a command on this machine/);
			return true;
		});
		assert.deepEqual(sandbox.backend.commands, [], "the execution engine received no command");
	});
});
