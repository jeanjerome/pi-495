import { strict as assert } from "node:assert";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { MAX_REPORT_BYTES } from "../../src/adapters/execution/parsers.ts";
import { openProjectView } from "../../src/adapters/stacks/project-view.ts";
import { ProjectViewRefusal } from "../../src/application/stacks/project-view.ts";
import { tempDir, writeFiles, removedAfterEach } from "../helpers/fixtures.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const REFS = [{ requirement_id: "R1", revision: 1 }];

/** A POM that declares one module, which only this file names. */
const OUTSIDE_POM =
	"<project><modelVersion>4.0.0</modelVersion><groupId>x</groupId><artifactId>outside</artifactId><version>1</version><packaging>pom</packaging><modules><module>outside-module</module></modules></project>\n";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-project-view-", cleanups);
});

describe("a technology reads the project through a view bounded to the copy", () => {
	it("given a project whose pom.xml is a link to a file outside the copy that declares outside-module, when its technology is detected, then no control is declared, no fact names outside-module, and the blind spot names pom.xml as escaping the copy and not read", () => {
		writeFiles(join(root, "outside"), { "pom.xml": OUTSIDE_POM });
		const project = join(root, "project");
		writeFiles(project, { "src/main/java/App.java": "public class App {}\n" });
		symlinkSync(join(root, "outside", "pom.xml"), join(project, "pom.xml"));

		const detection = STACKS_OF_495.recognise(project, REFS);

		assert.deepEqual(
			detection.controls.map((c) => c.control_id),
			[],
		);
		assert.ok(!JSON.stringify(detection.facts).includes("outside-module"), JSON.stringify(detection.facts));
		assert.ok(
			detection.capability_missing.some((spot) => spot.includes("pom.xml escapes the copy and was not read")),
			detection.capability_missing.join(" | "),
		);
	});

	it("given a package.json past the read bound, when its technology is detected, then no control is declared and the blind spot names its size", () => {
		const project = join(root, "project");
		writeFiles(project, {});
		writeFileSync(join(project, "package.json"), `{"scripts":{"test":"node --test"}}${" ".repeat(MAX_REPORT_BYTES)}`);

		const detection = STACKS_OF_495.recognise(project, REFS);

		assert.deepEqual(detection.controls, []);
		assert.match(detection.capability_missing.join(" | "), /package\.json is \d+ bytes, past the read bound/);
	});
});

describe("the view of a copy", () => {
	it("reads, lists and finds what the copy holds, a link inside it included, and nothing where the copy holds nothing", () => {
		const project = join(root, "project");
		writeFiles(project, { "a/b.txt": "b\n", "a/c/d.txt": "d\n" });
		symlinkSync(join(project, "a", "b.txt"), join(project, "link.txt"));
		const view = openProjectView(project);

		assert.equal(view.read("a/b.txt"), "b\n");
		assert.equal(view.read("link.txt"), "b\n");
		assert.deepEqual(view.list("a"), [
			{ name: "b.txt", directory: false },
			{ name: "c", directory: true },
		]);
		assert.equal(view.exists("a/c"), true);
		assert.equal(view.exists("missing"), false);
		assert.equal(view.read("missing"), null);
		assert.equal(view.read("a"), null);
		assert.deepEqual(view.list("missing"), []);
	});

	it("reads a file of exactly the read bound, and refuses one a byte past it, naming its size", () => {
		const project = join(root, "project");
		writeFiles(project, {});
		writeFileSync(join(project, "at-bound.txt"), "a".repeat(MAX_REPORT_BYTES));
		writeFileSync(join(project, "past-bound.txt"), "a".repeat(MAX_REPORT_BYTES + 1));
		const view = openProjectView(project);

		assert.equal(view.read("at-bound.txt")?.length, MAX_REPORT_BYTES);
		assert.throws(() => view.read("past-bound.txt"), {
			message: `past-bound.txt is ${MAX_REPORT_BYTES + 1} bytes, past the read bound of ${MAX_REPORT_BYTES}: it was not read`,
		});
	});

	it("refuses a path that leads out of the copy, by its text or by a directory linked outside, naming it", () => {
		writeFiles(join(root, "outside"), { "secret.txt": "s\n" });
		const project = join(root, "project");
		writeFiles(project, {});
		symlinkSync(join(root, "outside"), join(project, "linked"));
		const view = openProjectView(project);

		assert.throws(() => view.read("../outside/secret.txt"), {
			name: "Error",
			message: "../outside/secret.txt escapes the copy and was not read",
		});
		assert.throws(() => view.exists("linked/secret.txt"), ProjectViewRefusal);
		assert.throws(() => view.list("linked"), { message: "linked escapes the copy and was not read" });
	});
});
