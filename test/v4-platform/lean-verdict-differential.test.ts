import { strict as assert } from "node:assert";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { VERDICTS, type Verdict } from "../../src/contracts/v1/common.ts";
import type { evaluateG5 } from "../../src/domain/gates/g5.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { mandatoryOutcome, observeG5, requirementOutcome } from "../helpers/g5-combination.ts";
import { type CombinationCase, leanCombine, leanMissing } from "../helpers/lean-verdicts.ts";

const REPOSITORY = join(import.meta.dirname, "..", "..");
/** Every list of verdicts up to this length is compared, under both rules. */
const EXHAUSTIVE_BOUND = 4;
/** The seeds of the longer lists, kept so that a divergence they find is replayed as it was found. */
const SEEDS = [495, 20261010, 11];
const GENERATED_PER_SEED = 100;
const GENERATED_LENGTHS = { min: EXHAUSTIVE_BOUND + 1, max: 16 };
const MODES = ["all", "any"] as const;
/** The line of `combine` in `g5.ts` that leaves an obligation with no verdict NOT_RUN. */
const EMPTY_LIST_LINE = 'if (v.length === 0) return verdicts.length === 0 ? "NOT_RUN" : "NOT_APPLICABLE";';

const cleanups = removedAfterEach();

/** Every case of length 0 to `bound`, shortest first: the first divergence found is a minimal one. */
function exhaustive(bound: number): CombinationCase[] {
	const cases: CombinationCase[] = [];
	let lists: Verdict[][] = [[]];
	for (let length = 0; length <= bound; length++) {
		for (const verdicts of lists) for (const mode of MODES) cases.push({ mode, verdicts });
		lists = lists.flatMap((l) => VERDICTS.map((v) => [...l, v]));
	}
	return cases;
}

/** Longer lists drawn from a seeded generator (mulberry32), reproducible from the seed alone. */
function generated(seed: number, count: number): CombinationCase[] {
	let state = seed >>> 0;
	const next = (): number => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
	return Array.from({ length: count }, () => {
		const length = GENERATED_LENGTHS.min + Math.floor(next() * (GENERATED_LENGTHS.max - GENERATED_LENGTHS.min + 1));
		return { mode: pick(MODES), verdicts: Array.from({ length }, () => pick(VERDICTS)) };
	});
}

/** The declared corpus: the approved table's cases, every list up to the bound, then the generated ones. */
function corpus(): CombinationCase[] {
	const table = JSON.parse(
		readFileSync(join(REPOSITORY, "specs", "formal", "verdicts", "correspondance.json"), "utf8"),
	) as { rules: { cases: CombinationCase[] }[] };
	const tabled = table.rules.flatMap((r) => r.cases);
	return [...exhaustive(EXHAUSTIVE_BOUND), ...SEEDS.flatMap((s) => generated(s, GENERATED_PER_SEED)), ...tabled];
}

/**
 * What G5 lets be seen of one combination: the outcome of a mandatory requirement; for an optional one, the verdict of
 * G5 when it is the only obligation, and the verdict it reports beside a mandatory requirement held INDETERMINATE —
 * G5 keeps its reasons only when it does not pass; and the outcome of a mandatory requirement beside an any_pass
 * obligation of PASS and FAIL, which must neither change it nor be changed by it.
 */
function observed(c: CombinationCase, g5: typeof evaluateG5): unknown {
	const alone = observeG5([{ mandatory: false, ...c }], g5);
	const held = observeG5(
		[
			{ mandatory: false, ...c },
			{ mandatory: true, mode: "all", verdicts: ["INDETERMINATE"] },
		],
		g5,
	);
	const prefix = "optional requirement R1: ";
	const reported = held.reasons.find((r) => r.startsWith(prefix))?.slice(prefix.length) ?? "PASS";
	const beside = observeG5(
		[
			{ mandatory: true, mode: "any", verdicts: ["PASS", "FAIL"] },
			{ mandatory: true, ...c },
		],
		g5,
	);
	return {
		mandatory: requirementOutcome(observeG5([{ mandatory: true, ...c }], g5), 0),
		optional: { alone: alone.verdict, outcome: requirementOutcome(held, 0), reported },
		beside_any_pass: {
			any_pass: requirementOutcome(beside, 0),
			other: requirementOutcome(beside, 1),
			g5: beside.verdict,
		},
	};
}

/** What G5 must let be seen when the combination is the verdict the Lean reference gives. */
function expected(combined: Verdict): unknown {
	const outcome = mandatoryOutcome(combined);
	return {
		mandatory: outcome,
		optional: { alone: "PASS", outcome: "PASS", reported: combined },
		beside_any_pass: { any_pass: "PASS", other: outcome, g5: outcome },
	};
}

/** The first case, in the corpus's order, where G5 does not show what the reference says; null when none. */
function firstDivergence(
	cases: readonly CombinationCase[],
	reference: readonly Verdict[],
	g5: typeof evaluateG5,
): { case: CombinationCase; lean: Verdict; expected: unknown; observed: unknown } | null {
	for (const [i, c] of cases.entries()) {
		const lean = reference[i] as Verdict;
		const seen = observed(c, g5);
		if (!isDeepStrictEqual(seen, expected(lean))) return { case: c, lean, expected: expected(lean), observed: seen };
	}
	return null;
}

/** `evaluateG5` from a disposable copy of `src/` whose `combine` accepts an obligation with no verdict. */
async function acceptingTheEmptyList(): Promise<typeof evaluateG5> {
	const copy = outputDir("g5-mutant-", cleanups);
	cpSync(join(REPOSITORY, "src"), copy, { recursive: true });
	const g5 = join(copy, "domain", "gates", "g5.ts");
	const source = readFileSync(g5, "utf8");
	assert.ok(source.includes(EMPTY_LIST_LINE), "the line the mutant rewrites is in g5.ts");
	writeFileSync(g5, source.replace(EMPTY_LIST_LINE, EMPTY_LIST_LINE.replace('? "NOT_RUN"', '? "PASS"')));
	return ((await import(pathToFileURL(g5).href)) as { evaluateG5: typeof evaluateG5 }).evaluateG5;
}

describe("the verdicts of the kernel compared to the Lean reference", { skip: leanMissing }, () => {
	it("the mutant that accepts the empty list is rejected and the adopted kernel agrees on the declared corpus", async () => {
		const cases = corpus();
		const { verdicts: reference, output } = leanCombine(cases, cleanups);
		assert.ok(reference, `the Lean reference evaluates the corpus: ${output}`);
		assert.equal(reference.length, cases.length, `one verdict per case: ${output}`);

		const { evaluateG5: adopted } = await import("../../src/domain/gates/g5.ts");
		const agreement = firstDivergence(cases, reference, adopted);
		assert.equal(agreement, null, `the adopted kernel agrees with the reference: ${JSON.stringify(agreement)}`);

		const divergence = firstDivergence(cases, reference, await acceptingTheEmptyList());
		assert.deepEqual(
			divergence?.case,
			{ mode: "all", verdicts: [] },
			`the minimal case shows the divergence: ${JSON.stringify(divergence)}`,
		);
		assert.equal(divergence?.lean, "NOT_RUN");
		assert.deepEqual(divergence?.observed, {
			mandatory: "PASS",
			optional: { alone: "PASS", outcome: "PASS", reported: "PASS" },
			beside_any_pass: { any_pass: "PASS", other: "PASS", g5: "PASS" },
		});
	});
});
