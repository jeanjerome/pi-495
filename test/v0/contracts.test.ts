import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import fc from "fast-check";
import { canonicalize } from "../../src/contracts/canonical.ts";
import { digestValue, digestBytes, isDigest } from "../../src/contracts/digest.ts";
import { ContractError, validate, check } from "../../src/contracts/validate.ts";
import { CONTRACTS } from "../../src/contracts/registry.ts";
import { ActorRef, CanonicalError, Envelope } from "../../src/contracts/v1/common.ts";
import { Evidence } from "../../src/contracts/v1/evidence.ts";

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
		fc.assert(fc.property(fc.jsonValue(), (v) => {
			const d = digestValue(v);
			assert.ok(isDigest(d));
			assert.equal(d, digestValue(JSON.parse(JSON.stringify(v))));
		}));
		assert.equal(digestBytes(""), "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
	});
});

describe("runtime validation (AT-11, NFR-08)", () => {
	const actor = { actor_id: "a", actor_type: "human", role: "requester", origin: "tui_session", authentication_level: "session" };
	it("accepts a valid actor and refuses an unknown enum value or extra property", () => {
		assert.deepEqual(validate(ActorRef, actor), actor);
		assert.throws(() => validate(ActorRef, { ...actor, origin: "magic" }), ContractError);
		assert.throws(() => validate(ActorRef, { ...actor, extra: 1 }), ContractError);
		assert.equal(check(ActorRef, { ...actor, actor_type: "agent" }), true);
	});
	it("refuses an envelope with an unknown schema major version before any use", () => {
		const env = { schema_version: 1, message_id: "m", operation_id: "o", correlation_id: "c", causation_id: null, occurred_at: "2026-09-16T17:00:00.000Z", producer: { component: "x", version: "1", instance_id: "i" }, payload: {} };
		assert.deepEqual(validate(Envelope, env), env);
		const err = (() => { try { validate(Envelope, { ...env, schema_version: 2 }); } catch (e) { return e as ContractError; } })();
		assert.ok(err instanceof ContractError);
		assert.ok(err.violations.some((v) => v.path.includes("schema_version")));
	});
	it("evidence requires the closed verdict set and every mandatory field", () => {
		const evidence = { evidence_id: "e", requirement_refs: [{ requirement_id: "R1", revision: 1 }], control_id: "c", control_version: "1", subject: { kind: "candidate", id: "x", revision: 1, digest: digestValue(1) }, protocol_revision: { protocol_id: "p", revision: 1, content_digest: digestValue(2) }, environment_digest: digestValue(3), inputs_digest: digestValue(4), started_at: "2026-09-16T17:00:00.000Z", ended_at: "2026-09-16T17:00:01.000Z", verdict: "PASS", facts: {}, findings: [], artifacts: [], limits: { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] }, producer: actor, integrity: { content_digest: digestValue(5), chained_to: null } };
		assert.deepEqual(validate(Evidence, evidence), evidence);
		assert.throws(() => validate(Evidence, { ...evidence, verdict: "SKIPPED" }), ContractError);
		assert.throws(() => validate(Evidence, { ...evidence, verdict: "OK" }), ContractError);
		const { limits: _l, ...missing } = evidence;
		assert.throws(() => validate(Evidence, missing), ContractError);
	});
	it("canonical error keeps categories closed", () => {
		const err = { code: "CAPABILITY_MISSING", category: "capability", summary: "x", subject: null, phase: "verification_design", retryable: false, effect_state: "none", next_actions: ["qualify_capability"], details_ref: null };
		assert.deepEqual(validate(CanonicalError, err), err);
		assert.throws(() => validate(CanonicalError, { ...err, category: "other" }), ContractError);
	});
	it("every published contract has a stable urn id", () => {
		for (const [name, schema] of Object.entries(CONTRACTS)) assert.equal((schema as { $id?: string }).$id, `urn:495:contract:${name}:1`);
	});
});
