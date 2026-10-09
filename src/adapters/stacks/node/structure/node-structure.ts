/**
 * The structure of a Node package (ARC-01, `specs/adr/D-87`): the folders of its main sources, which an
 * architecture map divides into parts, the control that verifies the map the owner adopted, and the one that
 * compares the dependencies `package.json` declares to those the code uses. A package lays out no modules whose
 * dependency direction could be opposed to a change, so nothing is checked on it but what the adopted map brings.
 */
import type { StructureCapability } from "../../../../application/stacks/plugin.ts";
import type { NodeProject } from "../project/node-project.ts";
import { architectureVerification, cruisedIn, cruiserOffer, UNCRUISED } from "./architecture-control.ts";
import { dependenciesVerification } from "./dependencies-control.ts";
import { sourceFolders } from "./source-folders.ts";

export const NODE_STRUCTURE: StructureCapability<NodeProject> = {
	offer: (question) => {
		const verification = architectureVerification(question);
		if (verification === null) return { kind: "missing", reason: "the node technology does not offer it" };
		if ("short_of" in verification) return { kind: "missing", reason: verification.short_of };
		const dependencies = dependenciesVerification(question);
		return {
			kind: "available",
			controls: dependencies === null ? [verification.control] : [verification.control, dependencies.control],
			// A failing test proves nothing about the map, nor about the manifest: each tree that carries a defect
			// imports what the map forbids, or what `package.json` does not declare.
			own_negative_witness: {
				architecture: verification.witness,
				...(dependencies === null ? {} : { dependencies: dependencies.witness }),
			},
		};
	},
	packages: ({ view }) => sourceFolders(view),
	architecture: ({ view, architecture_map }) => {
		if (architecture_map === undefined) return undefined;
		return cruisedIn(view, architecture_map) ? cruiserOffer() : { kind: "not_proposed", note: UNCRUISED };
	},
};
