/**
 * The architecture a Maven reactor declares, frozen as rules: the dependency direction of its POMs, the
 * package root each module lays out, and the packages that may not import each other, with the control
 * that applies them to the Java declarations (ARC-01, ARC-04, CON-03).
 */
import type { ControlDefinition, StructureRule } from "../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../contracts/v1/evidence.ts";
import { baseControl, emptyTrigger } from "../../../application/stacks/stack.ts";
import type { MavenModule, MavenReactor } from "./reactor.ts";

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
export function structureRules(reactor: MavenReactor): StructureRule[] {
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

/** What a reactor whose modules lay out no opposable package roots is told it does not check. */
export const BOUNDARIES_NOT_CHECKED =
	"no two modules of this reactor lay out package roots that could be opposed to each other: no dependency direction between modules is checked on this target (CON-03)";

/**
 * The architecture is read from what the target itself declares — the reactor, the dependency direction of
 * its POMs, the package root each module lays out — and frozen here. The producer receives the boundaries
 * in its context and never the rules: a boundary it could edit in the tree would be a suggestion, and
 * ARC-04 asks for the opposite.
 */
export function structureControl(
	requirementRefs: RequirementRef[],
	reactor: MavenReactor,
	rules: StructureRule[],
	nodeBinary: string,
): ControlDefinition {
	return {
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
	};
}
