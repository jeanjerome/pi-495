/**
 * The Maven stack (CMP-TGT): this module declares the technology and assembles its detection from the
 * sensors of this directory. The detection is the reactor a POM tree declares, and the controls that
 * can be opposed to a candidate on it. Everything here is read from what the target itself declares —
 * its modules, the dependency direction of its POMs, the package root each module lays out, the report
 * each plugin binds — and nothing is executed to find out.
 */
import type { ControlDefinition } from "../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../contracts/v1/evidence.ts";
import type { StackAdapter, StackDetection } from "../../../application/stacks/stack.ts";
import { bindsJacocoReport, COVERAGE_NOT_MEASURED, coverageControl, jacocoRecommendation } from "./coverage-control.ts";
import { CPD_READER } from "./cpd-reader.ts";
import { JACOCO_READER } from "./jacoco-reader.ts";
import { JAVA_IMPORTS_READER } from "./java-imports-reader.ts";
import {
	mutationCapabilityMissing,
	mutationControl,
	mutationRecommendation,
	readsMutationReport,
} from "./mutation-control.ts";
import { PITEST_READER } from "./pitest-reader.ts";
import { PMD_READER } from "./pmd-reader.ts";
import { qualityControls } from "./quality-controls.ts";
import { pmdDeclaration, qualityOffer } from "./quality-referential.ts";
import { discoverMavenReactor } from "./reactor.ts";
import { BOUNDARIES_NOT_CHECKED, structureControl, structureRules } from "./structure-control.ts";
import { testControl } from "./test-control.ts";
import {
	coverageNegativeWitness,
	mutationNegativeWitness,
	negativeWitness,
	positiveWitness,
	qualityNegativeWitnesses,
	structureNegativeWitness,
} from "./witnesses.ts";

export const MAVEN_ADAPTER: StackAdapter = {
	stack: "maven",
	signal_files: ["pom.xml"],
	readers: [JACOCO_READER, JAVA_IMPORTS_READER, PITEST_READER, PMD_READER, CPD_READER],
	detect: detectMavenStack,
};

function detectMavenStack(projectPath: string, requirementRefs: RequirementRef[], nodeBinary: string): StackDetection {
	const reactor = discoverMavenReactor(projectPath);
	const witnessPrefix = reactor.witness_module ? `${reactor.witness_module}/` : "";
	const jacoco = bindsJacocoReport(projectPath, reactor.pom_paths);
	const mutation = readsMutationReport(projectPath, reactor.pom_paths);
	const rules = structureRules(reactor);
	const pmd = pmdDeclaration(projectPath, reactor.pom_paths);
	// Both sensors judge introduced production code, so both need a class the suite calls.
	const measuresIntroducedCode = jacoco || mutation.usable;
	const controls: ControlDefinition[] = [testControl(requirementRefs, reactor, jacoco)];
	if (jacoco) controls.push(coverageControl(requirementRefs, reactor, nodeBinary));
	if (rules.length > 0) controls.push(structureControl(requirementRefs, reactor, rules, nodeBinary));
	if (mutation.usable) controls.push(mutationControl(requirementRefs, reactor));
	if (pmd.by === "495") controls.push(...qualityControls(requirementRefs, reactor));
	return {
		stack: "maven",
		facts: {
			pom: true,
			modules: reactor.modules,
			ignored_modules: reactor.ignored_modules,
			jacoco_report_bound: jacoco,
			mutation_report_readable: mutation.usable,
			mutation_engine: mutation,
			architecture_rules: rules.map((rule) => rule.rule_id),
		},
		controls,
		lint_control_ids: pmd.by === "495" ? ["pmd", "cpd"] : [],
		positive_witness: positiveWitness(witnessPrefix, measuresIntroducedCode),
		witness_tests: measuresIntroducedCode ? 2 : 1,
		negative_witness: negativeWitness(witnessPrefix),
		own_negative_witness: {
			...(jacoco ? { coverage: coverageNegativeWitness(witnessPrefix) } : {}),
			// A failing test proves nothing about a boundary: the tree that carries this defect is one
			// where a module imports what it declares no dependency on, and it compiles nowhere.
			...(rules.length > 0 ? { structure: structureNegativeWitness(rules) } : {}),
			// A mutant survives where a test executes a line without asserting anything about it. The
			// coverage witness does not exhibit that defect — the line is never executed there, which
			// is the other control's business — so this one introduces a class the suite calls and
			// leaves unchecked.
			...(mutation.usable ? { mutation: mutationNegativeWitness(witnessPrefix) } : {}),
			...(pmd.by === "495" ? qualityNegativeWitnesses(witnessPrefix) : {}),
		},
		preparation_paths: reactor.preparation_paths,
		capability_missing: [
			...(jacoco ? [] : [COVERAGE_NOT_MEASURED]),
			...(mutation.usable ? [] : [mutationCapabilityMissing(mutation)]),
			...(rules.some((rule) => rule.kind === "forbidden_dependency") ? [] : [BOUNDARIES_NOT_CHECKED]),
		],
		recommendations: [...(jacoco ? [] : [jacocoRecommendation(projectPath)]), ...mutationRecommendation(mutation)],
		quality_referential: qualityOffer(projectPath, pmd, reactor),
	};
}
