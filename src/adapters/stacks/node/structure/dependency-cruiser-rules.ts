/**
 * The rules of an adopted architecture map, written as the configuration dependency-cruiser 18.5.0 is given at
 * each run (`specs/adr/D-87` §5): the style of each part — the rings of an onion, the calls permitted between
 * layers —, no dependency between two parts the map does not relate, no cycle between the folders of the map,
 * and every source in a part. A part in `simple` or `other` style has no rule of its own beyond its relations
 * and its cycles. A folder of the map holds the sources directly in it, as a Java package holds its classes.
 * Each rule is named in the words of the map, which is the name its violations are reported under.
 */
import type { ArchitectureMap } from "../../../../contracts/v1/protocol.ts";
import { onionRing } from "../../../../domain/architecture-map.ts";
import {
	escapedForPattern,
	NODE_OUTPUTS,
	SCRIPT_DECLARATION_ONLY,
	SCRIPT_SOURCE,
	SCRIPT_TEST_SOURCE,
} from "../shared.ts";

type Part = ArchitectureMap["parts"][number];

/** A rule that forbids the dependencies from the sources of `from` to those of `to`. */
interface Forbidden {
	name: string;
	severity: "error";
	from: { path: string };
	to: { path?: string; circular?: boolean; viaSomeNot?: string };
}

/** The sources directly in one of `folders`, as dependency-cruiser names a module: by its path from the copy. */
const sourcesIn = (folders: readonly string[]) => `^(${folders.map(escapedForPattern).join("|")})/[^/]+$`;

const foldersOf = (part: Part) => [...new Set(part.roles.map((r) => r.package))];
const foldersWith = (part: Part, role: (r: Part["roles"][number]) => boolean) =>
	part.roles.filter(role).map((r) => r.package);

const forbidden = (name: string, from: readonly string[], to: readonly string[]): Forbidden[] =>
	from.length === 0 || to.length === 0
		? []
		: [{ name, severity: "error", from: { path: sourcesIn(from) }, to: { path: sourcesIn(to) } }];

/** The rings of an onion from the centre outwards; the adapters, each named, are the outer ring. */
const RINGS = ["domain model", "domain services", "application services"] as const;

/** The onion of a part: a ring depends on no ring outside it, and an adapter on no other adapter. */
function onionRules(part: Part): Forbidden[] {
	const name = `part ${part.name} keeps the rings of its onion`;
	const inRing = (ring: string) => foldersWith(part, (r) => onionRing(r.role) === ring);
	const adapters = new Map<string, string[]>();
	for (const r of part.roles) {
		const ring = onionRing(r.role);
		if (ring !== null && typeof ring === "object")
			adapters.set(ring.adapter, [...(adapters.get(ring.adapter) ?? []), r.package]);
	}
	const allAdapters = [...adapters.values()].flat();
	return [
		...RINGS.flatMap((ring, i) =>
			forbidden(name, inRing(ring), [...RINGS.slice(i + 1).flatMap((outer) => inRing(outer)), ...allAdapters]),
		),
		...[...adapters].flatMap(([adapter, folders]) =>
			forbidden(
				name,
				folders,
				[...adapters].flatMap(([other, others]) => (other === adapter ? [] : others)),
			),
		),
	];
}

/** The layers of a part, each called only by the layers the map names; a dependency into the part from outside it is judged by the relations. */
function layeredRules(part: Part): Forbidden[] {
	const name = `part ${part.name} keeps the calls between its layers`;
	const layers = [...new Set(part.roles.map((r) => r.role))];
	return layers.flatMap((layer) => {
		const callers = new Set([layer, ...part.roles.filter((r) => r.role === layer).flatMap((r) => r.called_by ?? [])]);
		return forbidden(
			name,
			foldersWith(part, (r) => !callers.has(r.role)),
			foldersWith(part, (r) => r.role === layer),
		);
	});
}

/** For each part, one rule per part it may not depend on. */
function relationRules(map: ArchitectureMap): Forbidden[] {
	return map.parts.flatMap((from) =>
		map.parts
			.filter((to) => to.name !== from.name && !map.relations.some((r) => r.from === from.name && r.to === to.name))
			.flatMap((to) =>
				forbidden(`part ${from.name} may not depend on part ${to.name}`, foldersOf(from), foldersOf(to)),
			),
	);
}

/**
 * What dependency-cruiser does not read: what the tools of the package write, the installed packages, the
 * hidden directories and the tests, which the map does not judge.
 */
const NOT_READ = [
	`^(${NODE_OUTPUTS.map(escapedForPattern).join("|")})`,
	"(^|/)node_modules/",
	"(^|/)\\.",
	SCRIPT_TEST_SOURCE.source,
].join("|");

/** The configuration of dependency-cruiser that verifies `map`, as JSON. */
export function dependencyCruiserRules(map: ArchitectureMap): string {
	const folders = [...new Set(map.parts.flatMap(foldersOf))];
	const rules: Forbidden[] = [
		...map.parts.flatMap((part) =>
			part.style === "onion" ? onionRules(part) : part.style === "layered" ? layeredRules(part) : [],
		),
		...relationRules(map),
		// A cycle whose files all sit in one folder is that folder's own business, as a cycle inside a Java package is.
		{
			name: "no cycle between the folders of the map",
			severity: "error",
			from: { path: sourcesIn(folders) },
			to: { circular: true, viaSomeNot: "^$1/[^/]+$" },
		},
	];
	return `${JSON.stringify(
		{
			forbidden: rules,
			// A source in a folder of the package, outside every folder of the map, must depend on what nothing is: it
			// always breaks the rule, whatever it imports. A file at the root of the package is no folder of a map.
			required: [
				{
					name: "every source belongs to a part",
					severity: "error",
					module: {
						path: `/[^/]+${SCRIPT_SOURCE.source}`,
						pathNot: [sourcesIn(folders), SCRIPT_DECLARATION_ONLY.source],
					},
					to: { path: "^$" },
				},
			],
			options: {
				parser: "swc",
				// An import of a type is a dependency, as a reference to a type is one for ArchUnit.
				tsPreCompilationDeps: true,
				doNotFollow: { path: "(^|/)node_modules/" },
				exclude: { path: NOT_READ },
			},
		},
		null,
		2,
	)}\n`;
}
