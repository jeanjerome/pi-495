/**
 * V3 — the 495 line of Pi's footer names the step of the change, in the language of the session, then
 * its execution status: `495 Specification · running`, `495 Clos · completed`.
 */
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { StatusView } from "../../src/application/views.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { FakeContext, FakePi, HARNESS_ENV, RPC_ACTOR, commandProject } from "../helpers/command-fixture.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";

type ChangeView = NonNullable<StatusView["change"]>;

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("footer-step-name-", cleanups);
});

function view(change: Partial<ChangeView>): StatusView {
	return {
		schema_version: 1,
		program: null,
		change: {
			change_id: "chg_footer",
			increment_id: "inc_1",
			revision: 3,
			phase: "specifying",
			status: "running",
			outcome: "pending",
			stop_reason: null,
			stop_detail: null,
			resume_lifts_stop: false,
			gates: [],
			attempts: { used: 0, max: 3 },
			candidate: null,
			evidence: [],
			pending_decisions: [],
			last_intervention: null,
			continuations: 0,
			consumption: { tokens: 0, usd: null, subscription: false },
			next_action: "specify",
			updated_at: "2026-10-06T10:00:00.000Z",
			...change,
		},
		limits: [],
	};
}

/** A Pi session opened in `language`, its runtime resolved, and the context whose footer lines are recorded. */
function sessionIn(language: "fr" | "en"): { session: ExtensionSession; ctx: FakeContext } {
	const cwd = commandProject("495-footer-step-", cleanups);
	process.env.HARNESS495_DATA_DIR = join(root, language, "data");
	process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
	process.env.HARNESS495_LANGUAGE = language;
	if (process.platform !== "darwin") process.env.HARNESS495_ALLOW_UNCONFINED = "1";
	const pi = new FakePi();
	const session = new ExtensionSession(pi.host());
	const ctx = new FakeContext(cwd, "rpc", `s-footer-step-${language}`);
	session.openedAt(ctx.asCommand());
	assert.equal(session.lang(), language);
	return { session, ctx };
}

describe("the 495 footer line names the step of the change", () => {
	const saved: Record<string, string | undefined> = {};
	beforeEach(() => {
		for (const name of HARNESS_ENV) saved[name] = process.env[name];
	});
	afterEach(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	it("la ligne 495 d'un changement en cours dans l'étape de spécification commence par 495 Specification · running en anglais et 495 Spécification · running en français ; celle d'un changement clos et accepté commence par 495 Closed · completed et 495 Clos · completed", () => {
		for (const [language, specifying, closed] of [
			["en", "495 Specification · running", "495 Closed · completed"],
			["fr", "495 Spécification · running", "495 Clos · completed"],
		] as const) {
			const { session, ctx } = sessionIn(language);
			session.updateFooter(ctx.asCommand(), view({}));
			const running = ctx.statuses.at(-1) ?? "";
			assert.ok(running.startsWith(specifying), `${language}: ${running}`);
			session.updateFooter(ctx.asCommand(), view({ phase: "closed", status: "completed", outcome: "accepted" }));
			const done = ctx.statuses.at(-1) ?? "";
			assert.ok(done.startsWith(closed), `${language}: ${done}`);
		}
	});
});
