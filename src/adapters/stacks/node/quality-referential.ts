/**
 * The ESLint and jscpd quality referential offered to a Node target: the rules it applies with the
 * thresholds their analysers document, what they read of the package, and whether it is offered, given
 * who declares the analysers (QLT-01).
 */
import type { InstalledPackage, QualityPerimeter, QualityRule } from "../../../contracts/v1/protocol.ts";
import type { QualityOffer } from "../../../application/stacks/stack.ts";
import { declaredPackages, type PackageManifest } from "./package-manifest.ts";

/** The date the ESLint and jscpd referential below was checked against the packages it cites. */
const QUALITY_REFERENTIAL_DATE = "2026-10-03";
const ESLINT_VERSION = "10.12.0";
const JSCPD_VERSION = "5.4.0";
const ESLINT = `ESLint ${ESLINT_VERSION}`;
const JSCPD = `jscpd ${JSCPD_VERSION}`;

/** Where each ESLint rule is documented: the page the rule's own metadata names in ESLint 10.12.0. */
const eslintRuleSource = (rule: string): string => `eslint.org/docs/latest/rules/${rule}`;

/** The quality referential of a Node target: each threshold is the default its analyser documents, none is chosen here. */
export const NODE_QUALITY_REFERENTIAL: QualityRule[] = [
	{
		rule_id: "complexity",
		nature: "complexity",
		control_id: "eslint",
		reference: "complexity",
		threshold: "a function whose cyclomatic complexity is more than 20",
		properties: { max: "20" },
		tool: ESLINT,
		source: eslintRuleSource("complexity"),
		established_on: QUALITY_REFERENTIAL_DATE,
	},
	...(["no-unused-vars", "no-unused-private-class-members"] as const).map(
		(rule): QualityRule => ({
			rule_id: rule,
			nature: "dead_code",
			control_id: "eslint",
			reference: rule,
			threshold: "any occurrence",
			properties: {},
			tool: ESLINT,
			source: eslintRuleSource(rule),
			established_on: QUALITY_REFERENTIAL_DATE,
		}),
	),
	{
		rule_id: "jscpd",
		nature: "duplication",
		control_id: "jscpd",
		reference: null,
		threshold: "a duplicated block of at least 50 tokens and 5 lines",
		properties: { minTokens: "50", minLines: "5" },
		tool: JSCPD,
		source: `www.npmjs.com/package/jscpd/v/${JSCPD_VERSION}`,
		established_on: QUALITY_REFERENTIAL_DATE,
	},
];

/**
 * What ESLint and jscpd read in the package, as the referential runs them: the whole package as one
 * module, and not its TypeScript and JSX sources for ESLint, which reads them only through a parser of
 * its own, nor the packages it declares, nor a format jscpd is not given. No marker of generated code is
 * declared for Node, so nothing tells generated code apart.
 */
function nodeQualityPerimeter(pkg: PackageManifest): QualityPerimeter {
	return {
		measured: [{ module: ".", root: "." }],
		generated_annotations: [],
		unmeasured: [
			{
				subject: "TypeScript and JSX sources (.ts, .tsx, .mts, .cts, .jsx)",
				reason: `${ESLINT} reads only .js, .mjs and .cjs files without a dedicated parser, so their complexity and dead code are not measured`,
			},
			...declaredPackages(pkg).map((subject) => ({
				subject,
				reason: "a declared dependency, installed under node_modules/ outside the tree ESLint and jscpd analyse",
			})),
			{
				subject: "files in a format other than JavaScript and TypeScript",
				reason: `${JSCPD} is given the JavaScript and TypeScript formats only, so their duplication is not measured`,
			},
			{
				subject: "the separation of generated code",
				reason: "no marker of generated code is declared for Node, so every violation is counted as proprietary code",
			},
		],
	};
}

/** The analysers of the referential as a project may declare them itself, by package and by name. */
const QUALITY_ANALYSERS = [
	{ package: "eslint", name: "ESLint", version: ESLINT_VERSION },
	{ package: "jscpd", name: "jscpd", version: JSCPD_VERSION },
] as const;

/** Who declares the analysers in the package: nobody, 495 in a copy where the adopted referential was installed, or the project itself. */
export type AnalyserDeclaration =
	| { by: "nobody" }
	| { by: "495" }
	| { by: "project"; analyser: (typeof QUALITY_ANALYSERS)[number] };

/**
 * Only the adopted install says the referential was installed in this copy, by the packages it added: a
 * package that pins the same versions and installed them itself configures them itself, like any package
 * that declares either analyser.
 */
export function analyserDeclaration(
	pkg: PackageManifest,
	referentialPackages: readonly InstalledPackage[],
): AnalyserDeclaration {
	const installed = QUALITY_ANALYSERS.every((analyser) =>
		referentialPackages.some((p) => p.name === analyser.package && p.version === analyser.version),
	);
	if (installed) return { by: "495" };
	const declared = declaredPackages(pkg);
	const own = QUALITY_ANALYSERS.find((analyser) => declared.includes(analyser.package));
	return own === undefined ? { by: "nobody" } : { by: "project", analyser: own };
}

/**
 * The quality referential offered to a target whose `package.json` declares neither analyser, with the
 * install of each in a copy; a target that declares one configures it itself, and its rules are not
 * replaced by these.
 */
export function qualityOffer(pkg: PackageManifest, declaration: AnalyserDeclaration): QualityOffer {
	if (declaration.by === "project")
		return {
			kind: "not_proposed",
			note: `the project declares ${declaration.analyser.name} itself (${declaration.analyser.package} is a dependency in package.json): 495 proposes no quality referential of its own (QLT-01)`,
		};
	return {
		kind: "proposed",
		rules: NODE_QUALITY_REFERENTIAL,
		perimeter: nodeQualityPerimeter(pkg),
		recommendations: QUALITY_ANALYSERS.map((analyser) => ({
			test_type: "quality",
			tool: analyser.package,
			version: analyser.version,
			established_on: QUALITY_REFERENTIAL_DATE,
			source: `www.npmjs.com/package/${analyser.package}/v/${analyser.version}`,
			change: `in a copy, install ${analyser.package} ${analyser.version} as an exact devDependency, running no install script`,
			install: { package: analyser.package, version: analyser.version, manager: "npm" },
		})),
	};
}
