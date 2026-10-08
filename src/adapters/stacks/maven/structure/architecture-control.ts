/**
 * The verification of an adopted architecture map on a Maven reactor (`specs/adr/D-87`): once 495 declared
 * ArchUnit in the copy, the control that runs the rules of the map with the network closed, and the witness
 * that carries a dependency the map forbids.
 */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import type { CapabilityQuestion, WitnessFiles } from "../../../../application/stacks/plugin.ts";
import { baseControl } from "../../../../application/stacks/stack.ts";
import {
	type ArchitectureMap,
	type ControlDefinition,
	RULESET_DIRECTORY_PLACEHOLDER,
} from "../../../../contracts/v1/protocol.ts";
import type { MavenProject } from "../project/maven-project.ts";
import type { MavenReactor } from "../project/reactor.ts";
import { ARCHUNIT_RULES_PROPERTY } from "../shared.ts";
import { ARCHITECTURE_REPORTS, archunitDeclaredIn } from "./archunit-declaration.ts";
import { ARCHITECTURE_TEST_CLASS } from "./archunit-rules.ts";
import { modulePackages } from "./main-packages.ts";

/**
 * The tree that carries a dependency the map forbids (VER-05): two classes in two packages of the map that one
 * module declares, each using the other, a cycle the rules refuse and the build compiles. Empty when no module
 * declares two packages of the map.
 */
function architectureNegativeWitness(view: ProjectView, reactor: MavenReactor, map: ArchitectureMap): WitnessFiles {
	const mapped = new Set(map.parts.flatMap((part) => part.roles.map((r) => r.package)));
	for (const module of reactor.module_info) {
		const [a, b] = modulePackages(view, module).filter((p) => mapped.has(p));
		if (a === undefined || b === undefined || module.source_root === null) continue;
		const witness = (pkg: string, name: string, other: string) => [
			`${module.source_root}${pkg.replaceAll(".", "/")}/${name}.java`,
			`package ${pkg};\n\npublic final class ${name} {\n    ${other} next;\n}\n`,
		];
		return Object.fromEntries([
			witness(a, "Witness495CycleA", `${b}.Witness495CycleB`),
			witness(b, "Witness495CycleB", `${a}.Witness495CycleA`),
		]);
	}
	return {};
}

/**
 * What the adopted map adds to the structure of the reactor: the architecture control and its witness, once
 * the copy declares ArchUnit by 495's declaration; why it is not verified when no witness can be written;
 * nothing without a map or a declaration.
 */
export function architectureVerification({
	model,
	view,
	requirement_refs,
	architecture_map: map,
}: CapabilityQuestion<MavenProject>):
	| { control: ControlDefinition; witness: WitnessFiles }
	| { short_of: string }
	| null {
	if (map === undefined) return null;
	const host = archunitDeclaredIn(view, model.reactor);
	if (host === null) return null;
	const witness = architectureNegativeWitness(view, model.reactor, map);
	if (Object.keys(witness).length === 0)
		return {
			short_of:
				"the adopted architecture map is not verified: no module declares two of its packages, so no dependency it forbids can be written as a witness",
		};
	return {
		control: {
			...baseControl(requirement_refs),
			control_id: "architecture",
			title: "the rules of the adopted architecture map, checked by ArchUnit",
			command: [
				"mvn",
				"-B",
				"-q",
				"-o",
				"test",
				`-D${ARCHUNIT_RULES_PROPERTY}=${RULESET_DIRECTORY_PLACEHOLDER}`,
				`-Dtest=${ARCHITECTURE_TEST_CLASS}`,
				"-Dsurefire.failIfNoSpecifiedTests=false",
			],
			timeout_ms: 20 * 60_000,
			parser: "archunit-xml",
			report_path: `${host.path ? `${host.path}/` : ""}target/${ARCHITECTURE_REPORTS}`,
			architecture_map: map,
			provides: [],
			writable_paths: model.reactor.target_paths,
			protected_paths: [...model.reactor.pom_paths],
		},
		witness,
	};
}
