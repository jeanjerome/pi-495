import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import type { SandboxProfile } from "../../src/ports/execution.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = realpathSync(outputDir("writable-", cleanups));
});

const runner = () =>
	new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")), READERS_OF_495);

/** Whether the profile lets the command write at `path`, a granted path or a path under one. */
function grantsWrite(profile: SandboxProfile, path: string): boolean {
	return profile.write_paths.some((granted) => path === granted || path.startsWith(granted + sep));
}

describe("the writable paths of a control's profile", () => {
	it("a lines.txt linked to a file outside the copy, a target/495-vitest under a target linked to a directory outside the copy and a neighbouring copy-other/f are not among the writable paths of the profile", () => {
		const copy = join(root, "copy");
		mkdirSync(copy);
		writeFileSync(join(root, "outside.txt"), "untouched");
		mkdirSync(join(root, "outdir"));
		mkdirSync(join(root, "copy-other"));
		symlinkSync(join(root, "outside.txt"), join(copy, "lines.txt"));
		symlinkSync(join(root, "outdir"), join(copy, "target"));
		const profile = runner().profileFor(
			controlOf({ writable_paths: ["lines.txt", "target/495-vitest", join(root, "copy-other", "f")] }),
			copy,
		);
		const outsideTheCopy = [
			join(copy, "lines.txt"),
			join(root, "outside.txt"),
			join(copy, "target"),
			join(copy, "target", "495-vitest"),
			join(root, "outdir"),
			join(root, "outdir", "495-vitest"),
			join(root, "copy-other", "f"),
		];
		assert.deepEqual(
			outsideTheCopy.filter((path) => grantsWrite(profile, path)),
			[],
			"the profile grants the write under a path whose real path leaves the copy",
		);
	});

	it("a lines.txt linked to the absent file absent.txt outside the copy, named by --out=lines.txt, and a target/495-vitest under a target linked to the absent directory absentdir outside the copy are neither among the writable paths of the profile nor among its files to create", () => {
		const copy = join(root, "copy");
		mkdirSync(copy);
		symlinkSync(join(root, "absent.txt"), join(copy, "lines.txt"));
		symlinkSync("../absentdir", join(copy, "target"));
		const profile = runner().profileFor(
			controlOf({ writable_paths: ["lines.txt", "target/495-vitest"], command: ["tool", "--out=lines.txt"] }),
			copy,
		);
		const outsideTheCopy = [
			join(copy, "lines.txt"),
			join(root, "absent.txt"),
			join(copy, "target"),
			join(copy, "target", "495-vitest"),
			join(root, "absentdir"),
			join(root, "absentdir", "495-vitest"),
		];
		assert.deepEqual(
			outsideTheCopy.filter((path) => grantsWrite(profile, path)),
			[],
			"the profile grants the write under a path whose dangling link leads outside the copy",
		);
		assert.deepEqual(
			(profile.write_files ?? []).filter(
				(path) => path === join(copy, "lines.txt") || path === join(root, "absent.txt"),
			),
			[],
			"the profile has bubblewrap create a file a dangling link leads outside the copy",
		);
	});

	it("a d1/d2/a/l whose dangling link l leads outside the copy, reached through a link a back to the copy and named by --out=d1/d2/a/l, is neither among the writable paths of the profile nor among its files to create", () => {
		const copy = join(root, "copy");
		mkdirSync(join(copy, "d1", "d2"), { recursive: true });
		symlinkSync("../..", join(copy, "d1", "d2", "a"));
		symlinkSync("../escape", join(copy, "l"));
		const declared = join(copy, "d1", "d2", "a", "l");
		const profile = runner().profileFor(
			controlOf({ writable_paths: ["d1/d2/a/l"], command: ["tool", "--out=d1/d2/a/l"] }),
			copy,
		);
		assert.deepEqual(
			[declared, join(root, "escape")].filter((path) => grantsWrite(profile, path)),
			[],
			"the profile grants the write under a path whose dangling link, read from the link's real directory, leads outside the copy",
		);
		assert.deepEqual(
			(profile.write_files ?? []).filter((path) => path === declared || path === join(root, "escape")),
			[],
			"the profile has bubblewrap create a file a dangling link leads outside the copy",
		);
	});

	it("a lines.txt whose dangling link s/../escape climbs out of s, a link to a directory outside the copy, named by --out=lines.txt, is neither among the writable paths of the profile nor among its files to create", () => {
		const copy = join(root, "copy");
		mkdirSync(copy);
		mkdirSync(join(root, "outside", "x", "y"), { recursive: true });
		symlinkSync(join(root, "outside", "x", "y"), join(copy, "s"));
		symlinkSync("s/../escape", join(copy, "lines.txt"));
		const profile = runner().profileFor(
			controlOf({ writable_paths: ["lines.txt"], command: ["tool", "--out=lines.txt"] }),
			copy,
		);
		const outsideTheCopy = [join(copy, "lines.txt"), join(root, "outside", "x", "escape")];
		assert.deepEqual(
			outsideTheCopy.filter((path) => grantsWrite(profile, path)),
			[],
			"the profile grants the write under a path whose dangling link leaves the copy through the link its target names",
		);
		assert.deepEqual(
			(profile.write_files ?? []).filter((path) => outsideTheCopy.includes(path)),
			[],
			"the profile has bubblewrap create a file a dangling link leads outside the copy",
		);
	});

	it("running a control whose writable target/reports/mutation lies under a target linked to a directory outside the copy creates no reports directory in that outside directory", async () => {
		const copy = join(root, "copy");
		mkdirSync(copy);
		mkdirSync(join(root, "outdir"));
		symlinkSync(join(root, "outdir"), join(copy, "target"));
		await runner().runControl({
			...invocationBase(),
			control: controlOf({ writable_paths: ["target/reports/mutation"] }),
			workspace_path: copy,
		});
		assert.equal(
			existsSync(join(root, "outdir", "reports")),
			false,
			"the runner creates the parent of a writable path the profile does not grant",
		);
	});

	it("a report.txt and an absent target/reports of a copy reached through a link stay granted, at their place in the copy", () => {
		mkdirSync(join(root, "real", "copy"), { recursive: true });
		symlinkSync(join(root, "real"), join(root, "linked"));
		const copy = join(root, "linked", "copy");
		writeFileSync(join(copy, "report.txt"), "");
		const profile = runner().profileFor(controlOf({ writable_paths: ["report.txt", "target/reports"] }), copy);
		assert.deepEqual(profile.write_paths, [join(copy, "report.txt"), join(copy, "target", "reports")]);
	});

	it("a writable path that is a loop of links in the copy gives a profile that grants nothing outside the copy", () => {
		const copy = join(root, "copy");
		mkdirSync(copy);
		symlinkSync("b", join(copy, "a"));
		symlinkSync("a", join(copy, "b"));
		const profile = runner().profileFor(controlOf({ writable_paths: ["a"] }), copy);
		assert.deepEqual(
			profile.write_paths.filter((path) => !path.startsWith(copy + sep)),
			[],
		);
	});

	it("a writable path that is the copy itself, reached through a link, stays granted", () => {
		mkdirSync(join(root, "real", "copy"), { recursive: true });
		symlinkSync(join(root, "real"), join(root, "linked"));
		const copy = join(root, "linked", "copy");
		const profile = runner().profileFor(controlOf({ writable_paths: ["."] }), copy);
		assert.deepEqual(profile.write_paths, [copy]);
	});
});
