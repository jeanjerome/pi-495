/**
 * The declaration of ArchUnit that verifies an adopted architecture map in a copy of a Maven reactor, and the
 * module that runs its rules. The rules run in one module, the host, built after every other module of main
 * sources so that their classes are on its test classpath. The declaration is a profile of the host's POM,
 * activated only by the property the architecture control sets: it adds ArchUnit and the other modules to the
 * test classpath, compiles the rules 495 writes outside the copy in place of the host's tests, copies the files of
 * configuration of ArchUnit 495 writes beside them in place of the host's test resources, runs the rules with a
 * Surefire of its own, and writes their report apart from the reports of the project's tests. Without the
 * property, the build is the project's own, its tests included.
 */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import type { ArchitectureOffer } from "../../../../application/stacks/plugin.ts";
import type { FileEdit, RecommendedComplement } from "../../../../contracts/v1/protocol.ts";
import { elementText, type MavenModule, type MavenReactor } from "../project/reactor.ts";
import { ARCHUNIT, ARCHUNIT_RULES_PROPERTY, ARCHUNIT_VERSION } from "../shared.ts";

/** The date the ArchUnit release below was checked against the source it cites. */
const ARCHUNIT_DATE = "2026-10-08";

/**
 * The Surefire the rules run with, at the release checked on the date above. Its runner of JUnit Platform tests and
 * the launcher are declared as its own dependencies, so that resolving the plugins of the profile fetches them:
 * Surefire otherwise resolves both when it starts the tests, which the network closed refuses. The launcher is at
 * the version of the JUnit Platform ArchUnit is built on, which its `junit-platform-engine` dependency names, and
 * the profile puts that version of the platform on the test classpath ahead of the one the project's JUnit brings:
 * a launcher of one version of the platform does not run on another. The engines of the project's JUnit, built on
 * their own version of the platform, are kept off the classpath the rules run on, which needs none of them, and so
 * is JUnit 4: on a classpath that holds it, Surefire adds the Vintage engine of its launcher's platform, which the
 * network closed refuses.
 */
const SUREFIRE_VERSION = "3.6.0";
const JUNIT_PLATFORM_VERSION = "1.14.4";

/** The groups of the project's JUnit kept off the classpath the rules run on: Jupiter, Vintage, and JUnit 4. */
const PROJECT_JUNIT = ["org.junit.jupiter", "org.junit.vintage", "junit"];

/**
 * The files of configuration ArchUnit looks up by name at the root of the classpath the rules run on: the file of
 * ignored patterns, where it drops every violation whose line one of its patterns matches, and its properties,
 * where a bound on the cycles to detect makes every rule of cycles pass. 495 writes them empty beside the rules,
 * and the profile copies them in place of the host's test resources into the host's test classes, the first entry
 * of that classpath, ahead of the resources of every module: no file of the project is found, ArchUnit runs with
 * its default configuration, and no file of the project silences or changes a rule of the map.
 */
export const ARCHUNIT_CONFIGURATION = ["archunit_ignore_patterns.txt", "archunit.properties"] as const;

/** The directory of the build of the host the report of the rules is written in, apart from `surefire-reports`. */
export const ARCHITECTURE_REPORTS = "architecture495-reports";

type SourceModule = MavenModule & { source_root: string };

const withSources = (reactor: MavenReactor): SourceModule[] =>
	reactor.module_info.filter((m): m is SourceModule => m.source_root !== null);

/**
 * The module the rules run in: the last module of main sources, in the order of the reactor, that no other
 * module depends on, so that depending on all the others for its tests makes no cycle; null when there is
 * none.
 */
function architectureHost(reactor: MavenReactor): SourceModule | null {
	const modules = withSources(reactor);
	const dependedOn = new Set(reactor.module_info.flatMap((m) => m.depends_on));
	return modules.findLast((m) => m.artifact_id === null || !dependedOn.has(m.artifact_id)) ?? null;
}

const pomOf = (module: MavenModule) => (module.path ? `${module.path}/pom.xml` : "pom.xml");

/**
 * The group and the version a module is built with: its own, else its parent's; those of the host, by
 * Maven's interpolation, when the POM leaves them to a property.
 */
function coordinatesOf(view: ProjectView, module: MavenModule): { group: string; version: string } {
	const pom = (view.read(pomOf(module)) ?? "").replace(/<!--[\s\S]*?-->/g, "");
	const parent = /<parent\b[\s\S]*?<\/parent>/.exec(pom)?.[0] ?? "";
	const own = pom
		.replace(parent, "")
		.replace(/<(dependencies|dependencyManagement|build|profiles|reporting)\b[\s\S]*?<\/\1>/g, "");
	return {
		group: elementText(own, "groupId") ?? elementText(parent, "groupId") ?? "${project.groupId}",
		version: elementText(own, "version") ?? elementText(parent, "version") ?? "${project.version}",
	};
}

/** The profile that declares ArchUnit in the host, one line per entry, each indented by tabs below it. */
function archunitProfile(view: ProjectView, reactor: MavenReactor, host: SourceModule): string[] {
	const [group, artifact] = ARCHUNIT.split(":");
	const others = withSources(reactor).filter(
		(m) => m.path !== host.path && m.artifact_id !== null && !host.depends_on.includes(m.artifact_id),
	);
	const dependency = (g: string, a: string, v: string, scope = "<scope>test</scope>") =>
		`<dependency><groupId>${g}</groupId><artifactId>${a}</artifactId><version>${v}</version>${scope}</dependency>`;
	return [
		"<profile>",
		"\t<id>archunit495</id>",
		`\t<activation><property><name>${ARCHUNIT_RULES_PROPERTY}</name></property></activation>`,
		"\t<dependencies>",
		`\t\t${dependency(group!, artifact!, ARCHUNIT_VERSION)}`,
		`\t\t${dependency("org.junit.platform", "junit-platform-engine", JUNIT_PLATFORM_VERSION)}`,
		`\t\t${dependency("org.junit.platform", "junit-platform-commons", JUNIT_PLATFORM_VERSION)}`,
		...others.map((m) => {
			const { group: g, version } = coordinatesOf(view, m);
			return `\t\t${dependency(g, m.artifact_id!, version)}`;
		}),
		"\t</dependencies>",
		"\t<build>",
		"\t\t<plugins>",
		"\t\t\t<plugin>",
		"\t\t\t\t<groupId>org.apache.maven.plugins</groupId>",
		"\t\t\t\t<artifactId>maven-compiler-plugin</artifactId>",
		"\t\t\t\t<executions>",
		"\t\t\t\t\t<execution>",
		"\t\t\t\t\t\t<id>default-testCompile</id>",
		`\t\t\t\t\t\t<configuration><compileSourceRoots><compileSourceRoot>\${${ARCHUNIT_RULES_PROPERTY}}</compileSourceRoot></compileSourceRoots></configuration>`,
		"\t\t\t\t\t</execution>",
		"\t\t\t\t</executions>",
		"\t\t\t</plugin>",
		"\t\t\t<plugin>",
		"\t\t\t\t<groupId>org.apache.maven.plugins</groupId>",
		"\t\t\t\t<artifactId>maven-resources-plugin</artifactId>",
		"\t\t\t\t<executions>",
		"\t\t\t\t\t<execution>",
		"\t\t\t\t\t\t<id>default-testResources</id>",
		"\t\t\t\t\t\t<configuration><skip>true</skip></configuration>",
		"\t\t\t\t\t</execution>",
		"\t\t\t\t\t<execution>",
		"\t\t\t\t\t\t<id>archunit495-configuration</id>",
		"\t\t\t\t\t\t<phase>process-test-resources</phase>",
		"\t\t\t\t\t\t<goals><goal>copy-resources</goal></goals>",
		"\t\t\t\t\t\t<configuration>",
		"\t\t\t\t\t\t\t<outputDirectory>${project.build.testOutputDirectory}</outputDirectory>",
		"\t\t\t\t\t\t\t<overwrite>true</overwrite>",
		`\t\t\t\t\t\t\t<resources><resource><directory>\${${ARCHUNIT_RULES_PROPERTY}}</directory><includes>${ARCHUNIT_CONFIGURATION.map((file) => `<include>${file}</include>`).join("")}</includes></resource></resources>`,
		"\t\t\t\t\t\t</configuration>",
		"\t\t\t\t\t</execution>",
		"\t\t\t\t</executions>",
		"\t\t\t</plugin>",
		"\t\t\t<plugin>",
		"\t\t\t\t<groupId>org.apache.maven.plugins</groupId>",
		"\t\t\t\t<artifactId>maven-surefire-plugin</artifactId>",
		`\t\t\t\t<version>${SUREFIRE_VERSION}</version>`,
		"\t\t\t\t<configuration>",
		`\t\t\t\t\t<reportsDirectory>\${project.build.directory}/${ARCHITECTURE_REPORTS}</reportsDirectory>`,
		"\t\t\t\t\t<classpathDependencyExcludes>",
		...PROJECT_JUNIT.map((group) => `\t\t\t\t\t\t<classpathDependencyExclude>${group}:*</classpathDependencyExclude>`),
		"\t\t\t\t\t</classpathDependencyExcludes>",
		"\t\t\t\t</configuration>",
		"\t\t\t\t<dependencies>",
		`\t\t\t\t\t${dependency("org.apache.maven.surefire", "surefire-junit-platform", SUREFIRE_VERSION, "")}`,
		`\t\t\t\t\t${dependency("org.junit.platform", "junit-platform-launcher", JUNIT_PLATFORM_VERSION, "")}`,
		"\t\t\t\t</dependencies>",
		"\t\t\t</plugin>",
		"\t\t</plugins>",
		"\t</build>",
		"</profile>",
	];
}

/**
 * The edit that writes the profile into the host's POM: before the closing of its one `<profiles>`, or in a
 * `<profiles>` of its own before the closing of the project. Null when the place does not occur exactly once.
 */
function profileEdit(view: ProjectView, reactor: MavenReactor, host: SourceModule): FileEdit | null {
	const path = pomOf(host);
	const pom = view.read(path);
	if (pom === null) return null;
	const unit = /^([ \t]+)</m.exec(pom)?.[1] ?? "  ";
	const lines = (indent: string, declaration: readonly string[]) =>
		declaration.map((line) => `${indent}${line.replace(/^\t+/, (tabs) => unit.repeat(tabs.length))}`);
	const declared = archunitProfile(view, reactor, host);
	const once = (text: string) => pom.split(text).length === 2;
	if (pom.includes("</profiles>")) {
		const indent = /([ \t]*)<\/profiles>/.exec(pom)?.[1] ?? unit;
		if (!once("</profiles>")) return null;
		const [first, ...rest] = lines(`${indent}${unit}`, declared);
		return { path, current: "</profiles>", wanted: `${first!.trimStart()}\n${rest.join("\n")}\n${indent}</profiles>` };
	}
	if (!once("</project>")) return null;
	return {
		path,
		current: "</project>",
		wanted: `${[`${unit}<profiles>`, ...lines(`${unit}${unit}`, declared), `${unit}</profiles>`].join("\n")}\n</project>`,
	};
}

/**
 * The verification of the adopted map offered on the reactor: ArchUnit declared in a copy of the host's POM
 * and resolved by Maven; none when no module can host the rules or its POM does not take the declaration
 * without ambiguity.
 */
export function archunitOffer(view: ProjectView, reactor: MavenReactor): ArchitectureOffer {
	const host = architectureHost(reactor);
	if (host === null)
		return {
			kind: "not_proposed",
			note: "no module of main sources that no other module depends on can run the rules of the map",
		};
	const edit = profileEdit(view, reactor, host);
	if (edit === null)
		return {
			kind: "not_proposed",
			note: `${pomOf(host)} cannot receive the declaration of ArchUnit without ambiguity`,
		};
	const recommendation: RecommendedComplement = {
		test_type: "architecture",
		tool: ARCHUNIT,
		version: ARCHUNIT_VERSION,
		established_on: ARCHUNIT_DATE,
		source: "central.sonatype.com/artifact/com.tngtech.archunit/archunit-junit5",
		change: `in a copy of ${pomOf(host)}, declare ${ARCHUNIT} ${ARCHUNIT_VERSION} in a profile activated by the property ${ARCHUNIT_RULES_PROPERTY}, which 495 sets at each run to the rules it writes from the adopted map`,
		edit,
		install: { package: ARCHUNIT, version: ARCHUNIT_VERSION, manager: "maven" },
	};
	return { kind: "proposed", recommendation };
}

/** The host whose POM declares ArchUnit by 495's declaration in this copy, or null when none does. */
export function archunitDeclaredIn(view: ProjectView, reactor: MavenReactor): SourceModule | null {
	const host = architectureHost(reactor);
	if (host === null) return null;
	const pom = (view.read(pomOf(host)) ?? "").replace(/<!--[\s\S]*?-->/g, "");
	return pom.includes(`\${${ARCHUNIT_RULES_PROPERTY}}`) && pom.includes(ARCHUNIT.split(":")[1]!) ? host : null;
}
