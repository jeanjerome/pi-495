/**
 * V3 — the owner asks for another architecture map from Pi: the dialog asks for the remark on the map, the
 * text lands in the decision the journal records, and the second intervention receives it as the owner's
 * remark.
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ScriptedAgent } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import type { InterventionMandate } from "../../src/ports/execution.ts";
import {
	ARCHITECTURE_QUESTION,
	ARCHITECTURE_SPEC,
	DOMAIN_MAP,
	DOMAIN_MODULES,
	DOMAIN_SOURCES,
	mavenReactor,
} from "../helpers/architecture-survey.ts";
import { FakeContext, FakePi, HARNESS_ENV, RPC_ACTOR } from "../helpers/command-fixture.ts";
import { NO_QUALIFIED_SANDBOX, outputDir, removedAfterEach } from "../helpers/fixtures.ts";

const REMARK = "admin est en couches, pas en oignon";

let root: string;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
	root = outputDir("architecture-map-remark-dialog-", cleanups);
	for (const name of HARNESS_ENV) saved[name] = process.env[name];
	delete process.env.HARNESS495_LANGUAGE;
});
afterEach(() => {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});
/** Registered after the teardown above, so the directories are removed once it has run. */
const cleanups = removedAfterEach();

/**
 * Has the scripted agent of the runtime answer each intervention that asks for an architecture map with
 * the map of the story, and keeps the mandate of each of those.
 */
function proposingMaps(agent: ScriptedAgent): InterventionMandate[] {
	const mandates: InterventionMandate[] = [];
	const start = agent.startIntervention.bind(agent);
	agent.startIntervention = async (mandate) => {
		if (mandate.output_schema !== "architecture-map") return start(mandate);
		mandates.push(mandate);
		const specify = agent.scripts.get(mandate.role);
		agent.scripts.set(mandate.role, { steps: [{ kind: "complete", output: DOMAIN_MAP }] });
		try {
			return await start(mandate);
		} finally {
			if (specify) agent.scripts.set(mandate.role, specify);
		}
	};
	return mandates;
}

describe("asking for another architecture map from Pi", () => {
	it("choisir propose_map_again depuis Pi ouvre une saisie qui demande Votre remarque sur la carte, la décision enregistrée porte la remarque admin est en couches, pas en oignon comme texte libre, et le contexte de la seconde intervention porte cette remarque", async () => {
		const project = mavenReactor(DOMAIN_MODULES, DOMAIN_SOURCES);
		const agentScript = join(root, "agent.json");
		writeFileSync(
			agentScript,
			JSON.stringify({
				default: { steps: [{ kind: "fail", error: "not reached" }] },
				roles: { specify: { steps: [{ kind: "complete", output: ARCHITECTURE_SPEC }] } },
			}),
		);
		process.env.HARNESS495_DATA_DIR = join(root, "data");
		process.env.HARNESS495_SCRIPTED_AGENT = agentScript;
		process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
		if (NO_QUALIFIED_SANDBOX) process.env.HARNESS495_ALLOW_UNCONFINED = "1";
		const pi = new FakePi();
		const session = new ExtensionSession(pi.host());
		registerCommand495(pi.host(), session);
		const ctx = new FakeContext(project, "rpc", "s-architecture-map-remark-dialog");
		session.openedAt(ctx.asCommand());
		const mandates = proposingMaps(session.runtime().harness.deps.agent as ScriptedAgent);
		const inputs: string[] = [];
		let asked = 0;
		ctx.ui.select = async (question, options) => {
			ctx.selections.push({ question, options });
			if (asked++ > 0) return null;
			return options.find((o) => o.startsWith("propose_map_again — ")) ?? null;
		};
		ctx.ui.input = async (prompt) => {
			inputs.push(prompt);
			return REMARK;
		};
		try {
			await pi.run(`state ${ARCHITECTURE_QUESTION}`, ctx);
			assert.ok(session.binding, pi.said.join(" | "));
			for (let round = 0; round < 6 && mandates.length < 2; round++) await pi.run("resume", ctx);

			assert.deepEqual(inputs, ["Votre remarque sur la carte"], `the remark is asked for: ${pi.said.join(" | ")}`);
			const state = session.runtime().ledger.loadChange(session.binding.change_id)!.state;
			const again = state.human_decisions.find((d) => d.option_id === "propose_map_again");
			assert.equal(again?.free_text, REMARK, "the remark is kept with the decision");
			assert.equal(mandates.length, 2, `a second intervention proposes a map: ${pi.said.join(" | ")}`);
			assert.ok(
				mandates[1]!.prompt.includes(`The owner's remark: ${REMARK}`),
				`the second intervention receives the remark: ${mandates[1]!.prompt}`,
			);
		} finally {
			await session.close();
		}
	});
});
