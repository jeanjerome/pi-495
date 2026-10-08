/**
 * A survey of the architecture of a Maven reactor carried to its recommendation: the model asks the owner how many
 * teams work on the project, specifies two requirements, proposes the map the owner adopts, and proposes the
 * recommendations a test gives it, one per intervention that asks for one. Maven and ArchUnit are fakes, the
 * readers are the real ones.
 */
import { strict as assert } from "node:assert";
import type { ArchitectureHint, ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import type { SpecificationReport } from "../../src/contracts/v1/reports.ts";
import type { InterventionHandle, InterventionMandate } from "../../src/ports/execution.ts";
import { ARCHITECTURE_QUESTION, ArchitectureMapAgent, answerMap, mavenReactor } from "./architecture-survey.ts";
import { HUMAN } from "./change-fixture.ts";
import { FakeMavenControls, FakeMavenSandbox } from "./fake-maven.ts";
import { makeHarness, specReport, type TestHarness } from "./harness-fixture.ts";
import { treeDigest } from "./quality-survey.ts";

export const ORDER_SERVICE = "app/src/main/java/io/demo/app/OrderService.java";
export const MAIN = "app/src/main/java/io/demo/app/Main.java";
export const ORDER_REPOSITORY = "domain/src/main/java/io/demo/domain/port/OrderRepository.java";

/** `app` calls the infrastructure twice without a port, at lines 7 and 8 of its order service. */
export const RECOMMENDATION_SOURCES: Record<string, string> = {
	"domain/src/main/java/io/demo/domain/Order.java": "package io.demo.domain;\n\npublic class Order {}\n",
	[ORDER_REPOSITORY]:
		"package io.demo.domain.port;\n\npublic interface OrderRepository {\n    void save(io.demo.domain.Order order);\n}\n",
	"infrastructure/src/main/java/io/demo/infra/JpaOrders.java":
		"package io.demo.infra;\n\nimport io.demo.domain.port.OrderRepository;\n\npublic class JpaOrders implements OrderRepository {\n    public void save(io.demo.domain.Order order) {}\n}\n",
	"infrastructure/src/main/java/io/demo/infra/CardPayment.java":
		"package io.demo.infra;\n\npublic class CardPayment {}\n",
	[ORDER_SERVICE]:
		"package io.demo.app;\n\nimport io.demo.infra.CardPayment;\nimport io.demo.infra.JpaOrders;\n\npublic class OrderService {\n    private final JpaOrders orders = new JpaOrders();\n    private final CardPayment payments = new CardPayment();\n}\n",
	[MAIN]: `package io.demo.app;\n\npublic final class Main {\n${Array.from({ length: 15 }, (_, i) => `    // step ${i + 1} of the start\n`).join("")}    private Main() {}\n}\n`,
};

/** `domain` and `infrastructure` depend on nothing but `domain`; `app` declares both. */
export const RECOMMENDATION_MODULES = { domain: [], infrastructure: ["domain"], app: ["domain", "infrastructure"] };

const at = (path: string, line: number): ArchitectureHint[] => [{ path, line, says: "its package" }];

/** `domain` in onion; `app` may depend on `domain` alone, so its two calls of `io.demo.infra` are violations. */
export const RECOMMENDATION_MAP: ArchitectureMap = {
	parts: [
		{
			name: "domain",
			perimeter: ["domain"],
			style: "onion",
			roles: [
				{
					package: "io.demo.domain",
					role: "domain model",
					hints: at("domain/src/main/java/io/demo/domain/Order.java", 1),
				},
				{ package: "io.demo.domain.port", role: "domain services", hints: at(ORDER_REPOSITORY, 1) },
			],
			hints: at("domain/pom.xml", 1),
		},
		{
			name: "infrastructure",
			perimeter: ["infrastructure"],
			style: "simple",
			roles: [{ package: "io.demo.infra", role: "adapters", hints: at("infrastructure/pom.xml", 1) }],
			hints: at("infrastructure/pom.xml", 1),
		},
		{
			name: "app",
			perimeter: ["app"],
			style: "simple",
			roles: [{ package: "io.demo.app", role: "application", hints: at(ORDER_SERVICE, 1) }],
			hints: at("app/pom.xml", 1),
		},
	],
	relations: [
		{ from: "infrastructure", to: "domain", hints: at("infrastructure/pom.xml", 1) },
		{ from: "app", to: "domain", hints: at("app/pom.xml", 1) },
	],
};

export const TEAMS = { id: "q-equipes", question: "combien d'équipes travaillent sur le projet ?", material: true };
export const TEAMS_ANSWER = "deux équipes, une par module";
export const R2_STATEMENT = "un second moyen de paiement s'ajoute sans modifier le domaine";

const REQUIREMENTS: SpecificationReport["requirements"] = [
	{
		requirement_id: "R1",
		statement: "each part of the project keeps to the architecture it is organised in",
		mandatory: true,
		criterion: "no dependency crosses the architecture the project declares",
		category: "architecture",
		satisfied_by_reference: false,
	},
	{
		requirement_id: "R2",
		statement: R2_STATEMENT,
		mandatory: true,
		criterion: "the domain does not depend on a means of payment",
		category: "architecture",
		satisfied_by_reference: false,
	},
];

/** The specification asks how many teams work on the project, then binds the answer to R1. */
const SPECIFICATIONS = [
	specReport({ objective: ARCHITECTURE_QUESTION, questions: [TEAMS], answers: [], requirements: REQUIREMENTS }),
	specReport({
		objective: ARCHITECTURE_QUESTION,
		questions: [],
		answers: [{ question_id: TEAMS.id, observable: true, requirement_ids: ["R1"] }],
		requirements: REQUIREMENTS,
	}),
];

type Alternative = {
	alternative_id: string;
	nature: "keep" | "adjust" | "transform";
	description: string;
	benefits: string[];
	cost: { complexity: string; migration: string };
	risks: string[];
	constraints: string[];
};

export const KEEP: Alternative = {
	alternative_id: "A1",
	nature: "keep",
	description: "garder l'oignon tel qu'il est",
	benefits: ["aucune migration"],
	cost: { complexity: "aucune complexité de plus", migration: "aucune migration" },
	risks: ["app continue d'appeler io.demo.infra sans port"],
	constraints: ["R1"],
};

export const ADJUST: Alternative = {
	alternative_id: "A2",
	nature: "adjust",
	description: "ajouter un port de paiement dans domain, que io.demo.infra implémente",
	benefits: ["un second moyen de paiement s'ajoute par un adaptateur"],
	cost: { complexity: "un port et un adaptateur de plus", migration: "deux appels de app à déplacer derrière le port" },
	risks: ["un port sans second moyen de paiement reste une indirection"],
	constraints: ["R2", "R1"],
};

export const TRANSFORM: Alternative = {
	alternative_id: "A3",
	nature: "transform",
	description: "un module par équipe",
	benefits: ["chaque équipe livre son module"],
	cost: { complexity: "deux modules de plus à maintenir", migration: "découper app et domain" },
	risks: ["une frontière d'équipe qui ne suit pas le domaine"],
	constraints: [TEAMS.id],
};

export const CONCLUSION = "le port de paiement ajoute un moyen de paiement sans toucher au domaine";

/** The recommendation the reactor is given: keep, adjust by a port of payment, or transform into a module per team; A2 recommended. */
export const RECOMMENDATION = {
	alternatives: [KEEP, ADJUST, TRANSFORM],
	recommended: { alternative_id: "A2", conclusion: CONCLUSION, constraints: ["R2"] },
};

/**
 * Answers the two specifications of the reactor in turn, each intervention that asks for an architecture map with the
 * map of the reactor, and each that asks for a recommendation with the next of `recommendations`.
 */
export class RecommendationAgent extends ArchitectureMapAgent {
	private specifications = 0;
	constructor(recommendations: readonly unknown[]) {
		super([RECOMMENDATION_MAP], SPECIFICATIONS[0], recommendations);
	}
	override startIntervention(mandate: InterventionMandate): Promise<InterventionHandle> {
		if (mandate.role !== "specify" || mandate.output_schema !== "specification-report")
			return super.startIntervention(mandate);
		const output = SPECIFICATIONS[Math.min(this.specifications++, SPECIFICATIONS.length - 1)];
		this.scripts.set(mandate.role, { steps: [{ kind: "complete", output }] });
		const started = super.startIntervention(mandate);
		this.scripts.delete(mandate.role);
		return started;
	}
}

/**
 * The survey of the reactor, started in `language`, carried until it stops after the owner answered the question of
 * the teams and adopted the map, the model proposing `recommendations` in turn. Gives the digest of the project tree
 * before the survey started.
 */
export async function recommended(
	recommendations: readonly unknown[],
	sources: Record<string, string> = RECOMMENDATION_SOURCES,
	language: "fr" | "en" = "fr",
): Promise<{
	t: TestHarness;
	agent: RecommendationAgent;
	changeId: string;
	project: string;
	before: string;
	stopped_because: string;
	steps: string[];
}> {
	const project = mavenReactor(RECOMMENDATION_MODULES, sources);
	const before = treeDigest(project);
	const agent = new RecommendationAgent(recommendations);
	const t = makeHarness({
		agent,
		backend: (real) => new FakeMavenSandbox(real, "resolves"),
		controls: (real) => new FakeMavenControls(real),
	});
	const { change } = await t.harness.start({
		project_path: project,
		request_text: ARCHITECTURE_QUESTION,
		actor: HUMAN,
		language,
		deliverable: "state",
	});
	const changeId = change.change_id;
	const asked = await t.harness.advance(changeId, { max_steps: 40 });
	assert.equal(
		t.harness.pendingDecisions(changeId)[0]?.interaction,
		"IH-01",
		`the owner is asked how many teams: ${asked.stopped_because}, ${asked.steps.join(" | ")}`,
	);
	answerMap(t, changeId, "answer", TEAMS_ANSWER);
	const mapped = await t.harness.advance(changeId, { max_steps: 40 });
	assert.equal(
		t.harness.pendingDecisions(changeId)[0]?.interaction,
		"IH-04",
		`the map is proposed: ${mapped.stopped_because}, ${mapped.steps.join(" | ")}`,
	);
	answerMap(t, changeId, "adopt_map");
	const after = await t.harness.advance(changeId, { max_steps: 60 });
	return { t, agent, changeId, project, before, stopped_because: after.stopped_because, steps: after.steps };
}
