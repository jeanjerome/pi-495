import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { digestValue } from "../../src/contracts/digest.ts";
import { check } from "../../src/contracts/validate.ts";
import { HarnessConfigFile } from "../../src/contracts/v1/config.ts";
import type { ControlDefinition, FormalPackage, Protocol } from "../../src/contracts/v1/protocol.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";
import { ENV, KERNEL, Runner, protocol, ref, tick } from "../helpers/change-fixture.ts";

const pinned = (c: string): string => `sha256:${c.repeat(64)}`;

const PACKAGE: FormalPackage = {
	model: "spec/Compteur.tla",
	config: "spec/Compteur.cfg",
	files: {
		"spec/Compteur.tla": pinned("a"),
		"spec/Compteur.cfg": pinned("b"),
		"spec/CompteurFautif.tla": pinned("c"),
	},
	required_properties: ["Borne"],
	expected_violation: { mutant: "spec/CompteurFautif.tla", replaces: "spec/Compteur.tla" },
	tool: {
		name: "TLC",
		version: "2.19 of 08 August 2024 (rev: 5a47802)",
		java: "/usr/bin/java",
		jar: "/opt/tlaplus/tla2tools.jar",
	},
	budget: { timeout_ms: 600_000, workers: 1, heap_mb: 512 },
	requirement_ids: ["R1"],
	correspondence: [{ control_id: "unit", cases: ["the counter replays the traces of the model"] }],
};

/** The control the package is explored by, as the kernel freezes it: its version is the identity of the package. */
function formalControl(pkg: FormalPackage): ControlDefinition {
	return {
		control_id: "formal-model",
		version: digestValue(pkg),
		title: `TLC on ${pkg.model}`,
		command: [pkg.tool.java, "-cp", pkg.tool.jar, "tlc2.TLC", "-tool", "-config", pkg.config, pkg.model],
		cwd: ".",
		env_allowlist: ["PATH", "HOME"],
		env: {},
		timeout_ms: pkg.budget.timeout_ms,
		parser: "tlc",
		report_path: null,
		structure_rules: [],
		provides: [],
		requires: [],
		scope_argument: null,
		network: "denied",
		writable_paths: [".495-tlc"],
		requirement_refs: pkg.requirement_ids.map((requirement_id) => ({ requirement_id, revision: 1 })),
		protected: true,
		protected_paths: Object.keys(pkg.files),
		formal_package: pkg,
	};
}

function carrying(pkg: FormalPackage): Protocol {
	const base = protocol();
	return {
		...base,
		controls: [...base.controls, formalControl(pkg)],
		qualifications: {
			...base.qualifications,
			"formal-model": {
				positive: "PASS",
				negative: "FAIL",
				incident: "INDETERMINATE",
				qualified: true,
				environment_digest: ENV,
				notes: [],
			},
		},
	};
}

function g2(p: Protocol, formal_control: FormalPackage | null) {
	const r = new Runner({ formal_control }).create().g0().g1();
	r.run({ type: "gate.evaluate", gate: "G2", at: tick(), actor: KERNEL, protocol_ref: ref("p", p), protocol: p });
	return r.s.gates.G2!;
}

function without(field: keyof FormalPackage): Partial<FormalPackage> {
	const { [field]: _left, ...rest } = PACKAGE;
	return rest;
}

const declares = (formal_control: unknown): boolean => check(HarnessConfigFile, { policy: { formal_control } });

describe("a formal control is declared explicitly in the means the profile adopts", () => {
	it("un paquet incomplet est refusé et un projet sans modèle ne réclame aucun outil", () => {
		assert.ok(declares(PACKAGE), "an adopted formal package is a setting of the profile");
		for (const field of [
			"correspondence",
			"required_properties",
			"expected_violation",
			"tool",
			"requirement_ids",
		] as const)
			assert.equal(declares(without(field)), false, `a package without ${field} is refused`);
		assert.equal(declares({ ...PACKAGE, correspondence: [] }), false, "a package names its correspondence controls");
		assert.equal(declares({ ...PACKAGE, required_properties: [] }), false, "a package names what it must check");
		assert.equal(
			declares({ ...PACKAGE, tool: { ...PACKAGE.tool, jar: undefined } }),
			false,
			"a package names the TLC it is explored with",
		);

		assert.equal(g2(carrying(PACKAGE), PACKAGE).verdict, "PASS", "a complete package, qualified, is frozen");
		const unpinned = {
			...PACKAGE,
			files: { "spec/Compteur.cfg": pinned("b"), "spec/CompteurFautif.tla": pinned("c") },
		};
		const loose = g2(carrying(unpinned), unpinned);
		assert.equal(loose.verdict, "FAIL", "a package whose model is not pinned is not frozen");
		assert.match(
			loose.reasons.join(" | "),
			/formal package spec\/Compteur\.tla does not pin its model spec\/Compteur\.tla/,
		);
		const dropped = g2(protocol(), PACKAGE);
		assert.equal(dropped.verdict, "FAIL");
		assert.match(dropped.reasons.join(" | "), /policy adopts a formal package which the protocol does not carry/);
		const stale = g2(carrying(PACKAGE), { ...PACKAGE, files: { ...PACKAGE.files, "spec/Compteur.cfg": pinned("d") } });
		assert.match(
			stale.reasons.join(" | "),
			/the protocol explores a formal package other than the one the policy adopts/,
		);

		assert.equal(DEFAULT_POLICY.formal_control, null, "the default profile adopts no formal package");
		const plain = g2(protocol(), null);
		assert.equal(plain.verdict, "PASS", "a project without a model is frozen without any formal tool");
		assert.doesNotMatch(plain.reasons.join(" | "), /formal/);
	});

	it("G2 refuses a formal control that is not versioned by its package, bears on an unknown requirement, ties to an undefined control or is not qualified", () => {
		const selfReplacing = {
			...PACKAGE,
			expected_violation: { mutant: "spec/Compteur.tla", replaces: "spec/Compteur.tla" },
		};
		assert.match(
			g2(carrying(selfReplacing), selfReplacing).reasons.join(" | "),
			/its mutant spec\/Compteur\.tla replaces itself/,
		);
		const reversioned = carrying(PACKAGE);
		reversioned.controls = reversioned.controls.map((c) =>
			c.formal_package ? { ...c, version: `sha256:${"9".repeat(64)}` } : c,
		);
		assert.match(
			g2(reversioned, PACKAGE).reasons.join(" | "),
			/formal control formal-model is not versioned by the package it explores/,
		);
		const unknown = { ...PACKAGE, requirement_ids: ["R404"] };
		assert.match(
			g2(carrying(unknown), unknown).reasons.join(" | "),
			/formal package spec\/Compteur\.tla references unknown requirement R404/,
		);
		const untied = { ...PACKAGE, correspondence: [{ control_id: "replay", cases: ["a trace"] }] };
		assert.match(
			g2(carrying(untied), untied).reasons.join(" | "),
			/correspondence control replay of formal package spec\/Compteur\.tla is not defined/,
		);
		const unqualified = carrying(PACKAGE);
		unqualified.qualifications = {
			...unqualified.qualifications,
			"formal-model": { ...unqualified.qualifications["formal-model"]!, qualified: false },
		};
		const refused = g2(unqualified, PACKAGE);
		assert.equal(refused.verdict, "FAIL");
		assert.match(refused.reasons.join(" | "), /formal control formal-model is not qualified/);
	});
});
