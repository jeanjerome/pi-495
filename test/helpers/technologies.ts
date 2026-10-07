/** The technologies of 495 as the extension hands them to the kernel, and the readers it hands the runner. */
import { readersOf } from "../../src/adapters/execution/common-readers.ts";
import { STACKS_OF_495 } from "../../src/extension/runtime.ts";

export { STACKS_OF_495 };

export const READERS_OF_495 = readersOf(STACKS_OF_495);
