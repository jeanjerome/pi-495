/**
 * V3 — the owner asks for another analysis of the architecture from Pi: the dialog asks for the remark on the
 * recommendation, the text lands in the decision the journal records, and the second intervention receives it as the
 * owner's remark. Maven and ArchUnit are fakes put in place of the runtime's own, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ScriptedAgent } from "../../src/adapters/pi-worker/scripted-agent.ts";
import type { HarnessDeps } from "../../src/application/harness.ts";
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
import { FakeMavenControls, FakeMavenSandbox } from "../helpers/fake-maven.ts";
import { NO_QUALIFIED_SANDBOX, outputDir, removedAfterEach } from "../helpers/fixtures.ts";

const REMARK = "deux équipes ne justifient pas deux modules";

/** Two alternatives argued by ARC-01, the requirement of the survey. */
const RECOMMENDATION = {
	alternatives: ["keep", "adjust"].map((nature, i) => ({
		alternative_id: `A${i + 1}`,
		nature,
		description: `${nature} the architecture`,
		benefits: ["the map holds"],
		cost: { complexity: "little", migration: "little" },
		risks: ["the map drifts"],
		constraints: ["ARC-01"],
	})),
	recommended: { alternative_id: "A2", conclusion: "ARC-01 asks for it", constraints: ["ARC-01"] },
};

let root: string;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
	root = outputDir("architecture-recommendation-remark-dialog-", cleanups);
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
 * Has the scripted agent of the runtime answer each intervention that asks for an architecture map with the map of
 * the reactor, and each that asks for a recommendation with the recommendation above, and keeps the mandate of each
 * of the latter.
 */
function proposing(agent: ScriptedAgent): InterventionMandate[] {
	const mandates: InterventionMandate[] = [];
	const start = agent.startIntervention.bind(agent);
	agent.startIntervention = async (mandate) => {
		const output =
			mandate.output_schema === "architecture-map"
				? DOMAIN_MAP
				: mandate.output_schema === "architecture-recommendation"
					? RECOMMENDATION
					: null;
		if (output === null) return start(mandate);
		if (output === RECOMMENDATION) mandates.push(mandate);
		const kept = agent.scripts.get(mandate.role);
		agent.scripts.set(mandate.role, { steps: [{ kind: "complete", output }] });
		try {
			return await start(mandate);
		} finally {
			if (kept) agent.scripts.set(mandate.role, kept);
			else agent.scripts.delete(mandate.role);
		}
	};
	return mandates;
}

/** Puts the fake Maven in place of the runtime's own: what the sandbox runs of `mvn`, and what the controls read. */
function onFakeMaven(deps: HarnessDeps): void {
	const backend = deps.sandbox.backend;
	const maven = new FakeMavenSandbox(
		{ backend: backend.backend, qualify: (profile) => backend.qualify(profile), run: backend.run.bind(backend) },
		"resolves",
	);
	backend.run = (profile, request, signal) => maven.run(profile, request, signal);
	const runner = deps.controls;
	const controls = new FakeMavenControls({ readers: runner.readers, runControl: runner.runControl.bind(runner) });
	runner.runControl = (invocation, signal) => controls.runControl(invocation, signal);
}

/**
 * Starts the survey of the reactor from Pi in the session `sessionId`, adopts the map, chooses ask_analysis on the
 * first IH-05 with the remark above and leaves the next one for later. Gives what the text inputs asked for, and the
 * mandate of each intervention that proposed a recommendation; the caller closes the session.
 */
async function askedAnotherAnalysis(sessionId: string): Promise<{
	pi: FakePi;
	session: ExtensionSession;
	inputs: string[];
	mandates: InterventionMandate[];
}> {
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
	const ctx = new FakeContext(project, "rpc", sessionId);
	session.openedAt(ctx.asCommand());
	const harness = session.runtime().harness;
	const mandates = proposing(harness.deps.agent as ScriptedAgent);
	onFakeMaven(harness.deps);
	const inputs: string[] = [];
	let analyses = 0;
	ctx.ui.select = async (question, options) => {
		ctx.selections.push({ question, options });
		const adopt = options.find((o) => o.startsWith("adopt_map — "));
		if (adopt) return adopt;
		if (analyses++ > 0) return null;
		return options.find((o) => o.startsWith("ask_analysis — ")) ?? null;
	};
	ctx.ui.input = async (prompt) => {
		inputs.push(prompt);
		return REMARK;
	};
	try {
		await pi.run(`state ${ARCHITECTURE_QUESTION}`, ctx);
		assert.ok(session.binding, pi.said.join(" | "));
		for (let round = 0; round < 6 && mandates.length < 2; round++) await pi.run("resume", ctx);
	} catch (error) {
		await session.close();
		throw error;
	}
	return { pi, session, inputs, mandates };
}

describe("asking for another architecture analysis from Pi", () => {
	it("choisir ask_analysis depuis Pi ouvre une saisie qui demande Votre remarque sur la recommandation, la décision enregistrée porte la remarque deux équipes ne justifient pas deux modules comme texte libre, et le contexte de la seconde intervention porte cette remarque", async () => {
		const { pi, session, inputs, mandates } = await askedAnotherAnalysis("s-architecture-recommendation-remark-dialog");
		try {
			assert.deepEqual(
				inputs,
				["Votre remarque sur la recommandation"],
				`the remark on the recommendation is asked for: ${pi.said.join(" | ")}`,
			);
			const state = session.runtime().ledger.loadChange(session.binding!.change_id)!.state;
			const again = state.human_decisions.find((d) => d.option_id === "ask_analysis");
			assert.equal(again?.free_text, REMARK, "the remark is kept with the decision");
			assert.equal(mandates.length, 2, `a second intervention proposes a recommendation: ${pi.said.join(" | ")}`);
			assert.ok(
				mandates[1]!.prompt.includes(`The owner's remark: ${REMARK}`),
				`the second intervention receives the remark: ${mandates[1]!.prompt}`,
			);
		} finally {
			await session.close();
		}
	});

	it("dans une session anglaise, choisir ask_analysis depuis Pi ouvre une saisie qui demande Your remark on the recommendation, et la décision enregistrée porte la remarque comme texte libre", async () => {
		process.env.HARNESS495_LANGUAGE = "en";
		const { pi, session, inputs } = await askedAnotherAnalysis("s-architecture-recommendation-remark-dialog-en");
		try {
			assert.deepEqual(
				inputs,
				["Your remark on the recommendation"],
				`the remark on the recommendation is asked for in English: ${pi.said.join(" | ")}`,
			);
			const state = session.runtime().ledger.loadChange(session.binding!.change_id)!.state;
			const again = state.human_decisions.find((d) => d.option_id === "ask_analysis");
			assert.equal(again?.free_text, REMARK, "the remark is kept with the decision");
		} finally {
			await session.close();
		}
	});
});
