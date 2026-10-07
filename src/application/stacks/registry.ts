/**
 * The registry of the technologies (CMP-TGT), the one door the kernel asks a project through: it recognises
 * the technology of a copy without executing anything, and hands back what the common layer assembled from
 * its capabilities. A project no technology recognises is not a project without defects — it is named as a
 * missing capability, which is what G2 refuses on.
 */
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import type { InstalledPackage } from "../../contracts/v1/protocol.ts";
import type { ReaderTraits } from "../../domain/survey.ts";
import { assembleDetection, undetected } from "./assembly.ts";
import type { StackPlugin } from "./plugin.ts";
import { type OpenProjectView, ProjectViewRefusal } from "./project-view.ts";
import type { DetectedTechnology } from "./stack.ts";

/**
 * The technologies a project is recognised with, in the order they claim one, how a copy is opened to them,
 * and every reader their controls are read through.
 */
export class StackRegistry {
	readonly technologies: readonly StackPlugin<unknown>[];
	readonly #readers: readonly ReaderTraits[];
	readonly #openView: OpenProjectView;

	constructor(
		technologies: readonly StackPlugin<unknown>[],
		openView: OpenProjectView,
		readers: readonly ReaderTraits[],
	) {
		this.technologies = technologies;
		this.#readers = readers;
		this.#openView = openView;
	}

	/**
	 * The first technology of the list, in its order, that recognises the project at `projectPath`. A read the
	 * view of the copy refuses stops the recognition: the technology declares no control, and its blind spot
	 * names the path that was not read. `referentialPackages` are the packages the adopted install of the
	 * quality referential put in the copy, as its lock names them; empty anywhere else, so a manifest alone
	 * never stands for that install.
	 */
	recognise(
		projectPath: string,
		requirementRefs: RequirementRef[],
		nodeBinary = process.execPath,
		referentialPackages: readonly InstalledPackage[] = [],
	): DetectedTechnology {
		const view = this.#openView(projectPath);
		let stack = "unknown";
		try {
			for (const technology of this.technologies) {
				const model = technology.recognise(view);
				if (model === null) continue;
				stack = technology.id;
				const question = {
					model,
					view,
					requirement_refs: requirementRefs,
					node_binary: nodeBinary,
					referential_packages: referentialPackages,
				};
				return assembleDetection(technology, question, this.#readers);
			}
		} catch (error) {
			if (!(error instanceof ProjectViewRefusal)) throw error;
			return undetected(stack, error.message);
		}
		const expected = this.technologies.flatMap((t) => t.signal_files).join(" or ");
		return undetected("unknown", `no qualified target adapter for this project (${expected} expected)`);
	}
}
