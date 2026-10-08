/**
 * The structure of a Node package (ARC-01, `specs/adr/D-87`): the folders of its main sources, which an
 * architecture map divides into parts, and the control that verifies the map the owner adopted. A package lays
 * out no modules whose dependency direction could be opposed to a change, so nothing is checked on it but that
 * map.
 */
import type { StructureCapability } from "../../../../application/stacks/plugin.ts";
import type { NodeProject } from "../project/node-project.ts";
import { architectureVerification, cruiserOffer } from "./architecture-control.ts";
import { sourceFolders } from "./source-folders.ts";

export const NODE_STRUCTURE: StructureCapability<NodeProject> = {
	offer: (question) => {
		const verification = architectureVerification(question);
		if (verification === null) return { kind: "missing", reason: "the node technology does not offer it" };
		if ("short_of" in verification) return { kind: "missing", reason: verification.short_of };
		return {
			kind: "available",
			controls: [verification.control],
			// A failing test proves nothing about the map: the tree that carries this defect imports what it forbids.
			own_negative_witness: { architecture: verification.witness },
		};
	},
	packages: ({ view }) => sourceFolders(view),
	architecture: ({ architecture_map }) => (architecture_map === undefined ? undefined : cruiserOffer()),
};
