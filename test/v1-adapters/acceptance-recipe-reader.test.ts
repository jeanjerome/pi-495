import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ACCEPTANCE_RECIPE_READER } from "../../src/adapters/execution/acceptance-recipe.ts";
import type { AcceptanceRecipe } from "../../src/contracts/v1/protocol.ts";
import type { ReaderRun, ReportDocument, SourceTree } from "../../src/ports/execution.ts";
import { controlOf, observation } from "../helpers/execution-fixture.ts";

const CANDIDATE = `sha256:${"c".repeat(64)}`;

const RECIPE: AcceptanceRecipe = {
	journey: "greet a name through the command line of the built package",
	preconditions: [],
	entry: "node bin/greet.js Ada",
	observations: [{ observation_id: "O1", requirement_id: "R1", expected: "the output reads HELLO ADA" }],
	negative_control: { requirement_id: "R1", deprived_of: "a copy without shout", expected: "shout is missing" },
	negative_not_applicable: null,
	simulations: ["the clock"],
	not_exercised: ["the interactive prompt"],
	external_data: [],
};

/** A run of the recipe control whose report file holds `text`, or no report when `text` is null. */
class RecipeRunOnDisk implements ReaderRun {
	readonly control = controlOf({
		control_id: "acceptance-recipe",
		parser: "acceptance-recipe",
		report_path: "recipe-report.json",
		acceptance_recipe: RECIPE,
	});
	readonly observation = observation();
	readonly stdout = "";
	readonly stderr = "";
	readonly introduced_lines = null;
	readonly subject_digest = CANDIDATE;
	readonly #report: string | null;
	constructor(report: string | null) {
		this.#report = report;
	}
	async reports(): Promise<ReportDocument[]> {
		return this.#report === null ? [] : [{ name: "recipe-report.json", text: this.#report }];
	}
	async sources(): Promise<Map<string, string>> {
		return new Map();
	}
	async text(path: string): Promise<string> {
		throw new Error(`${path} is not read by the acceptance recipe reader`);
	}
	async tree(): Promise<SourceTree> {
		throw new Error("the acceptance recipe reader walks no tree");
	}
	relativize(message: string): string {
		return message;
	}
}

function reportOf(over: Record<string, unknown> = {}): string {
	return JSON.stringify({
		candidate: CANDIDATE,
		built_version: "greet@1.0.0",
		entry: "node bin/greet.js Ada",
		simulations: ["the clock"],
		observations: [{ observation_id: "O1", requirement_id: "R1", observed: "HELLO ADA", outcome: "passed" }],
		negative_control: { requirement_id: "R1", observed: "shout is missing", outcome: "refused" },
		...over,
	});
}

const read = (text: string | null) => ACCEPTANCE_RECIPE_READER.read(new RecipeRunOnDisk(text));

describe("the reader of an acceptance run decides only on what the report observed of the declared recipe", () => {
	it("passes a report of every declared observation and a refused negative control, naming what is not exercised", async () => {
		const parsed = await read(reportOf());
		assert.equal(parsed.verdict, "PASS", parsed.notes.join(" | "));
		assert.deepEqual(parsed.notes, ["not exercised: the interactive prompt"]);
	});

	it("fails a declared observation the candidate failed, as a blocking finding tied to its requirement", async () => {
		const parsed = await read(
			reportOf({
				observations: [{ observation_id: "O1", requirement_id: "R1", observed: "Hello Ada", outcome: "failed" }],
			}),
		);
		assert.equal(parsed.verdict, "FAIL");
		assert.equal(parsed.findings?.length, 1);
		assert.equal(parsed.findings?.[0]?.severity, "blocker");
		assert.match(parsed.findings?.[0]?.message ?? "", /requirement R1: observation O1 expected .*, observed Hello Ada/);
	});

	it("leaves undecided a negative control that the deprived copy did not refuse", async () => {
		const parsed = await read(
			reportOf({ negative_control: { requirement_id: "R1", observed: "shout answered", outcome: "accepted" } }),
		);
		assert.equal(parsed.verdict, "INDETERMINATE");
		assert.match(
			parsed.notes.join(" | "),
			/negative control of R1 observed shout answered .*does not tell the delivered/,
		);
	});

	it("leaves undecided a report that omits the negative control or a declared observation", async () => {
		const parsed = await read(
			reportOf({
				observations: [{ observation_id: "O2", requirement_id: "R1", observed: "x", outcome: "passed" }],
				negative_control: null,
			}),
		);
		assert.equal(parsed.verdict, "INDETERMINATE");
		assert.match(parsed.notes.join(" | "), /observation O1 of R1 is not reported/);
		assert.match(parsed.notes.join(" | "), /the negative control of R1 is not reported/);
	});

	it("leaves undecided a declared observation reported under another requirement than the declared one", async () => {
		const parsed = await read(
			reportOf({
				observations: [{ observation_id: "O1", requirement_id: "R2", observed: "HELLO ADA", outcome: "passed" }],
			}),
		);
		assert.equal(parsed.verdict, "INDETERMINATE");
		assert.match(parsed.notes.join(" | "), /observation O1 of R1 is not reported/);
	});

	it("leaves undecided a refused negative control reported under another requirement than the declared one", async () => {
		const parsed = await read(
			reportOf({ negative_control: { requirement_id: "R2", observed: "shout is missing", outcome: "refused" } }),
		);
		assert.equal(parsed.verdict, "INDETERMINATE");
		assert.match(parsed.notes.join(" | "), /the negative control of R1 is not reported/);
	});

	it("leaves undecided a report that drove another entry or simulated what the recipe does not allow", async () => {
		const parsed = await read(reportOf({ entry: "node src/greet.js", simulations: ["the clock", "the network"] }));
		assert.equal(parsed.verdict, "INDETERMINATE");
		assert.match(
			parsed.notes.join(" | "),
			/drove the entry node src\/greet\.js, the recipe declares node bin\/greet\.js Ada/,
		);
		assert.match(parsed.notes.join(" | "), /simulates the network, which the recipe does not allow/);
	});

	it("leaves undecided a run without a report, with a report that is not JSON or outside the contract", async () => {
		assert.match((await read(null)).notes.join(" | "), /no acceptance report at recipe-report\.json/);
		assert.match((await read("{")).notes.join(" | "), /is not JSON/);
		assert.match((await read("{}")).notes.join(" | "), /does not follow the contract acceptance-report/);
	});
});
