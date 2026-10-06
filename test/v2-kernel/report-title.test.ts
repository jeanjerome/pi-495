/**
 * The report of a change names the request it answers, as its program names it, so the owner reads
 * which request the report is about without its identifier.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { makeHarness, trackedProject } from "../helpers/harness-fixture.ts";

const REQUEST = "add freeMinutes(busy) beside freeSlots";

describe("the title of a report", () => {
	it("the report of a change started on a request opens on 495 report · <the request>", async () => {
		const t = makeHarness();
		const { change } = await t.harness.start({ project_path: trackedProject(), request_text: REQUEST, actor: HUMAN });
		const report = await t.harness.report(change.change_id);
		assert.equal(report.title, REQUEST);
		assert.match(
			formatReport(report, "en").split("\n")[0]!,
			new RegExp(`^495 report · ${REQUEST.replace(/[()]/g, "\\$&")} — `),
		);
	});
});
