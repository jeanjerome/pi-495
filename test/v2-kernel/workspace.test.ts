import { strict as assert } from "node:assert";
import { readFileSync, symlinkSync, unlinkSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GitWorkspace, DEFAULT_WORKSPACE_POLICY, inspectGit } from "../../src/adapters/workspace/git-workspace.ts";
import { walkTree, diffEntries, isExcluded } from "../../src/adapters/workspace/walk.ts";
import {
	fixtureTs,
	gitCmd,
	initRepo,
	tempDir,
	writeFiles,
	fixtureSpecial,
	fixtureMavenMultiModule,
	ESC,
	removedAfterEach,
} from "../helpers/fixtures.ts";

let root: string;
let ws: GitWorkspace;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-ws-", cleanups);
	ws = new GitWorkspace(join(root, "workspaces"));
});

describe("reference capture: the five entry situations (§9.1, SA-002, SA-003, GIT-01)", () => {
	it("empty directory gives an explicit empty reference", async () => {
		const p = join(root, "empty");
		writeFiles(p, {});
		const ref = await ws.captureReference(p, DEFAULT_WORKSPACE_POLICY);
		assert.equal(ref.kind, "empty_directory");
		assert.equal(ref.entries.length, 0);
		assert.equal(ref.head_commit, null);
	});
	it("git repository without HEAD keeps user files inventoried as pre-existing, without git error", async () => {
		const p = join(root, "nohead");
		writeFiles(p, { "a.txt": "user work", "src/b.js": "1" });
		initRepo(p, false);
		const ref = await ws.captureReference(p, DEFAULT_WORKSPACE_POLICY);
		assert.equal(ref.kind, "git_no_head");
		assert.equal(ref.head_commit, null);
		assert.deepEqual(
			ref.entries.map((e) => [e.path, e.baseline_state, e.origin]),
			[
				["a.txt", "added", "user"],
				["src/b.js", "added", "user"],
			],
		);
	});
	it("clean repository references HEAD and the tree", async () => {
		const p = join(root, "clean");
		fixtureTs(p);
		initRepo(p);
		const ref = await ws.captureReference(p, DEFAULT_WORKSPACE_POLICY);
		assert.equal(ref.kind, "git_clean_head");
		assert.match(ref.head_commit!, /^[0-9a-f]{40}$/);
		assert.equal(ref.branch, "main");
		assert.ok(ref.entries.every((e) => e.baseline_state === "unchanged"));
	});
	it("dirty repository distinguishes user modifications and untracked files from committed content", async () => {
		const p = join(root, "dirty");
		fixtureTs(p);
		initRepo(p);
		writeFileSync(join(p, "src", "greet.js"), "export function greet(n) { return `Hi ${n}`; }\n");
		writeFileSync(join(p, "notes.txt"), "untracked user file\n");
		const ref = await ws.captureReference(p, DEFAULT_WORKSPACE_POLICY);
		assert.equal(ref.kind, "git_dirty_head");
		const byPath = new Map(ref.entries.map((e) => [e.path, e]));
		assert.equal(byPath.get("src/greet.js")?.baseline_state, "modified");
		assert.equal(byPath.get("src/greet.js")?.origin, "user");
		assert.equal(byPath.get("notes.txt")?.origin, "user");
		assert.equal(byPath.get("README.md")?.baseline_state, "unchanged");
		assert.equal(byPath.get("README.md")?.origin, "unknown");
	});
	it("non-git directory gives an initial snapshot", async () => {
		const p = join(root, "plain");
		writeFiles(p, { "x.txt": "x" });
		const ref = await ws.captureReference(p, DEFAULT_WORKSPACE_POLICY);
		assert.equal(ref.kind, "non_git_directory");
		assert.equal(ref.entries[0]?.origin, "user");
	});
	it("the reference digest does not depend on the branch name nor on the path (§5.3)", async () => {
		const a = join(root, "a");
		const b = join(root, "b");
		fixtureTs(a);
		fixtureTs(b);
		initRepo(a);
		initRepo(b);
		gitCmd(b, ["checkout", "-qb", "feature/x"]);
		const ra = await ws.captureReference(a, DEFAULT_WORKSPACE_POLICY);
		const rb = await ws.captureReference(b, DEFAULT_WORKSPACE_POLICY);
		assert.equal(ra.tree_digest, rb.tree_digest);
		assert.notEqual(ra.branch, rb.branch);
	});
});

describe("workspace isolation and candidate manifest (GIT-02, RM-050, RM-049, ADR-011)", () => {
	it("excludes generated directories at every depth and sanitizes retained references", async () => {
		assert.equal(isExcluded("target/classes/App.class", ["target/"]), true);
		assert.equal(isExcluded("infrastructure/target/test-classes/Feature.class", ["target/"]), true);
		assert.equal(isExcluded("infrastructure/src/target/Feature.java", ["target/"]), true);
		assert.equal(isExcluded("infrastructure/src/targeted/Feature.java", ["target/"]), false);

		const project = join(root, "reactor-with-generated-output");
		fixtureMavenMultiModule(project, true);
		writeFiles(project, {
			"domain/target/classes/Address.class": "stale bytecode",
			"infrastructure/target/test-classes/features/User.feature": "stale test resource",
		});
		writeFileSync(
			join(project, "infrastructure", "target", "application.jar"),
			"x".repeat(DEFAULT_WORKSPACE_POLICY.max_file_bytes + 1),
		);
		const retained = await ws.captureReference(project, { ...DEFAULT_WORKSPACE_POLICY, exclusions: [] });
		assert.ok(
			retained.entries.some((entry) => entry.path.includes("/target/")),
			"the retained snapshot reproduces the former inventory",
		);
		assert.equal(retained.limits.truncated, true);
		retained.entries.push({ ...retained.entries[0]!, path: ".DS_Store" });

		const handle = await ws.createWorkspace(retained, DEFAULT_WORKSPACE_POLICY);
		assert.equal(existsSync(join(handle.path, "domain", "target")), false);
		assert.equal(existsSync(join(handle.path, "infrastructure", "target")), false);
		const manifest = await ws.snapshotCandidate(handle, retained, DEFAULT_WORKSPACE_POLICY);
		assert.equal(
			manifest.entries.some((entry) => entry.path.includes("/target/")),
			false,
		);
		assert.equal(
			manifest.entries.some((entry) => entry.path.endsWith(".DS_Store")),
			false,
		);
		assert.deepEqual(manifest.selected_paths, []);
		assert.equal(manifest.limits.truncated, false);
		assert.deepEqual(manifest.limits.notes, []);
	});

	it("given the default exclusions, then a copy keeps node_modules/vitest/dist/index.js and drops dist/index.js and module/target/classes", async () => {
		assert.equal(isExcluded("node_modules/vitest/dist/index.js", ["dist/"]), false);
		assert.equal(isExcluded("packages/app/node_modules/vitest/dist/index.js", ["dist/"]), false);
		assert.equal(isExcluded("packages/app/dist/index.js", ["dist/"]), true);
		assert.equal(isExcluded("packages/app/node_modules/x", ["node_modules/"]), true);

		const project = join(root, "node-project-with-installed-dependencies");
		writeFiles(project, {
			"package.json": "{}",
			"src/index.js": "export {};\n",
			"dist/index.js": "build artefact",
			"node_modules/vitest/dist/index.js": "export {};\n",
			"module/pom.xml": "<project/>",
			"module/target/classes/A.class": "stale bytecode",
		});
		const reference = await ws.captureReference(project, DEFAULT_WORKSPACE_POLICY);
		const handle = await ws.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
		assert.equal(existsSync(join(handle.path, "node_modules", "vitest", "dist", "index.js")), true);
		assert.equal(existsSync(join(handle.path, "dist", "index.js")), false);
		assert.equal(existsSync(join(handle.path, "dist")), false);
		assert.equal(existsSync(join(handle.path, "module", "target", "classes")), false);
	});

	it("given the default exclusions, when a candidate rewrites node_modules/.vite/vitest/x/results.json and adds a file under node_modules/.vite-temp/ and the API token under node_modules/.vitest/, then its manifest carries none of them, while a change to node_modules/vitest/dist/index.js is still in it", async () => {
		const project = join(root, "vitest-project");
		writeFiles(project, {
			"package.json": "{}",
			"node_modules/vitest/dist/index.js": "export {};\n",
			"node_modules/.vite/vitest/x/results.json": '{"version":"5.0.0","results":[]}',
		});
		const reference = await ws.captureReference(project, DEFAULT_WORKSPACE_POLICY);
		const handle = await ws.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
		writeFiles(handle.path, {
			"node_modules/.vite/vitest/x/results.json": '{"version":"5.0.0","results":[[0.4]]}',
			"node_modules/.vite-temp/vitest.config.ts.timestamp.mjs": "export default {};\n",
			"node_modules/.vitest/.vitest-secret-token": "token\n",
			"node_modules/vitest/dist/index.js": "export const patched = true;\n",
		});
		const manifest = await ws.snapshotCandidate(handle, reference, DEFAULT_WORKSPACE_POLICY);
		assert.deepEqual(manifest.selected_paths, ["node_modules/vitest/dist/index.js"]);
		assert.deepEqual(
			manifest.entries.filter((e) => e.path.startsWith("node_modules/.vite")),
			[],
		);
	});

	it("resolves retained workspaces from the former colocated root", () => {
		const current = join(root, "current-workspaces");
		const legacy = join(root, "legacy-workspaces");
		const retained = join(legacy, "ws_retained");
		writeFiles(retained, { "marker.txt": "retained" });
		const compatible = new GitWorkspace(current, [legacy]);
		assert.equal(compatible.workspacePath("ws_retained"), retained);
		assert.equal(compatible.workspacePath("ws_new"), join(current, "ws_new"));
	});

	it("the worker writes in the workspace, never in the project; the manifest lists added, modified, deleted, mode and symlink changes", async () => {
		const p = join(root, "proj");
		fixtureTs(p);
		initRepo(p);
		writeFileSync(join(p, "notes.txt"), "user\n");
		const ref = await ws.captureReference(p, DEFAULT_WORKSPACE_POLICY);
		const handle = await ws.createWorkspace(ref, DEFAULT_WORKSPACE_POLICY);
		assert.notEqual(handle.path, p);
		assert.equal(readFileSync(join(handle.path, "notes.txt"), "utf8"), "user\n");
		writeFileSync(
			join(handle.path, "src", "greet.js"),
			"export function greet(name) {\n  return `Hello, ${name}!`;\n}\n",
		);
		writeFileSync(join(handle.path, "src", "new.js"), "export const x = 1;\n");
		unlinkSync(join(handle.path, "README.md"));
		chmodSync(join(handle.path, "scripts", "lint.js"), 0o755);
		symlinkSync("greet.js", join(handle.path, "src", "alias.js"));
		const manifest = await ws.snapshotCandidate(handle, ref, DEFAULT_WORKSPACE_POLICY);
		const states = Object.fromEntries(manifest.entries.map((e) => [e.path, e.baseline_state]));
		assert.equal(states["src/greet.js"], "modified");
		assert.equal(states["src/new.js"], "added");
		assert.equal(states["README.md"], "deleted");
		assert.equal(states["scripts/lint.js"], "mode_changed");
		assert.equal(states["src/alias.js"], "added");
		assert.equal(states["notes.txt"], "unchanged");
		assert.equal(manifest.entries.find((e) => e.path === "notes.txt")?.origin, "user");
		assert.equal(manifest.entries.find((e) => e.path === "src/new.js")?.origin, "agent");
		assert.deepEqual(manifest.selected_paths, [
			"README.md",
			"scripts/lint.js",
			"src/alias.js",
			"src/greet.js",
			"src/new.js",
		]);
		assert.equal(manifest.base_digest, ref.tree_digest);
		assert.equal(readFileSync(join(p, "README.md"), "utf8"), "# f-ts\n", "project untouched");
		assert.equal(existsSync(join(p, "src", "new.js")), false);
		const again = await ws.snapshotCandidate(handle, ref, DEFAULT_WORKSPACE_POLICY);
		assert.equal(again.manifest_digest, manifest.manifest_digest, "identity is deterministic");
		await ws.closeWorkspace(handle.workspace_id, "delete");
		assert.equal(existsSync(handle.path), false);
		assert.equal(existsSync(join(p, "notes.txt")), true, "user work preserved after abandon (RM-056)");
	});
	it("a candidate identity changes with content, not with the workspace name", async () => {
		const p = join(root, "proj");
		fixtureTs(p);
		initRepo(p);
		const ref = await ws.captureReference(p, DEFAULT_WORKSPACE_POLICY);
		const h1 = await ws.createWorkspace(ref, DEFAULT_WORKSPACE_POLICY);
		const h2 = await ws.createWorkspace(ref, DEFAULT_WORKSPACE_POLICY);
		writeFileSync(join(h1.path, "x.js"), "1");
		writeFileSync(join(h2.path, "x.js"), "1");
		const m1 = await ws.snapshotCandidate(h1, ref, DEFAULT_WORKSPACE_POLICY);
		const m2 = await ws.snapshotCandidate(h2, ref, DEFAULT_WORKSPACE_POLICY);
		assert.equal(m1.manifest_digest, m2.manifest_digest);
		writeFileSync(join(h2.path, "x.js"), "2");
		assert.notEqual(
			(await ws.snapshotCandidate(h2, ref, DEFAULT_WORKSPACE_POLICY)).manifest_digest,
			m1.manifest_digest,
		);
	});
	it("special files are inventoried honestly: binary digested, escaping symlink kept as a link, executable mode kept (F-SPECIAL)", async () => {
		const p = join(root, "special");
		fixtureSpecial(p);
		writeFileSync(join(p, ".DS_Store"), "host metadata");
		writeFileSync(join(p, "src", "._exec.sh"), "host metadata");
		const walked = await walkTree(p, DEFAULT_WORKSPACE_POLICY);
		const link = walked.entries.find((e) => e.path === "escape-link");
		assert.equal(link?.kind, "symlink");
		assert.equal(link?.symlink_target, "../etc/passwd");
		assert.equal(walked.entries.find((e) => e.path === "src/exec.sh")?.mode, "000755");
		assert.ok(
			walked.entries.some((e) => e.path.includes(`${ESC}[31m`)),
			"hostile name preserved as bytes",
		);
		assert.equal(walked.entries.find((e) => e.path === "bin/data.bin")?.size, 5);
		assert.equal(
			walked.entries.some((e) => e.path === ".DS_Store" || e.path.includes("/._")),
			false,
			"host metadata is not normative content",
		);
	});
	it("a file above the size limit is reported as a limit, not silently skipped (AT-12)", async () => {
		const p = join(root, "big");
		writeFiles(p, { "big.bin": "x".repeat(2000), "small.txt": "s" });
		const walked = await walkTree(p, { ...DEFAULT_WORKSPACE_POLICY, max_file_bytes: 1000 });
		assert.equal(walked.limits.truncated, true);
		assert.equal(walked.entries.find((e) => e.path === "big.bin")?.content_digest, null);
		assert.ok(walked.limits.notes[0]?.includes("big.bin"));
		const diff = diffEntries(walked.entries, walked.entries);
		assert.ok(diff.every((e) => e.baseline_state === "unchanged"));
	});
	it("given a node_modules file above the file limit, when the candidate is observed, then its entry carries a digest and the limits note no excess, while the same file outside node_modules is still noted", async () => {
		const p = join(root, "deps");
		const nineMiB = "x".repeat(9 * 1024 * 1024);
		assert.ok(nineMiB.length > DEFAULT_WORKSPACE_POLICY.max_file_bytes);
		writeFiles(p, { "node_modules/x/big.node": nineMiB, "small.txt": "s" });
		const installed = await walkTree(p, DEFAULT_WORKSPACE_POLICY);
		const entry = installed.entries.find((e) => e.path === "node_modules/x/big.node");
		assert.match(entry?.content_digest ?? "", /^sha256:[0-9a-f]{64}$/);
		assert.equal(installed.limits.truncated, false);
		assert.deepEqual(installed.limits.notes, []);
		const outside = join(root, "outside");
		writeFiles(outside, { "big.node": nineMiB });
		const walked = await walkTree(outside, DEFAULT_WORKSPACE_POLICY);
		assert.equal(walked.entries.find((e) => e.path === "big.node")?.content_digest, null);
		assert.deepEqual(walked.limits.notes, [`big.node exceeds ${DEFAULT_WORKSPACE_POLICY.max_file_bytes} bytes`]);
	});
	it("inspectGit ignores a parent repository", async () => {
		const p = join(root, "parent");
		fixtureTs(p);
		initRepo(p);
		writeFiles(join(p, "sub"), { "f.txt": "1" });
		const info = await inspectGit(join(p, "sub"));
		assert.equal(info.is_repo, false);
	});
});
