/**
 * Git runner of the workspace (CMP-WSP): one `git` invocation, without a terminal prompt and with the
 * C locale, so that what is parsed from its output does not depend on the user's environment.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function git(
	cwd: string,
	args: string[],
	allowFailure = false,
): Promise<{ stdout: string; stderr: string; code: number }> {
	try {
		const { stdout, stderr } = await execFileAsync("git", args, {
			cwd,
			maxBuffer: 64 * 1024 * 1024,
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
		});
		return { stdout, stderr, code: 0 };
	} catch (error) {
		const e = error as { stdout?: string; stderr?: string; code?: number };
		if (allowFailure)
			return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: typeof e.code === "number" ? e.code : 1 };
		throw error;
	}
}
