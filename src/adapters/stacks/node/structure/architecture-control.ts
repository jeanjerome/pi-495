/**
 * The verification of an adopted architecture map on a Node package (`specs/adr/D-87`): once dependency-cruiser
 * 18.5.0 and its swc parser are installed in the copy, the control that runs the rules of the map with the
 * network closed, and the witness that carries a dependency the map forbids.
 */
import type { ArchitectureOffer, CapabilityQuestion, WitnessFiles } from "../../../../application/stacks/plugin.ts";
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import { baseControl } from "../../../../application/stacks/stack.ts";
import {
	type ArchitectureMap,
	type ControlDefinition,
	type RecommendedComplement,
	RULESET_PLACEHOLDER,
} from "../../../../contracts/v1/protocol.ts";
import type { NodeProject } from "../project/node-project.ts";
import { REPORT_DIRECTORY } from "../shared.ts";
import { MAP_VERIFICATION_UNSEEN } from "./map-verification-unseen.ts";

/** The date the analyser and its parser below were checked against the packages they cite. */
const MAP_ANALYSERS_DATE = "2026-10-08";

/** The analyser of the map and its parser, at the versions their rules and their output were read against. */
const MAP_ANALYSERS = [
	{ package: "dependency-cruiser", version: "18.5.0" },
	{ package: "@swc/core", version: "1.16.13" },
] as const;

/**
 * The verification of the adopted map offered on a package: dependency-cruiser, and the swc parser it reads
 * TypeScript with, installed by npm in a copy as exact development dependencies, with what it does not see.
 */
export function cruiserOffer(): ArchitectureOffer {
	const complement = (p: (typeof MAP_ANALYSERS)[number]): RecommendedComplement => ({
		test_type: "architecture",
		tool: p.package,
		version: p.version,
		established_on: MAP_ANALYSERS_DATE,
		source: `www.npmjs.com/package/${p.package}/v/${p.version}`,
		change: `in a copy, install ${p.package} ${p.version} as an exact devDependency, running no install script`,
		install: { package: p.package, version: p.version, manager: "npm" },
	});
	const [analyser, ...parsers] = MAP_ANALYSERS;
	return {
		kind: "proposed",
		recommendation: complement(analyser),
		brought_with: parsers.map(complement),
		unseen: [...MAP_VERIFICATION_UNSEEN],
	};
}

/** Where dependency-cruiser writes the JSON the architecture control reads. */
const REPORT_PATH = `${REPORT_DIRECTORY}/495-dependency-cruiser.json`;

/** Whether the copy carries the analyser and its parser at their versions, under `node_modules`. */
function analysersInstalledIn(view: ProjectView): boolean {
	return MAP_ANALYSERS.every((analyser) => {
		const text = view.read(`node_modules/${analyser.package}/package.json`);
		try {
			return text !== null && (JSON.parse(text) as { version?: unknown }).version === analyser.version;
		} catch {
			return false; // a manifest that cannot be read installs nothing 495 can run
		}
	});
}

/**
 * The tree that carries a dependency the map forbids (VER-05): two sources in two folders of the map, each
 * importing the other, a cycle between folders the rules refuse. Empty when the map has fewer than two folders.
 */
function architectureNegativeWitness(map: ArchitectureMap): WitnessFiles {
	const [a, b] = [...new Set(map.parts.flatMap((part) => part.roles.map((r) => r.package)))];
	if (a === undefined || b === undefined) return {};
	const up = (from: string) =>
		from
			.split("/")
			.map(() => "..")
			.join("/");
	return {
		[`${a}/witness495-cycle-a.js`]: `import { b } from "${up(a)}/${b}/witness495-cycle-b.js";\n\nexport const a = () => b;\n`,
		[`${b}/witness495-cycle-b.js`]: `import { a } from "${up(b)}/${a}/witness495-cycle-a.js";\n\nexport const b = () => a;\n`,
	};
}

/**
 * What the adopted map adds to the structure of the package: the architecture control and its witness, once the
 * copy carries dependency-cruiser and swc; why it is not verified when no witness can be written; nothing without
 * a map or without the analysers.
 */
export function architectureVerification({
	view,
	requirement_refs,
	node_binary,
	architecture_map: map,
}: CapabilityQuestion<NodeProject>):
	| { control: ControlDefinition; witness: WitnessFiles }
	| { short_of: string }
	| null {
	if (map === undefined || !analysersInstalledIn(view)) return null;
	const witness = architectureNegativeWitness(map);
	if (Object.keys(witness).length === 0)
		return {
			short_of:
				"the adopted architecture map is not verified: it names fewer than two folders, so no dependency it forbids can be written as a witness",
		};
	return {
		control: {
			...baseControl(requirement_refs),
			control_id: "architecture",
			title: "the rules of the adopted architecture map, checked by dependency-cruiser",
			// Run from the copy's `node_modules`, never from the host's PATH, with the rules the runner writes outside
			// the copy: no `.dependency-cruiser.*` of the package is read, and no known violation is ignored.
			command: [
				node_binary,
				"node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
				"--config",
				RULESET_PLACEHOLDER,
				...(view.exists("tsconfig.json") ? ["--ts-config", "tsconfig.json"] : []),
				"--output-type",
				"json",
				"--output-to",
				REPORT_PATH,
				".",
			],
			timeout_ms: 10 * 60_000,
			parser: "dependency-cruiser-json",
			report_path: REPORT_PATH,
			architecture_map: map,
			provides: [],
			writable_paths: [REPORT_PATH],
			protected_paths: ["package.json", "node_modules/"],
		},
		witness,
	};
}
