import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolveWorkspacesDir } from "../../src/adapters/platform/paths.ts";

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
