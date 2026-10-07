/**
 * V0 — the published contract names the phases by the step they belong to, and a canonical error
 * carries the phase under that name.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { KERNEL, Runner, design, ref, tick } from "../helpers/change-fixture.ts";

/** The values `contracts/v1/canonical-error.json` publishes for `phase`, besides `null`. */
function publishedPhases(): string[] {
	const contract = JSON.parse(
		readFileSync(new URL("../../contracts/v1/canonical-error.json", import.meta.url), "utf8"),
	) as {
		properties: { phase: { anyOf: { enum?: string[] }[] } };
	};
	return contract.properties.phase.anyOf.flatMap((branch) => branch.enum ?? []);
}

describe("the published contract knows only the phase identifiers named after the step", () => {
	it("the phase enumeration of contracts/v1/canonical-error.json is intake, scoping, specification, qualification, preparing, design, implementation, verifying, reviewing, deciding, integration, closed, and a canonical error raised in qualification carries phase qualification", () => {
		assert.deepEqual(publishedPhases(), [
			"intake",
			"scoping",
			"specification",
			"qualification",
			"preparing",
			"design",
			"implementation",
			"verifying",
			"reviewing",
			"deciding",
			"integration",
			"closed",
		]);
		const inQualification = new Runner().create().g0().g1();
		const d = design();
		const refused = inQualification.try({
			type: "gate.evaluate",
			gate: "G3",
			at: tick(),
			actor: KERNEL,
			design_ref: ref("dsg_1", d),
			design: d,
		});
		assert.ok(!refused.ok, "the design gate is refused in qualification");
		const canonical = JSON.parse(JSON.stringify(refused.error.toCanonical())) as { phase: string };
		assert.equal(canonical.phase, "qualification");
		assert.ok(publishedPhases().includes(canonical.phase), "the contract publishes the phase the error carries");
	});
});
