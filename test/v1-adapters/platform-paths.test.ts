import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { legacyDataDirs, resolveDataDir, resolveWorkspacesDir } from "../../src/adapters/platform/paths.ts";
import { describeEnvironment } from "../../src/application/environment.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import { reusableQualification } from "../../src/application/qualification.ts";
import { Runner, candidate, protocol, ref, tick, KERNEL } from "../helpers/change-fixture.ts";

describe("platform storage paths", () => {
	it("stores data in one whitespace-free home directory, never in a platform application folder", () => {
		assert.equal(resolveDataDir({}, "/Users/demo"), "/Users/demo/.495");
		assert.equal(resolveDataDir({}, "/home/demo"), "/home/demo/.495");
		assert.equal(resolveDataDir({ HARNESS495_DATA_DIR: "/srv/495" }, "/Users/demo"), "/srv/495");
		// Being whitespace-free is what keeps the workspaces colocated rather than displaced.
		assert.equal(
			resolveWorkspacesDir(resolveDataDir({}, "/Users/demo"), {}, "darwin", "/Users/demo", "/private/tmp"),
			"/Users/demo/.495/workspaces",
		);
	});

	it("still resolves the former default locations, for reading only", () => {
		assert.deepEqual(legacyDataDirs({}, "darwin", "/Users/demo"), ["/Users/demo/Library/Application Support/495"]);
		assert.deepEqual(legacyDataDirs({}, "linux", "/home/demo"), ["/home/demo/.local/share/495"]);
		assert.deepEqual(legacyDataDirs({ XDG_DATA_HOME: "/xdg" }, "linux", "/home/demo"), ["/xdg/495"]);
	});

	it("keeps workspaces beside a whitespace-free data directory", () => {
		assert.equal(
			resolveWorkspacesDir("/tmp/495-data", {}, "darwin", "/Users/demo", "/private/tmp"),
			"/tmp/495-data/workspaces",
		);
	});

	it("keeps workspaces out of a former data directory whose path carries whitespace", () => {
		const path = resolveWorkspacesDir(
			"/Users/demo/Library/Application Support/495",
			{},
			"darwin",
			"/Users/demo",
			"/private/tmp",
		);
		assert.equal(path, "/Users/demo/Library/Caches/495/workspaces");
		assert.equal(/\s/.test(path), false);
	});

	it("honours an explicit workspace root and falls back to a whitespace-free temporary path", () => {
		assert.equal(
			resolveWorkspacesDir(
				"/data with spaces",
				{ HARNESS495_WORKSPACES_DIR: "/srv/495-ws" },
				"linux",
				"/home/demo",
				"/tmp",
			),
			"/srv/495-ws",
		);
		assert.equal(
			resolveWorkspacesDir("/data with spaces", {}, "linux", "/home/demo user", "/tmp"),
			"/tmp/495-workspaces",
		);
	});
});

describe("environment identity (RM-018, RM-076)", () => {
	it("covers the running 495 build, so an upgrade mid-change is a different environment", () => {
		const a = describeEnvironment("pi-0.85.1", "seatbelt", {});
		assert.match(a.facts.harness.build_digest, /^sha256:[0-9a-f]{64}$/);
		assert.notEqual(a.facts.harness.version, "unknown", "the running package version is part of the identity");
		assert.equal(
			describeEnvironment("pi-0.85.1", "seatbelt", {}).ref.digest,
			a.ref.digest,
			"the identity is stable for one build",
		);
		// Everything else equal, another build is another environment: qualifications and evidence
		// produced before an upgrade can no longer be confused with those produced after it.
		const other = digestValue({
			...a.facts,
			harness: { ...a.facts.harness, build_digest: `sha256:${"0".repeat(64)}` },
		});
		assert.notEqual(other, a.ref.digest);
	});
});

describe("component version change and dependent qualifications (EXT-02, REC-16, RM-076)", () => {
	/** A probe whose reported version is the only thing that moves between the two environments. */
	const probes = (version: string): Record<string, [string, string[]]> => ({
		toolchain: [process.execPath, ["-e", `console.log("toolchain ${version}")`]],
	});

	it("a locked component moving to another version is another environment", () => {
		const before = describeEnvironment("pi-0.85.1", "seatbelt", probes("1.0.0"));
		const after = describeEnvironment("pi-0.85.1", "seatbelt", probes("1.0.1"));
		assert.equal(before.facts.tools.toolchain, "toolchain 1.0.0");
		assert.equal(after.facts.tools.toolchain, "toolchain 1.0.1");
		assert.deepEqual(
			{ ...after.facts, tools: {} },
			{ ...before.facts, tools: {} },
			"nothing but the component version differs",
		);
		assert.notEqual(after.ref.digest, before.ref.digest);
		assert.notEqual(after.ref.environment_id, before.ref.environment_id);
	});

	it("a qualification established before the update is not reused after it, and the protocol carrying it no longer passes G2", () => {
		const before = describeEnvironment("pi-0.85.1", "seatbelt", probes("1.0.0"));
		const after = describeEnvironment("pi-0.85.1", "seatbelt", probes("1.0.1"));
		const unit = protocol().controls[0]!;
		const established = protocol({
			environment_digest: before.ref.digest,
			qualifications: {
				unit: {
					positive: "PASS",
					negative: "FAIL",
					incident: "INDETERMINATE",
					qualified: true,
					environment_digest: before.ref.digest,
					notes: [],
				},
			},
		});
		assert.ok(
			reusableQualification([established], unit, before.ref.digest),
			"the same sensor in the same environment is not requalified",
		);
		assert.equal(
			reusableQualification([established], unit, after.ref.digest),
			null,
			"the three witnesses have not answered under the new component version",
		);
		// The protocol frozen before the update claims an environment the change is no longer in.
		const r = new Runner().create({ environment_digest: after.ref.digest }).g0().g1();
		r.run({
			type: "gate.evaluate",
			gate: "G2",
			at: tick(),
			actor: KERNEL,
			protocol_ref: ref("prt_1", established),
			protocol: established,
		});
		assert.equal(r.s.gates.G2?.verdict, "FAIL");
		assert.ok(
			r.s.gates.G2?.reasons.some((reason) => reason.includes("environment")),
			r.s.gates.G2?.reasons.join("; "),
		);
	});

	it("the update invalidates the evidence and the gates that depended on the old environment, and sends the change back to the protocol", () => {
		const after = describeEnvironment("pi-0.85.1", "seatbelt", probes("1.0.1"));
		const r = new Runner().toDeciding(candidate("c1"));
		assert.ok(r.s.evidence.length > 0 && r.s.evidence.every((e) => e.valid));
		r.run({ type: "environment.change", at: tick(), actor: KERNEL, digest: after.ref.digest });
		assert.equal(r.s.environment_digest, after.ref.digest);
		assert.equal(r.s.phase, "verification_design", "the change goes back to building and qualifying its protocol");
		assert.ok(
			r.s.evidence.every((e) => !e.valid),
			"evidence measured in the former environment no longer counts",
		);
		assert.deepEqual(
			(["G2", "G3", "G4", "G5"] as const).filter((g) => r.s.gates[g]),
			[],
			"every gate from G2 onwards is invalidated",
		);
		// An update decided in the middle of an intervention is refused instead of splitting it.
		const running = new Runner().toImplementing();
		running.run({
			type: "intervention.start",
			at: tick(),
			actor: KERNEL,
			intervention_id: "int_x",
			role: "implement",
			attempt_id: "att_x",
			model: { provider_id: "p", model_id: "m", thinking_level: "off", location: "on_machine" },
			profile_id: "implement",
			profile_qualified: true,
		});
		running.expectError(
			{ type: "environment.change", at: tick(), actor: KERNEL, digest: after.ref.digest },
			"PRECONDITION_FAILED",
		);
	});
});
