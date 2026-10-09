/**
 * The readers of the report formats no single technology owns — an exit code, JUnit XML, the output of the
 * TLC model checker — which the runner reads beside the readers each technology brings.
 */
import type { StackPlugin } from "../../application/stacks/plugin.ts";
import type { ReportReader } from "../../ports/execution.ts";
import { TLC_READER } from "../formal/tlc.ts";
import { EXIT_CODE_READER, JUNIT_READER } from "./parsers.ts";

const COMMON_READERS: readonly ReportReader[] = [EXIT_CODE_READER, JUNIT_READER, TLC_READER];

/** The readers a runner reads the controls of these technologies through: the common ones, then each one's own. */
export function readersOf(stacks: readonly Pick<StackPlugin<unknown>, "readers">[]): ReportReader[] {
	return [...COMMON_READERS, ...stacks.flatMap((stack) => stack.readers)];
}
