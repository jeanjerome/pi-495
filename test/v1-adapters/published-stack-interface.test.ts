import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import type {
	CapabilityQuestion,
	CoverageCapability,
	InstallCapability,
	MutationCapability,
	Offer,
	ProjectEntry,
	ProjectView,
	QualityCapability,
	StackPlugin,
	StructureCapability,
	TestCapability,
	WorkspaceCapability,
} from "pi-495/stack";
import { FICT_PLUGIN } from "../../examples/fictitious-technology/fict.ts";
import { buildUnlessPresent, PACKAGE_ROOT, packageManifest } from "../helpers/built-package.ts";

/**
 * The capabilities of a technology, each by the type `pi-495/stack` publishes for it: the typecheck of this file
 * fails when one of them leaves the interface.
 */
interface PublishedCapabilities<Model> {
	readonly tests: TestCapability<Model>;
	readonly coverage?: CoverageCapability<Model>;
	readonly mutation?: MutationCapability<Model>;
	readonly quality?: QualityCapability<Model>;
	readonly structure?: StructureCapability<Model>;
	readonly workspace?: WorkspaceCapability;
	readonly install?: InstallCapability;
}

describe("the interface of a technology, published under pi-495/stack", () => {
	it('given the package of 495, package.json declares exports["./stack"] with its types, and import("pi-495/stack") gives stackConformance and the readers of the exit code, of JUnit XML and of LCOV', async () => {
		const entry = packageManifest().exports?.["./stack"];
		assert.equal(typeof entry?.types, "string", 'package.json declares exports["./stack"] with its types');
		assert.equal(typeof entry?.default, "string", 'package.json declares exports["./stack"] with its module');
		buildUnlessPresent(entry!.default!);
		assert.ok(existsSync(join(PACKAGE_ROOT, entry!.types!)), `${entry!.types} is built beside ${entry!.default}`);
		const stack = await import("pi-495/stack");
		assert.equal(typeof stack.stackConformance, "function", "pi-495/stack gives stackConformance");
		const lcov = stack.lcovReader({
			expected: () => true,
			silencing: { pattern: /c8 ignore/, rule_id: "r", hides: "h" },
		});
		assert.deepEqual(
			[stack.EXIT_CODE_READER.id, stack.JUNIT_READER.id, lcov.id],
			["exit-code", "junit-xml", "lcov"],
			"pi-495/stack gives the readers of the exit code, of JUnit XML and of LCOV",
		);
	});

	it("given a module typed against pi-495/stack, StackPlugin, each of its capabilities, the question they receive, their offer and the view of the project are types it reads there", () => {
		const capabilities: PublishedCapabilities<true> = FICT_PLUGIN.capabilities;
		const technology: StackPlugin<true> = { ...FICT_PLUGIN, capabilities };
		const entries: ProjectEntry[] = [{ name: "fict.toml", directory: false }];
		const view: ProjectView = {
			exists: (path) => entries.some((entry) => entry.name === path),
			read: () => null,
			list: () => entries,
		};
		const question: CapabilityQuestion<true> = {
			model: true,
			view,
			requirement_refs: [],
			node_binary: process.execPath,
			referential_packages: [],
		};
		const offer: Offer = technology.capabilities.tests.offer(question);
		assert.equal(technology.recognise(view), true, "the technology recognises the project through the view");
		assert.equal(offer.kind, "available", "the tests capability answers the question with its offer");
	});

	it("given the exports of the package, a path it does not declare reaches no module of the package", async () => {
		for (const specifier of [
			"pi-495",
			"pi-495/package.json",
			"pi-495/dist/extension/index.js",
			"pi-495/extension/index.js",
			"pi-495/stack.js",
		])
			await assert.rejects(import(specifier), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" }, `${specifier} is closed`);
	});

	it("given the exports of the package, Pi still loads the extension from the path pi.extensions names, relative to the package root", async () => {
		const [extension] = packageManifest().pi.extensions;
		assert.ok(extension, "package.json names the extension Pi loads");
		buildUnlessPresent(extension);
		const loaded = await import(pathToFileURL(join(PACKAGE_ROOT, extension)).href);
		assert.equal(typeof loaded.default, "function", `${extension} exports the extension factory Pi calls`);
	});
});
