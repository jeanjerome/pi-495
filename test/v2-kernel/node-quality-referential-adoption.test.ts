/**
 * A survey of the quality of a Node project that declares neither ESLint nor jscpd: the owner is asked
 * whether to adopt the quality referential the Node adapter proposes, with one fact per rule. Adopted,
 * both analysers are installed in a copy with the network open for that step alone, the referential is
 * frozen with the date of the decision, and the survey measures the requirement with eslint and jscpd;
 * the report counts the violations of the module `.` by rule and names what the referential does not
 * measure. When the install fails, or npm cannot extend the target, the requirement is a blind spot with
 * its reason.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";
import type { TestHarness } from "../helpers/harness-fixture.ts";
import {
	CHECKSUM_A,
	CHECKSUM_B,
	JSCPD_BINARY,
	NODE_GRADER,
	nodeLineOf,
	nodeQualityProject,
	nodeSurveyed,
} from "../helpers/node-quality-survey.ts";
import { writeFiles } from "../helpers/fixtures.ts";
import { answer, latestSurvey, treeDigest } from "../helpers/quality-survey.ts";

const RULES = [
	["complexity", "eslint"],
	["no-unused-vars", "eslint"],
	["no-unused-private-class-members", "eslint"],
	["jscpd", "jscpd"],
] as const;

async function frozenProtocol(t: TestHarness, changeId: string): Promise<Protocol> {
	const state = t.ledger.loadChange(changeId)!.state;
	assert.equal(state.gates.G2?.verdict, "PASS", state.gates.G2?.reasons.join("; ") ?? state.stop_detail ?? "");
	return (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
}

describe("a survey of quality proposes the referential of the Node adapter", () => {
	it("un état des lieux de la qualité d'un projet Node demande l'adoption du référentiel avec un fait par règle et deux issues, l'adoption disant qu'eslint et jscpd sont installés dans une copie", async () => {
		const { t, npm, changeId, first } = await nodeSurveyed(nodeQualityProject());
		assert.equal(first.stopped_because, "decision_required", first.steps.join(" | "));
		const pending = t.harness.pendingDecisions(changeId);
		assert.equal(pending.length, 1, pending.map((d) => d.interaction).join(", "));
		const asked = pending[0]!;
		assert.deepEqual(
			asked.options.map((o) => o.id),
			["adopt_referential", "leave_blind_spot"],
			`two ways out: adopt it, or leave the requirement a blind spot: ${asked.question}`,
		);
		assert.match(asked.question, /référentiel de qualité/);
		assert.match(asked.question, /Node/);
		for (const [nature, rule, threshold, tool, page] of [
			["complexity", "complexity", "20", "ESLint 10.12.0", /eslint\.org\/\S+\/complexity/],
			["dead_code", "no-unused-vars", "any occurrence", "ESLint 10.12.0", /eslint\.org\/\S+\/no-unused-vars/],
			[
				"dead_code",
				"no-unused-private-class-members",
				"any occurrence",
				"ESLint 10.12.0",
				/eslint\.org\/\S+\/no-unused-private-class-members/,
			],
			["duplication", "jscpd", "50 tokens", "jscpd 5.4.0", /npmjs\.com\/\S+jscpd/],
		] as const) {
			const fact = asked.facts.find((f) => f.includes(` ${rule},`));
			assert.ok(fact, `a fact names ${rule}: ${asked.facts.join(" | ")}`);
			for (const part of [nature, threshold, tool, "2026-10-03"])
				assert.ok(fact.includes(part), `${rule}: ${part} in ${fact}`);
			assert.match(fact, page, `${rule}: its documentation page`);
		}
		const adopt = asked.options.find((o) => o.id === "adopt_referential")!;
		const said = `${adopt.label} ${adopt.effect}`;
		for (const part of ["eslint 10.12.0", "jscpd 5.4.0"]) assert.ok(said.includes(part), `${part} in ${said}`);
		assert.match(said, /dépendances de développement exactes/);
		assert.match(said, /dans une copie/);
		assert.match(said, /sans exécuter de script d'installation/);
		assert.match(said, /réseau ouvert pour cette seule étape/);
		assert.match(said, /rien n'est écrit dans le projet/);
		assert.doesNotMatch(said, /POM|Maven/, "an npm install, not a Maven resolution");
		assert.equal(npm.installs(), 0, "nothing is installed before the owner adopts");
	});

	it("l'adoption gèle le référentiel avec la date de la décision et le survey mesure l'exigence par eslint et jscpd en FAIL avec un constat par violation, sans changer le digest du projet", async () => {
		const project = nodeQualityProject();
		const before = treeDigest(project);
		// The owner answers two days after the referential was established, just before midnight, and the protocol is frozen
		// the next day.
		let at = Date.parse("2026-10-05T23:59:00.000Z");
		const clock = {
			now: () => {
				at += 1;
				return new Date(at).toISOString();
			},
		};
		const { t, npm, changeId } = await nodeSurveyed(project, { clock });
		answer(t, changeId, "adopt_referential");
		at = Date.parse("2026-10-06T00:00:01.000Z");
		const after = await t.harness.advance(changeId, { max_steps: 40 });
		assert.equal(after.stopped_because, "decision_required", after.steps.join(" | "));

		const installs = npm.runs.filter((r) => r.command[0] === "npm" && r.command[1] === "install");
		assert.equal(installs.length, 1, "both analysers are installed by one install");
		const install = installs[0]!.command;
		for (const part of ["--save-dev", "--save-exact", "--ignore-scripts", "eslint@10.12.0", "jscpd@5.4.0"])
			assert.ok(install.includes(part), `${part} in ${install.join(" ")}`);
		assert.deepEqual(
			npm.runs.filter((r) => r.network !== "denied").map((r) => r.command.join(" ")),
			[install.join(" ")],
			"the network is open for the install and for nothing else",
		);

		const protocol = await frozenProtocol(t, changeId);
		const adoption = t.ledger
			.loadChange(changeId)!
			.state.human_decisions.find((d) => d.option_id === "adopt_referential");
		assert.ok(adoption, "the adoption is recorded");
		const referential = protocol.quality_referential;
		assert.ok(referential, "the frozen protocol carries the referential");
		assert.equal(adoption.recorded_at.slice(0, 10), "2026-10-05");
		assert.equal(referential.adopted_on, "2026-10-05", "with the date of the decision");
		assert.deepEqual(
			referential.rules.map((r) => [r.rule_id, r.control_id]),
			RULES.map(([rule, control]) => [rule, control]),
			"each rule with its oracle",
		);
		for (const rule of referential.rules) assert.ok(rule.threshold.length > 0 && rule.source.length > 0, rule.rule_id);
		for (const id of ["eslint", "jscpd"]) {
			assert.ok(
				protocol.controls.some((c) => c.control_id === id),
				`${id} is frozen`,
			);
			assert.equal(
				protocol.qualifications[id]?.qualified,
				true,
				`${id}: ${protocol.qualifications[id]?.notes.join("; ")}`,
			);
		}

		const survey = await latestSurvey(t, changeId);
		const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
		assert.ok(quality);
		assert.deepEqual(
			quality.measures.map((m) => [m.control_id, m.verdict]).sort(),
			[
				["eslint", "FAIL"],
				["jscpd", "FAIL"],
			],
			`the requirement is measured by eslint and jscpd: ${quality.blind_spot}`,
		);
		const findings = (id: string) => survey.controls.find((c) => c.control_id === id)?.findings ?? [];
		for (const [rule, line] of [
			["complexity", nodeLineOf("export function grade(")],
			["no-unused-vars", nodeLineOf("function neverCalled(")],
			["no-unused-private-class-members", nodeLineOf("#unread")],
		] as const)
			assert.ok(
				findings("eslint").some(
					(f) => f.path === NODE_GRADER && f.message.includes(rule) && f.message.includes(`${NODE_GRADER}:${line}`),
				),
				`${rule} at ${NODE_GRADER}:${line}: ${findings("eslint")
					.map((f) => f.message)
					.join(" | ")}`,
			);
		const [duplication, ...more] = findings("jscpd");
		assert.equal(more.length, 0, "one finding per duplication");
		for (const place of [`${CHECKSUM_A}:`, `${CHECKSUM_B}:`])
			assert.ok(duplication?.message.includes(place), `${place} in ${duplication?.message}`);

		assert.equal(treeDigest(project), before, "the project tree is as it was");
	});

	it("l'adoption gèle chaque fichier installé avec le mode que l'installation lui a donné, et le binaire natif de jscpd est exécutable dans chaque copie où jscpd tourne", async () => {
		const { t, analysers, changeId } = await nodeSurveyed(nodeQualityProject());
		answer(t, changeId, "adopt_referential");
		await t.harness.advance(changeId, { max_steps: 40 });
		const protocol = await frozenProtocol(t, changeId);
		const modeOf = (path: string) => (protocol.complements ?? []).find((c) => c.path === path)?.mode;
		assert.equal(modeOf(JSCPD_BINARY), "000755", "the binary of jscpd is frozen executable");
		assert.equal(modeOf("node_modules/eslint/package.json"), "000644", "a file the install left plain stays plain");
		assert.ok(analysers.jscpdExecutable.length > 1, "jscpd runs in its witnesses and in the survey");
		assert.ok(
			analysers.jscpdExecutable.every(Boolean),
			`the binary of jscpd is executable in every copy jscpd runs in: ${analysers.jscpdExecutable.join(", ")}`,
		);
	});

	it("le rapport compte une violation du module . sous complexity, no-unused-vars, no-unused-private-class-members et jscpd, et nomme ce que le référentiel ne mesure pas avec sa raison", async () => {
		const { t, changeId } = await nodeSurveyed(nodeQualityProject());
		answer(t, changeId, "adopt_referential");
		await t.harness.advance(changeId, { max_steps: 40 });
		const report = await t.harness.report(changeId);
		const referential = report.survey?.referential;
		assert.ok(referential, "the survey section names the adopted referential");
		assert.match(referential.adopted_on, /^\d{4}-\d{2}-\d{2}$/, "with its date of adoption");
		const { rules, unmeasured } = referential;
		for (const [ruleId, controlId] of RULES) {
			const rule = rules.find((r) => r.rule_id === ruleId);
			assert.ok(rule, `${ruleId} is named`);
			assert.equal(rule.control_id, controlId, `${ruleId}: its oracle`);
			assert.ok(rule.threshold.length > 0 && rule.source.length > 0, `${ruleId}: its threshold and its source`);
			assert.deepEqual(
				rule.proprietary_by_module,
				[{ module: ".", violations: 1 }],
				`${ruleId}: one violation of the proprietary code in the module . ${JSON.stringify(rule.findings)}`,
			);
		}

		const reasonOf = (pattern: RegExp): string => {
			const found = referential.unmeasured.find((u) => pattern.test(u.subject));
			assert.ok(
				found,
				`${pattern} is named as unmeasured: ${referential.unmeasured.map((u) => u.subject).join(" | ")}`,
			);
			return found.reason;
		};
		assert.match(reasonOf(/TypeScript.*JSX/), /ESLint.*parser/);
		assert.match(reasonOf(/^lodash$/), /declared dependency/);
		assert.match(reasonOf(/^vitest$/), /declared dependency/);
		assert.match(reasonOf(/format other than JavaScript and TypeScript/), /jscpd/);
		assert.match(reasonOf(/generated code/), /no marker of generated code/);

		for (const [language, label] of [
			["en", "not measured"],
			["fr", "non mesuré"],
		] as const) {
			const text = formatReport(report, language);
			const section = text.slice(text.indexOf(label));
			assert.ok(
				text.indexOf(label) > text.indexOf("jscpd — "),
				`${language}: what is not measured, under the referential`,
			);
			for (const u of unmeasured)
				assert.ok(
					section.includes(`${u.subject}: ${u.reason}`),
					`${language}: ${u.subject} with its reason: ${section}`,
				);
		}
	});

	it("une installation qui échoue n'adopte rien et le survey rend la raison de npm", async () => {
		const { t, changeId } = await nodeSurveyed(nodeQualityProject(), { reachable: false });
		answer(t, changeId, "adopt_referential");
		await t.harness.advance(changeId, { max_steps: 40 });
		const protocol = await frozenProtocol(t, changeId);
		assert.equal(protocol.quality_referential, undefined, "nothing is adopted");
		assert.ok(
			!protocol.controls.some((c) => c.control_id === "eslint" || c.control_id === "jscpd"),
			"no eslint nor jscpd control is declared",
		);
		const survey = await latestSurvey(t, changeId);
		const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
		assert.match(quality?.blind_spot ?? "", /ENOTFOUND registry\.npmjs\.org/, "the reason npm gave");
	});

	it("avec un package-lock.json en lockfileVersion 1 qui nomme vitest et, sous lui, tinyspy, une installation qui retire node_modules/vitest/index.js ou node_modules/vitest/node_modules/tinyspy/index.js n'adopte rien et le survey nomme l'exigence comme angle mort avec le message qui nomme ce fichier", async () => {
		const top = "node_modules/vitest/index.js";
		const nested = "node_modules/vitest/node_modules/tinyspy/index.js";
		for (const removed of [top, nested]) {
			const project = nodeQualityProject();
			writeFiles(project, {
				"package-lock.json": `${JSON.stringify({
					name: "graded",
					version: "1.0.0",
					lockfileVersion: 1,
					dependencies: {
						lodash: { version: "4.17.21", integrity: "sha512-fake-lodash" },
						vitest: {
							version: "4.0.0",
							integrity: "sha512-fake-vitest",
							dev: true,
							dependencies: { tinyspy: { version: "4.0.3", integrity: "sha512-fake-tinyspy", dev: true } },
						},
					},
				})}\n`,
				[top]: "export {};\n",
				[nested]: "export {};\n",
			});
			const { t, npm, changeId } = await nodeSurveyed(project, { removes: [removed] });
			answer(t, changeId, "adopt_referential");
			await t.harness.advance(changeId, { max_steps: 40 });
			assert.equal(npm.installs(), 1, `${removed}: the install ran`);
			const protocol = await frozenProtocol(t, changeId);
			assert.equal(protocol.quality_referential, undefined, `${removed}: nothing is adopted`);
			assert.ok(
				!protocol.controls.some((c) => c.control_id === "eslint" || c.control_id === "jscpd"),
				`${removed}: no eslint nor jscpd control is declared`,
			);
			const survey = await latestSurvey(t, changeId);
			const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
			assert.equal(quality?.measures.length, 0, `${removed}: the requirement is measured by nothing`);
			assert.match(
				quality?.blind_spot ?? "",
				new RegExp(`the install changed ${removed.replaceAll(".", "\\.")}, which already existed under node_modules/`),
				`${removed}: the blind spot carries the message that names it`,
			);
		}
	});

	it("un projet sans package-lock.json ne reçoit aucune décision d'adoption du référentiel et le survey dit que la cible n'a pas de package-lock.json", async () => {
		const project = nodeQualityProject(false);
		const before = treeDigest(project);
		const { t, npm, changeId } = await nodeSurveyed(project);
		assert.ok(
			t.harness.pendingDecisions(changeId).every((d) => !d.options.some((o) => o.id === "adopt_referential")),
			"no referential is proposed",
		);
		const survey = await latestSurvey(t, changeId);
		const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
		assert.match(quality?.blind_spot ?? "", /no package-lock\.json/);
		assert.equal(npm.installs(), 0, "nothing is installed");
		assert.equal(treeDigest(project), before);
	});

	it("un projet qui déclare déjà eslint ne reçoit aucune décision d'adoption du référentiel, rien n'est installé et le survey dit que le projet déclare ESLint lui-même", async () => {
		const project = nodeQualityProject(true, { devDependencies: { vitest: "4.0.0", eslint: "9.0.0" } });
		const before = treeDigest(project);
		const { t, npm, changeId } = await nodeSurveyed(project);
		assert.ok(
			t.harness.pendingDecisions(changeId).every((d) => !d.options.some((o) => o.id === "adopt_referential")),
			"no referential is proposed to a project that declares ESLint itself",
		);
		const survey = await latestSurvey(t, changeId);
		const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
		assert.match(quality?.blind_spot ?? "", /declares ESLint itself/);
		assert.equal(npm.installs(), 0, "nothing is installed over the project's own ESLint");
		assert.equal(treeDigest(project), before);
	});

	it("un projet qui épingle eslint 10.12.0 et jscpd 5.4.0, les a installés et porte son eslint.config.js ne reçoit aucune décision d'adoption, rien n'est installé, le protocole gelé ne porte ni référentiel ni contrôle eslint ou jscpd, et le survey dit que le projet déclare ESLint lui-même", async () => {
		const project = nodeQualityProject(true, {
			devDependencies: { vitest: "4.0.0", eslint: "10.12.0", jscpd: "5.4.0" },
		});
		writeFiles(project, {
			"node_modules/eslint/package.json": '{"name":"eslint","version":"10.12.0"}\n',
			"node_modules/jscpd/package.json": '{"name":"jscpd","version":"5.4.0"}\n',
			"eslint.config.js": 'export default [{ rules: { complexity: "off" } }];\n',
		});
		const before = treeDigest(project);
		const { t, npm, changeId } = await nodeSurveyed(project);
		assert.ok(
			t.harness.pendingDecisions(changeId).every((d) => !d.options.some((o) => o.id === "adopt_referential")),
			"no referential is proposed to a project that pins and installs the analysers itself",
		);
		const protocol = await frozenProtocol(t, changeId);
		assert.equal(protocol.quality_referential, undefined, "the frozen protocol carries no referential");
		assert.deepEqual(
			protocol.controls.map((c) => c.control_id).filter((id) => id === "eslint" || id === "jscpd"),
			[],
			"the frozen protocol carries no eslint nor jscpd control",
		);
		const survey = await latestSurvey(t, changeId);
		const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
		assert.match(quality?.blind_spot ?? "", /declares ESLint itself/);
		assert.equal(npm.installs(), 0, "nothing is installed over the project's own ESLint");
		assert.equal(treeDigest(project), before);
	});

	it("un projet qui déclare eslint, dont scripts.test nomme un lanceur que 495 ne lit pas, ne reçoit aucune décision d'adoption du référentiel et rien n'est installé", async () => {
		const project = nodeQualityProject(true, {
			scripts: { test: "tsc && node --test" },
			devDependencies: { vitest: "4.0.0", eslint: "9.0.0" },
		});
		const before = treeDigest(project);
		const { t, npm, changeId, first } = await nodeSurveyed(project);
		assert.ok(
			t.harness.pendingDecisions(changeId).every((d) => !d.options.some((o) => o.id === "adopt_referential")),
			"no referential is proposed to a project that declares ESLint itself",
		);
		assert.equal(npm.installs(), 0, "nothing is installed over the project's own ESLint");
		assert.equal(first.stopped_because, "capability_missing", first.steps.join(" | "));
		assert.equal(treeDigest(project), before);
	});
});
