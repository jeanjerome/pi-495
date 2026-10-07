/**
 * The Node stack (CMP-TGT): the controls a `package.json` offers, detected without executing
 * anything. The suite runs under `node --test` unless `scripts.test` declares vitest, mocha or jest
 * run without an argument, each read through the report it writes. A declared lint script becomes a
 * control of its own, refused rather than guessed when it needs a shell. A `scripts.test` that names
 * a runner 495 cannot read leaves no control at all, lint included, and offers no quality referential,
 * so the change stops on that runner rather than freezing a protocol without it. A target that asks
 * its runner for coverage receives a control that judges the lines a change introduces from the LCOV
 * report the runner writes; one that does not is told so instead (QLT-04). A target that installed Stryker
 * receives a control that judges the mutants of the lines a change introduces; one that did not is
 * recommended to (VER-04). A target that declares neither ESLint nor jscpd is offered a quality
 * referential that installs both in a copy (QLT-01); one that declares either is told why not. In a copy
 * where the adopted install put the referential, and there alone, ESLint and jscpd are the quality controls.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	RULESET_PLACEHOLDER,
	SCOPE_PLACEHOLDER,
	type ControlDefinition,
	type InstalledPackage,
	type QualityPerimeter,
	type QualityRule,
	type RecommendedComplement,
} from "../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import { baseControl, emptyTrigger, type QualityOffer, type StackAdapter, type StackDetection } from "./stack.ts";

export const NODE_ADAPTER: StackAdapter = { stack: "node", signal_files: ["package.json"], detect: detectNodeStack };

function detectNodeStack(
	projectPath: string,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
	referentialPackages: readonly InstalledPackage[],
): StackDetection {
	const pkgPath = join(projectPath, "package.json");
	let pkg: PackageManifest = {};
	try {
		pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as typeof pkg;
	} catch {
		/* invalid package.json is a fact, not an error */
	}
	const scripts = pkg.scripts ?? {};
	const suite = suiteOf(
		projectPath,
		typeof scripts.test === "string" ? scripts.test : undefined,
		requirementRefs,
		nodeBinary,
	);
	// A runner 495 cannot read leaves no control at all: a protocol frozen on the lint alone would
	// judge nothing of the behaviour the refused runner was there to judge.
	const controls: ControlDefinition[] = suite.control ? [suite.control] : [];
	if (suite.coverage?.control) controls.push(suite.coverage.control);
	const lintScript = typeof scripts.lint === "string" ? scripts.lint : undefined;
	const lint = lintScript && !suite.refusal ? lintOf(lintScript, nodeBinary) : {};
	if (lint.command)
		controls.push({
			...baseControl(requirementRefs),
			control_id: "lint",
			title: `npm run lint (${lintScript})`,
			command: lint.command,
			timeout_ms: 5 * 60_000,
			parser: "exit-code",
			report_path: null,
			provides: [],
			protected_paths: ["scripts/lint.js", "eslint.config.js", ".eslintrc.json", "package.json"],
		});
	const mutation = suite.runner
		? mutationOutcome(projectPath, suite.runner, suite.control, requirementRefs, nodeBinary)
		: {};
	if (mutation.control) controls.push(mutation.control);
	// Nor is a quality referential offered then: the analysers its adoption would install could never be
	// declared, and a project that declares one itself would see it installed over its own.
	const analysers = suite.refusal ? null : analyserDeclaration(pkg, referentialPackages);
	if (analysers?.by === "495") controls.push(...qualityControls(requirementRefs, nodeBinary));
	const witnesses = suite.runner ? witnessesOf(suite.runner, projectPath) : nodeTestWitnesses();
	const measured =
		suite.runner && (suite.coverage?.control || mutation.control) ? moduleWitnesses(suite.runner, projectPath) : null;
	return {
		stack: "node",
		facts: { scripts: Object.keys(scripts), has_test_dir: existsSync(join(projectPath, "test")) },
		controls,
		lint_control_ids: [...(lint.command ? ["lint"] : []), ...(analysers?.by === "495" ? ["eslint", "jscpd"] : [])],
		positive_witness: { ...witnesses.positive, ...measured?.positive },
		witness_tests: measured ? 2 : 1,
		own_negative_witness: {
			...(suite.coverage?.control && measured ? { coverage: measured.uncovered } : {}),
			...(mutation.control && measured ? { mutation: measured.unasserted } : {}),
			...(analysers?.by === "495" ? QUALITY_NEGATIVE_WITNESSES : {}),
		},
		negative_witness: { ...witnesses.negative, "src/495-negative-witness.js": "var forbidden = 1;\n" },
		preparation_paths: ["test/", "tests/"],
		capability_missing: suite.refusal
			? [suite.refusal]
			: [...(suite.coverage?.missing ?? []), ...(mutation.missing ?? []), ...(lint.refusal ? [lint.refusal] : [])],
		recommendations: [suite.coverage?.recommendation, mutation.recommendation].filter((r) => r !== undefined),
		...(analysers ? { quality_referential: qualityOffer(pkg, analysers) } : {}),
	};
}

/** What the adapter reads of a `package.json`: its scripts, and the dependencies it declares. */
interface PackageManifest {
	scripts?: Record<string, unknown>;
	dependencies?: Record<string, unknown>;
	devDependencies?: Record<string, unknown>;
	optionalDependencies?: Record<string, unknown>;
	peerDependencies?: Record<string, unknown>;
}

/** Every package `package.json` declares, whatever the kind of dependency, sorted. */
function declaredPackages(pkg: PackageManifest): string[] {
	const maps = [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.peerDependencies];
	return [...new Set(maps.flatMap((map) => (map && typeof map === "object" ? Object.keys(map) : [])))].sort();
}

/** The date the ESLint and jscpd referential below was checked against the packages it cites. */
const QUALITY_REFERENTIAL_DATE = "2026-10-03";
const ESLINT_VERSION = "10.12.0";
const JSCPD_VERSION = "5.4.0";
const ESLINT = `ESLint ${ESLINT_VERSION}`;
const JSCPD = `jscpd ${JSCPD_VERSION}`;

/** Where each ESLint rule is documented: the page the rule's own metadata names in ESLint 10.12.0. */
const eslintRuleSource = (rule: string): string => `eslint.org/docs/latest/rules/${rule}`;

/** The quality referential of a Node target: each threshold is the default its analyser documents, none is chosen here. */
const NODE_QUALITY_REFERENTIAL: QualityRule[] = [
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
type AnalyserDeclaration =
	| { by: "nobody" }
	| { by: "495" }
	| { by: "project"; analyser: (typeof QUALITY_ANALYSERS)[number] };

/**
 * Only the adopted install says the referential was installed in this copy, by the packages it added: a
 * package that pins the same versions and installed them itself configures them itself, like any package
 * that declares either analyser.
 */
function analyserDeclaration(
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
function qualityOffer(pkg: PackageManifest, declaration: AnalyserDeclaration): QualityOffer {
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

/**
 * Where a runner writes its JUnit report, and an analyser its own. `target/` is excluded from every
 * snapshot by default, so the copy has none: the directory itself is what the control declares writable,
 * because the runner creates the parent of its output file and the sandbox refuses to create a directory
 * it did not open.
 */
const REPORT_DIRECTORY = "target";

/** Where ESLint writes its JSON report, and where jscpd writes its own. */
const ESLINT_REPORT_PATH = `${REPORT_DIRECTORY}/495-eslint.json`;
const JSCPD_OUTPUT = `${REPORT_DIRECTORY}/495-jscpd`;

/** The source formats jscpd is given: JavaScript and TypeScript, with and without JSX. */
const JSCPD_FORMATS = "javascript,jsx,typescript,tsx";

/** The ESLint rules of the referential as its `--rule` option takes them: each at error, with the options its threshold needs. */
function eslintRules(rules: readonly QualityRule[]): string {
	const entries = rules.flatMap((rule) => {
		if (rule.reference === null) return [];
		const options = Object.entries(rule.properties).map(([name, value]) => [name, Number(value)] as const);
		return [[rule.reference, options.length === 0 ? "error" : ["error", Object.fromEntries(options)]] as const];
	});
	return JSON.stringify(Object.fromEntries(entries));
}

/**
 * The controls of the referential, once it was installed in the copy they run in: one per analyser, each
 * run from the copy's `node_modules` and never from the host's PATH, with the network closed, applying the
 * rules of the referential it is the oracle of. ESLint looks up no configuration and is given its rules on
 * its command line; jscpd reads the configuration the runner writes from the frozen rules instead of a
 * `.jscpd.json` of the tree, ignores what a `.gitignore` leaves out, and reads JavaScript and TypeScript
 * outside `node_modules/` only.
 */
function qualityControls(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition[] {
	const rulesOf = (controlId: string) => NODE_QUALITY_REFERENTIAL.filter((rule) => rule.control_id === controlId);
	const control = (
		controlId: "eslint" | "jscpd",
		title: string,
		command: string[],
		reportPath: string,
	): ControlDefinition => ({
		...baseControl(requirementRefs),
		control_id: controlId,
		title,
		command: [nodeBinary, ...command],
		timeout_ms: 10 * 60_000,
		parser: controlId === "eslint" ? "eslint-json" : "jscpd-json",
		report_path: reportPath,
		quality_rules: rulesOf(controlId),
		provides: [],
		writable_paths: [REPORT_DIRECTORY],
		protected_paths: ["package.json", "node_modules/"],
	});
	return [
		control(
			"eslint",
			"violations of the frozen quality rules, read from the ESLint report",
			[
				"node_modules/eslint/bin/eslint.js",
				"--no-config-lookup",
				"--rule",
				eslintRules(rulesOf("eslint")),
				// A package with no JavaScript file is one ESLint has nothing to read in, not a failure to read it.
				"--no-error-on-unmatched-pattern",
				"--format",
				"json",
				"--output-file",
				ESLINT_REPORT_PATH,
				".",
			],
			ESLINT_REPORT_PATH,
		),
		control(
			"jscpd",
			"duplicated blocks, read from the jscpd report",
			[
				"node_modules/jscpd/run-jscpd.js",
				"--config",
				RULESET_PLACEHOLDER,
				"--format",
				JSCPD_FORMATS,
				"--ignore",
				"**/node_modules/**",
				"--no-gitignore",
				"--reporters",
				"json",
				"--output",
				JSCPD_OUTPUT,
				"--silent",
				".",
			],
			`${JSCPD_OUTPUT}/jscpd-report.json`,
		),
	];
}

/** Twenty conditions on top of the function itself: a cyclomatic complexity of 21, one above the threshold. */
const COMPLEX_WITNESS = `export function witness495Grade(a, b, c) {
  let r = 0;
${Array.from({ length: 20 }, (_, i) => `  if (${["a", "b", "c"][i % 3]} > ${Math.floor(i / 3)}) r++;`).join("\n")}
  return r;
}
`;

/** A block of more than 50 tokens over more than 5 lines that only its twin witness repeats. */
const DUPLICATE_WITNESS = `export function witness495Checksum(samples) {
  let witness495Sum = 17;
  for (let k = 0; k < samples.length; k++) {
    if (samples[k] % 3 === 1) {
      witness495Sum = witness495Sum * 31 + samples[k];
    } else {
      witness495Sum = witness495Sum * 37 - samples[k] / 5;
    }
  }
  return witness495Sum;
}
`;

/**
 * The trees that carry the defects the quality controls claim to detect (VER-05): a function above the
 * complexity threshold for ESLint, and a block two witness modules repeat for jscpd. The project may
 * already carry both; a witness is judged by the findings in its own files.
 */
const QUALITY_NEGATIVE_WITNESSES: Record<string, Record<string, string>> = {
	eslint: { "src/witness495/complex.mjs": COMPLEX_WITNESS },
	jscpd: {
		"src/witness495/duplicate-a.mjs": DUPLICATE_WITNESS,
		"src/witness495/duplicate-b.mjs": DUPLICATE_WITNESS,
	},
};

type SuiteRunner = "node-test" | "vitest" | "mocha" | "jest";

// The only forms of `scripts.test` 495 reads: a command that starts the runner directly. Anything
// with shell syntax needs a shell, which the sandbox does not give.
const VITEST_COMMAND = /^\s*vitest(\s+run)?\s*$/;
const MOCHA_COMMAND = /^\s*mocha\s*$/;
const JEST_COMMAND = /^\s*jest\s*$/;
const NODE_TEST_COMMAND = /^\s*node\s+--test(\s|$)/;
const NODE_TEST_COVERAGE = /(^|\s)--experimental-test-coverage(\s|$)/;
const READ_RUNNER = /^(vitest|mocha|jest)\s/;
const SHELL_SYNTAX = /[|&;<>$`()]/;

/** What a measurement of the introduced lines becomes on a target: a control that judges it, or the reason there is none and what would give one. */
interface SensorOutcome {
	control?: ControlDefinition;
	missing?: string[];
	recommendation?: RecommendedComplement;
}

/** The date the versions below were checked against the sources they cite. */
const CATALOGUE_DATE = "2026-09-30";

/** The flag makes `node --test` write the lines it executed; it needs nothing installed. */
const NODE_TEST_COVERAGE_RECOMMENDATION: RecommendedComplement = {
	test_type: "coverage",
	tool: "node --experimental-test-coverage",
	version: "24.21.0",
	established_on: CATALOGUE_DATE,
	source: "nodejs.org/docs/latest-v24.x/api/test.html#collecting-code-coverage",
	change: "in package.json, add --experimental-test-coverage to scripts.test",
};

const COVERAGE_NOT_MEASURED = "the coverage of the introduced lines is not measured on this target";

/** What Stryker is installed as, and where its JSON reporter writes the report the control reads. */
const STRYKER_PACKAGE = "@stryker-mutator/core";
const STRYKER_REPORT = "reports/mutation/mutation.json";

const MUTATION_NOT_MEASURED = "the mutation of the introduced lines is not measured on this target";

const STRYKER_RECOMMENDATION: RecommendedComplement = {
	test_type: "mutation",
	tool: STRYKER_PACKAGE,
	version: "10.0.0",
	established_on: CATALOGUE_DATE,
	source: "stryker-mutator.io/docs/stryker-js/getting-started/",
	change: `install ${STRYKER_PACKAGE} as a devDependency`,
};

/**
 * The mutation control of a target that installed Stryker, or why it has none. Stryker is run from the
 * copy's `node_modules` and never from the host's PATH, with the configuration the target chose and
 * `npm test` as its command unless that configuration says otherwise; 495 installs nothing. The runners
 * whose qualification witnesses 495 writes are the ones it can qualify the control on.
 */
function mutationOutcome(
	projectPath: string,
	runner: SuiteRunner,
	unit: ControlDefinition,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
): SensorOutcome {
	if (runner !== "node-test" && runner !== "vitest")
		return { missing: [`${MUTATION_NOT_MEASURED}: 495 writes no qualification witness for ${runner}`] };
	if (!existsSync(join(projectPath, "node_modules", STRYKER_PACKAGE)))
		return {
			missing: [`${MUTATION_NOT_MEASURED}: ${STRYKER_PACKAGE} is not installed`],
			recommendation: STRYKER_RECOMMENDATION,
		};
	return {
		control: {
			...unit,
			control_id: "mutation",
			title: "surviving mutants on the lines the candidate wrote, read from the Stryker JSON report",
			command: [
				nodeBinary,
				`node_modules/${STRYKER_PACKAGE}/bin/stryker.js`,
				"run",
				"--reporters",
				"json",
				"--concurrency",
				"1",
			],
			timeout_ms: 30 * 60_000,
			parser: "stryker-json",
			report_path: STRYKER_REPORT,
			provides: [],
			requires: [],
			scope_argument: `--mutate=${SCOPE_PLACEHOLDER}`,
			// Stryker listens on every interface to talk to its test processes: without the loopback profile
			// it fails with `listen EPERM`.
			network: "loopback",
			// Stryker runs the suite in a copy under `.stryker-tmp` whose `node_modules` links back to the
			// copy's own, so the directories vitest writes in, `VITEST_OWN_PATHS`, are written through that link.
			writable_paths: ["reports/mutation", ".stryker-tmp", ...(runner === "vitest" ? VITEST_OWN_PATHS : [])],
			requirement_refs: requirementRefs,
			// A narrowed `mutate`, an added exclusion or another reporter would make the control pass on less.
			protected_paths: [...unit.protected_paths, "stryker.conf.*", "stryker.config.*"],
		},
	};
}

/**
 * The unit control `scripts.test` declares, or why there is none: a control whose reader is not
 * qualified on the output it reads is worth less than no control, so a runner 495 cannot read is
 * named instead of being run under the wrong reader.
 */
function suiteOf(
	projectPath: string,
	scriptsTest: string | undefined,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
):
	| { runner: SuiteRunner; control: ControlDefinition; coverage?: SensorOutcome; refusal?: undefined }
	| { runner?: undefined; control?: undefined; coverage?: undefined; refusal: string } {
	if (scriptsTest === undefined || NODE_TEST_COMMAND.test(scriptsTest)) {
		if (scriptsTest !== undefined && NODE_TEST_COVERAGE.test(scriptsTest)) {
			const control = nodeTestCoverageControl(requirementRefs, nodeBinary);
			return {
				runner: "node-test",
				control,
				coverage: { control: coverageControl(control, requirementRefs, nodeBinary, LCOV_REPORT) },
			};
		}
		return {
			runner: "node-test",
			control: nodeTestControl(requirementRefs, nodeBinary),
			coverage: {
				missing: [
					`${COVERAGE_NOT_MEASURED}: scripts.test does not ask node:test for coverage (--experimental-test-coverage)`,
				],
				recommendation:
					scriptsTest === undefined
						? NODE_TEST_COVERAGE_RECOMMENDATION
						: {
								...NODE_TEST_COVERAGE_RECOMMENDATION,
								edit: {
									path: "package.json",
									current: scriptsTest,
									wanted: `${scriptsTest} --experimental-test-coverage`,
								},
							},
			},
		};
	}
	if (VITEST_COMMAND.test(scriptsTest)) return vitestSuite(projectPath, requirementRefs, nodeBinary);
	if (MOCHA_COMMAND.test(scriptsTest))
		return { runner: "mocha", control: mochaControl(requirementRefs, nodeBinary), coverage: unreadCoverage("mocha") };
	if (JEST_COMMAND.test(scriptsTest))
		return { runner: "jest", control: jestControl(requirementRefs, nodeBinary), coverage: unreadCoverage("jest") };
	const command = scriptsTest.trim();
	if (SHELL_SYNTAX.test(command))
		return { refusal: `scripts.test chains commands through a shell (${command}), which 495 cannot run` };
	const withArguments = READ_RUNNER.exec(command);
	if (withArguments)
		return {
			refusal: `scripts.test runs ${command}, but 495 reads ${withArguments[1]} only when it runs without an argument`,
		};
	return {
		refusal: `scripts.test runs ${command}, whose output 495 cannot read: only node --test, vitest, mocha and jest are read`,
	};
}

function nodeTestControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	return {
		...baseControl(requirementRefs),
		control_id: "unit",
		title: "node:test suite",
		command: [nodeBinary, "--test", "--test-reporter=tap"],
		timeout_ms: 10 * 60_000,
		parser: "node-test",
		report_path: null,
		provides: [],
		// `node_modules/` holds code the checks load, and only an adopted complement writes there: any other
		// file added or modified under it is a dependency the producer slipped into the project.
		protected_paths: ["test/", "tests/", "package.json", "node_modules/"],
	};
}

/**
 * Where node:test writes its LCOV report: a file at the root of the copy, which is why the control
 * declares that one file writable and nothing around it. The report goes beside the TAP stream, which
 * stays on the standard output where the node-test reader looks for it.
 */
const LCOV_REPORT = "495-lcov.info";
/** The name under which `unit` provides that report to the controls that require it. */
const LCOV_REPORT_NAME = "lcov-report";

function nodeTestCoverageControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "node:test suite with coverage (command read from scripts.test)",
		command: [
			nodeBinary,
			"--test",
			"--experimental-test-coverage",
			"--test-reporter=tap",
			"--test-reporter-destination=stdout",
			"--test-reporter=lcov",
			`--test-reporter-destination=${LCOV_REPORT}`,
		],
		provides: [LCOV_REPORT_NAME],
		writable_paths: [LCOV_REPORT],
	};
}

/**
 * The control that judges the lines a change introduces from the LCOV report `unit` wrote. It runs
 * nothing of its own and protects what `unit` protects: a configuration that excludes files from the
 * report would make lines disappear from it.
 */
function coverageControl(
	unit: ControlDefinition,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
	report: string,
): ControlDefinition {
	return {
		...unit,
		control_id: "coverage",
		title: "introduced-line coverage, read from the LCOV report of the test run",
		command: emptyTrigger(nodeBinary),
		timeout_ms: 60_000,
		parser: "lcov",
		report_path: report,
		provides: [],
		requires: [LCOV_REPORT_NAME],
		writable_paths: [],
		requirement_refs: requirementRefs,
	};
}

/** The coverage providers vitest loads from `node_modules`, in the order the control prefers them. */
const VITEST_COVERAGE_PROVIDERS = ["v8", "istanbul"] as const;
type VitestCoverageProvider = (typeof VITEST_COVERAGE_PROVIDERS)[number];

/** Where vitest writes the LCOV report of its coverage run, under the directory the sandbox lets it create. */
const VITEST_COVERAGE_DIRECTORY = `${REPORT_DIRECTORY}/coverage`;

/** The version of the vitest the target installed, which a coverage provider has to match; null when it cannot be read. */
function installedVitestVersion(projectPath: string): string | null {
	try {
		const manifest = JSON.parse(readFileSync(join(projectPath, "node_modules", "vitest", "package.json"), "utf8")) as {
			version?: unknown;
		};
		return typeof manifest.version === "string" ? manifest.version : null;
	} catch {
		return null; // an absent or unreadable vitest manifest leaves the version unread
	}
}

/** The provider the target installed: vitest measures nothing without one, and 495 installs none. */
function installedVitestProvider(projectPath: string): VitestCoverageProvider | null {
	return (
		VITEST_COVERAGE_PROVIDERS.find((provider) =>
			existsSync(join(projectPath, "node_modules", "@vitest", `coverage-${provider}`)),
		) ?? null
	);
}

function vitestSuite(
	projectPath: string,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
): { runner: SuiteRunner; control: ControlDefinition; coverage: SensorOutcome } {
	const provider = installedVitestProvider(projectPath);
	const control = vitestControl(requirementRefs, nodeBinary, provider);
	if (provider === null) {
		const version = installedVitestVersion(projectPath);
		return {
			runner: "vitest",
			control,
			coverage: {
				missing: [
					`${COVERAGE_NOT_MEASURED}: vitest is installed without a coverage provider, and @vitest/coverage-v8 would make it measurable`,
				],
				...(version === null
					? {}
					: {
							recommendation: {
								test_type: "coverage",
								tool: "@vitest/coverage-v8",
								version,
								established_on: CATALOGUE_DATE,
								source: "vitest.dev/guide/coverage.html",
								change: `install @vitest/coverage-v8@${version} as a devDependency, the version of the installed vitest`,
								install: { package: "@vitest/coverage-v8", version, manager: "npm" },
							},
						}),
			},
		};
	}
	return {
		runner: "vitest",
		control,
		coverage: {
			control: coverageControl(control, requirementRefs, nodeBinary, `${VITEST_COVERAGE_DIRECTORY}/lcov.info`),
		},
	};
}

/** A runner whose coverage is declared where 495 does not look, or wrapped by a tool it does not run. */
function unreadCoverage(runner: "mocha" | "jest"): SensorOutcome {
	return { missing: [`${COVERAGE_NOT_MEASURED}: 495 does not read the coverage of ${runner}`] };
}

/**
 * What vitest writes in the copy besides its report: Vite bundles the configuration under
 * `node_modules/.vite-temp`, and vitest 5 creates its API token under `node_modules/.vitest` when the
 * user data directory, which the sandbox keeps read-only, holds none yet.
 */
const VITEST_OWN_PATHS = ["node_modules/.vite-temp", "node_modules/.vitest"];

/**
 * The vitest the target installed, run from the copy's `node_modules` and never from the host's PATH,
 * so the control judges the version the target declared. The directories vitest writes in,
 * `VITEST_OWN_PATHS`, are writable next to the report. With a coverage provider installed it also
 * writes the LCOV report of the run under `target/coverage`.
 */
function vitestControl(
	requirementRefs: RequirementRef[],
	nodeBinary: string,
	provider: VitestCoverageProvider | null,
): ControlDefinition {
	const report = `${REPORT_DIRECTORY}/junit.xml`;
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "vitest suite (command read from scripts.test)",
		command: [
			nodeBinary,
			"node_modules/vitest/vitest.mjs",
			"run",
			"--reporter=junit",
			`--outputFile=${report}`,
			...(provider === null
				? []
				: [
						"--coverage.enabled",
						`--coverage.provider=${provider}`,
						"--coverage.reporter=lcov",
						`--coverage.reportsDirectory=${VITEST_COVERAGE_DIRECTORY}`,
					]),
		],
		provides: provider === null ? [] : [LCOV_REPORT_NAME],
		parser: "junit-xml",
		report_path: report,
		writable_paths: [REPORT_DIRECTORY, ...VITEST_OWN_PATHS],
		// A narrowed `include` or an added `exclude` would make the suite green without proving anything.
		protected_paths: [...nodeTest.protected_paths, "vitest.config.*", "vite.config.*"],
	};
}

/**
 * The mocha the target installed, run from the copy's `node_modules` and never from the host's PATH.
 * Mocha's xunit reporter writes the report itself and creates its parent directory, so `target/` is
 * the only place the control may write.
 */
function mochaControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	const report = `${REPORT_DIRECTORY}/mocha-xunit.xml`;
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "mocha suite (command read from scripts.test)",
		command: [nodeBinary, "node_modules/mocha/bin/mocha.js", "--reporter=xunit", `--reporter-option=output=${report}`],
		parser: "junit-xml",
		report_path: report,
		writable_paths: [REPORT_DIRECTORY],
		// A narrowed `spec` or an added reporter would make the suite green without proving anything, as
		// they would for vitest.
		protected_paths: [...nodeTest.protected_paths, ".mocharc.*"],
	};
}

/**
 * Where jest writes its JSON report: a file, not the standard output, where a test or the code it
 * exercises can print before the JSON. It sits at the root of the copy, which is why the control
 * declares that one file writable and nothing around it.
 */
const JEST_REPORT = "495-jest-report.json";

/** The jest the target installed, run from the copy's `node_modules` and never from the host's PATH. */
function jestControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "jest suite (command read from scripts.test)",
		command: [nodeBinary, "node_modules/jest/bin/jest.js", "--json", `--outputFile=${JEST_REPORT}`],
		parser: "jest-json",
		report_path: JEST_REPORT,
		writable_paths: [JEST_REPORT],
		// A restricted `testMatch`, a `reporters` entry or a transformer would make the suite green without
		// proving anything.
		protected_paths: [...nodeTest.protected_paths, "jest.config.*"],
	};
}

function nodeTestWitnesses(): Witnesses {
	return {
		positive: {
			"test/495-positive-witness.test.js":
				'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 positive witness: the runner reports a passing test", () => { assert.equal(1, 1); });\n',
		},
		negative: {
			"test/495-negative-witness.test.js":
				'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 negative witness: an injected defect must be detected", () => { assert.equal(1, 2); });\n',
		},
	};
}

type Witnesses = { positive: Record<string, string>; negative: Record<string, string> };

/**
 * Witness tests placed where the target keeps its tests: the runner's own discovery decides whether
 * they run. Mocha lends a test file no assertion, so its witnesses pass or fail by throwing; jest
 * and vitest lend `expect`, which vitest has to import.
 */
function testDirectoryWitnesses(
	projectPath: string,
	extension: "js" | "ts",
	sources: { positive: string; negative: string },
): Witnesses {
	const directory = existsSync(join(projectPath, "tests")) ? "tests" : "test";
	return {
		positive: { [`${directory}/495-positive-witness.test.${extension}`]: sources.positive },
		negative: { [`${directory}/495-negative-witness.test.${extension}`]: sources.negative },
	};
}

const POSITIVE_TITLE = "495 positive witness: the runner reports a passing test";
const NEGATIVE_TITLE = "495 negative witness: an injected defect must be detected";

const WITNESS_SOURCES = {
	vitest: {
		extension: "ts",
		positive: `import { expect, it } from "vitest";\nit("${POSITIVE_TITLE}", () => { expect(1).toBe(1); });\n`,
		negative: `import { expect, it } from "vitest";\nit("${NEGATIVE_TITLE}", () => { expect(1).toBe(2); });\n`,
	},
	mocha: {
		extension: "js",
		positive: `it("${POSITIVE_TITLE}", () => { if (1 !== 1) throw new Error("1 is not 1"); });\n`,
		negative: `it("${NEGATIVE_TITLE}", () => { if (1 !== 2) throw new Error("1 is not 2"); });\n`,
	},
	jest: {
		extension: "js",
		positive: `test("${POSITIVE_TITLE}", () => { expect(1).toBe(1); });\n`,
		negative: `test("${NEGATIVE_TITLE}", () => { expect(1).toBe(2); });\n`,
	},
} as const;

function witnessesOf(runner: SuiteRunner, projectPath: string): Witnesses {
	if (runner === "node-test") return nodeTestWitnesses();
	const { extension, ...sources } = WITNESS_SOURCES[runner];
	return testDirectoryWitnesses(projectPath, extension, sources);
}

const COVERED_MODULE = "src/witness495/covered.mjs";
const UNCOVERED_MODULE = "src/witness495/uncovered.mjs";
const UNASSERTED_MODULE = "src/witness495/unasserted.mjs";

/**
 * What the sensors of the introduced lines are qualified on. The positive witness adds a module its
 * test calls in full and asserts every result of. The coverage sensor's own negative witness adds one
 * its test loads and leaves a function of uncalled, which a failing test cannot show: a suite that
 * fails stops before the report exists, and a line nothing executes is not a failure. The mutation
 * sensor's own negative witness adds one its test calls without asserting, which coverage cannot see
 * either: every line of it is executed, and no test would notice if it changed.
 */
function moduleWitnesses(
	runner: SuiteRunner,
	projectPath: string,
): { positive: Record<string, string>; uncovered: Record<string, string>; unasserted: Record<string, string> } {
	const directory = runner === "vitest" && existsSync(join(projectPath, "tests")) ? "tests" : "test";
	// A vitest test is a `.ts` file, as its unit witnesses are: the `include` of a vitest configuration
	// that names `*.test.ts` would never discover a `.mjs` one.
	const testExtension = runner === "vitest" ? "ts" : "mjs";
	const runnerImport =
		runner === "vitest" ? 'import { it } from "vitest";\n' : 'import { test as it } from "node:test";\n';
	const header =
		runner === "vitest"
			? 'import { expect, it } from "vitest";\n'
			: `${runnerImport}import { strict as assert } from "node:assert";\n`;
	const equal = (actual: string, expected: number): string =>
		runner === "vitest" ? `expect(${actual}).toBe(${expected})` : `assert.equal(${actual}, ${expected})`;
	return {
		positive: {
			[COVERED_MODULE]:
				"export function twice(n) {\n  return n * 2;\n}\n\nexport function thrice(n) {\n  return n * 3;\n}\n",
			[`${directory}/495-covered-witness.test.${testExtension}`]: `${header}import { thrice, twice } from "../${COVERED_MODULE}";\n\nit("495 coverage witness: every function of the module is called", () => {\n  ${equal("twice(2)", 4)};\n  ${equal("thrice(2)", 6)};\n});\n`,
		},
		uncovered: {
			[UNCOVERED_MODULE]:
				"export function called(n) {\n  return n + 1;\n}\n\nexport function neverCalled(n) {\n  return n - 1;\n}\n",
			[`${directory}/495-uncovered-witness.test.${testExtension}`]: `${header}import { called } from "../${UNCOVERED_MODULE}";\n\nit("495 coverage witness: the module is loaded and one function is called", () => {\n  ${equal("called(1)", 2)};\n});\n`,
		},
		unasserted: {
			[UNASSERTED_MODULE]: "export function half(n) {\n  return n / 2;\n}\n",
			[`${directory}/495-unasserted-witness.test.${testExtension}`]: `${runnerImport}import { half } from "../${UNASSERTED_MODULE}";\n\nit("495 mutation witness: the function is called and nothing is asserted", () => {\n  half(4);\n});\n`,
		},
	};
}

/**
 * The argv of `scripts.lint` split on whitespace, `node` replaced by the Node binary, or why there is
 * none: a script with shell syntax needs a shell, which the sandbox does not give.
 */
function lintOf(script: string, nodeBinary: string): { command?: string[]; refusal?: string } {
	if (SHELL_SYNTAX.test(script))
		return { refusal: `scripts.lint chains commands through a shell (${script}), which 495 cannot run` };
	const parts = script.trim().split(/\s+/);
	return { command: parts[0] === "node" ? [nodeBinary, ...parts.slice(1)] : parts };
}
