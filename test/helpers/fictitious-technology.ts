/**
 * The projects the tests drive the example technology on: a tracked copy of its sample project, which holds
 * `fict.toml`, the greeting and the case that checks it.
 */
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFiles } from "./fixtures.ts";
import { trackedProject } from "./harness-fixture.ts";

const SAMPLE_PROJECT = join(import.meta.dirname, "..", "..", "examples", "fictitious-technology", "project");

export const GREETING = readFileSync(join(SAMPLE_PROJECT, "src", "greeting.txt"), "utf8");

/** A tracked copy of the sample project, with `files` added. */
export function greetingProject(files: Record<string, string> = {}): string {
	return trackedProject((root) => {
		cpSync(SAMPLE_PROJECT, root, { recursive: true });
		writeFiles(root, files);
	});
}
