/**
 * The reactor a POM tree declares, read without running Maven: its modules, what each POM depends on, and
 * the package root and source roots each module lays out.
 */
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import { PROFILES } from "./poms.ts";

export interface MavenModule {
	/** Module directory relative to the reactor root; empty for the root module. */
	path: string;
	artifact_id: string | null;
	/** Artifact ids of the reactor modules this POM declares as dependencies, outside any profile. */
	depends_on: string[];
	/** The other dependencies this POM declares outside any profile, as `groupId:artifactId` when the group is written. */
	external_dependencies: string[];
	/** The package root the module's own layout declares, when its sources share one. */
	package_root: string | null;
	/** Workspace-relative main source root, when the module has one. */
	source_root: string | null;
	/** Workspace-relative test source root, when the module has one. */
	test_root: string | null;
}

export interface MavenReactor {
	modules: string[];
	module_info: MavenModule[];
	pom_paths: string[];
	preparation_paths: string[];
	target_paths: string[];
	witness_module: string;
	ignored_modules: string[];
}

/**
 * Discovers the root project and every reachable `<module>` without executing Maven. One breadth-first walk:
 * each refusal of a `<module>` entry, ignored and named, is a condition of the step that queues the next
 * POM, and the model is read from what that walk saw.
 */
export function discoverMavenReactor(view: ProjectView): MavenReactor {
	// Module paths are resolved against a root of their own, which nothing is read through, so that one
	// leading out of the reactor is told apart from one inside it.
	const root = resolve(sep, "reactor");
	const queue = [""];
	const seen = new Set<string>();
	const children = new Map<string, string[]>();
	const identities = new Map<string, PomIdentity>();
	const ignored: string[] = [];
	while (queue.length > 0) {
		const module = queue.shift()!;
		if (seen.has(module)) continue;
		const xml = view.read(module ? `${module}/pom.xml` : "pom.xml");
		if (xml === null) {
			ignored.push(module || ".");
			continue;
		}
		seen.add(module);
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
				if (!view.exists(`${normal}/pom.xml`)) {
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
			const testRoot = pathAt(m, "src/test/java");
			const hasSources = view.exists(sourceRoot);
			const inReactor = (d: PomDependency) => reactorArtifacts.has(d.artifact_id);
			return {
				path: m,
				artifact_id: identity.artifact_id,
				depends_on: [...new Set(identity.dependencies.filter(inReactor).map((d) => d.artifact_id))].sort(),
				external_dependencies: identity.dependencies
					.filter((d) => !inReactor(d))
					.map((d) => (d.group_id === null ? d.artifact_id : `${d.group_id}:${d.artifact_id}`)),
				package_root: hasSources ? packageRootOf(view, sourceRoot) : null,
				source_root: hasSources ? `${sourceRoot}/` : null,
				test_root: view.exists(testRoot) ? `${testRoot}/` : null,
			};
		}),
		pom_paths: modules.map((m) => pathAt(m, "pom.xml")),
		preparation_paths: modules.map((m) => pathAt(m, "src/test/")),
		target_paths: modules.map((m) => pathAt(m, "target")),
		witness_module: witness,
		ignored_modules: [...new Set(ignored)].sort(),
	};
}

interface PomDependency {
	/** Null when the POM leaves the group to a property or to nothing. */
	group_id: string | null;
	artifact_id: string;
}

interface PomIdentity {
	artifact_id: string | null;
	dependencies: PomDependency[];
}

/** The text of the first `<name>` element of a POM fragment, null when it is absent or left to a property. */
export function elementText(xml: string, name: string): string | null {
	const text = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`).exec(xml)?.[1]?.trim();
	return text && !text.includes("${") ? text : null;
}

/**
 * What a POM declares about itself: its own artifact and the artifacts it depends on. The blocks a
 * dependency may hide in without `mvn test` resolving it — the parent coordinates, managed versions,
 * plugin dependencies and profiles — are removed first: a dependency that exists only under an
 * activated profile is not one the reactor guarantees, the same reading `bindsJacocoReport` applies.
 */
function pomIdentity(xml: string): PomIdentity {
	const own = xml
		.replace(/<parent\b[\s\S]*?<\/parent>/g, "")
		.replace(/<dependencyManagement\b[\s\S]*?<\/dependencyManagement>/g, "")
		.replace(/<build\b[\s\S]*?<\/build>/g, "")
		.replace(PROFILES, "")
		.replace(/<reporting\b[\s\S]*?<\/reporting>/g, "");
	const dependencies: PomDependency[] = [];
	for (const block of own.matchAll(/<dependencies\b[^>]*>([\s\S]*?)<\/dependencies>/g)) {
		for (const match of (block[1] ?? "").matchAll(/<dependency\b[^>]*>([\s\S]*?)<\/dependency>/g)) {
			// An exclusion names an artifact the dependency does not bring.
			const declared = (match[1] ?? "").replace(/<exclusions\b[\s\S]*?<\/exclusions>/g, "");
			const artifact = elementText(declared, "artifactId");
			if (artifact !== null) dependencies.push({ group_id: elementText(declared, "groupId"), artifact_id: artifact });
		}
	}
	const withoutDependencies = own.replace(/<dependencies\b[\s\S]*?<\/dependencies>/g, "");
	return { artifact_id: elementText(withoutDependencies, "artifactId"), dependencies };
}

/**
 * The package root a source tree lays out: the directory chain below the source root that holds no
 * source of its own and branches nowhere. `src/main/java/io/scalastic/demo/domain` with two
 * subdirectories under it declares `io.scalastic.demo.domain`; a tree whose sources sit in the
 * default package declares nothing, and nothing is what this returns.
 */
function packageRootOf(view: ProjectView, sourceRoot: string): string | null {
	const segments: string[] = [];
	let current = sourceRoot;
	for (let depth = 0; depth < 32; depth++) {
		const entries = view.list(current).filter((entry) => !entry.name.startsWith("."));
		const directories = entries.filter((entry) => entry.directory);
		if (directories.length !== 1 || directories.length !== entries.length) break;
		segments.push(directories[0]!.name);
		current = join(current, directories[0]!.name);
	}
	return segments.length > 0 ? segments.join(".") : null;
}
