/**
 * The quality of a Maven target: the PMD and CPD controls that apply the adopted quality referential to its
 * reactor, with their witnesses, and the referential offered to the owner (QLT-01).
 */
import { RULESET_PLACEHOLDER, type ControlDefinition } from "../../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../../contracts/v1/evidence.ts";
import type { QualityCapability } from "../../../../application/stacks/plugin.ts";
import { baseControl } from "../../../../application/stacks/stack.ts";
import type { MavenProject } from "../project/maven-project.ts";
import { PMD_REFERENTIAL, pmdDeclaration, qualityOffer } from "./quality-referential.ts";
import { qualityNegativeWitnesses } from "./quality-witnesses.ts";
import { witnessPrefix } from "../project/witness-layout.ts";
import { PMD_RULESET_PROPERTY } from "../shared.ts";
import type { MavenReactor } from "../project/reactor.ts";

/**
 * The controls of the referential, once 495 declared PMD in the copy they run in: one per analyser, each
 * applying the rules of the referential it is the oracle of, with the network closed. PMD reads the rule
 * set the runner writes from the frozen rules at each run; CPD is given its threshold on its command line.
 * Each goal runs behind `compile` in the same invocation, so a module that depends on another module of
 * the reactor resolves it from the reactor: offline, the local repository never received it.
 */
function qualityControls(requirementRefs: RequirementRef[], reactor: MavenReactor): ControlDefinition[] {
	const rulesOf = (controlId: string) => PMD_REFERENTIAL.filter((rule) => rule.control_id === controlId);
	const minimumTokens = rulesOf("cpd")[0]?.properties.minimumTokens ?? "";
	const control = (controlId: string, title: string, goal: string, argument: string): ControlDefinition => ({
		...baseControl(requirementRefs),
		control_id: controlId,
		title,
		command: ["mvn", "-B", "-q", "-o", "compile", goal, argument],
		timeout_ms: 10 * 60_000,
		parser: controlId === "pmd" ? "pmd-xml" : "cpd-xml",
		report_path: "**/target",
		quality_rules: rulesOf(controlId),
		provides: [],
		writable_paths: reactor.target_paths,
		protected_paths: [...reactor.pom_paths],
	});
	return [
		control(
			"pmd",
			"violations of the frozen quality rules, read from the PMD report",
			"pmd:pmd",
			`-D${PMD_RULESET_PROPERTY}=${RULESET_PLACEHOLDER}`,
		),
		control("cpd", "duplicated blocks, read from the CPD report", "pmd:cpd", `-DminimumTokens=${minimumTokens}`),
	];
}

export const MAVEN_QUALITY: QualityCapability<MavenProject> = {
	offer: ({ model, view, requirement_refs }) => {
		const pmd = pmdDeclaration(view, model.reactor.pom_paths);
		if (pmd.by === "project")
			return {
				kind: "missing",
				reason: `the project configures PMD itself (maven-pmd-plugin is named in ${pmd.pom}), and 495 runs no analyser of its own (QLT-01)`,
			};
		if (pmd.by === "nobody")
			return { kind: "missing", reason: "no quality referential is adopted in this copy (QLT-01)" };
		return {
			kind: "available",
			controls: qualityControls(requirement_refs, model.reactor),
			own_negative_witness: qualityNegativeWitnesses(witnessPrefix(model.reactor)),
		};
	},
	referential: ({ model, view }) => qualityOffer(view, pmdDeclaration(view, model.reactor.pom_paths), model.reactor),
};
