/**
 * The reading of the links a Maven reactor establishes by configuration or by reflection against an adopted map
 * (ARC-01): the control that runs nothing, reads the copy with the network closed and judges what it reads by the
 * map it froze, and the witness that carries a configuration file naming a class of a part the map forbids.
 */
import type { CapabilityQuestion, WitnessFiles } from "../../../../application/stacks/plugin.ts";
import { baseControl, emptyTrigger } from "../../../../application/stacks/stack.ts";
import type { RequirementRef } from "../../../../contracts/v1/evidence.ts";
import type { ArchitectureMap, ControlDefinition } from "../../../../contracts/v1/protocol.ts";
import type { MavenProject } from "../project/maven-project.ts";
import type { MavenModule, MavenReactor } from "../project/reactor.ts";

type Part = ArchitectureMap["parts"][number];

/** The control of the links established by configuration or by reflection, judged by the parts and relations of `map`. */
function configuredLinksControl(
	requirementRefs: RequirementRef[],
	reactor: MavenReactor,
	map: ArchitectureMap,
	nodeBinary: string,
): ControlDefinition {
	return {
		...baseControl(requirementRefs),
		control_id: "configured-links",
		title:
			"the links a configuration file or a string of the code establishes by naming a class in full, against the adopted map",
		command: emptyTrigger(nodeBinary),
		timeout_ms: 120_000,
		parser: "configured-links",
		report_path: null,
		architecture_map: map,
		provides: [],
		protected_paths: [...reactor.pom_paths],
	};
}

/** The module of the reactor with a main source root that the perimeter of `part` names, and that of no other part. */
function moduleOfPart(reactor: MavenReactor, map: ArchitectureMap, part: Part): MavenModule | undefined {
	const claimed = (module: MavenModule) => map.parts.filter((p) => p.perimeter.includes(module.path || "."));
	return reactor.module_info.find(
		(module) => module.source_root !== null && claimed(module).length === 1 && claimed(module)[0] === part,
	);
}

/** A class `Witness495Linked` in `pkg` of `toModule`, and a configuration file of `fromModule` naming it in full. */
function linkedWitness(fromModule: MavenModule, toModule: MavenModule, pkg: string): WitnessFiles {
	const resources = `${fromModule.path ? `${fromModule.path}/` : ""}src/main/resources/`;
	return {
		[`${toModule.source_root}${pkg.replaceAll(".", "/")}/Witness495Linked.java`]: `package ${pkg};\n\npublic final class Witness495Linked {}\n`,
		[`${resources}witness495-link.properties`]: `witness495.linked=${pkg}.Witness495Linked\n`,
	};
}

/**
 * The tree that carries a link the map forbids (VER-05): a class in a package of a part, and a configuration file of
 * a part that may not depend on it naming that class in full. Empty when no two such parts each have a module.
 */
function configuredLinksNegativeWitness(reactor: MavenReactor, map: ArchitectureMap): WitnessFiles {
	for (const from of map.parts) {
		const fromModule = moduleOfPart(reactor, map, from);
		if (fromModule === undefined) continue;
		for (const to of map.parts) {
			if (to === from || map.relations.some((r) => r.from === from.name && r.to === to.name)) continue;
			const toModule = moduleOfPart(reactor, map, to);
			const pkg = to.roles[0]?.package;
			if (toModule !== undefined && pkg !== undefined) return linkedWitness(fromModule, toModule, pkg);
		}
	}
	return {};
}

/**
 * What the adopted map adds to read the links established by configuration or by reflection: the control and its
 * witness; nothing without a map, or when no two parts each have a module to write a forbidden link between.
 */
export function configuredLinksVerification({
	model,
	requirement_refs,
	node_binary,
	architecture_map: map,
}: CapabilityQuestion<MavenProject>): { control: ControlDefinition; witness: WitnessFiles } | null {
	if (map === undefined) return null;
	const witness = configuredLinksNegativeWitness(model.reactor, map);
	if (Object.keys(witness).length === 0) return null;
	return { control: configuredLinksControl(requirement_refs, model.reactor, map, node_binary), witness };
}
