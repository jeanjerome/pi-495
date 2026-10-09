import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { exploreManifest, formalToolingMissing, normalisedTrace } from "../helpers/check-formal.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";

const MODEL = join(import.meta.dirname, "..", "..", "specs", "formal", "change-lifecycle");

interface ArchivedCounterexample {
	mutant: string;
	manifest: string;
	property: string;
	trace: { step: number; action: string; state: string }[];
}

interface Manifest {
	model: string;
	files: Record<string, string>;
}

let store: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	store = outputDir("change-model-mutants-", cleanups);
});

/** Explores a mutant and checks that it violates its designated property along the archived trace. */
async function assertViolates(manifest: string, property: string, archive: string): Promise<void> {
	const { report, output } = await exploreManifest(join(MODEL, manifest), store);
	assert.equal(report?.outcome, "counterexample", `${manifest} is explored to a violation, not refused: ${output}`);
	assert.equal(report?.result?.counterexample?.property, property, `${manifest} violates ${property}`);
	const archived = JSON.parse(readFileSync(join(MODEL, "counterexamples", archive), "utf8")) as ArchivedCounterexample;
	assert.equal(archived.property, property, `the archived trace is tied to ${property}`);
	assert.equal(archived.manifest, manifest);
	assert.deepEqual(normalisedTrace(report?.result?.counterexample?.trace ?? []), archived.trace, "the trace is kept");
}

describe("the mutants of the change-lifecycle model", { skip: formalToolingMissing }, () => {
	it("the stale-proof mutant violates precisely the freshness property", async () => {
		await assertViolates("mutant-stale-proof.manifest.json", "FreshAcceptance", "stale-proof.json");
	});

	it("the exhausted-budget mutant violates precisely the obligations property", async () => {
		await assertViolates(
			"mutant-accept-exhausted.manifest.json",
			"AcceptanceNeedsObligations",
			"accept-exhausted.json",
		);
	});

	it("the forged-acceptance mutant violates precisely the human provenance property", async () => {
		await assertViolates("mutant-forged-acceptance.manifest.json", "HumanProvenance", "forged-acceptance.json");
	});

	it("the mutants live outside the adopted model", () => {
		const adopted = JSON.parse(readFileSync(join(MODEL, "manifest.json"), "utf8")) as Manifest;
		assert.deepEqual(
			Object.keys(adopted.files).filter((file) => file.startsWith("mutants/")),
			[],
		);
	});

	it("a syntax fault in a mutant is an error, never the expected violation", async () => {
		const copy = join(outputDir("change-model-syntax-", cleanups), "change-lifecycle");
		cpSync(MODEL, copy, { recursive: true });
		const manifestPath = join(copy, "mutant-stale-proof.manifest.json");
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
		const mutant = join(copy, manifest.model);
		// Text after the closing line of a module is not read: the fault goes inside the module.
		writeFileSync(mutant, readFileSync(mutant, "utf8").replace(/^====/m, "Broken == /\\\n===="));
		const digest = createHash("sha256").update(readFileSync(mutant)).digest("hex");
		manifest.files[manifest.model] = `sha256:${digest}`;
		writeFileSync(manifestPath, JSON.stringify(manifest));
		const { report, output } = await exploreManifest(manifestPath, store);
		assert.equal(report?.outcome, "error", output);
		assert.match(report?.reasons.join("\n") ?? "", /Parsing or semantic analysis failed/);
		assert.equal(report?.result?.counterexample ?? null, null);
	});
});
