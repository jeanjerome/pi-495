/**
 * The skills 495 bundles (`specs/adr/D-87`): each a SKILL.md in the Agent Skills format that Pi loads, shipped
 * in the package beside the build and handed to an intervention through the resource loader of Pi. A skill
 * of the analysed project is never loaded: it would be an instruction coming from the tree (`D-11`).
 */
import { fileURLToPath } from "node:url";
import type { ContextSkill } from "../ports/execution.ts";

/** A skill 495 bundles: what the manifest of a context names, and the SKILL.md file that carries it. */
export interface BundledSkill extends ContextSkill {
	file: string;
}

/**
 * The identification skill an intervention proposing the architecture map of a target receives. Its path is
 * read from this module's place, which is the same in `src/` and in the build, both one directory below
 * the root of the package.
 */
export const ARCHITECTURE_MAP_SKILL: BundledSkill = {
	name: "architecture-map",
	file: fileURLToPath(new URL("../../skills/architecture-map/SKILL.md", import.meta.url)),
	adapted_on: "2026-10-08",
	sources: [
		{
			repository: "github/awesome-copilot",
			skill: "architecture-blueprint-generator",
			commit: "caab1f62",
			committed_on: "2026-02-24",
			license: "MIT",
		},
		{
			repository: "sirius-zuo/design-pattern-skill",
			skill: "design-pattern-review",
			commit: "66d78158",
			committed_on: "2026-05-15",
			license: "MIT",
		},
	],
};

/** The skill an intervention recommending what to do with the architecture of a target receives, read from the same place. */
export const ARCHITECTURE_RECOMMENDATION_SKILL: BundledSkill = {
	name: "architecture-recommendation",
	file: fileURLToPath(new URL("../../skills/architecture-recommendation/SKILL.md", import.meta.url)),
	adapted_on: "2026-10-09",
	sources: [
		{
			repository: "sirius-zuo/design-pattern-skill",
			skill: "design-pattern-review",
			commit: "66d78158",
			committed_on: "2026-05-15",
			license: "MIT",
		},
	],
};
