import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolveWorkspacesDir } from "../../src/adapters/platform/paths.ts";
import { describeEnvironment } from "../../src/application/environment.ts";
import { digestValue } from "../../src/contracts/digest.ts";

describe("platform storage paths", () => {
	it("keeps workspaces beside a whitespace-free data directory", () => {
		assert.equal(resolveWorkspacesDir("/tmp/495-data", {}, "darwin", "/Users/demo", "/private/tmp"), "/tmp/495-data/workspaces");
	});

	it("keeps macOS workspaces out of Application Support", () => {
		const path = resolveWorkspacesDir("/Users/demo/Library/Application Support/495", {}, "darwin", "/Users/demo", "/private/tmp");
		assert.equal(path, "/Users/demo/Library/Caches/495/workspaces");
		assert.equal(/\s/.test(path), false);
	});

	it("honours an explicit workspace root and falls back to a whitespace-free temporary path", () => {
		assert.equal(resolveWorkspacesDir("/data with spaces", { HARNESS495_WORKSPACES_DIR: "/srv/495-ws" }, "linux", "/home/demo", "/tmp"), "/srv/495-ws");
		assert.equal(resolveWorkspacesDir("/data with spaces", {}, "linux", "/home/demo user", "/tmp"), "/tmp/495-workspaces");
	});
});

describe("environment identity (RM-018, RM-076)", () => {
	it("covers the running 495 build, so an upgrade mid-change is a different environment", () => {
		const a = describeEnvironment("pi-0.85.1", "seatbelt", {});
		assert.match(a.facts.harness.build_digest, /^sha256:[0-9a-f]{64}$/);
		assert.notEqual(a.facts.harness.version, "unknown", "the running package version is part of the identity");
		assert.equal(describeEnvironment("pi-0.85.1", "seatbelt", {}).ref.digest, a.ref.digest, "the identity is stable for one build");
		// Everything else equal, another build is another environment: qualifications and evidence
		// produced before an upgrade can no longer be confused with those produced after it.
		const other = digestValue({ ...a.facts, harness: { ...a.facts.harness, build_digest: `sha256:${"0".repeat(64)}` } });
		assert.notEqual(other, a.ref.digest);
	});
});
