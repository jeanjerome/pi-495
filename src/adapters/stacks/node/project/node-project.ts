/** The model of a Node project its capabilities share (CMP-TGT): its manifest and the suite `scripts.test` declares. */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import { type PackageManifest, readManifest } from "./package-manifest.ts";
import { type NodeSuite, suiteOf } from "./test-runner.ts";

export interface NodeProject {
	manifest: PackageManifest;
	/** `scripts.test` as written, when it is a string. */
	scripts_test: string | undefined;
	suite: NodeSuite;
}

export function readNodeProject(view: ProjectView): NodeProject {
	const manifest = readManifest(view);
	const scriptsTest = typeof manifest.scripts?.test === "string" ? manifest.scripts.test : undefined;
	return { manifest, scripts_test: scriptsTest, suite: suiteOf(view, scriptsTest) };
}
