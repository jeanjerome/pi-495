/**
 * The decision that presents the architecture map of a Maven reactor says, beside what `dependency:analyze` checks,
 * that 495 also reads at each run, without installing anything, every link a configuration file or a string of the
 * code establishes by naming in full a class of a part the map does not permit to depend on, in French and in
 * English. Maven is a fake.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildDecisionRequest } from "../../src/application/decisions.ts";
import { surveyedArchitecture } from "../helpers/architecture-survey.ts";
import { CONFIGURED_LINKS_REACTOR } from "../helpers/configured-links-reactor.ts";
import { DEPENDENCIES_MAP } from "../helpers/dependencies-reactor.ts";
import { writeFiles } from "../helpers/fixtures.ts";
import { trackedProject } from "../helpers/harness-fixture.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

describe("the decision on the map of a Maven reactor names the reading of the links established without an import", () => {
	it("l'issue d'adoption de la carte d'un réacteur Maven dit que 495 relève, sans rien installer, les liens qu'un fichier de configuration ou une chaîne du code établit vers une partie dont la carte ne permet pas de dépendre, en français et en anglais", async () => {
		const project = trackedProject((root) => writeFiles(root, CONFIGURED_LINKS_REACTOR));
		const { t, changeId } = await surveyedArchitecture(project, [DEPENDENCIES_MAP]);
		const asked = t.harness.pendingDecisions(changeId).find((d) => d.interaction === "IH-04");
		assert.ok(asked, "the map is presented");
		const adopt = asked.options.find((o) => o.id === "adopt_map");
		assert.ok(adopt, "the owner may adopt the map");
		const said = `${adopt.label} — ${adopt.effect}`;
		for (const expected of [
			"495 relève aussi, à chaque exécution et sans rien installer, chaque lien qu'un fichier de configuration ou une chaîne du code établit en nommant en entier une classe d'une partie dont la carte ne permet pas de dépendre",
		])
			assert.ok(said.includes(expected), `« ${expected} » in ${said}`);

		const english = buildDecisionRequest({
			decision_id: asked.decision_id,
			change_id: changeId,
			interaction: "IH-04",
			subject: asked.subject,
			language: "en",
			facts: asked.facts,
			recommendation: null,
			arg: "ARC-01",
			architecture_map: {
				installs: [{ package: "com.tngtech.archunit:archunit-junit5", version: "1.5.1", manager: "maven" }],
				unverified: null,
				unchecked_parts: [],
			},
			installers: (manager) => STACKS_OF_495.installerOf(manager)?.install,
			requested_at: asked.requested_at,
		}).options.find((o) => o.id === "adopt_map");
		assert.ok(english, "the owner may adopt the map in English");
		const saidInEnglish = `${english.label} — ${english.effect}`;
		for (const expected of [
			"495 also reads, at each run and without installing anything, every link a configuration file or a string of the code establishes by naming in full a class of a part the map does not permit to depend on",
		])
			assert.ok(saidInEnglish.includes(expected), `« ${expected} » in ${saidInEnglish}`);
	});
});
