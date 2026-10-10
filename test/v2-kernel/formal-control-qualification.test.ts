import { strict as assert } from "node:assert";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { readersOf } from "../../src/adapters/execution/common-readers.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import type { EvidenceCandidate } from "../../src/contracts/v1/evidence.ts";
import type { ControlDefinition, Protocol } from "../../src/contracts/v1/protocol.ts";
import { STACKS_OF_495 } from "../../src/extension/runtime.ts";
import { invocationBase } from "../helpers/execution-fixture.ts";
import { tuiOrigin } from "../helpers/change-fixture.ts";
import { examining } from "../helpers/contested-change.ts";
import { reopenHarness } from "../helpers/harness-fixture.ts";
import {
	COMPTEUR_SANS_GARDE,
	CONFIG,
	DIVERGENT,
	REPLAY_CASE,
	counterPackage,
	counterSession,
	tlcStandIn,
	runCounterChange,
} from "../helpers/formal-control.ts";
import { digestBytes } from "../../src/contracts/digest.ts";
import { outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";

const copies = removedAfterEach();

interface TlcFacts {
	outcome: string;
	reasons: string[];
	counterexample: { property: string } | null;
}

/** Runs the frozen control on a copy of `project`, after `alter` changed the copy. */
async function explore(
	control: ControlDefinition,
	project: string,
	alter: (copy: string) => void = () => {},
): Promise<{ evidence: EvidenceCandidate; tlc: TlcFacts | undefined }> {
	const copy = join(outputDir("formal-copy-", copies), "ws");
	cpSync(project, copy, { recursive: true });
	alter(copy);
	const runner = new GenericControlRunner(
		new UnconfinedSandbox(),
		new CasObjectStore(join(copy, "..", "objects")),
		readersOf(STACKS_OF_495.technologies),
	);
	const { evidence } = await runner.runControl({ ...invocationBase(), control, workspace_path: copy });
	return { evidence, tlc: evidence.facts.tlc as TlcFacts | undefined };
}

describe("the formal control is qualified and frozen with the other controls of the preparation", () => {
	it("un contrôle qualifié distingue contre-exemple, absence d'outil et exploration interrompue", async () => {
		const tool = tlcStandIn();
		const pkg = counterPackage(tool);
		const { t, state, project } = await runCounterChange(pkg);
		const frozen = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
		const control = frozen?.controls.find((c) => c.formal_package);
		assert.ok(control, "the protocol freezes the control of the adopted formal package");
		assert.equal(control.parser, "tlc", "the control is read by the TLC reader the kernel already has");
		assert.equal(control.command[0], tool.java, "the control runs the TLC the owner adopted, nothing else");
		assert.deepEqual(
			frozen?.qualifications[control.control_id],
			{
				...frozen?.qualifications[control.control_id],
				positive: "PASS",
				negative: "FAIL",
				incident: "INDETERMINATE",
				qualified: true,
				notes: [],
			},
			"the approved model completes, the mutant ends on a counterexample, a broken runner is an incident",
		);
		for (const file of Object.keys(pkg.files))
			assert.ok(control.protected_paths.includes(file), `the producer may not modify ${file}`);

		const counterexample = await explore(control, project, (copy) =>
			writeFiles(copy, { "spec/Compteur.tla": COMPTEUR_SANS_GARDE }),
		);
		assert.equal(counterexample.evidence.verdict, "FAIL", "a counterexample fails the model");
		assert.equal(counterexample.tlc?.outcome, "counterexample");
		assert.equal(counterexample.tlc?.counterexample?.property, "Borne");

		const reduced = await explore(control, project, (copy) =>
			writeFiles(copy, { "spec/Compteur.cfg": "CONSTANT Max = 3\nINIT Init\nNEXT Next\nINVARIANT TypeOK\n" }),
		);
		assert.notEqual(reduced.evidence.verdict, "PASS", "a configuration reduced by the producer proves nothing");
		assert.match(reduced.evidence.limits.notes.join(" | "), /spec\/Compteur\.cfg is sha256:\w+, the package approves/);

		const hung = await explore(control, project, (copy) => writeFiles(copy, { ".495-hang": "" }));
		assert.equal(hung.evidence.verdict, "INDETERMINATE", "an interrupted exploration is neither PASS nor FAIL");
		assert.equal(hung.tlc?.outcome, "inconclusive");
		assert.match(hung.tlc?.reasons[0] ?? "", /the run was interrupted: timeout/);

		rmSync(tool.java);
		const absent = await explore(control, project);
		assert.equal(absent.evidence.verdict, "INDETERMINATE", "an absent tool is neither PASS nor FAIL");
		assert.equal(absent.tlc?.outcome, "error");
		assert.match(absent.tlc?.reasons[0] ?? "", /^capability missing: no Java runtime at /);
	});

	it("le modèle réduit par le producteur ne passe pas G4 et l'objection au modèle suit la contestation du cas qui le relie au programme", async () => {
		const pkg = counterPackage(tlcStandIn());
		const reduced = await runCounterChange(pkg, {
			producer: { writes: { "spec/Compteur.cfg": CONFIG.replace("INVARIANT Borne\n", "") } },
		});
		assert.notEqual(reduced.state.outcome, "accepted", "a model reduced by the producer accepts nothing");
		assert.match(
			reduced.state.gates.G4?.reasons.join(" | ") ?? "",
			/protected path altered by the producer: spec\/Compteur\.cfg/,
		);
		assert.equal(
			reduced.state.evidence.some((e) => e.control_id === "formal-model"),
			false,
			"no exploration of the reduced model is taken as a proof",
		);

		const observation = "the model steps the counter by one where R1 only bounds it at max";
		const contested = await runCounterChange(pkg, {
			implementation: DIVERGENT,
			producer: {
				contests: [{ case: REPLAY_CASE, observation }],
				examiner: examining("requirement_change", "the replay asserts the adopted model; the objection is to it"),
			},
		});
		const [filed, ...others] = contested.state.contestations ?? [];
		assert.equal(others.length, 0, contested.steps.join(" | "));
		assert.equal(filed?.case_name, REPLAY_CASE, "the objection to the model is filed on the case tying it to the code");
		assert.equal(filed?.reproduction.control_id, "unit", "the kernel's failing run of the replay reproduces it");
		assert.deepEqual(
			contested.t.harness.pendingDecisions(contested.state.change_id).map((d) => d.options.map((o) => o.id)),
			[["revise", "keep"]],
			"the owner alone says whether the adopted model changes",
		);
		assert.notEqual(contested.state.outcome, "accepted");
	});

	it("un paquet révisé après la contestation du modèle fait de nouveau qualifier le contrôle formel avant d'être gelé", async () => {
		const tool = tlcStandIn();
		const pkg = counterPackage(tool);
		const contested = await runCounterChange(pkg, {
			implementation: DIVERGENT,
			producer: {
				contests: [{ case: REPLAY_CASE, observation: "the model steps the counter by one where R1 bounds it" }],
				examiner: examining("requirement_change", "the replay asserts the adopted model; the objection is to it"),
			},
		});
		const changeId = contested.state.change_id;
		const former = contested.state.protocol?.formal?.package_digest;
		assert.ok(former, "the first protocol froze the adopted package");
		const [asked] = contested.t.harness.pendingDecisions(changeId);
		assert.ok(asked, contested.steps.join(" | "));
		const answered = contested.t.harness.answerDecision(
			changeId,
			{
				decision_id: asked.decision_id,
				option_id: "revise",
				free_text: "next(x, max) bounds the counter at max and the model pins the README it documents",
				reason: null,
				subject_revision: asked.subject.revision,
				scope: null,
				expires_at: null,
			},
			tuiOrigin(),
		);
		assert.equal(answered.error, null, answered.error?.message);

		const runs = () => readFileSync(tool.ran, "utf8").trim().split("\n").length;
		const before = runs();
		const revised = counterPackage(tool, { files: { ...pkg.files, "README.md": digestBytes("# counter\n") } });
		const t = reopenHarness(contested.t, counterSession(revised));
		const resumed = await t.harness.advance(changeId, { max_steps: 40 });
		const state = t.ledger.loadChange(changeId)!.state;
		const frozen = state.protocol?.formal?.package_digest;
		assert.ok(frozen && frozen !== former, `the revised package is frozen: ${resumed.steps.join(" | ")}`);
		const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
		const control = protocol?.controls.find((c) => c.formal_package);
		assert.equal(control?.version, frozen, "the formal control is versioned by the revised package");
		assert.equal(protocol?.qualifications[control.control_id]?.qualified, true, "the revised control is qualified");
		assert.equal(
			runs() - before,
			4,
			"TLC explores the approved model and its mutant again for the revised package, then the candidate twice",
		);
		assert.ok(
			state.evidence.some((e) => e.control_id === "formal-model" && !e.valid),
			"the exploration of the former package no longer counts",
		);
	});

	it("a completed exploration by another TLC, leaving a required property unchecked or missing a pinned file is no PASS of the package", async () => {
		const { t, state, project } = await runCounterChange(counterPackage(tlcStandIn()));
		const frozen = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
		const control = frozen?.controls.find((c) => c.formal_package);
		assert.ok(control?.formal_package, "the protocol freezes the control of the adopted formal package");
		const pkg = control.formal_package;
		const approved = await explore(control, project);
		assert.equal(approved.evidence.verdict, "PASS", "the approved model explored by the approved TLC passes");

		const otherTlc = await explore(
			{ ...control, formal_package: { ...pkg, tool: { ...pkg.tool, version: "2.18" } } },
			project,
		);
		assert.equal(otherTlc.evidence.verdict, "INDETERMINATE", "another TLC proves nothing of the package");
		assert.match(otherTlc.evidence.limits.notes.join(" | "), /the package approves TLC 2\.18/);

		const unchecked = await explore(
			{ ...control, formal_package: { ...pkg, required_properties: [...pkg.required_properties, "Vivacite"] } },
			project,
		);
		assert.equal(unchecked.evidence.verdict, "INDETERMINATE", "a required property left unchecked proves nothing");
		assert.match(unchecked.evidence.limits.notes.join(" | "), /the exploration did not check the required Vivacite/);

		const removed = await explore(control, project, (copy) => rmSync(join(copy, "spec", "mutants", "Compteur.tla")));
		assert.equal(removed.evidence.verdict, "INDETERMINATE", "a pinned file removed from the copy proves nothing");
		assert.match(
			removed.evidence.limits.notes.join(" | "),
			/spec\/mutants\/Compteur\.tla is absent, the package approves/,
		);
	});

	it("a package whose mutant is not in the reference stops capability_missing before any exploration", async () => {
		const tool = tlcStandIn();
		const pkg = counterPackage(tool);
		const absent = "spec/mutants/Absent.tla";
		const stopped = await runCounterChange({
			...pkg,
			files: { ...pkg.files, [absent]: pkg.files["spec/mutants/Compteur.tla"]! },
			expected_violation: { ...pkg.expected_violation, mutant: absent },
		});
		assert.equal(stopped.stopped_because, "capability_missing", stopped.steps.join(" | "));
		assert.match(
			stopped.steps.join(" | "),
			/the mutant spec\/mutants\/Absent\.tla of the adopted formal package cannot be read in the reference/,
		);
		assert.equal(existsSync(tool.ran), false, "no exploration ran");
	});

	it("un projet sans modèle ne recherche ni ne lance aucun outil formel", async () => {
		const { t, state } = await runCounterChange(null);
		const frozen = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
		assert.ok(frozen, "the protocol is frozen");
		assert.equal(
			frozen.controls.some((c) => c.parser === "tlc" || c.formal_package),
			false,
			"no formal control is frozen for a profile that adopts no model",
		);
	});
});
