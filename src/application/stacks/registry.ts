/**
 * The registry of the technologies (CMP-TGT), the one door the kernel asks a project through: it recognises
 * the technology of a copy without executing anything, and hands back what the common layer assembled from
 * its capabilities. A project no technology recognises is not a project without defects — it is named as a
 * missing capability, which is what G2 refuses on.
 */
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import type { FileEdit, InstalledPackage } from "../../contracts/v1/protocol.ts";
import type { ReaderTraits } from "../../domain/survey.ts";
import type { WorkspacePolicy } from "../../ports/execution.ts";
import { assembleDetection, undetected } from "./assembly.ts";
import type { InstallCapability, StackPlugin, TestLayout, ToolProbe, WorkspaceCapability } from "./plugin.ts";
import { type OpenProjectView, ProjectViewRefusal } from "./project-view.ts";
import type { DetectedTechnology } from "./stack.ts";

const NO_WORKSPACE: WorkspaceCapability = { outputs: [] };

/** The install capability of the technology that runs a package manager, and the directory that technology installs dependencies in. */
export interface Installer {
	readonly install: InstallCapability;
	readonly installed_dependencies: readonly string[];
}

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

	/** The tools whose version enters the identity of the environment, as every technology of the list declares them. */
	toolVersions(): Record<string, ToolProbe> {
		return Object.fromEntries(
			this.technologies.flatMap((technology) => Object.entries(technology.capabilities.workspace?.versions ?? {})),
		);
	}

	/**
	 * What the technology that recognises the project at `projectPath` puts into a copy that is not a change, and
	 * the variables its controls read; nothing when no technology recognises it, or when the view of the copy
	 * refuses a read.
	 */
	workspaceOf(projectPath: string): WorkspaceCapability {
		return this.#recognising(projectPath)?.capabilities.workspace ?? NO_WORKSPACE;
	}

	/**
	 * The directories every technology of the list installs dependencies in: each stays protected in every project,
	 * so a technology that declares none takes away no protection another gives.
	 */
	installedDependencies(): string[] {
		return [
			...new Set(
				this.technologies.flatMap((technology) => technology.capabilities.workspace?.installed_dependencies ?? []),
			),
		];
	}

	/**
	 * The policy a copy of the project at `projectPath` is taken under: the exclusions of `policy`, then the
	 * outputs its technology declares, and the directories every technology of the list installs dependencies in.
	 */
	copyPolicyOf(projectPath: string, policy: WorkspacePolicy): WorkspacePolicy {
		return {
			...policy,
			exclusions: [...new Set([...policy.exclusions, ...this.workspaceOf(projectPath).outputs])],
			installed_dependencies: this.installedDependencies(),
		};
	}

	/** The technology of the list that runs the package manager `manager`, as its install capability declares it; null when none does. */
	installerOf(manager: string): Installer | null {
		const technology = this.technologies.find((t) => t.capabilities.install?.manager === manager);
		const install = technology?.capabilities.install;
		if (technology === undefined || install === undefined) return null;
		const installed = technology.capabilities.workspace?.installed_dependencies;
		return { install, installed_dependencies: installed === undefined ? [] : [installed] };
	}

	/**
	 * The rule a file edit recommended for the project at `projectPath` is applied by, as the technology that
	 * recognises it, and so recommends the edit, declares it; undefined when it declares none.
	 */
	editRuleOf(projectPath: string): ((text: string, edit: FileEdit) => string | null) | undefined {
		return this.#recognising(projectPath)?.capabilities.install?.edit;
	}

	/**
	 * What the technology that recognises the project at `projectPath` calls a test file and the production
	 * resource a test resource may carry; no file and no resource when no technology recognises it.
	 */
	testLayoutOf(projectPath: string): TestLayout {
		const tests = this.#recognising(projectPath)?.capabilities.tests;
		return {
			isTestFile: (path) => tests?.isTestFile(path) ?? false,
			mirroredResource: (path) => tests?.mirroredResource?.(path) ?? null,
		};
	}

	/** The first technology of the list that recognises the project at `projectPath`, or null when the view refuses a read. */
	#recognising(projectPath: string): StackPlugin<unknown> | null {
		const view = this.#openView(projectPath);
		try {
			return this.technologies.find((t) => t.recognise(view) !== null) ?? null;
		} catch (error) {
			if (!(error instanceof ProjectViewRefusal)) throw error;
			return null;
		}
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
