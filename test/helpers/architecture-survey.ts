/**
 * A survey of the architecture of a Maven reactor: the model answers the question with one requirement
 * about the architecture, then proposes the maps a test gives it, one per intervention that asks for a
 * map. Maven is a fake, as in the survey of quality.
 */
import { strict as assert } from "node:assert";
import { ScriptedAgent } from "../../src/adapters/pi-worker/scripted-agent.ts";
import type { Clock } from "../../src/application/ids.ts";
import type { ArchitectureHint, ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import type { InterventionHandle, InterventionMandate } from "../../src/ports/execution.ts";
import { HUMAN, tuiOrigin } from "./change-fixture.ts";
import { FakeMavenControls, FakeMavenSandbox, type MavenMode } from "./fake-maven.ts";
import { writeFiles } from "./fixtures.ts";
import { makeHarness, specReport, trackedProject, type TestHarness } from "./harness-fixture.ts";

export const ARCHITECTURE_QUESTION = "comment l'architecture du projet est-elle organisée ?";

/** One requirement about the architecture, as the model answers the question with. */
export const ARCHITECTURE_SPEC = specReport({
	objective: ARCHITECTURE_QUESTION,
	requirements: [
		{
			requirement_id: "ARC-01",
			statement: "each part of the project keeps to the architecture it is organised in",
			mandatory: true,
			criterion: "no dependency crosses the architecture the project declares",
			category: "architecture",
			satisfied_by_reference: false,
		},
	],
});

/**
 * Answers the specification with `spec`, and each intervention that asks for an architecture map with
 * the next map of `maps`, the last one again once they run out. Keeps the mandate of each of those.
 */
export class ArchitectureMapAgent extends ScriptedAgent {
	readonly mapMandates: InterventionMandate[] = [];
	private readonly maps: readonly unknown[];
	constructor(maps: readonly unknown[], spec = ARCHITECTURE_SPEC) {
		super({ steps: [{ kind: "complete", output: spec }] });
		this.maps = maps;
	}
	override startIntervention(mandate: InterventionMandate): Promise<InterventionHandle> {
		if (mandate.output_schema !== "architecture-map") return super.startIntervention(mandate);
		this.mapMandates.push(mandate);
		const map = this.maps[Math.min(this.mapMandates.length - 1, this.maps.length - 1)];
		this.scripts.set(mandate.role, { steps: [{ kind: "complete", output: map }] });
		const started = super.startIntervention(mandate);
		this.scripts.delete(mandate.role);
		return started;
	}
}

/** A Maven reactor of `modules`, each with the reactor modules it depends on, carrying `sources`. */
export function mavenReactor(modules: Record<string, readonly string[]>, sources: Record<string, string>): string {
	const dependency = (artifactId: string) =>
		`<dependency><groupId>io.demo</groupId><artifactId>${artifactId}</artifactId><version>1.0.0</version></dependency>`;
	const modulePom = (artifactId: string, dependsOn: readonly string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version></parent>
  <artifactId>${artifactId}</artifactId>
  <dependencies>${dependsOn.map(dependency).join("")}</dependencies>
</project>
`;
	return trackedProject((root) =>
		writeFiles(root, {
			"pom.xml": `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version>
  <packaging>pom</packaging>
  <modules>${Object.keys(modules)
		.map((m) => `<module>${m}</module>`)
		.join("")}</modules>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.2.5</version>
      </plugin>
    </plugins>
  </build>
</project>
`,
			...Object.fromEntries(Object.entries(modules).map(([m, deps]) => [`${m}/pom.xml`, modulePom(m, deps)])),
			...sources,
		}),
	);
}

/** A Java type `name` of `pkg`, under the main sources of `module`, whose package is declared on line 1. */
export function javaSource(module: string, pkg: string, name: string, body = ""): [string, string] {
	return [
		`${module}/src/main/java/${pkg.replaceAll(".", "/")}/${name}.java`,
		`package ${pkg};\n\npublic interface ${name} {${body}}\n`,
	];
}

/** The reactor of the story: `domain` carries a model, services and a port, which `infrastructure` implements. */
export const DOMAIN_SOURCES: Record<string, string> = Object.fromEntries([
	javaSource("domain", "io.demo.domain.user", "User"),
	javaSource("domain", "io.demo.domain.service", "UserService"),
	javaSource("domain", "io.demo.domain.port", "UserRepository"),
	[
		"infrastructure/src/main/java/io/demo/infra/JdbcUserRepository.java",
		"package io.demo.infra;\n\nimport io.demo.domain.port.UserRepository;\n\npublic final class JdbcUserRepository implements UserRepository {}\n",
	],
]);

/** The modules of the reactor of the story: `infrastructure` depends on `domain`. */
export const DOMAIN_MODULES = { domain: [], infrastructure: ["domain"] } as const;

const hint = (path: string, line: number, says: string): ArchitectureHint => ({ path, line, says });

/** The map a model proposes of the reactor of the story. */
export const DOMAIN_MAP: ArchitectureMap = {
	parts: [
		{
			name: "domain",
			perimeter: ["domain"],
			style: "onion",
			roles: [
				{
					package: "io.demo.domain.user",
					role: "domain model",
					hints: [hint("domain/src/main/java/io/demo/domain/user/User.java", 3, "an entity of the model")],
				},
				{
					package: "io.demo.domain.service",
					role: "domain services",
					hints: [hint("domain/src/main/java/io/demo/domain/service/UserService.java", 3, "a service of the model")],
				},
				{
					package: "io.demo.domain.port",
					role: "domain services",
					hints: [
						hint(
							"domain/src/main/java/io/demo/domain/port/UserRepository.java",
							3,
							"an interface the infrastructure implements",
						),
					],
				},
			],
			hints: [hint("domain/pom.xml", 5, "the module depends on no other")],
		},
		{
			name: "infrastructure",
			perimeter: ["infrastructure"],
			style: "onion",
			roles: [
				{
					package: "io.demo.infra",
					role: "adapter persistence",
					hints: [hint("infrastructure/src/main/java/io/demo/infra/JdbcUserRepository.java", 5, "implements a port")],
				},
			],
			hints: [hint("infrastructure/pom.xml", 5, "the module of the adapters")],
		},
	],
	relations: [
		{
			from: "infrastructure",
			to: "domain",
			hints: [hint("infrastructure/pom.xml", 6, "the module depends on domain")],
		},
	],
};

/**
 * A survey of the architecture of `project`, conducted until it stops, the model proposing `maps` in turn;
 * `clock` is the time of the harness, when a test moves it, and `mode` how Maven resolves. The fake Maven is
 * returned with what it ran.
 */
export async function surveyedArchitecture(
	project: string,
	maps: readonly unknown[],
	clock?: Clock,
	mode: MavenMode = "resolves",
): Promise<{
	t: TestHarness;
	agent: ArchitectureMapAgent;
	maven: FakeMavenSandbox;
	changeId: string;
	stopped_because: string;
	steps: string[];
}> {
	const agent = new ArchitectureMapAgent(maps);
	let maven: FakeMavenSandbox | undefined;
	const t = makeHarness({
		agent,
		backend: (real) => {
			maven = new FakeMavenSandbox(real, mode);
			return maven;
		},
		controls: (real) => new FakeMavenControls(real),
		...(clock ? { clock } : {}),
	});
	assert.ok(maven, "the harness runs on the fake Maven");
	const { change } = await t.harness.start({
		project_path: project,
		request_text: ARCHITECTURE_QUESTION,
		actor: HUMAN,
		deliverable: "state",
	});
	const first = await t.harness.advance(change.change_id, { max_steps: 40 });
	return { t, agent, maven, changeId: change.change_id, stopped_because: first.stopped_because, steps: first.steps };
}

/** The owner answers the decision the change waits on with `optionId`, writing `freeText` beside it. */
export function answerMap(t: TestHarness, changeId: string, optionId: string, freeText: string | null = null): void {
	const [pending] = t.harness.pendingDecisions(changeId);
	assert.ok(pending, "a decision is pending");
	const answered = t.harness.answerDecision(
		changeId,
		{
			decision_id: pending.decision_id,
			option_id: optionId,
			free_text: freeText,
			reason: null,
			subject_revision: pending.subject.revision,
			scope: null,
			expires_at: null,
		},
		tuiOrigin(),
	);
	assert.equal(answered.error, null, answered.error?.message);
}
