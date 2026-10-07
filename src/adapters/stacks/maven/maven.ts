/**
 * The Maven technology (CMP-TGT): a project whose root holds a `pom.xml`, modelled by the reactor its POM tree
 * declares, and the capabilities each directory here implements on it. Everything is read from what the target
 * itself declares — its modules, the dependency direction of its POMs, the package root each module lays out,
 * the report each plugin binds — and nothing is executed to find out.
 */
import type { StackPlugin } from "../../../application/stacks/plugin.ts";
import { bindsJacocoReport, MAVEN_COVERAGE } from "./coverage/coverage-control.ts";
import { JACOCO_READER } from "./coverage/jacoco-reader.ts";
import { MAVEN_MUTATION, readsMutationReport } from "./mutation/mutation-control.ts";
import { PITEST_READER } from "./mutation/pitest-reader.ts";
import type { MavenProject } from "./project/maven-project.ts";
import { discoverMavenReactor } from "./project/reactor.ts";
import { CPD_READER } from "./quality/cpd-reader.ts";
import { PMD_READER } from "./quality/pmd-reader.ts";
import { MAVEN_QUALITY } from "./quality/quality-controls.ts";
import { JAVA_IMPORTS_READER } from "./structure/java-imports-reader.ts";
import { MAVEN_STRUCTURE, structureRules } from "./structure/structure-control.ts";
import { MAVEN_TESTS } from "./tests/test-control.ts";

export const MAVEN_PLUGIN: StackPlugin<MavenProject> = {
	id: "maven",
	signal_files: ["pom.xml"],
	recognise(view) {
		if (!view.exists("pom.xml")) return null;
		const reactor = discoverMavenReactor(view);
		return { reactor, jacoco_report_bound: bindsJacocoReport(view, reactor.pom_paths) };
	},
	facts({ model, view }) {
		const mutation = readsMutationReport(view, model.reactor.pom_paths);
		return {
			pom: true,
			modules: model.reactor.modules,
			ignored_modules: model.reactor.ignored_modules,
			jacoco_report_bound: model.jacoco_report_bound,
			mutation_report_readable: mutation.usable,
			mutation_engine: mutation,
			architecture_rules: structureRules(model.reactor).map((rule) => rule.rule_id),
		};
	},
	readers: [JACOCO_READER, JAVA_IMPORTS_READER, PITEST_READER, PMD_READER, CPD_READER],
	capabilities: {
		tests: MAVEN_TESTS,
		coverage: MAVEN_COVERAGE,
		mutation: MAVEN_MUTATION,
		quality: MAVEN_QUALITY,
		structure: MAVEN_STRUCTURE,
	},
};
