import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import fc from "fast-check";
import { canonicalize } from "../../src/contracts/canonical.ts";
import { digestValue, digestBytes, isDigest } from "../../src/contracts/digest.ts";
import { ContractError, validate, check } from "../../src/contracts/validate.ts";
import { CONTRACTS } from "../../src/contracts/registry.ts";
import { ActorRef, CanonicalError, Envelope } from "../../src/contracts/v1/common.ts";
import { Evidence } from "../../src/contracts/v1/evidence.ts";
import { ControlCapabilityDiagnosis, ControlDefinition, Protocol } from "../../src/contracts/v1/protocol.ts";
import { NODE_TEST_READER } from "../../src/adapters/stacks/node/tests/node-test-reader.ts";
import { NODE_LCOV_READER } from "../../src/adapters/stacks/node/coverage/coverage-control.ts";
import { STRYKER_READER } from "../../src/adapters/stacks/node/mutation/stryker-reader.ts";
import { protocol } from "../helpers/change-fixture.ts";

describe("canonical JSON and digests (§8.1)", () => {
	it("is independent of key order and omits undefined", () => {
		assert.equal(canonicalize({ b: 1, a: [1, { d: null, c: undefined }] }), '{"a":[1,{"d":null}],"b":1}');
		assert.equal(digestValue({ b: 1, a: 2 }), digestValue({ a: 2, b: 1 }));
		assert.notEqual(digestValue({ a: null }), digestValue({}));
		assert.notEqual(digestValue({ a: 0 }), digestValue({ a: null }));
	});
	it("refuses non-finite numbers", () => {
		assert.throws(() => canonicalize({ a: Number.NaN }), TypeError);
	});
	it("digest is stable and well formed for random objects", () => {
		fc.assert(
			fc.property(fc.jsonValue(), (v) => {
				const d = digestValue(v);
				assert.ok(isDigest(d));
				assert.equal(d, digestValue(JSON.parse(JSON.stringify(v))));
			}),
		);
		assert.equal(digestBytes(""), "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
	});
});

describe("runtime validation (AT-11, NFR-08)", () => {
	const actor = {
		actor_id: "a",
		actor_type: "human",
		role: "requester",
		origin: "tui_session",
		authentication_level: "session",
	};
	it("accepts a valid actor and refuses an unknown enum value or extra property", () => {
		assert.deepEqual(validate(ActorRef, actor), actor);
		assert.throws(() => validate(ActorRef, { ...actor, origin: "magic" }), ContractError);
		assert.throws(() => validate(ActorRef, { ...actor, extra: 1 }), ContractError);
		assert.equal(check(ActorRef, { ...actor, actor_type: "agent" }), true);
	});
	it("refuses an envelope with an unknown schema major version before any use", () => {
		const env = {
			schema_version: 1,
			message_id: "m",
			operation_id: "o",
			correlation_id: "c",
			causation_id: null,
			occurred_at: "2026-09-16T17:00:00.000Z",
			producer: { component: "x", version: "1", instance_id: "i" },
			payload: {},
		};
		assert.deepEqual(validate(Envelope, env), env);
		const err = (() => {
			try {
				validate(Envelope, { ...env, schema_version: 2 });
			} catch (e) {
				return e as ContractError;
			}
		})();
		assert.ok(err instanceof ContractError);
		assert.ok(err.violations.some((v) => v.path.includes("schema_version")));
	});
	it("evidence requires the closed verdict set and every mandatory field", () => {
		const evidence = {
			evidence_id: "e",
			requirement_refs: [{ requirement_id: "R1", revision: 1 }],
			control_id: "c",
			control_version: "1",
			subject: { kind: "candidate", id: "x", revision: 1, digest: digestValue(1) },
			protocol_revision: { protocol_id: "p", revision: 1, content_digest: digestValue(2) },
			environment_digest: digestValue(3),
			inputs_digest: digestValue(4),
			started_at: "2026-09-16T17:00:00.000Z",
			ended_at: "2026-09-16T17:00:01.000Z",
			verdict: "PASS",
			facts: {},
			findings: [],
			artifacts: [],
			limits: { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] },
			baseline: null,
			producer: actor,
			integrity: { content_digest: digestValue(5), chained_to: null },
		};
		assert.deepEqual(validate(Evidence, evidence), evidence);
		assert.throws(() => validate(Evidence, { ...evidence, verdict: "SKIPPED" }), ContractError);
		assert.throws(() => validate(Evidence, { ...evidence, verdict: "OK" }), ContractError);
		const { limits: _l, ...missing } = evidence;
		assert.throws(() => validate(Evidence, missing), ContractError);
	});
	it("canonical error keeps categories closed", () => {
		const err = {
			code: "CAPABILITY_MISSING",
			category: "capability",
			summary: "x",
			subject: null,
			phase: "qualification",
			retryable: false,
			effect_state: "none",
			next_actions: ["qualify_capability"],
			details_ref: null,
		};
		assert.deepEqual(validate(CanonicalError, err), err);
		assert.throws(() => validate(CanonicalError, { ...err, category: "other" }), ContractError);
	});
	it("every published contract has a stable urn id", () => {
		for (const [name, schema] of Object.entries(CONTRACTS))
			assert.equal((schema as { $id?: string }).$id, `urn:495:contract:${name}:1`);
	});
});

describe("the parser identifiers of a control", () => {
	const unit = {
		control_id: "unit",
		version: "1",
		title: "jest suite",
		command: ["node", "node_modules/jest/bin/jest.js"],
		cwd: ".",
		env_allowlist: ["PATH"],
		env: {},
		timeout_ms: 1000,
		parser: "jest-json",
		report_path: "495-jest-report.json",
		structure_rules: [],
		provides: [],
		requires: [],
		scope_argument: null,
		network: "denied",
		writable_paths: ["495-jest-report.json"],
		requirement_refs: [{ requirement_id: "R1", revision: 1 }],
		protected: true,
		protected_paths: ["tests/"],
	};
	it("given a control declaring the jest-json parser, then the protocol schema accepts it, and a control declaring an empty parser is refused", () => {
		assert.deepEqual(validate(ControlDefinition, unit), unit);
		assert.throws(() => validate(ControlDefinition, { ...unit, parser: "" }), ContractError);
	});
	it("given a control declaring the lcov parser, then the protocol schema accepts it and the parser is differential", () => {
		const coverage = {
			...unit,
			control_id: "coverage",
			parser: "lcov",
			report_path: "495-lcov.info",
			writable_paths: [],
		};
		assert.deepEqual(validate(ControlDefinition, coverage), coverage);
		assert.equal(NODE_LCOV_READER.differential, true);
		assert.equal(NODE_TEST_READER.differential, false);
	});
	it("given a control declaring the stryker-json parser, then the protocol schema accepts it and the parser is differential", () => {
		const mutation = {
			...unit,
			control_id: "mutation",
			parser: "stryker-json",
			report_path: "reports/mutation",
			writable_paths: ["reports/mutation", ".stryker-tmp"],
		};
		assert.deepEqual(validate(ControlDefinition, mutation), mutation);
		assert.equal(STRYKER_READER.differential, true);
	});
});

describe("the capability diagnosis of a protocol", () => {
	const diagnosis = {
		stack: "node",
		level: "executed",
		test_files: 3,
		discovered: 3,
		executed: 3,
		undiscriminated_requirements: [],
		unobserved_requirements: [],
		notes: [],
	};
	const recommendation = {
		test_type: "coverage",
		tool: "--experimental-test-coverage",
		version: "24.0.0",
		established_on: "2026-09-30",
		source: "https://nodejs.org/api/test.html#collecting-code-coverage",
		change: "add --experimental-test-coverage to scripts.test",
	};
	it("given a capability diagnosis carrying a recommendation, then the schema accepts it, and given one without the list, then it is still accepted", () => {
		const carrying = { ...diagnosis, recommendations: [recommendation] };
		assert.deepEqual(validate(ControlCapabilityDiagnosis, carrying), carrying);
		assert.deepEqual(validate(ControlCapabilityDiagnosis, diagnosis), diagnosis);
		assert.throws(
			() => validate(ControlCapabilityDiagnosis, { ...diagnosis, recommendations: [{ ...recommendation, extra: 1 }] }),
			ContractError,
		);
	});
});

describe("a file edit recommended to a target and the complement its owner adopted", () => {
	const recommendation = {
		test_type: "coverage",
		tool: "node --experimental-test-coverage",
		version: "24.21.0",
		established_on: "2026-09-30",
		source: "nodejs.org/docs/latest-v24.x/api/test.html#collecting-code-coverage",
		change: "in package.json, add --experimental-test-coverage to scripts.test",
	};
	const edit = { path: "package.json", current: "node --test", wanted: "node --test --experimental-test-coverage" };
	const adopted = {
		path: "package.json",
		digest: digestBytes('{"scripts":{"test":"node --test --experimental-test-coverage"}}'),
		test_type: "coverage",
		tool: "node --experimental-test-coverage",
	};
	const frozen = protocol();
	it("given a recommendation carrying a file edit and a protocol carrying an adopted complement, then the schema accepts them, and given neither, then it still accepts the protocol and the diagnosis", () => {
		const withEdit = { ...frozen.capability_diagnosis, recommendations: [{ ...recommendation, edit }] };
		assert.deepEqual(validate(ControlCapabilityDiagnosis, withEdit), withEdit);
		assert.deepEqual(
			validate(ControlCapabilityDiagnosis, { ...frozen.capability_diagnosis, recommendations: [recommendation] }),
			{
				...frozen.capability_diagnosis,
				recommendations: [recommendation],
			},
		);
		const carrying = { ...frozen, complements: [adopted] };
		assert.deepEqual(validate(Protocol, carrying), carrying);
		assert.deepEqual(validate(Protocol, frozen), frozen);
		assert.throws(
			() =>
				validate(ControlCapabilityDiagnosis, {
					...withEdit,
					recommendations: [{ ...recommendation, edit: { path: "package.json" } }],
				}),
			ContractError,
		);
		assert.throws(() => validate(Protocol, { ...frozen, complements: [{ ...adopted, extra: 1 }] }), ContractError);
	});
});

describe("an install recommended to a target and the packages its adoption installed", () => {
	const recommendation = {
		test_type: "coverage",
		tool: "@vitest/coverage-v8",
		version: "3.2.4",
		established_on: "2026-09-30",
		source: "vitest.dev/guide/coverage.html",
		change: "install @vitest/coverage-v8 at the installed vitest version",
	};
	const install = { package: "@vitest/coverage-v8", version: "3.2.4", manager: "npm" };
	const installedPackages = [{ name: "@vitest/coverage-v8", version: "3.2.4", integrity: "sha512-abc==" }];
	const frozen = protocol();
	it("given a recommendation carrying an install and a protocol carrying installed packages, then the schema accepts them, and given neither, then it still accepts the protocol and the diagnosis", () => {
		const withInstall = { ...frozen.capability_diagnosis, recommendations: [{ ...recommendation, install }] };
		assert.deepEqual(validate(ControlCapabilityDiagnosis, withInstall), withInstall);
		const carrying = { ...frozen, installed_packages: installedPackages };
		assert.deepEqual(validate(Protocol, carrying), carrying);
		assert.deepEqual(validate(Protocol, frozen), frozen);
		assert.deepEqual(
			validate(ControlCapabilityDiagnosis, { ...frozen.capability_diagnosis, recommendations: [recommendation] }),
			{ ...frozen.capability_diagnosis, recommendations: [recommendation] },
		);
		assert.throws(
			() =>
				validate(ControlCapabilityDiagnosis, {
					...withInstall,
					recommendations: [{ ...recommendation, install: { package: "@vitest/coverage-v8" } }],
				}),
			ContractError,
		);
		assert.throws(
			() => validate(Protocol, { ...frozen, installed_packages: [{ ...installedPackages[0], extra: 1 }] }),
			ContractError,
		);
	});
});

describe("an install recommended with a package manager", () => {
	const recommendation = {
		test_type: "coverage",
		tool: "org.jacoco:jacoco-maven-plugin",
		version: "0.8.15",
		established_on: "2026-09-30",
		source: "www.jacoco.org/jacoco/trunk/doc/maven.html",
		change: "declare jacoco-maven-plugin in the POM",
	};
	const diagnosis = protocol().capability_diagnosis;
	const installing = (manager: string) => ({
		...diagnosis,
		recommendations: [
			{ ...recommendation, install: { package: "org.jacoco:jacoco-maven-plugin", version: "0.8.15", manager } },
		],
	});
	it("given a recommendation installing with maven, then the schema accepts it, and given one installing with npm, then it still accepts it", () => {
		assert.deepEqual(validate(ControlCapabilityDiagnosis, installing("maven")), installing("maven"));
		assert.deepEqual(validate(ControlCapabilityDiagnosis, installing("npm")), installing("npm"));
		assert.throws(() => validate(ControlCapabilityDiagnosis, installing("gradle")), ContractError);
	});
});
