import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { check } from "../../src/contracts/validate.ts";
import { ControlCapabilityDiagnosis } from "../../src/contracts/v1/protocol.ts";
import { summarizeJUnit } from "../../src/adapters/execution/parsers.ts";
import {
	diagnoseControlCapability,
	oracleNote,
	requirementOracles,
	type PreparationRecord,
} from "../../src/application/preparation.ts";

const requirements = [
	{ requirement_id: "R1", mandatory: true, satisfied_by_reference: false },
	{ requirement_id: "R2", mandatory: true, satisfied_by_reference: false },
];
const suite = { reported: 3, skipped: 0, witnesses: 1 };
const file = { path: "test/shout.test.js", digest: `sha256:${"a".repeat(64)}`, size_bytes: 120 };

/** A preparation whose suite fails on the reference, and whose only failing case is the one of R1. */
const prepared: PreparationRecord = {
	preparation_id: "prep_1",
	objective: "write the tests of R1 and R2",
	allowed_paths: ["test/"],
	files: [file],
	modified_existing: [],
	on_reference: "FAIL",
	discriminant: true,
	loadable: true,
	qualified: true,
	notes: [],
	requirements: [
		{
			requirement_id: "R1",
			category: "new_behaviour",
			control_id: "unit",
			expected: "failed_assertion",
			cases: [{ name: "R1 shout upper-cases the greeting", outcome: "failed_assertion" }],
			qualification: "proved",
		},
		{
			requirement_id: "R2",
			category: "new_behaviour",
			control_id: "unit",
			expected: "failed_assertion",
			cases: [],
			qualification: "no_case",
		},
	],
};

describe("the binding of each requirement to its own observations", () => {
	it("R1 et R2 gardent des observations distinctes et un ancien dossier reste lisible sans être surqualifié", () => {
		const diagnosis = diagnoseControlCapability({
			stack: "node",
			test_files: [file.path],
			requirements,
			suite,
			prepared,
		});
		assert.deepEqual(
			diagnosis.undiscriminated_requirements,
			["R2"],
			"the red of R1 does not prove R2: R2 stays without an oracle of its own",
		);
		assert.deepEqual(
			diagnosis.oracles?.map((o) => [o.requirement_id, o.cases.map((c) => c.name), o.qualification]),
			[
				["R1", ["R1 shout upper-cases the greeting"], "proved"],
				["R2", [], "no_case"],
			],
			"each requirement keeps the observations of its own cases",
		);
		assert.ok(check(ControlCapabilityDiagnosis, diagnosis), "the diagnosis carrying the oracles is a valid contract");

		// A preparation recorded before observations were kept per requirement: a whole suite red on the reference.
		const { requirements: _dropped, ...older } = prepared;
		const legacy = diagnoseControlCapability({
			stack: "node",
			test_files: [file.path],
			requirements,
			suite,
			prepared: older,
		});
		assert.deepEqual(
			legacy.undiscriminated_requirements,
			["R1", "R2"],
			"an older dossier stays readable and proves no requirement it never observed",
		);
		assert.notEqual(legacy.level, "discriminating", "an older dossier is not qualified after the fact");
		assert.ok(
			legacy.notes.some((n) => n.includes("before observations were kept per requirement")),
			legacy.notes.join(" | "),
		);
		assert.ok(check(ControlCapabilityDiagnosis, legacy), "the diagnosis of an older dossier is a valid contract");
	});
});

describe("an incident is not a red on the behaviour", () => {
	it("a case failing on an import or before its assertion proves no requirement, and a reader naming no case leaves every requirement unlocatable", () => {
		const oracles = requirementOracles(
			[
				{ requirement_id: "R1", satisfied_by_reference: false },
				{ requirement_id: "R2", satisfied_by_reference: true },
				{ requirement_id: "R3", satisfied_by_reference: false },
			],
			"unit",
			[
				{ name: "R1 shout upper-cases the greeting", outcome: "failed_otherwise" },
				{ name: "R2 greet unchanged", outcome: "failed_otherwise" },
				{ name: "R3 whisper lower-cases the greeting", outcome: "failed_assertion" },
				{ name: "R3 whisper loads its module", outcome: "failed_otherwise" },
			],
		);
		assert.deepEqual(
			oracles.map((o) => [o.requirement_id, o.qualification]),
			[
				["R1", "incident"],
				["R2", "incident"],
				["R3", "incident"],
			],
			"a failure without an assertion qualifies none of them, even beside an assertion that fails",
		);
		const diagnosis = diagnoseControlCapability({
			stack: "node",
			test_files: [file.path],
			requirements: [...requirements, { requirement_id: "R3", mandatory: true, satisfied_by_reference: false }],
			suite,
			prepared: { ...prepared, requirements: oracles },
		});
		assert.notEqual(diagnosis.level, "discriminating", "an incident is not a discriminant preparation");
		assert.deepEqual(diagnosis.undiscriminated_requirements, ["R1", "R2", "R3"]);
		assert.match(
			diagnosis.notes.join(" | "),
			/R1: its cases fail on the reference without an assertion, which proves nothing about it: "R1 shout upper-cases the greeting" failed otherwise/,
		);

		const unlocated = requirementOracles(requirements, "unit", null);
		assert.deepEqual(
			unlocated.map((o) => [o.requirement_id, o.qualification, o.cases]),
			[
				["R1", "unlocatable", []],
				["R2", "unlocatable", []],
			],
			"a reader that names no case covers nothing from its global count",
		);
		assert.match(oracleNote(unlocated[0]!), /the reader of unit names no case/);
	});

	it("a contradiction an earlier preparation saw stays named beside a later reader that names no case", () => {
		const characterized = [{ requirement_id: "R2", mandatory: true, satisfied_by_reference: true }];
		const [refuted] = requirementOracles(characterized, "unit", [
			{ name: "R2 greet says hi", outcome: "failed_assertion" },
		]);
		const diagnosis = diagnoseControlCapability({
			stack: "node",
			test_files: [file.path],
			requirements: characterized,
			suite,
			prepared: { ...prepared, requirements: requirementOracles(characterized, "unit", null) },
			refuted: [refuted!],
		});
		assert.deepEqual(diagnosis.undiscriminated_requirements, ["R2"]);
		const notes = diagnosis.notes.join(" | ");
		assert.match(notes, /R2: the reader of unit names no case/, notes);
		assert.match(
			notes,
			/R2 is declared satisfied by the reference, and its characterization contradicts it there: "R2 greet says hi"/,
			"the reader that names no case does not stand in for the contradiction",
		);
	});
});

describe("a case bound by the method name a JUnit report carries", () => {
	it("un cas Surefire nommé r_update_refuse_nom_pris_rejectsNameHeldByAnotherUser, en échec par assertion sur la référence, prouve l’exigence r-update-refuse-nom-pris", () => {
		// What Surefire writes for a JUnit 5 case: the method name only, never its @DisplayName.
		const report = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.example.UserServiceTest" tests="1" failures="1" errors="0" skipped="0">
  <testcase name="r_update_refuse_nom_pris_rejectsNameHeldByAnotherUser" classname="com.example.UserServiceTest" time="0.01">
    <failure message="expected: &lt;true&gt; but was: &lt;false&gt;" type="org.opentest4j.AssertionFailedError">org.opentest4j.AssertionFailedError: expected: &lt;true&gt; but was: &lt;false&gt;</failure>
  </testcase>
</testsuite>`;
		const target = [{ requirement_id: "r-update-refuse-nom-pris", mandatory: true, satisfied_by_reference: false }];
		const oracles = requirementOracles(target, "unit", summarizeJUnit([report]).cases);
		assert.deepEqual(
			oracles.map((o) => [o.requirement_id, o.cases.map((c) => [c.name, c.outcome]), o.qualification]),
			[
				[
					"r-update-refuse-nom-pris",
					[["com.example.UserServiceTest.r_update_refuse_nom_pris_rejectsNameHeldByAnotherUser", "failed_assertion"]],
					"proved",
				],
			],
			"the case names r-update-refuse-nom-pris with its hyphens written as underscores, and its red on an assertion proves it",
		);
		const diagnosis = diagnoseControlCapability({
			stack: "maven",
			test_files: ["src/test/java/com/example/UserServiceTest.java"],
			requirements: target,
			suite,
			prepared: { ...prepared, requirements: oracles },
		});
		assert.equal(diagnosis.level, "discriminating", "the preparation is qualified rather than left without a case");
		assert.deepEqual(diagnosis.undiscriminated_requirements, [], diagnosis.notes.join(" | "));
	});
});
