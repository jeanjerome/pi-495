/**
 * The readers of the report formats no single technology owns — an exit code, JUnit XML, the output of the
 * TLC model checker, the report of an acceptance run — which the runner reads beside the readers each technology brings.
 */
import type { StackPlugin } from "../../application/stacks/plugin.ts";
import type { ReportReader } from "../../ports/execution.ts";
import { TLC_READER } from "../formal/tlc.ts";
import { ACCEPTANCE_RECIPE_READER } from "./acceptance-recipe.ts";
import { EXIT_CODE_READER, JUNIT_READER } from "./parsers.ts";

const COMMON_READERS: readonly ReportReader[] = [EXIT_CODE_READER, JUNIT_READER, TLC_READER, ACCEPTANCE_RECIPE_READER];

/** The readers a runner reads the controls of these technologies through: the common ones, then each one's own. */
export function readersOf(stacks: readonly Pick<StackPlugin<unknown>, "readers">[]): ReportReader[] {
	return [...COMMON_READERS, ...stacks.flatMap((stack) => stack.readers)];
}
