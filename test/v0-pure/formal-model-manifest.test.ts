import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const REPOSITORY = join(import.meta.dirname, "..", "..");
const MODEL_DIRECTORY = join(REPOSITORY, "specs", "formal", "change-lifecycle");
const MANIFEST = join(MODEL_DIRECTORY, "manifest.json");
const RULES = readFileSync(join(REPOSITORY, "specs", "amont", "specification-fonctionnelle.md"), "utf8");
const COMMANDS = readFileSync(join(REPOSITORY, "src", "domain", "change", "commands.ts"), "utf8");

interface ModelManifest {
	model?: string;
	required_properties?: string[];
	invariants?: Record<string, { rules: string[]; actions: string[] }>;
	actions?: Record<string, { command: string; code: string[] }>;
}

/** The manifest of the change-lifecycle model, or nothing when no model has been written. */
const manifest: ModelManifest = existsSync(MANIFEST)
	? (JSON.parse(readFileSync(MANIFEST, "utf8")) as ModelManifest)
	: {};
const model = manifest.model ? readFileSync(join(MODEL_DIRECTORY, manifest.model), "utf8") : "";

/** A rule of the functional specification: a row of its rule tables, or a scenario or flow heading. */
function isNormativeRule(id: string): boolean {
	return RULES.includes(`| ${id} |`) || RULES.includes(`### ${id} `);
}

/** Whether a TLA+ operator is defined in the model, with or without parameters. */
function definedInModel(name: string): boolean {
	return new RegExp(`^${name}(\\([^)]*\\))? ==`, "m").test(model);
}

/** Whether `path#symbol` names a function or a method that the kernel file defines. */
function definedInKernel(reference: string): boolean {
	const [path, symbol] = reference.split("#");
	if (!path || !symbol || !existsSync(join(REPOSITORY, path))) return false;
	return new RegExp(`(^export function ${symbol}\\(|^\\t${symbol}\\()`, "m").test(
		readFileSync(join(REPOSITORY, path), "utf8"),
	);
}

/** The actions the model's next-state relation is made of: the operator heading each disjunct of `Next`. */
function actionsOfNext(): string[] {
	const next = /^Next ==\n((?:[ \t]+.*\n)+)/m.exec(model)?.[1] ?? "";
	return [...next.matchAll(/\\\/\s*(?:\\E [^:]+:\s*)?([A-Z]\w*)/g)].map((m) => m[1] ?? "");
}

describe("the manifest of the change-lifecycle model", () => {
	it("every required invariant cites its rule and a matching public action", () => {
		const invariants = Object.entries(manifest.invariants ?? {});
		assert.ok(invariants.length > 0, "the model manifest relates no invariant to a rule of the kernel");
		for (const [name, invariant] of invariants) {
			assert.ok(manifest.required_properties?.includes(name), `${name} is a required property of the exploration`);
			assert.ok(definedInModel(name), `${name} is defined in the model`);
			assert.ok(invariant.rules.length > 0, `${name} cites the rule it preserves`);
			for (const rule of invariant.rules) assert.ok(isNormativeRule(rule), `${name} cites ${rule}, a normative rule`);
			assert.ok(invariant.actions.length > 0, `${name} names the actions that must preserve it`);
			for (const action of invariant.actions) {
				const kernel = manifest.actions?.[action];
				assert.ok(kernel, `${name} names ${action}, which the table maps to the kernel`);
				assert.ok(COMMANDS.includes(`type: "${kernel.command}"`), `${action} is the public command ${kernel.command}`);
			}
		}
	});

	it("every action of the model is mapped to a kernel command and to the code that carries it out", () => {
		const table = manifest.actions ?? {};
		const next = actionsOfNext();
		assert.ok(next.length > 0, "the model defines its next-state relation as a disjunction of actions");
		assert.deepEqual(
			next.filter((action) => !(action in table)),
			[],
			"every action of Next is in the table",
		);
		for (const [action, kernel] of Object.entries(table)) {
			assert.ok(next.includes(action), `${action} is an action of Next`);
			assert.ok(definedInModel(action), `${action} is defined in the model`);
			assert.ok(COMMANDS.includes(`type: "${kernel.command}"`), `${action} is the public command ${kernel.command}`);
			assert.ok(kernel.code.length > 0, `${action} names the kernel code that carries it out`);
			for (const reference of kernel.code) assert.ok(definedInKernel(reference), `${reference} is defined`);
		}
	});
});
