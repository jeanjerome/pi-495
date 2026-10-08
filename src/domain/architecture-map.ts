/**
 * The architecture map of a target as the owner reads it (`specs/adr/D-87`): one fact per part, with its
 * perimeter, its style and the role of each of its packages, and one per relation the map permits, each
 * element with the places in the reference that support it.
 */
import type { ArchitectureHint, ArchitectureMap } from "../contracts/v1/protocol.ts";

/** The places that support an element, each a file, a line and what it shows. */
function supported(hints: readonly ArchitectureHint[]): string {
	return hints.length === 0 ? "" : ` [${hints.map((h) => `${h.path}:${h.line} ${h.says}`.trim()).join("; ")}]`;
}

type Part = ArchitectureMap["parts"][number];
type Role = Part["roles"][number];

/** The inner rings of an onion, from the centre outwards; the adapters, each named, are the outer ring. */
const ONION_RINGS = ["domain model", "domain services", "application services"] as const;
const ADAPTER = "adapter ";

/** The ring a role of a part in onion names: one of the inner rings, or a named adapter; null for any other role. */
export function onionRing(role: string): (typeof ONION_RINGS)[number] | { adapter: string } | null {
	const ring = ONION_RINGS.find((r) => r === role);
	if (ring) return ring;
	const adapter = role.startsWith(ADAPTER) ? role.slice(ADAPTER.length).trim() : "";
	return adapter === "" ? null : { adapter };
}

/** The layers that may call the layer of a role of a part in layers, as the decision says them. */
function calledBy(role: Role): string {
	if (role.called_by === undefined) return "";
	return `, called by ${role.called_by.length === 0 ? "no layer" : role.called_by.join(", ")}`;
}

/** What the owner reads of a proposed map before adopting it, with the packages of the main sources no part covers. */
export function architectureMapFacts(map: ArchitectureMap, unassigned: readonly string[]): string[] {
	return [
		...map.parts.map(
			(part) =>
				`architecture part ${part.name}: perimeter ${part.perimeter.join(", ")}; style ${part.style}${supported(part.hints)}; roles: ${part.roles.map((r) => `${r.package} ${r.role}${calledBy(r)}${supported(r.hints)}`).join("; ")}`,
		),
		...map.relations.map((r) => `architecture relation: ${r.from} may depend on ${r.to}${supported(r.hints)}`),
		...(unassigned.length === 0 ? [] : [`architecture packages without a part: ${unassigned.join(", ")}`]),
	];
}

/**
 * What the style of a part asks that its roles do not say: in onion, a role that is no ring; in layers, a
 * layer that does not say which layers may call it, or names as a caller a layer the part does not have.
 */
function styleDefects(part: Part): string[] {
	if (part.style === "onion")
		return part.roles.flatMap((r) =>
			onionRing(r.role) === null
				? [
						`part ${part.name}: package ${r.package} has the role "${r.role}", which is no ring of an onion: ${ONION_RINGS.map((ring) => `"${ring}"`).join(", ")} or "adapter <name>"`,
					]
				: [],
		);
	if (part.style !== "layered") return [];
	const layers = new Set(part.roles.map((r) => r.role));
	return part.roles.flatMap((r) => {
		if (r.called_by === undefined) return [`part ${part.name}: layer ${r.role} does not say which layers may call it`];
		return r.called_by
			.filter((caller) => !layers.has(caller))
			.map((caller) => `part ${part.name}: layer ${r.role} may be called by ${caller}, which is no layer of the part`);
	});
}

/**
 * What the reference says of a proposed map: it holds, with the packages of the main sources no part gives a
 * role to; or it does not, with each role that does not follow the style of its part, each package no main
 * source declares and each hint that points at no line of a file of the reference.
 */
export type MapCheck = { holds: true; unassigned: string[] } | { holds: false; missing: string[] };

/**
 * Checks a map against the packages the main sources declare and the files of the reference, `linesOf`
 * giving the number of lines of a file of the reference, or null when the reference holds no such file.
 */
export function checkArchitectureMap(
	map: ArchitectureMap,
	packages: readonly string[],
	linesOf: (path: string) => number | null,
): MapCheck {
	const named = map.parts.flatMap((part) => part.roles.map((r) => r.package));
	const hints = [
		...map.parts.flatMap((part) => [...part.hints, ...part.roles.flatMap((r) => r.hints)]),
		...map.relations.flatMap((r) => r.hints),
	];
	const missing = [
		...map.parts.flatMap(styleDefects),
		...[...new Set(named.filter((p) => !packages.includes(p)))].map(
			(p) => `package ${p} is declared by no main source of the reference`,
		),
		...hints.flatMap((h) => {
			const lines = linesOf(h.path);
			if (lines === null) return [`hint ${h.path}:${h.line} names no file of the reference`];
			return h.line > lines ? [`hint ${h.path}:${h.line} is past the end of its file, which has ${lines} lines`] : [];
		}),
	];
	if (missing.length > 0) return { holds: false, missing };
	return { holds: true, unassigned: packages.filter((p) => !named.includes(p)) };
}
