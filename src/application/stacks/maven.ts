/**
 * The Maven stack (CMP-TGT): the reactor a POM tree declares, and the controls that can be opposed
 * to a candidate on it. Everything here is read from what the target itself declares — its modules,
 * the dependency direction of its POMs, the package root each module lays out, the report each
 * plugin binds — and nothing is executed to find out.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
	SCOPE_PLACEHOLDER,
	type ControlDefinition,
	type FileEdit,
	type RecommendedComplement,
	type StructureRule,
} from "../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import { baseControl, emptyTrigger, type StackAdapter, type StackDetection } from "./stack.ts";

export const MAVEN_ADAPTER: StackAdapter = { stack: "maven", signal_files: ["pom.xml"], detect: detectMavenStack };

function detectMavenStack(projectPath: string, requirementRefs: RequirementRef[], nodeBinary: string): StackDetection {
	const reactor = discoverMavenReactor(projectPath);
	const witnessPrefix = reactor.witness_module ? `${reactor.witness_module}/` : "";
	const jacoco = bindsJacocoReport(projectPath, reactor.pom_paths);
	const mutation = readsMutationReport(projectPath, reactor.pom_paths);
	const rules = structureRules(reactor);
	// Both sensors judge introduced production code, so both need a class the suite calls.
	const measuresIntroducedCode = jacoco || mutation.usable;
	const controls: ControlDefinition[] = [
		{
			...baseControl(requirementRefs),
			control_id: "maven-test",
			title: "mvn test (Surefire)",
			command: ["mvn", "-B", "-q", "-o", "test"],
			timeout_ms: 20 * 60_000,
			parser: "junit-xml",
			report_path: "**/target/surefire-reports",
			provides: ["surefire-reports", ...(jacoco ? ["jacoco-report"] : [])],
			writable_paths: reactor.target_paths,
			protected_paths: [...reactor.preparation_paths, ...reactor.pom_paths],
		},
	];
	// The measurement is the one `mvn test` already writes: JaCoCo binds `report` to that phase, so
	// this sensor runs no command of its own and reads the report left in the workspace. It names
	// that report rather than relying on where it sits in this array: the qualification runs the
	// producer in each of its witness workspaces, and the verification runs them in that order.
	if (jacoco)
		controls.push({
			...baseControl(requirementRefs),
			control_id: "coverage",
			title: "introduced-line coverage, read from the JaCoCo report of mvn test",
			command: emptyTrigger(nodeBinary),
			timeout_ms: 60_000,
			parser: "jacoco-xml",
			report_path: "**/target/site/jacoco",
			provides: [],
			requires: ["jacoco-report"],
			protected_paths: [...reactor.pom_paths],
		});
	// The architecture is read from what the target itself declares — the reactor, the dependency
	// direction of its POMs, the package root each module lays out — and frozen here. The producer
	// receives the boundaries in its context and never the rules: a boundary it could edit in the
	// tree would be a suggestion, and ARC-04 asks for the opposite.
	if (rules.length > 0)
		controls.push({
			...baseControl(requirementRefs),
			control_id: "structure",
			title: "frozen architecture boundaries, read from the Java declarations",
			command: emptyTrigger(nodeBinary),
			timeout_ms: 120_000,
			parser: "java-imports",
			report_path: null,
			structure_rules: rules,
			provides: [],
			protected_paths: [...reactor.pom_paths],
		});
	// Mutation is the one question coverage cannot answer, and the one control that runs a build of
	// its own. It is declared last and given a budget of its own, and it is scoped at each run to
	// the classes the frozen candidate modified: the engine mutates those and nothing else, so what
	// it costs follows the size of the change rather than the size of the target (VER-04).
	if (mutation.usable)
		controls.push({
			...baseControl(requirementRefs),
			control_id: "mutation",
			title: "surviving mutants on the classes the candidate modified, read from the PITest XML report",
			command: [
				"mvn",
				"-B",
				"-q",
				"-o",
				"test-compile",
				"org.pitest:pitest-maven:mutationCoverage",
				"-DfailWhenNoMutations=false",
				"-Dthreads=1",
			],
			timeout_ms: 30 * 60_000,
			parser: "pitest-xml",
			report_path: "**/target/pit-reports",
			provides: ["pit-reports"],
			scope_argument: `-DtargetClasses=${SCOPE_PLACEHOLDER}`,
			network: "loopback",
			writable_paths: reactor.target_paths,
			protected_paths: [...reactor.pom_paths],
		});
	const positive: Record<string, string> = {
		[`${witnessPrefix}${WITNESS_TEST_ROOT}PositiveWitness495Test.java`]: measuresIntroducedCode
			? `package ${WITNESS_PACKAGE};\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\npublic class PositiveWitness495Test {\n    @Test void runnerReportsAPassingTest() { assertEquals(1, 1); }\n    @Test void introducedCodeIsExercised() { assertEquals(4, new Witness495Covered().twice(2)); }\n}\n`
			: `package ${WITNESS_PACKAGE};\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\npublic class PositiveWitness495Test { @Test void runnerReportsAPassingTest() { assertEquals(1, 1); } }\n`,
	};
	// The witnesses of both differential sensors are introduced production code, not tests: a class
	// the suite calls and asserts on is what they must both let through. The defect each of them
	// claims to detect is a different treatment of that class, and a failing test exhibits neither
	// — it would stop the build before any report is written.
	if (measuresIntroducedCode)
		positive[`${witnessPrefix}${WITNESS_SOURCE_ROOT}Witness495Covered.java`] = witnessClass(
			"Witness495Covered",
			"twice",
			"n * 2",
		);
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
		lint_control_ids: [],
		positive_witness: positive,
		witness_tests: measuresIntroducedCode ? 2 : 1,
		negative_witness: {
			[`${witnessPrefix}${WITNESS_TEST_ROOT}NegativeWitness495Test.java`]: `package ${WITNESS_PACKAGE};\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\npublic class NegativeWitness495Test { @Test void injectedDefectMustBeDetected() { assertEquals(1, 2); } }\n`,
		},
		own_negative_witness: {
			...(jacoco
				? {
						coverage: {
							[`${witnessPrefix}${WITNESS_SOURCE_ROOT}Witness495Uncovered.java`]: witnessClass(
								"Witness495Uncovered",
								"half",
								"n / 2",
							),
						},
					}
				: {}),
			// A failing test proves nothing about a boundary: the tree that carries this defect is one
			// where a module imports what it declares no dependency on, and it compiles nowhere.
			...(rules.length > 0 ? { structure: structureNegativeWitness(rules) } : {}),
			// A mutant survives where a test executes a line without asserting anything about it. The
			// coverage witness does not exhibit that defect — the line is never executed there, which
			// is the other control's business — so this one introduces a class the suite calls and
			// leaves unchecked.
			...(mutation.usable ? { mutation: mutationNegativeWitness(witnessPrefix) } : {}),
		},
		preparation_paths: reactor.preparation_paths,
		capability_missing: [
			...(jacoco
				? []
				: [
						"no JaCoCo report bound outside a profile: the coverage of the introduced lines is not measured on this target (QLT-04)",
					]),
			...(mutation.usable ? [] : [mutationCapabilityMissing(mutation)]),
			...(rules.some((rule) => rule.kind === "forbidden_dependency")
				? []
				: [
						"no two modules of this reactor lay out package roots that could be opposed to each other: no dependency direction between modules is checked on this target (CON-03)",
					]),
		],
		recommendations: [...(jacoco ? [] : [jacocoRecommendation(projectPath)]), ...mutationRecommendation(mutation)],
	};
}

/** The date the versions below were checked against the sources they cite. */
const CATALOGUE_DATE = "2026-09-30";

const JACOCO_PLUGIN_VERSION = "0.8.15";

/** The dependency plugin that resolves the plugins of a POM without running any of them, at the release checked on the date above. */
export const MAVEN_DEPENDENCY_PLUGIN_VERSION = "3.11.0";

/**
 * The declaration of JaCoCo as it is inserted into a POM: `prepare-agent` attaches the agent to the
 * tests, and `report` is bound to the test phase so that `mvn test` leaves the report the control reads.
 */
function jacocoDeclaration(indent: string, unit: string, eol: string): string {
	const lines = [
		"<plugin>",
		`${unit}<groupId>org.jacoco</groupId>`,
		`${unit}<artifactId>jacoco-maven-plugin</artifactId>`,
		`${unit}<version>${JACOCO_PLUGIN_VERSION}</version>`,
		`${unit}<executions>`,
		`${unit}${unit}<execution>`,
		`${unit}${unit}${unit}<id>prepare-agent</id>`,
		`${unit}${unit}${unit}<goals><goal>prepare-agent</goal></goals>`,
		`${unit}${unit}</execution>`,
		`${unit}${unit}<execution>`,
		`${unit}${unit}${unit}<id>report</id>`,
		`${unit}${unit}${unit}<phase>test</phase>`,
		`${unit}${unit}${unit}<goals><goal>report</goal></goals>`,
		`${unit}${unit}</execution>`,
		`${unit}</executions>`,
		"</plugin>",
	];
	return lines.map((line) => `${indent}${line}${eol}`).join("");
}

/** The profiles of a POM: what they declare exists only when a build activates them. */
const PROFILES = /<profiles\b[\s\S]*?<\/profiles>/g;

/** A POM without its profiles, the part every build of the reactor reads. */
function outsideProfiles(xml: string): string {
	return xml.replace(PROFILES, "");
}

/** Each POM of the reactor that can be read, outside its profiles. */
function* readPomsOutsideProfiles(projectPath: string, pomPaths: readonly string[]): Generator<string> {
	for (const rel of pomPaths) {
		let xml = "";
		try {
			xml = readFileSync(join(projectPath, rel), "utf8");
		} catch {
			continue; // an unreadable POM declares and binds nothing; the other POMs are still read
		}
		yield outsideProfiles(xml);
	}
}

/** The regions of a POM whose plugins a build does not run: comments, profiles, managed plugins and reporting. */
const INACTIVE_REGIONS = [
	/<!--[\s\S]*?-->/g,
	PROFILES,
	/<pluginManagement\b[\s\S]*?<\/pluginManagement>/g,
	/<reporting\b[\s\S]*?<\/reporting>/g,
];

/** How many lines before the opening of the plugins may be added to the text to replace to make it occur once. */
const ANCHOR_CONTEXT_LINES = 4;

/**
 * The replacement that declares JaCoCo in the root POM: the line that opens its one `build/plugins`
 * section, preceded by as many lines as it takes to occur once, followed by the declaration. Null when
 * the POM does not take it without ambiguity: plugins only in a profile, in `pluginManagement` or in
 * `reporting`, more than one section, JaCoCo already named outside a profile, or an opening line that
 * is not alone on its line.
 */
function jacocoEdit(pom: string): FileEdit | null {
	// The inactive regions are blanked to the same length, so a position found in `active` is one of `pom`.
	const active = INACTIVE_REGIONS.reduce((text, region) => text.replace(region, (m) => " ".repeat(m.length)), pom);
	if (active.includes("jacoco-maven-plugin")) return null;
	const opening = active.indexOf("<plugins>");
	if (opening < 0 || active.indexOf("<plugins>", opening + 1) >= 0) return null;
	if (!/<build\b/.test(active.slice(0, opening))) return null;
	const openingLine = /^([ \t]*)<plugins>[ \t]*(\r?\n)/.exec(pom.slice(pom.lastIndexOf("\n", opening) + 1));
	if (openingLine === null) return null;
	const [line, indent = "", eol = "\n"] = openingLine;
	const end = pom.lastIndexOf("\n", opening) + 1 + line.length;
	let start = end - line.length;
	for (let added = 0; pom.split(pom.slice(start, end)).length !== 2; added++) {
		if (added === ANCHOR_CONTEXT_LINES || start === 0) return null;
		start = pom.lastIndexOf("\n", start - 2) + 1;
	}
	const anchor = pom.slice(start, end);
	const unit = /^([ \t]*)<plugin>/m.exec(pom.slice(end))?.[1]?.slice(indent.length) || "  ";
	return { path: "pom.xml", current: anchor, wanted: `${anchor}${jacocoDeclaration(`${indent}${unit}`, unit, eol)}` };
}

/** Recommends JaCoCo, with the edit and the resolution that adopt it when the root POM takes the declaration. */
function jacocoRecommendation(projectPath: string): RecommendedComplement {
	const recommendation: RecommendedComplement = {
		test_type: "coverage",
		tool: "org.jacoco:jacoco-maven-plugin",
		version: JACOCO_PLUGIN_VERSION,
		established_on: CATALOGUE_DATE,
		source: "www.jacoco.org/jacoco/trunk/doc/maven.html",
		change:
			"in the POM, declare jacoco-maven-plugin outside any profile with the prepare-agent goal and the report goal bound to the test phase",
	};
	let pom: string;
	try {
		pom = readFileSync(join(projectPath, "pom.xml"), "utf8");
	} catch {
		return recommendation; // an unreadable POM gets the recommendation without an edit to apply
	}
	const edit = jacocoEdit(pom);
	if (edit === null) return recommendation;
	return {
		...recommendation,
		edit,
		install: { package: recommendation.tool, version: recommendation.version, manager: "maven" },
	};
}

/**
 * What the target must change so the mutants of its modified classes are observed: declare PIT when
 * it is absent, otherwise fix the one property or two that make its report unreadable.
 */
function mutationRecommendation(engine: MutationEngineConfiguration): RecommendedComplement[] {
	if (engine.usable) return [];
	const pit = {
		test_type: "mutation",
		tool: "org.pitest:pitest-maven",
		version: "1.30.0",
		established_on: CATALOGUE_DATE,
		source: "pitest.org/quickstart/maven/",
	};
	if (!engine.declared)
		return [
			{
				...pit,
				change:
					"in the POM, declare pitest-maven outside any profile with XML among its outputFormats and timestampedReports set to false",
			},
		];
	const changes = [
		...(engine.xml_report ? [] : ["add XML to its outputFormats"]),
		...(engine.stable_report_path ? [] : ["set timestampedReports to false"]),
	];
	return [{ ...pit, change: `in the POM, in the pitest-maven declaration, ${changes.join(" and ")}` }];
}

/**
 * What a target declares about its mutation engine. Three properties make its report readable by a
 * control, and each is checked on its own so that the one that is missing can be named: the plugin
 * declared outside any profile, an XML report among its output formats, and a report path carrying
 * no timestamp. A run whose report lands in a directory named after the minute it started is not a
 * report a frozen control can read, and a measurement a sensor silently fails to find is worth
 * nothing (QLT-02).
 */
export interface MutationEngineConfiguration {
	declared: boolean;
	xml_report: boolean;
	stable_report_path: boolean;
	/** The three together: the report of a scoped run can be found and read. */
	usable: boolean;
}

export function readsMutationReport(projectPath: string, pomPaths: readonly string[]): MutationEngineConfiguration {
	const found = { declared: false, xml_report: false, stable_report_path: false };
	for (const pom of readPomsOutsideProfiles(projectPath, pomPaths)) {
		if (!/pitest-maven/.test(pom)) continue;
		found.declared = true;
		if (/<outputFormats>[\s\S]*?\bXML\b[\s\S]*?<\/outputFormats>/i.test(pom)) found.xml_report = true;
		if (/<timestampedReports>\s*false\s*<\/timestampedReports>/i.test(pom)) found.stable_report_path = true;
	}
	return { ...found, usable: found.declared && found.xml_report && found.stable_report_path };
}

/** What the target would have to declare for the mutants of its modified classes to be observed. */
export function mutationCapabilityMissing(engine: MutationEngineConfiguration): string {
	if (!engine.declared)
		return "no mutation engine declared outside a profile: whether a test would notice a change to the introduced lines is not observed on this target (VER-04)";
	const missing = [
		...(engine.xml_report ? [] : ["no XML report among its output formats"]),
		...(engine.stable_report_path ? [] : ["timestamped report directories, which no frozen control can name"]),
	];
	return `a mutation engine is declared on this target but its report cannot be read: ${missing.join(" and ")} (VER-04)`;
}

/**
 * The package the witnesses of a Maven target are written in, on both sides of the source root.
 * None of them sits in the default package: a mutation engine scopes the tests it runs to the
 * packages its test tree declares, so a witness test outside every package is never executed, and a
 * sensor proved on a witness nothing ran is not proved at all (VER-05).
 */
const WITNESS_PACKAGE = "witness495";
const WITNESS_SOURCE_ROOT = `src/main/java/${WITNESS_PACKAGE}/`;
const WITNESS_TEST_ROOT = `src/test/java/${WITNESS_PACKAGE}/`;

/** A witness class of one method, whose body is the single expression the mutators rewrite. */
function witnessClass(name: string, method: string, body: string): string {
	return `package ${WITNESS_PACKAGE};\n\npublic final class ${name} {\n    public int ${method}(int n) {\n        return ${body};\n    }\n}\n`;
}

/**
 * The tree that carries the defect the mutation control claims to detect (VER-05): a class the suite
 * executes and asserts nothing about. Its mutants are reached by a test and killed by none, which is
 * exactly what coverage cannot see and what this control exists for.
 */
function mutationNegativeWitness(witnessPrefix: string): Record<string, string> {
	return {
		[`${witnessPrefix}${WITNESS_SOURCE_ROOT}Witness495Unasserted.java`]: witnessClass(
			"Witness495Unasserted",
			"half",
			"n / 2",
		),
		[`${witnessPrefix}${WITNESS_TEST_ROOT}NegativeMutationWitness495Test.java`]: `package ${WITNESS_PACKAGE};\n\nimport org.junit.jupiter.api.Test;\n\npublic class NegativeMutationWitness495Test {\n    @Test void executesWithoutAsserting() { new Witness495Unasserted().half(4); }\n}\n`,
	};
}

/**
 * Whether `mvn test` leaves a coverage report behind: the JaCoCo plugin with its `report` goal bound
 * outside any profile. Inside a profile, the report exists only when that profile is activated, which
 * the control cannot assume — and a sensor that silently finds no measurement is worth nothing.
 */
function bindsJacocoReport(projectPath: string, pomPaths: readonly string[]): boolean {
	for (const pom of readPomsOutsideProfiles(projectPath, pomPaths))
		if (/jacoco-maven-plugin/.test(pom) && /<goal>\s*report\s*<\/goal>/.test(pom)) return true;
	return false;
}

interface MavenModule {
	/** Module directory relative to the reactor root; empty for the root module. */
	path: string;
	artifact_id: string | null;
	/** Artifact ids of the reactor modules this POM declares as dependencies, outside any profile. */
	depends_on: string[];
	/** The package root the module's own layout declares, when its sources share one. */
	package_root: string | null;
	/** Workspace-relative main source root, when the module has one. */
	source_root: string | null;
}

interface MavenReactor {
	modules: string[];
	module_info: MavenModule[];
	pom_paths: string[];
	preparation_paths: string[];
	target_paths: string[];
	witness_module: string;
	ignored_modules: string[];
}

/** Discovers the root project and every reachable `<module>` without executing Maven. */
function discoverMavenReactor(projectPath: string): MavenReactor {
	const root = resolve(projectPath);
	const queue = [""];
	const seen = new Set<string>();
	const children = new Map<string, string[]>();
	const identities = new Map<string, { artifact_id: string | null; dependencies: string[] }>();
	const ignored: string[] = [];
	while (queue.length > 0) {
		const module = queue.shift()!;
		if (seen.has(module)) continue;
		const pom = join(root, module, "pom.xml");
		if (!existsSync(pom)) {
			ignored.push(module || ".");
			continue;
		}
		seen.add(module);
		let xml = "";
		try {
			xml = readFileSync(pom, "utf8");
		} catch {
			ignored.push(module || ".");
			continue;
		}
		identities.set(module, pomIdentity(xml));
		const nested: string[] = [];
		for (const block of xml.matchAll(/<modules\b[^>]*>([\s\S]*?)<\/modules>/g)) {
			for (const match of (block[1] ?? "").matchAll(/<module\b[^>]*>([\s\S]*?)<\/module>/g)) {
				const raw = (match[1] ?? "").trim();
				if (!raw || raw.includes("${")) {
					if (raw) ignored.push(raw);
					continue;
				}
				const absolute = resolve(root, module, raw);
				const rel = relative(root, absolute);
				if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
					ignored.push(raw);
					continue;
				}
				const normal = rel.split(sep).join("/");
				if (!existsSync(join(root, normal, "pom.xml"))) {
					ignored.push(normal);
					continue;
				}
				nested.push(normal);
			}
		}
		const unique = [...new Set(nested)].sort();
		children.set(module, unique);
		queue.push(...unique);
	}
	const modules = [...seen].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
	const pathAt = (module: string, suffix: string) => (module ? `${module}/${suffix}` : suffix);
	const leaves = modules.filter((m) => (children.get(m)?.length ?? 0) === 0);
	const witness = leaves.find((m) => m !== "") ?? "";
	const reactorArtifacts = new Set(
		[...identities.values()].map((identity) => identity.artifact_id).filter((id): id is string => id !== null),
	);
	return {
		modules: modules.map((m) => m || "."),
		module_info: modules.map((m) => {
			const identity = identities.get(m) ?? { artifact_id: null, dependencies: [] };
			const sourceRoot = pathAt(m, "src/main/java");
			const hasSources = existsSync(join(root, sourceRoot));
			return {
				path: m,
				artifact_id: identity.artifact_id,
				depends_on: identity.dependencies.filter((id) => reactorArtifacts.has(id)).sort(),
				package_root: hasSources ? packageRootOf(join(root, sourceRoot)) : null,
				source_root: hasSources ? `${sourceRoot}/` : null,
			};
		}),
		pom_paths: modules.map((m) => pathAt(m, "pom.xml")),
		preparation_paths: modules.map((m) => pathAt(m, "src/test/")),
		target_paths: modules.map((m) => pathAt(m, "target")),
		witness_module: witness,
		ignored_modules: [...new Set(ignored)].sort(),
	};
}

/**
 * What a POM declares about itself: its own artifact and the artifacts it depends on. The blocks a
 * dependency may hide in without `mvn test` resolving it — the parent coordinates, managed versions,
 * plugin dependencies and profiles — are removed first: a dependency that exists only under an
 * activated profile is not one the reactor guarantees, the same reading `bindsJacocoReport` applies.
 */
function pomIdentity(xml: string): { artifact_id: string | null; dependencies: string[] } {
	const own = xml
		.replace(/<parent\b[\s\S]*?<\/parent>/g, "")
		.replace(/<dependencyManagement\b[\s\S]*?<\/dependencyManagement>/g, "")
		.replace(/<build\b[\s\S]*?<\/build>/g, "")
		.replace(PROFILES, "")
		.replace(/<reporting\b[\s\S]*?<\/reporting>/g, "");
	const dependencies: string[] = [];
	for (const block of own.matchAll(/<dependencies\b[^>]*>([\s\S]*?)<\/dependencies>/g)) {
		for (const match of (block[1] ?? "").matchAll(/<artifactId\b[^>]*>([\s\S]*?)<\/artifactId>/g)) {
			const id = (match[1] ?? "").trim();
			if (id && !id.includes("${")) dependencies.push(id);
		}
	}
	const withoutDependencies = own.replace(/<dependencies\b[\s\S]*?<\/dependencies>/g, "");
	const artifact = /<artifactId\b[^>]*>([\s\S]*?)<\/artifactId>/.exec(withoutDependencies)?.[1]?.trim() ?? null;
	return {
		artifact_id: artifact && !artifact.includes("${") ? artifact : null,
		dependencies: [...new Set(dependencies)],
	};
}

/**
 * The package root a source tree lays out: the directory chain below the source root that holds no
 * source of its own and branches nowhere. `src/main/java/io/scalastic/demo/domain` with two
 * subdirectories under it declares `io.scalastic.demo.domain`; a tree whose sources sit in the
 * default package declares nothing, and nothing is what this returns.
 */
function packageRootOf(sourceRoot: string): string | null {
	const segments: string[] = [];
	let current = sourceRoot;
	for (let depth = 0; depth < 32; depth++) {
		let entries: string[];
		try {
			entries = readdirSync(current).filter((name) => !name.startsWith("."));
		} catch {
			break; // an unreadable directory ends the descent at the package found so far
		}
		const directories = entries.filter((name) => {
			try {
				return statSync(join(current, name)).isDirectory();
			} catch {
				return false; // an entry that cannot be read is no directory, so the descent stops here
			}
		});
		if (directories.length !== 1 || directories.length !== entries.length) break;
		segments.push(directories[0]!);
		current = join(current, directories[0]!);
	}
	return segments.length > 0 ? segments.join(".") : null;
}

/**
 * Package families a module shares with everything that depends on it: a container, an ORM, a web
 * framework. Their absence from a core module is what makes it testable and portable on its own;
 * their presence is not a defect of this analyser's making, and a module that already carries one
 * keeps it as a named preexisting finding.
 */
const FRAMEWORK_PACKAGES = [
	"org.springframework",
	"jakarta.",
	"javax.",
	"org.hibernate",
	"io.cucumber",
	"com.fasterxml.jackson",
	"io.quarkus",
	"io.micronaut",
];

/**
 * The architecture rules a Maven reactor opposes to its own code (ARC-01, ARC-04, CON-03).
 *
 * Nothing here is a style preference. Each rule restates a declaration the target already made: the
 * dependency direction its POMs fix, the package root each module lays out, and the elementary
 * property that two packages importing each other are one package. A reactor that declares nothing
 * gets no rule, and the insufficiency is recorded rather than replaced by a convention.
 */
function structureRules(reactor: MavenReactor): StructureRule[] {
	const modules = reactor.module_info.filter(
		(m): m is MavenModule & { artifact_id: string; package_root: string; source_root: string } =>
			m.artifact_id !== null && m.package_root !== null && m.source_root !== null,
	);
	const rules: StructureRule[] = [];
	for (const module of modules) {
		for (const other of modules) {
			if (other.path === module.path || other.package_root === module.package_root) continue;
			if (module.depends_on.includes(other.artifact_id)) continue;
			// Nested package roots cannot be told apart by an import: `io.x.domain.spi` is under
			// `io.x.domain`, so forbidding the second would forbid the first module's own sources.
			if (
				module.package_root.startsWith(`${other.package_root}.`) ||
				other.package_root.startsWith(`${module.package_root}.`)
			)
				continue;
			rules.push({
				rule_id: `structure:module-boundary:${module.path || "."}->${other.path || "."}`,
				kind: "forbidden_dependency",
				statement: `module ${module.artifact_id} declares no dependency on module ${other.artifact_id}, whose sources are laid out under ${other.package_root}`,
				scope: [module.source_root],
				forbidden: [other.package_root],
			});
		}
	}
	// The module that depends on no other and that others build on is the one every dependent module
	// inherits from: a framework imported there is a framework they all carry.
	const core = modules.find(
		(m) =>
			m.depends_on.length === 0 &&
			modules.some((other) => other.path !== m.path && other.depends_on.includes(m.artifact_id)),
	);
	if (core)
		rules.push({
			rule_id: `structure:framework-independence:${core.path || "."}`,
			kind: "forbidden_dependency",
			statement: `module ${core.artifact_id} declares no dependency on another module of the reactor and the others build on it, so a framework or container imported there is one they all carry`,
			scope: [core.source_root],
			forbidden: [...FRAMEWORK_PACKAGES],
		});
	// A cycle needs no second module to exist, and no declaration to be read as one: two packages that
	// import each other are a fact of the tree, whatever the reactor looks like.
	const scopes = reactor.module_info.map((m) => m.source_root).filter((root): root is string => root !== null);
	if (scopes.length > 0)
		rules.push({
			rule_id: "structure:package-cycle",
			kind: "no_cycle",
			statement:
				"two packages that import each other are one unit, which cannot be changed, tested, replaced or extracted apart",
			scope: scopes,
			forbidden: [],
		});
	return rules;
}

/**
 * The tree that carries the defect the structural control claims to detect (VER-05). The shared
 * negative witness of a Maven target is a failing test, which says nothing about a boundary: this
 * one is a source of a module importing exactly what that module declares no dependency on. It is
 * never compiled — a boundary is read in the declarations, not in a build.
 */
function structureNegativeWitness(rules: readonly StructureRule[]): Record<string, string> {
	const boundary = rules.find(
		(rule) => rule.kind === "forbidden_dependency" && rule.scope.length > 0 && rule.forbidden.length > 0,
	);
	if (boundary) {
		const forbidden = `${boundary.forbidden[0]!.replace(/\.$/, "")}.Witness495Forbidden`;
		return {
			[`${boundary.scope[0]}witness495/Witness495Boundary.java`]: `package witness495;\n\nimport ${forbidden};\n\npublic final class Witness495Boundary {\n    private Witness495Boundary() {}\n}\n`,
		};
	}
	const cycle = rules.find((rule) => rule.kind === "no_cycle" && rule.scope.length > 0);
	if (!cycle) return {};
	return {
		[`${cycle.scope[0]}witness495/a/Witness495CycleA.java`]:
			"package witness495.a;\n\nimport witness495.b.Witness495CycleB;\n\npublic final class Witness495CycleA {\n    private Witness495CycleA() {}\n}\n",
		[`${cycle.scope[0]}witness495/b/Witness495CycleB.java`]:
			"package witness495.b;\n\nimport witness495.a.Witness495CycleA;\n\npublic final class Witness495CycleB {\n    private Witness495CycleB() {}\n}\n",
	};
}
