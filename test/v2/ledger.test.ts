import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { SqliteLedger, evidenceDigest } from "../../src/adapters/storage-sqlite/ledger.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { Evidence } from "../../src/contracts/v1/evidence.ts";
import { Runner, candidate, HUMAN, KERNEL, ENV } from "../helpers/change-fixture.ts";
import { replay } from "../../src/domain/change/apply.ts";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "495-ledger-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function sampleEvents() {
	const r = new Runner();
	r.toDeciding(candidate("c1")).g5();
	return r.events;
}

describe("SQLite ledger: append-only chain and projections (EVD-02, EVD-03, NFR-03)", () => {
	it("appends events with a hash chain, projects the state and verifies integrity", async () => {
		const ledger = new SqliteLedger(join(dir, "state.sqlite"));
		const events = sampleEvents();
		const first = ledger.appendChange("chg_1", 0, events.slice(0, 5), { correlation_id: "cor_1" });
		assert.equal(first.revision, 5);
		const second = ledger.appendChange("chg_1", 5, events.slice(5), { correlation_id: "cor_2", causation_id: first.event_ids[4] });
		assert.equal(second.revision, events.length);
		const loaded = ledger.loadChange("chg_1");
		assert.ok(loaded);
		assert.deepEqual(loaded.state, replay(events));
		assert.equal(loaded.state.outcome, "accepted");
		const stored = ledger.readChangeEvents("chg_1");
		assert.equal(stored.length, events.length);
		assert.equal(stored[0]!.previous_hash, null);
		for (let i = 1; i < stored.length; i++) assert.equal(stored[i]!.previous_hash, stored[i - 1]!.hash);
		assert.equal(stored[5]!.causation_id, first.event_ids[4]);
		const report = await ledger.verifyIntegrity();
		assert.equal(report.ok, true, JSON.stringify(report.problems));
		assert.equal(report.events_checked, events.length);
		ledger.close();
	});

	it("refuses a concurrent write with REVISION_CONFLICT and never overwrites (RM-067)", () => {
		const ledger = new SqliteLedger(join(dir, "state.sqlite"));
		const events = sampleEvents();
		ledger.appendChange("chg_1", 0, events.slice(0, 3), { correlation_id: "a" });
		assert.throws(() => ledger.appendChange("chg_1", 0, events.slice(0, 3), { correlation_id: "b" }), (e: Error) => /REVISION_CONFLICT|revision/.test(String((e as { code?: string }).code ?? e.message)));
		assert.throws(() => ledger.appendChange("chg_1", 2, events.slice(3, 4), { correlation_id: "b" }));
		assert.equal(ledger.readChangeEvents("chg_1").length, 3);
		ledger.close();
	});

	it("a crash before commit leaves the previous consistent state (fault injection)", async () => {
		let crash = false;
		const ledger = new SqliteLedger(join(dir, "state.sqlite"), { hooks: { beforeCommit: () => { if (crash) throw new Error("simulated crash before COMMIT"); } } });
		const events = sampleEvents();
		ledger.appendChange("chg_1", 0, events.slice(0, 4), { correlation_id: "a" });
		crash = true;
		assert.throws(() => ledger.appendChange("chg_1", 4, events.slice(4, 9), { correlation_id: "b" }), /simulated crash/);
		crash = false;
		assert.equal(ledger.loadChange("chg_1")?.revision, 4);
		assert.equal(ledger.readChangeEvents("chg_1").length, 4);
		assert.equal((await ledger.verifyIntegrity()).ok, true);
		ledger.appendChange("chg_1", 4, events.slice(4), { correlation_id: "c" });
		assert.deepEqual(ledger.loadChange("chg_1")?.state, replay(events));
		ledger.close();
	});

	it("a crash between events and projection is atomic too, and survives reopening the file", async () => {
		const path = join(dir, "state.sqlite");
		let crash = true;
		const ledger = new SqliteLedger(path, { hooks: { beforeProjection: () => { if (crash) throw new Error("crash before projection"); } } });
		const events = sampleEvents();
		assert.throws(() => ledger.appendChange("chg_1", 0, events, { correlation_id: "a" }), /crash before projection/);
		assert.equal(ledger.loadChange("chg_1"), null);
		assert.equal(ledger.readChangeEvents("chg_1").length, 0);
		ledger.close();
		crash = false;
		const reopened = new SqliteLedger(path);
		reopened.appendChange("chg_1", 0, events, { correlation_id: "a" });
		reopened.close();
		const again = new SqliteLedger(path);
		assert.equal(again.loadChange("chg_1")?.state.outcome, "accepted");
		assert.equal((await again.verifyIntegrity()).ok, true);
		again.close();
	});

	it("detects a tampered event, a tampered projection and rebuilds the projection from events (F-EVIDENCE)", async () => {
		const ledger = new SqliteLedger(join(dir, "state.sqlite"));
		const events = sampleEvents();
		ledger.appendChange("chg_1", 0, events, { correlation_id: "a" });
		ledger.db.prepare("UPDATE changes SET state = ? WHERE change_id = ?").run(JSON.stringify({ ...ledger.loadChange("chg_1")!.state, outcome: "integrated" }), "chg_1");
		let report = await ledger.verifyIntegrity();
		assert.equal(report.ok, false);
		assert.ok(report.problems.some((p) => p.kind === "projection"));
		const rebuilt = ledger.rebuildChange("chg_1");
		assert.equal(rebuilt?.outcome, "accepted");
		assert.equal((await ledger.verifyIntegrity()).ok, true);
		const target = ledger.readChangeEvents("chg_1")[3]!;
		ledger.db.prepare("UPDATE events SET payload = ? WHERE event_id = ?").run(JSON.stringify({ ...target.event, at: "1999-01-01T00:00:00.000Z" }), target.event_id);
		report = await ledger.verifyIntegrity();
		assert.equal(report.ok, false);
		assert.ok(report.problems.some((p) => p.kind === "chain" && p.subject === target.event_id));
		ledger.close();
	});

	it("stores programs, artifacts, evidence, decisions, operations, bindings and leases", async () => {
		const ledger = new SqliteLedger(join(dir, "state.sqlite"));
		const cas = new CasObjectStore(join(dir, "objects"));
		ledger.appendProgram("prg_1", 0, [{ type: "program.created", at: "2026-09-16T10:00:00.000Z", actor: HUMAN, program_id: "prg_1", project_path: "/p", objective: { artifact_id: "obj", revision: 1, content_digest: digestValue("o"), schema_version: 1 }, title: "T", budgets: { max_increments: 5, increments_started: 0, program_ms: 1000, program_ms_used: 0 } }], { correlation_id: "x" });
		assert.equal(ledger.listPrograms("/p").length, 1);
		assert.equal(ledger.loadProgram("prg_1")?.state.title, "T");
		const obj = await cas.putText("hello");
		const ref = ledger.putArtifact("mandate", "chg_1", "mnd_1", obj, "kernel", "2026-09-16T10:00:00.000Z");
		assert.equal(ref.revision, 1);
		assert.equal(ledger.putArtifact("mandate", "chg_1", "mnd_1", obj, "kernel", "2026-09-16T10:00:01.000Z").revision, 2);
		assert.equal(ledger.listArtifacts("chg_1", "mandate").length, 2);
		assert.equal(ledger.getArtifact({ artifact_id: "mnd_1", revision: 1 })?.object.digest, obj.digest);
		const evidence: Evidence = { evidence_id: "evd_1", requirement_refs: [], control_id: "unit", control_version: "1", subject: { kind: "candidate", id: "c", revision: 1, digest: digestValue("c") }, protocol_revision: { protocol_id: "p", revision: 1, content_digest: digestValue("p") }, environment_digest: ENV, inputs_digest: digestValue("i"), started_at: "2026-09-16T10:00:00.000Z", ended_at: "2026-09-16T10:00:01.000Z", verdict: "PASS", facts: {}, findings: [], artifacts: [{ name: "stdout", ref: obj }], limits: { truncated: false, bytes_read: 5, bytes_total: 5, exclusions: [], unstable: false, notes: [] }, producer: KERNEL, integrity: { content_digest: "", chained_to: null } };
		evidence.integrity.content_digest = evidenceDigest(evidence);
		ledger.putEvidence(evidence, "chg_1");
		assert.deepEqual(ledger.getEvidence("evd_1"), evidence);
		assert.equal((await ledger.verifyIntegrity((d) => cas.verify(d))).ok, true);
		writeFileSync(cas.pathFor(obj.digest), "tampered");
		const report = await ledger.verifyIntegrity((d) => cas.verify(d));
		assert.equal(report.ok, false);
		assert.ok(report.problems.some((p) => p.kind === "object"));
		ledger.upsertOperation({ operation_id: "op_1", idempotency_key: "k1", operation_type: "verification", aggregate_id: "chg_1", inputs_digest: digestValue(1), status: "accepted", effect_state: "none", result: null, created_at: "t", updated_at: "t" });
		assert.equal(ledger.getOperationByKey("k1")?.operation_id, "op_1");
		ledger.bindSession({ session_id: "s1", cwd: "/p", program_id: "prg_1", change_id: null, bound_at: "t" });
		assert.equal(ledger.findBindingsByCwd("/p")[0]?.session_id, "s1");
		ledger.unbindSession("s1");
		assert.equal(ledger.getSessionBinding("s1"), null);
		const now = "2026-09-16T10:00:00.000Z";
		assert.ok(ledger.acquireLease("change:chg_1", "owner-a", 60_000, now));
		assert.equal(ledger.acquireLease("change:chg_1", "owner-b", 60_000, now), null);
		assert.ok(ledger.acquireLease("change:chg_1", "owner-b", 60_000, "2026-09-16T10:02:00.000Z"), "expired lease can be taken over");
		assert.equal(ledger.heartbeatLease("change:chg_1", "owner-a", 60_000, "2026-09-16T10:02:00.000Z"), false);
		ledger.close();
	});

	it("refuses a database whose schema is newer (NFR-08)", () => {
		const path = join(dir, "state.sqlite");
		const ledger = new SqliteLedger(path);
		ledger.db.prepare("INSERT INTO schema_migrations (version, digest, applied_at, result) VALUES (99, 'x', 't', 'applied')").run();
		ledger.close();
		assert.throws(() => new SqliteLedger(path), /newer than supported/);
	});
});

describe("CAS object store (§7.3)", () => {
	it("writes atomically, is idempotent and verifies digests", async () => {
		const cas = new CasObjectStore(join(dir, "objects"));
		const a = await cas.putText("hello");
		const b = await cas.putText("hello");
		assert.deepEqual(a, b);
		assert.equal(a.size_bytes, 5);
		assert.equal(new TextDecoder().decode((await cas.get(a))!), "hello");
		assert.equal(new TextDecoder().decode((await cas.get(a, { offset: 1, length: 3 }))!), "ell");
		assert.equal(await cas.verify(a.digest), true);
		assert.equal(await cas.get("sha256:" + "0".repeat(64)), null);
		assert.deepEqual(await cas.listDigests(), [a.digest]);
	});
	it("a crash before rename leaves no visible object, only a recoverable temporary", async () => {
		let crash = true;
		const cas = new CasObjectStore(join(dir, "objects"), { beforeRename: () => { if (crash) throw new Error("crash before rename"); } });
		await assert.rejects(cas.putText("data"), /crash before rename/);
		assert.equal(await cas.has(digestValue("x")), false);
		assert.deepEqual(await cas.listDigests(), []);
		assert.equal(readdirSync(join(dir, "objects", "tmp")).length, 1);
		assert.equal(await cas.cleanupTemporaries(), 1);
		crash = false;
		const ref = await cas.putText("data");
		assert.equal(await cas.verify(ref.digest), true);
	});
});
