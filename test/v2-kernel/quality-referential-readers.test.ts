/**
 * The quality referential is offered only for a requirement about quality that no control measures, and
 * what a control measures is read in the reader its technology declares.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ReferenceSnapshot } from "../../src/contracts/v1/candidate.ts";
import { settleQualityReferential } from "../../src/application/phases/quality-referential.ts";
import type { PhaseContext, Unit } from "../../src/application/phases/phase.ts";
import type { DetectedTechnology } from "../../src/application/stacks/stack.ts";
import type { VerificationCoordinator } from "../../src/application/verification.ts";
import type { ReportReader } from "../../src/ports/execution.ts";
import { ref, requirements } from "../helpers/change-fixture.ts";
import { controlOf } from "../helpers/execution-fixture.ts";

/** A reader a technology brings, which judges the style of the code. */
const STYLE_READER: ReportReader = {
	id: "fict-style",
	version: "1.0.0",
	nature: "style",
	differential: false,
	located: false,
	read: async () => ({ verdict: "PASS", facts: {}, notes: [], failures: [] }),
};

describe("the quality referential, for a target whose style control reads through its technology's reader", () => {
	it("settles without a blind spot a requirement about quality that the control measures", async () => {
		const content = requirements();
		// Only the readers are read before the settlement returns: the rest of the context stays unset.
		const verification: Partial<VerificationCoordinator> = { readers: [STYLE_READER] };
		const ctx: Partial<PhaseContext> = { verification: verification as VerificationCoordinator };
		const detection: DetectedTechnology = {
			stack: "fict",
			facts: {},
			controls: [controlOf({ control_id: "style", parser: "fict-style" })],
			lint_control_ids: [],
			positive_witness: {},
			witness_tests: 0,
			negative_witness: {},
			own_negative_witness: {},
			preparation_paths: [],
			capability_missing: [],
			recommendations: [],
			quality_referential: { kind: "not_proposed", note: "the target configures its own analyser" },
		};
		const settlement = await settleQualityReferential(
			ctx as PhaseContext,
			{} as Unit,
			"cor_1",
			{ ref: ref("art_req", content), content },
			{} as ReferenceSnapshot,
			"/nowhere",
			detection,
		);
		assert.equal(settlement.kind, "settled");
		assert.equal("blind_spot" in settlement ? settlement.blind_spot : undefined, undefined);
	});
});
