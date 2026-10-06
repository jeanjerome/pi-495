/**
 * V3 — the 495 line of Pi's footer says that the consumption it shows is the agents' own, spent in
 * their sessions, and not the session where the owner types the commands. The agent is scripted: it
 * declares the tokens and the amount a real session would report, and no model is called.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { ASKS_Q1, FakeContext, FakePi, HARNESS_ENV, RPC_ACTOR, commandProject } from "../helpers/command-fixture.ts";
import { removedAfterEach, outputDir } from "../helpers/fixtures.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("footer-agents-consumption-", cleanups);
});

/**
 * Starts a change whose specifying agent asks a question, declaring `spent` — 72,000 tokens on a
 * subscription, or nothing — and returns the session and the context whose footer lines were recorded.
 */
async function startSpending(
	language: "fr" | "en",
	spent: boolean,
): Promise<{ session: ExtensionSession; ctx: FakeContext }> {
	const cwd = commandProject("495-footer-agents-", cleanups);
	const dir = join(root, `${language}-${spent ? "spent" : "none"}`);
	mkdirSync(dir, { recursive: true });
	const agentScript = join(dir, "agent.json");
	const consumption = spent
		? {
				tokens: 72_000,
				cost: { usd: 0.11, unknown_reason: null, basis: "host_catalogue", subscription: true },
			}
		: {};
	writeFileSync(
		agentScript,
		JSON.stringify({
			default: { steps: [{ kind: "fail", error: "not reached" }] },
			roles: { specify: { steps: [{ kind: "complete", output: ASKS_Q1 }], ...consumption } },
		}),
	);
	process.env.HARNESS495_DATA_DIR = join(dir, "data");
	process.env.HARNESS495_SCRIPTED_AGENT = agentScript;
	process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
	process.env.HARNESS495_LANGUAGE = language;
	if (process.platform !== "darwin") process.env.HARNESS495_ALLOW_UNCONFINED = "1";
	const pi = new FakePi();
	const session = new ExtensionSession(pi.host());
	registerCommand495(pi.host(), session);
	const ctx = new FakeContext(cwd, "rpc", `s-footer-agents-${language}-${spent ? "spent" : "none"}`);
	session.openedAt(ctx.asCommand());
	await pi.run("start x", ctx);
	assert.ok(session.binding, pi.said.join(" | "));
	return { session, ctx };
}

describe("the 495 footer line names the agents as the spenders of the consumption", () => {
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

	it("une intervention dont l'agent scripté déclare 72 000 jetons et un coût sur abonnement laisse une ligne 495 qui se termine par · agents 72.0k tokens · ~$0.11 (sub) en anglais et · agents 72,0 k jetons · ~0,11 $ (abonnement) en français, et un changement sans consommation garde une ligne 495 sans agents", async () => {
		for (const [language, suffix, unit] of [
			["en", " · agents 72.0k tokens · ~$0.11 (sub)", "tokens"],
			["fr", " · agents 72,0 k jetons · ~0,11 $ (abonnement)", "jetons"],
		] as const) {
			const { ctx } = await startSpending(language, true);
			const last = ctx.statuses.at(-1) ?? "";
			assert.ok(last.startsWith("495 ") && last.endsWith(suffix), `${language}: ${ctx.statuses.join(" | ")}`);
			for (const line of ctx.statuses.filter((s) => s.includes(unit)))
				assert.ok(line.includes(" · agents "), `${language}: every line with a consumption names the agents: ${line}`);

			const { ctx: none } = await startSpending(language, false);
			assert.ok(none.statuses.length > 0, `${language}: the 495 line was shown`);
			for (const line of none.statuses)
				assert.ok(!line.includes("agents"), `${language}: a change without consumption names no agent: ${line}`);
		}
	});

	it("un message de progression que le noyau rapporte pendant la conduite d'un changement dont les interventions ont consommé 72 000 jetons sur abonnement laisse une ligne 495 qui se termine par · agents 72.0k tokens · ~$0.11 (sub) en anglais et · agents 72,0 k jetons · ~0,11 $ (abonnement) en français", async () => {
		for (const [language, suffix] of [
			["en", " · agents 72.0k tokens · ~$0.11 (sub)"],
			["fr", " · agents 72,0 k jetons · ~0,11 $ (abonnement)"],
		] as const) {
			const { session, ctx } = await startSpending(language, true);
			// The hook the conduct installed is the one the kernel reports its progress through.
			session.runtime().harness.deps.onProgress?.("capturing the reference");
			assert.equal(
				ctx.statuses.at(-1),
				`495 capturing the reference${suffix}`,
				`${language}: ${ctx.statuses.join(" | ")}`,
			);
		}
	});
});
