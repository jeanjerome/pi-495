/**
 * How the Maven technology brings a plugin into a copy of the target: the plugin is declared by the edit of
 * the POM its recommendation describes, in a copy of its own, and Maven resolves it there without running any
 * of its goals; the resolution is accepted only when it changed nothing but that POM. Maven writes what it
 * downloads into its local repository, outside the copy, where it stays whatever the owner decides next.
 */
import type { PackageInstall } from "../../../../contracts/v1/protocol.ts";
import type { InstallCapability, InstallPhrases } from "../../../../application/stacks/plugin.ts";
import { PMD_PLUGIN, PMD_PLUGIN_VERSION } from "../shared.ts";

/** The site skin the `pmd` and `cpd` goals of `maven-pmd-plugin` 3.28.0 load to render their report, as they name it when it is missing. */
const PMD_SITE_SKIN = "org.apache.maven.skins:maven-fluido-skin:2.0.0-M9";

/** The dependency plugin that resolves the plugins of a POM without running any of them, at the release checked on 2026-09-30, the date of the Maven catalogue. */
const MAVEN_DEPENDENCY_PLUGIN = "org.apache.maven.plugins:maven-dependency-plugin:3.11.0";

/**
 * The command that resolves the plugins of a copy without running any goal of them. When the PMD plugin
 * 495 declares is among `installs`, the site skin its report goals render with is fetched too, without its
 * dependencies: resolving the plugins does not fetch it, and the goals stop offline without it.
 */
export function mavenResolutionCommand(installs: readonly PackageInstall[]): string[] {
	const pmd = installs.some((install) => install.package === PMD_PLUGIN && install.version === PMD_PLUGIN_VERSION);
	return [
		"mvn",
		"-B",
		`${MAVEN_DEPENDENCY_PLUGIN}:resolve-plugins`,
		...(pmd ? [`${MAVEN_DEPENDENCY_PLUGIN}:get`, `-Dartifact=${PMD_SITE_SKIN}`, "-Dtransitive=false"] : []),
	];
}

/** The line a debug run of Maven announces its local repository with, configuration of the machine and of the project applied. */
const LOCAL_REPOSITORY_LINE = /^\[DEBUG\] Using local repository at ([^\r\n]+)/m;

/** The local repository Maven announces in the output of a debug run, as announced, or null when it announces none. */
export function readLocalRepository(output: string): string | null {
	return LOCAL_REPOSITORY_LINE.exec(output)?.[1] ?? null;
}

/** What a Maven resolution left in the copy: accepted, or what keeps it from being accepted. */
type ResolutionInspection = { kind: "accepted" } | { kind: "refused"; reason: string };

/**
 * Accepts a resolution only when the copy holds what 495 wrote into it and nothing else changed: each
 * file in `written` is as written, and every other file is as it was, none added and none removed.
 * The resolution writes the local repository of Maven, which is outside the copy.
 */
export function inspectResolution(
	before: Readonly<Record<string, string>>,
	after: Readonly<Record<string, string>>,
	written: readonly { path: string; digest: string }[],
): ResolutionInspection {
	const expected = new Map(written.map((w) => [w.path, w.digest] as const));
	const paths = [...new Set([...Object.keys(before), ...Object.keys(after), ...expected.keys()])].sort();
	for (const path of paths) {
		if (after[path] === (expected.get(path) ?? before[path])) continue;
		return {
			kind: "refused",
			reason: `the resolution left ${path} ${expected.has(path) ? "other than 495 wrote it" : "changed, and only the local repository of Maven is written outside pom.xml"}`,
		};
	}
	return { kind: "accepted" };
}

/** The variables Maven reads its JDK, its own options and its installation from, besides the ones every control receives. */
const MAVEN_ENV_NAMES = ["JAVA_HOME", "MAVEN_OPTS", "MAVEN_ARGS", "MAVEN_HOME", "M2_HOME"];

/** What the owner is told Maven does with the plugin it resolves in a copy, and what its inspection accepts. */
const MAVEN_PHRASES: { fr: InstallPhrases; en: InstallPhrases } = {
	fr: {
		complementLabel: (names) => `résout ${names}`,
		complementDoes: (names) => `résout ${names} avec Maven dans une copie du projet`,
		runsNothing: "sans exécuter aucun but du greffon",
		keptOutside: (directory) =>
			`les fichiers téléchargés sont écrits dès l'adoption dans le dépôt local que Maven désigne${directory === undefined ? "" : ` (${directory})`} et y restent si l'intégration est refusée`,
		complementInspected:
			"la copie est inspectée et la résolution n'est acceptée que si elle ne modifie aucun fichier autre que pom.xml",
		referentialLabel: (names) => `déclare ${names} dans une copie du POM et le résout`,
		referentialDoes: (names) => `déclare ${names} dans une copie du POM et résout le greffon avec Maven`,
		referentialInspected:
			"la copie est inspectée et la résolution n'est acceptée que si elle ne modifie aucun fichier autre que pom.xml",
	},
	en: {
		complementLabel: (names) => `resolves ${names}`,
		complementDoes: (names) => `resolves ${names} with Maven in a copy of the project`,
		runsNothing: "running no goal of the plugin",
		keptOutside: (directory) =>
			`the downloaded files are written from the adoption into the local repository Maven designates${directory === undefined ? "" : ` (${directory})`} and stay there if the integration is refused`,
		complementInspected:
			"the copy is inspected and the resolution is accepted only if it changes no file other than pom.xml",
		referentialLabel: (names) => `declares ${names} in a copy of the POM and resolves it`,
		referentialDoes: (names) => `declares ${names} in a copy of the POM and resolves the plugin with Maven`,
		referentialInspected:
			"the copy is inspected and the resolution is accepted only if it changes no file other than pom.xml",
	},
};

export const MAVEN_INSTALL: InstallCapability = {
	manager: "maven",
	title: "Maven",
	form: "resolve",
	plan: (_files, installs) => ({ kind: "command", command: mavenResolutionCommand(installs) }),
	inspect: (before, after, _installs, written) => {
		const inspected = inspectResolution(before.files, after.files, written);
		// Only the edit of the POM is kept, which the adoption writes from the recommendation.
		return inspected.kind === "refused" ? inspected : { kind: "accepted", files: [], packages: [] };
	},
	outside_write: {
		command: ["mvn", "-X", "-o", "-B", "validate"],
		read: readLocalRepository,
		unsaid: "Maven did not announce its local repository",
		kept: { unestablished: "Maven's local repository could not be established" },
	},
	env: { names: MAVEN_ENV_NAMES },
	// Maven says the cause on its standard output and leaves its error output to the JVM's warnings.
	failure_output: "stdout",
	// What Maven printed while it resolved is kept, for the dossier to show what it downloaded.
	keeps_output: true,
	phrases: MAVEN_PHRASES,
};
