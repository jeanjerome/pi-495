/**
 * The readers of the report formats several technologies write — an exit code, JUnit XML, LCOV — which
 * the runner reads beside the readers each technology brings.
 */
import type { StackPlugin } from "../../application/stacks/plugin.ts";
import type { ReportReader } from "../../ports/execution.ts";
import { LCOV_READER } from "./lcov.ts";
import { EXIT_CODE_READER, JUNIT_READER } from "./parsers.ts";

const COMMON_READERS: readonly ReportReader[] = [EXIT_CODE_READER, JUNIT_READER, LCOV_READER];

/** The readers a runner reads the controls of these technologies through: the common ones, then each one's own. */
export function readersOf(stacks: readonly Pick<StackPlugin<unknown>, "readers">[]): ReportReader[] {
	return [...COMMON_READERS, ...stacks.flatMap((stack) => stack.readers)];
}
