/**
 * A survey of the quality of a Maven project whose code already violates the quality referential of the
 * Maven adapter: a method of complexity 11, a private method nothing calls, and a block two files repeat.
 * Maven and its repositories are fakes, and so are PMD and CPD, whose reports the real readers read.
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Clock } from "../../src/application/ids.ts";
import type { SpecificationReport } from "../../src/contracts/v1/reports.ts";
import type { Survey } from "../../src/domain/survey.ts";
import { HUMAN, tuiOrigin } from "./change-fixture.ts";
import { FakeMavenControls, FakeMavenSandbox, type MavenMode } from "./fake-maven.ts";
import { fixtureJava, writeFiles } from "./fixtures.ts";
import { makeHarness, specReport, trackedProject, type TestHarness } from "./harness-fixture.ts";

const QUESTION = "quel est l'état de la qualité du code ?";

const spec = specReport({
	objective: QUESTION,
	requirements: [
		{
			requirement_id: "QLT-01",
			statement: "the code carries no method above the complexity threshold, no dead code and no duplicated block",
			mandatory: true,
			criterion: "the quality referential reports no violation",
			category: "quality",
			satisfied_by_reference: false,
		},
	],
});

export const GRADER = "src/main/java/io/h495/Grader.java";
const GRADER_SOURCE = `package io.h495;

public final class Grader {
    private Grader() {}

    private static int never() { return 0; }

    public static int grade(int a, int b, int c) {
        int r = 0;
        if (a > 0) r++;
        if (b > 0) r++;
        if (c > 0) r++;
        if (a > 1) r++;
        if (b > 1) r++;
        if (c > 1) r++;
        if (a > 2) r++;
        if (b > 2) r++;
        if (c > 2) r++;
        if (a > 3) r++;
        return r;
    }
}
`;

/** The line of `GRADER_SOURCE` that holds `text`, counted from 1. */
export const lineOf = (text: string): number => GRADER_SOURCE.split("\n").findIndex((l) => l.includes(text)) + 1;

/** A class carrying a block of more than 100 tokens that its twin repeats. */
function duplicated(name: string): string {
	return `package io.h495;

public final class ${name} {
    private ${name}() {}

    public static int compute(int[] values) {
        int total = 0;
        for (int i = 0; i < values.length; i++) {
            if (values[i] % 2 == 0) {
                total += values[i] * 3;
            } else {
                total -= values[i] / 2;
            }
            if (total > 1000) {
                total = total % 997;
            }
        }
        String label = "total=" + total + ";count=" + values.length;
        return total + label.length();
    }
}
`;
}

/** The sources that violate the referential: a method of complexity 11, a private method nothing calls, and a block two files repeat. */
export const QUALITY_SOURCES: Record<string, string> = {
	[GRADER]: GRADER_SOURCE,
	"src/main/java/io/h495/DupA.java": duplicated("DupA"),
	"src/main/java/io/h495/DupB.java": duplicated("DupB"),
};

/** A declaration of PMD the project writes itself, without the rule set 495 names. */
export const PMD_DECLARED_BY_PROJECT = `      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-pmd-plugin</artifactId>
        <version>3.21.0</version>
      </plugin>
`;

/** A Maven project with a method of complexity 11, a private method nothing calls, and a block two files repeat. */
export function qualityProject(pmd = ""): string {
	return trackedProject((root) => {
		fixtureJava(root);
		writeFiles(root, QUALITY_SOURCES);
		if (pmd) {
			const pom = join(root, "pom.xml");
			writeFileSync(pom, readFileSync(pom, "utf8").replace("</plugins>", `${pmd}    </plugins>`));
		}
	});
}

/** The digest of every file of the project but its Git directory. */
export function treeDigest(root: string): string {
	const hash = createHash("sha256");
	const walk = (relative: string): void => {
		for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			const path = relative ? `${relative}/${entry.name}` : entry.name;
			if (entry.name === ".git") continue;
			if (entry.isDirectory()) walk(path);
			else
				hash
					.update(`${path}\0`)
					.update(readFileSync(join(root, path)))
					.update("\0");
		}
	};
	walk("");
	return hash.digest("hex");
}

interface SurveyOptions {
	mode?: MavenMode;
	clock?: Clock;
	/** The specification the model answers the question with; one requirement about quality otherwise. */
	report?: SpecificationReport;
}

function surveyHarness({ mode = "resolves", clock, report = spec }: SurveyOptions): {
	t: TestHarness;
	maven: FakeMavenSandbox;
} {
	let maven: FakeMavenSandbox | undefined;
	const t = makeHarness({
		...(clock ? { clock } : {}),
		defaultScript: { steps: [{ kind: "complete", output: report }] },
		backend: (real) => {
			maven = new FakeMavenSandbox(real, mode);
			return maven;
		},
		controls: (real) => new FakeMavenControls(real),
	});
	return { t, maven: maven! };
}

/** A survey of the quality of `project`, conducted until it stops, at the time `clock` reads when given. */
export async function surveyed(project: string, options: SurveyOptions = {}) {
	const { t, maven } = surveyHarness(options);
	const { change } = await t.harness.start({
		project_path: project,
		request_text: QUESTION,
		actor: HUMAN,
		deliverable: "state",
	});
	const first = await t.harness.advance(change.change_id, { max_steps: 40 });
	return { t, maven, changeId: change.change_id, first };
}

export function answer(t: TestHarness, changeId: string, optionId: string): void {
	const [pending] = t.harness.pendingDecisions(changeId);
	assert.ok(pending, "a decision is pending");
	const answered = t.harness.answerDecision(
		changeId,
		{
			decision_id: pending.decision_id,
			option_id: optionId,
			free_text: null,
			reason: null,
			subject_revision: pending.subject.revision,
			scope: null,
			expires_at: null,
		},
		tuiOrigin(),
	);
	assert.equal(answered.error, null);
}

/** The survey the change last proposed. */
export async function latestSurvey(t: TestHarness, changeId: string): Promise<Survey> {
	const state = t.ledger.loadChange(changeId)!.state;
	const survey = await t.harness.artifacts.latest<Survey>(state, "survey");
	assert.ok(survey, `a survey is proposed: ${state.stop_detail ?? state.status}`);
	return survey.content;
}
