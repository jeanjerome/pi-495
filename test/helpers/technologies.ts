/** The technologies of 495 as the extension hands them to the kernel, and the readers it hands the runner. */
import { readersOf } from "../../src/adapters/execution/common-readers.ts";
import { registryOf, STACKS_OF_495 } from "../../src/extension/runtime.ts";

export { registryOf, STACKS_OF_495 };

export const READERS_OF_495 = readersOf(STACKS_OF_495.technologies);

/**
 * The technologies of 495 where the Node technology reads no structure of its targets: no architecture map is
 * proposed for a Node project, and a requirement about its architecture stays a blind spot no control measures.
 */
export const STACKS_WITHOUT_NODE_STRUCTURE = STACKS_OF_495.technologies.map((technology) => {
	if (technology.id !== "node") return technology;
	const { structure: _structure, ...capabilities } = technology.capabilities;
	return { ...technology, capabilities };
});
