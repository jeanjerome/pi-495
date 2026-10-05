/**
 * V0 — the line of the gauge under the editor at its boundaries: a full cell only per whole 5 % of
 * the window, never more than twenty, and an empty context told apart from an unknown one.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatAgentContext } from "../../src/presentation/structured/text.ts";

const bar = (full: number) => "█".repeat(full) + "░".repeat(20 - full);

describe("the line of the agent context gauge", () => {
	it("a context just under 5 % of the window fills no cell while its percentage rounds to 5", () => {
		assert.equal(
			formatAgentContext({ tokens: 49_999, context_window: 1_000_000 }, "en"),
			`Agent context  ${bar(0)}  5%   50.0k / 1.0M`,
		);
	});

	it("a context of exactly 5 % of the window fills one cell", () => {
		assert.equal(
			formatAgentContext({ tokens: 50_000, context_window: 1_000_000 }, "en"),
			`Agent context  ${bar(1)}  5%   50.0k / 1.0M`,
		);
	});

	it("a context larger than the window fills twenty cells and no more, and says its percentage", () => {
		assert.equal(
			formatAgentContext({ tokens: 1_100_000, context_window: 1_000_000 }, "en"),
			`Agent context  ${bar(20)}  110%   1.1M / 1.0M`,
		);
	});

	it("an empty context on a window under a million shows 0 % and the window in thousands", () => {
		assert.equal(
			formatAgentContext({ tokens: 0, context_window: 128_000 }, "en"),
			`Agent context  ${bar(0)}  0%   0.0k / 128.0k`,
		);
	});
});
