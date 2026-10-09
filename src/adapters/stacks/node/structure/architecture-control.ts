/**
 * The verification of an adopted architecture map on a Node package (`specs/adr/D-87`): once dependency-cruiser
 * 18.5.0 and its swc parser are installed in the copy, the control that runs the rules of the map with the
 * network closed, and the witness that carries a dependency the map forbids.
 */
import type { ArchitectureOffer, CapabilityQuestion, WitnessFiles } from "../../../../application/stacks/plugin.ts";
import { baseControl } from "../../../../application/stacks/stack.ts";
import {
	type ArchitectureMap,
	type ControlDefinition,
	type RecommendedComplement,
	RULESET_PLACEHOLDER,
} from "../../../../contracts/v1/protocol.ts";
import type { NodeProject } from "../project/node-project.ts";
import { REPORT_DIRECTORY } from "../shared.ts";
import { analysersInstalledIn, DEPENDENCIES_ANALYSER, MAP_ANALYSERS, type MapAnalyser } from "./map-analysers.ts";
import { MAP_VERIFICATION_UNSEEN } from "./map-verification-unseen.ts";

/** The date the analyser of the map and its parser were checked against the packages they cite. */
const MAP_ANALYSERS_DATE = "2026-10-08";
/** The date the analyser of the dependencies was checked against the package it cites. */
const DEPENDENCIES_ANALYSER_DATE = "2026-10-09";

/**
 * The verification of the adopted map offered on a package: dependency-cruiser, and the swc parser it reads
 * TypeScript with, and Knip, which compares the dependencies `package.json` declares to those the code uses, all
 * installed by npm in a copy in one step as exact development dependencies, with what they do not see.
 */
export function cruiserOffer(): ArchitectureOffer {
	const complement = (p: MapAnalyser, establishedOn: string): RecommendedComplement => ({
		test_type: "architecture",
		tool: p.package,
		version: p.version,
		established_on: establishedOn,
		source: `www.npmjs.com/package/${p.package}/v/${p.version}`,
		change: `in a copy, install ${p.package} ${p.version} as an exact devDependency, running no install script`,
		install: { package: p.package, version: p.version, manager: "npm" },
	});
	const [analyser, ...parsers] = MAP_ANALYSERS;
	return {
		kind: "proposed",
		recommendation: complement(analyser, MAP_ANALYSERS_DATE),
		brought_with: [
			...parsers.map((parser) => complement(parser, MAP_ANALYSERS_DATE)),
			complement(DEPENDENCIES_ANALYSER, DEPENDENCIES_ANALYSER_DATE),
		],
		unseen: [...MAP_VERIFICATION_UNSEEN],
	};
}

/** Where dependency-cruiser writes the JSON the architecture control reads. */
const REPORT_PATH = `${REPORT_DIRECTORY}/495-dependency-cruiser.json`;

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
	if (map === undefined || !analysersInstalledIn(view, MAP_ANALYSERS)) return null;
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
