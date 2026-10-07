/**
 * The PMD quality referential offered to a Maven target: the rules it applies with the thresholds PMD
 * documents, what PMD and CPD read of the reactor, and whether it is offered, given who declares PMD in the
 * POMs (QLT-01).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { QualityPerimeter, QualityRule } from "../../../contracts/v1/protocol.ts";
import { PMD_PLUGIN, PMD_PLUGIN_VERSION } from "../../../application/installation.ts";
import type { QualityOffer } from "../../../application/stacks/stack.ts";
import { withPluginEdit } from "./plugin-declaration.ts";
import type { MavenReactor } from "./reactor.ts";
import { PMD_RULESET_PROPERTY } from "./shared.ts";

/** The date the PMD referential below was checked against the sources it cites. */
const QUALITY_REFERENTIAL_DATE = "2026-10-03";

/** The PMD release `maven-pmd-plugin` 3.28.0 embeds, whose documentation states each threshold below. */
const PMD = "PMD 7.17.0";
const PMD_DOC = "docs.pmd-code.org/pmd-doc-7.17.0";

/** The quality referential of a Maven target: each threshold is the default PMD documents, none is chosen here. */
export const PMD_REFERENTIAL: QualityRule[] = [
	{
		rule_id: "CyclomaticComplexity",
		nature: "complexity",
		control_id: "pmd",
		reference: "category/java/design.xml/CyclomaticComplexity",
		threshold: "a method whose cyclomatic complexity is 10 or more",
		properties: { methodReportLevel: "10" },
		tool: PMD,
		source: `${PMD_DOC}/pmd_rules_java_design.html#cyclomaticcomplexity`,
		established_on: QUALITY_REFERENTIAL_DATE,
	},
	{
		rule_id: "CognitiveComplexity",
		nature: "complexity",
		control_id: "pmd",
		reference: "category/java/design.xml/CognitiveComplexity",
		threshold: "a method whose cognitive complexity is 15 or more",
		properties: { reportLevel: "15" },
		tool: PMD,
		source: `${PMD_DOC}/pmd_rules_java_design.html#cognitivecomplexity`,
		established_on: QUALITY_REFERENTIAL_DATE,
	},
	...(["UnusedPrivateMethod", "UnusedPrivateField", "UnusedLocalVariable"] as const).map(
		(rule): QualityRule => ({
			rule_id: rule,
			nature: "dead_code",
			control_id: "pmd",
			reference: `category/java/bestpractices.xml/${rule}`,
			threshold: "any occurrence",
			properties: {},
			tool: PMD,
			source: `${PMD_DOC}/pmd_rules_java_bestpractices.html#${rule.toLowerCase()}`,
			established_on: QUALITY_REFERENTIAL_DATE,
		}),
	),
	{
		rule_id: "CPD",
		nature: "duplication",
		control_id: "cpd",
		reference: null,
		threshold: "a duplicated block of at least 100 tokens",
		properties: { minimumTokens: "100" },
		tool: PMD,
		source: "maven.apache.org/plugins/maven-pmd-plugin/cpd-mojo.html#minimumTokens",
		established_on: QUALITY_REFERENTIAL_DATE,
	},
];

/** The annotations a code generator writes on the types it generates, from the JDK, Java EE and Jakarta EE. */
const GENERATED_ANNOTATIONS = [
	"javax.annotation.Generated",
	"javax.annotation.processing.Generated",
	"jakarta.annotation.Generated",
];

/**
 * What PMD and CPD read in the reactor, as `maven-pmd-plugin` runs them by default: the main sources of
 * each module, and not its test sources, nor the dependencies the POMs declare, which are artifacts
 * resolved outside the tree, nor a block that two modules repeat, CPD comparing one module at a time.
 */
function qualityPerimeter(reactor: MavenReactor): QualityPerimeter {
	const dependencies = [...new Set(reactor.module_info.flatMap((m) => m.external_dependencies))].sort();
	return {
		measured: reactor.module_info.flatMap((m) =>
			m.source_root === null ? [] : [{ module: m.path || ".", root: m.source_root }],
		),
		generated_annotations: GENERATED_ANNOTATIONS,
		unmeasured: [
			...reactor.module_info.flatMap((m) =>
				m.test_root === null
					? []
					: [
							{
								subject: m.test_root,
								reason: `test sources, which maven-pmd-plugin ${PMD_PLUGIN_VERSION} does not read (includeTests is false by default)`,
							},
						],
			),
			...dependencies.map((subject) => ({
				subject,
				reason: "a declared dependency, an artifact resolved outside the tree, whose code PMD and CPD do not read",
			})),
			{
				subject: "duplication between two modules",
				reason: `CPD compares the files of one module with each other only (aggregate is false by default in maven-pmd-plugin ${PMD_PLUGIN_VERSION})`,
			},
		],
	};
}

/** The declaration of PMD as it is inserted into a POM: no goal is bound, and the rule set is the one 495 names at each run. */
const PMD_DECLARATION = [
	"<plugin>",
	"\t<groupId>org.apache.maven.plugins</groupId>",
	"\t<artifactId>maven-pmd-plugin</artifactId>",
	`\t<version>${PMD_PLUGIN_VERSION}</version>`,
	"\t<configuration>",
	"\t\t<rulesets>",
	`\t\t\t<ruleset>\${${PMD_RULESET_PROPERTY}}</ruleset>`,
	"\t\t</rulesets>",
	"\t</configuration>",
	"</plugin>",
];

/** Who declares PMD in the reactor: nobody, 495 in a copy where the referential was adopted, or the project itself in the POM named. */
export type PmdDeclaration = { by: "nobody" } | { by: "495" } | { by: "project"; pom: string };

export function pmdDeclaration(projectPath: string, pomPaths: readonly string[]): PmdDeclaration {
	for (const rel of pomPaths) {
		let pom = "";
		try {
			pom = readFileSync(join(projectPath, rel), "utf8");
		} catch {
			continue; // an unreadable POM declares nothing; the other POMs are still read
		}
		const declared = pom.replace(/<!--[\s\S]*?-->/g, "");
		if (!declared.includes("maven-pmd-plugin")) continue;
		return declared.includes(`\${${PMD_RULESET_PROPERTY}}`) ? { by: "495" } : { by: "project", pom: rel };
	}
	return { by: "nobody" };
}

/**
 * The quality referential offered to a target whose POMs do not name PMD, with the recommendation that
 * declares the plugin in a copy and resolves it; a target that names PMD configures it itself, and its
 * rules are not replaced by these.
 */
export function qualityOffer(projectPath: string, declaration: PmdDeclaration, reactor: MavenReactor): QualityOffer {
	if (declaration.by === "project")
		return {
			kind: "not_proposed",
			note: `the project configures PMD itself (maven-pmd-plugin is named in ${declaration.pom}): 495 proposes no quality referential of its own (QLT-01)`,
		};
	return {
		kind: "proposed",
		rules: PMD_REFERENTIAL,
		perimeter: qualityPerimeter(reactor),
		recommendations: [
			withPluginEdit(
				projectPath,
				{
					test_type: "quality",
					tool: PMD_PLUGIN,
					version: PMD_PLUGIN_VERSION,
					established_on: QUALITY_REFERENTIAL_DATE,
					source: "maven.apache.org/plugins/maven-pmd-plugin/",
					change: `in a copy of the POM, declare maven-pmd-plugin outside any profile with the rule set named by the property ${PMD_RULESET_PROPERTY}, which 495 writes from the frozen protocol at each run`,
				},
				"maven-pmd-plugin",
				PMD_DECLARATION,
			),
		],
	};
}
