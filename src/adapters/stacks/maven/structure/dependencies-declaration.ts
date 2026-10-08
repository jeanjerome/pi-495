/**
 * The declaration of the analysis of the dependencies in a copy of each POM of a Maven reactor. `dependency:analyze`
 * reads its configuration from the POMs of the project — the plugin in a module, the management of the plugins of a
 * parent, an execution `default-cli` — and its parameters from the properties Maven hands it, from the POMs or from
 * `.mvn/maven.config`; each of them silences a gap. The declaration is a profile activated only by the property the
 * dependencies control sets, which carries the execution the control runs, with a configuration that replaces the
 * project's and sets every parameter of the goal. It is written in every POM, since a module whose parent is not the
 * root of the reactor does not inherit the profile of the root. A parameter the descriptor of the plugin binds to a
 * property, or gives a default value, keeps that value even when configured empty, unless its own element replaces it
 * too; the other lists are replaced with the whole configuration. Without the property, the build of the copy is the
 * project's.
 */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import type { MavenReactor } from "../project/reactor.ts";
import {
	DEPENDENCIES_EXECUTION,
	DEPENDENCIES_PROPERTY,
	DEPENDENCY_PLUGIN,
	DEPENDENCY_PLUGIN_VERSION,
} from "../shared.ts";

/**
 * Each parameter of `analyze` in 3.11.0, as its descriptor names it, at the value 495 analyses with: the runtime
 * dependencies aside, the classes of each gap named, nothing ignored, the projects of packaging `pom` and `ear`
 * skipped as the plugin skips them by default.
 */
const PARAMETERS = [
	"<analyzer>default</analyzer>",
	'<excludedClasses combine.self="override"/>',
	"<failOnWarning>false</failOnWarning>",
	"<ignoreAllNonTestScoped>false</ignoreAllNonTestScoped>",
	"<ignoreNonCompile>false</ignoreNonCompile>",
	"<ignoreUnusedRuntime>true</ignoreUnusedRuntime>",
	"<ignoredDependencies/>",
	'<ignoredNonTestScopedDependencies combine.self="override"/>',
	'<ignoredPackagings combine.self="override"><ignoredPackaging>pom</ignoredPackaging><ignoredPackaging>ear</ignoredPackaging></ignoredPackagings>',
	"<ignoredUnusedDeclaredDependencies/>",
	"<ignoredUsedUndeclaredDependencies/>",
	"<outputXML>false</outputXML>",
	"<scriptableOutput>false</scriptableOutput>",
	"<skip>false</skip>",
	"<usedDependencies/>",
	"<verbose>true</verbose>",
];

const [GROUP, ARTIFACT] = DEPENDENCY_PLUGIN.split(":") as [string, string];

/** The profile that declares the analysis in a POM, one line per entry, each indented by tabs below it. */
export const DEPENDENCIES_PROFILE: readonly string[] = [
	"<profile>",
	`\t<id>${DEPENDENCIES_PROPERTY}</id>`,
	`\t<activation><property><name>${DEPENDENCIES_PROPERTY}</name></property></activation>`,
	"\t<build>",
	"\t\t<plugins>",
	"\t\t\t<plugin>",
	`\t\t\t\t<groupId>${GROUP}</groupId>`,
	`\t\t\t\t<artifactId>${ARTIFACT}</artifactId>`,
	`\t\t\t\t<version>${DEPENDENCY_PLUGIN_VERSION}</version>`,
	"\t\t\t\t<executions>",
	"\t\t\t\t\t<execution>",
	`\t\t\t\t\t\t<id>${DEPENDENCIES_EXECUTION}</id>`,
	'\t\t\t\t\t\t<configuration combine.self="override">',
	...PARAMETERS.map((parameter) => `\t\t\t\t\t\t\t${parameter}`),
	"\t\t\t\t\t\t</configuration>",
	"\t\t\t\t\t</execution>",
	"\t\t\t\t</executions>",
	"\t\t\t</plugin>",
	"\t\t</plugins>",
	"\t</build>",
	"</profile>",
];

/** Whether every POM of the reactor declares the analysis by 495's declaration in this copy. */
export function dependenciesDeclaredIn(view: ProjectView, reactor: MavenReactor): boolean {
	return reactor.pom_paths.every((path) => {
		const pom = (view.read(path) ?? "").replace(/<!--[\s\S]*?-->/g, "");
		return pom.includes(`<name>${DEPENDENCIES_PROPERTY}</name>`) && pom.includes(`<id>${DEPENDENCIES_EXECUTION}</id>`);
	});
}
