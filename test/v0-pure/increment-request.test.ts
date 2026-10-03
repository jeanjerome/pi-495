import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { incrementRequest } from "../../src/application/trajectory.ts";
import type { Baseline, BaselineGap, IncrementSpec } from "../../src/domain/program/program.ts";

const gap = (rule_id: string, module: string | null, over: Partial<BaselineGap> = {}): BaselineGap => ({
	rule_id,
	threshold: `${rule_id} threshold`,
	module,
	authorship: "proprietary",
	violations: 1,
	scope_decision: null,
	...over,
});

const BASELINE: Baseline = {
	change_id: "chg_survey",
	reference_digest: `sha256:${"b".repeat(64)}`,
	gaps: [
		gap("CyclomaticComplexity", "domain", { violations: 3 }),
		gap("CyclomaticComplexity", "infrastructure"),
		gap("UnusedPrivateMethod", null, { authorship: "generated" }),
	],
};

const A: IncrementSpec = {
	increment_id: "A",
	title: "Domain to standards",
	value: "the domain meets the referential",
	depends_on: [],
	kind: "remediation",
	required_capabilities: [],
	requirement_ids: [],
	closure_criterion: "the suite passes",
	gaps: [
		{ rule_id: "CyclomaticComplexity", module: "domain", authorship: "proprietary" },
		{ rule_id: "UnusedPrivateMethod", module: null, authorship: "generated" },
	],
};

describe("the request of an increment's change", () => {
	it("names each gap of the survey the increment removes, with its module, its code, its count at the survey and its threshold, in French and in English, and none of the other increments' gaps", () => {
		assert.equal(
			incrementRequest(A, "fr", BASELINE),
			[
				"Domain to standards",
				"",
				"Valeur: the domain meets the referential",
				"Critère de clôture: the suite passes",
				"",
				"Écarts à supprimer :",
				"- CyclomaticComplexity dans domain, code propriétaire : 3 violations à l'état des lieux (seuil : CyclomaticComplexity threshold)",
				"- UnusedPrivateMethod dans aucun module mesuré, code généré : 1 violation à l'état des lieux (seuil : UnusedPrivateMethod threshold)",
			].join("\n"),
		);
		assert.equal(
			incrementRequest(A, "en", BASELINE),
			[
				"Domain to standards",
				"",
				"Value: the domain meets the referential",
				"Closure criterion: the suite passes",
				"",
				"Gaps to remove:",
				"- CyclomaticComplexity in domain, proprietary code: 3 violations at the survey (threshold: CyclomaticComplexity threshold)",
				"- UnusedPrivateMethod in no measured module, generated code: 1 violation at the survey (threshold: UnusedPrivateMethod threshold)",
			].join("\n"),
		);
	});

	it("names no gap for an increment of a trajectory that cites no survey", () => {
		assert.equal(
			incrementRequest(A, "en", null),
			"Domain to standards\n\nValue: the domain meets the referential\nClosure criterion: the suite passes",
		);
	});
});
