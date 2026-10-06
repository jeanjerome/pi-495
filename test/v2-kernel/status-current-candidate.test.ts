/**
 * The checks a status shows are those of the current candidate: a verdict on a candidate the change
 * has replaced says nothing of the one it now carries.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { formatStatus } from "../../src/presentation/structured/text.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { makeHarness, trackedProject } from "../helpers/harness-fixture.ts";

const WRONG = "export function greet(name) {\n  return `Hello, ${name}!`;\n}\n";
const RIGHT = "export function greet(name) {\n  return `Hello, ${name}`;\n}\n";

/** An implementation that writes `content` to src/greet.js and reports that path changed. */
const writesGreet = (content: string): AgentScript => ({
	steps: [
		{ kind: "write", path: "src/greet.js", content },
		{ kind: "complete", output: { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: true, notes: [] } },
	],
});

describe("the checks of a status", () => {
	it("un changement dont le premier candidat a échoué au contrôle unit et dont le second l'a réussi a un statut dont la section des contrôles du candidat montre ✔ unit       passed et aucune ligne ✘ unit", async () => {
		let attempt = 0;
		const t = makeHarness();
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "implement") {
				attempt++;
				t.agent.scripts.set("implement", writesGreet(attempt === 1 ? WRONG : RIGHT));
			}
			return original(m);
		};
		const { change } = await t.harness.start({
			project_path: trackedProject(),
			request_text: "greet must keep returning Hello, <name>",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(result.view.change?.attempts.used, 2, "the first candidate was replaced");

		const lines = formatStatus(t.harness.status(change.change_id), "en").split("\n");
		const checks = lines.slice(lines.indexOf("  Checks on the candidate") + 1);
		assert.ok(lines.includes("  Checks on the candidate"), lines.join("\n"));
		assert.ok(checks.includes("    ✔ unit       passed"), lines.join("\n"));
		assert.ok(!lines.some((l) => l.startsWith("    ✘ unit")), lines.join("\n"));
	});
});
