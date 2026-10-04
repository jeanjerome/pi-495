/**
 * The git operations the cycle needs, and nothing more: where a branch stands, which commits it
 * carries and what each touched, a detached tree at one commit to replay a red in, and the one
 * squashed commit a branch lands as.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Commit {
	sha: string;
	sujet: string;
	fichiers: string[];
}

export function git(cwd: string, args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function revision(cwd: string, ref = "HEAD"): string {
	return git(cwd, ["rev-parse", ref]);
}

export function brancheCourante(cwd: string): string {
	return git(cwd, ["branch", "--show-current"]);
}

/** The commit the branch forked from `cible` at. */
export function baseDe(cwd: string, cible: string): string {
	return git(cwd, ["merge-base", cible, "HEAD"]);
}

export function arbrePropre(cwd: string): boolean {
	return git(cwd, ["status", "--porcelain"]) === "";
}

/** The commits `base..HEAD`, oldest first, each with the paths it changed. */
export function commitsEntre(cwd: string, base: string): Commit[] {
	const out = git(cwd, ["log", "--reverse", "--format=%H%x00%s", "--name-only", `${base}..HEAD`]);
	if (out === "") return [];
	const commits: Commit[] = [];
	for (const line of out.split("\n")) {
		if (line.includes("\0")) {
			const [sha, sujet] = line.split("\0") as [string, string];
			commits.push({ sha, sujet, fichiers: [] });
		} else if (line !== "") commits.at(-1)?.fichiers.push(line);
	}
	return commits;
}

/** A commit is test-only when every path it touches is under `test/`. */
export function estCommitDeTestSeul(commit: Commit): boolean {
	return commit.fichiers.length > 0 && commit.fichiers.every((f) => f.startsWith("test/"));
}

export function fichiersChanges(cwd: string, base: string): string[] {
	const out = git(cwd, ["diff", "--name-only", `${base}...HEAD`]);
	return out === "" ? [] : out.split("\n");
}

/** A detached worktree at `sha`, with the repository's `node_modules` linked so the suite can run. */
export function arbreDetache(cwd: string, sha: string): string {
	const path = mkdtempSync(join(tmpdir(), "cycle-arbre-"));
	git(cwd, ["worktree", "add", "-q", "--detach", path, sha]);
	execFileSync("ln", ["-s", join(cwd, "node_modules"), join(path, "node_modules")]);
	return path;
}

export function retirerArbre(cwd: string, path: string): void {
	git(cwd, ["worktree", "remove", "--force", path]);
}

/** Stages `chemins` and commits them with `message`. */
export function commiter(cwd: string, message: string, chemins: string[]): void {
	git(cwd, ["add", "--", ...chemins]);
	git(cwd, ["commit", "-q", "-m", message]);
}

/** Lands `branche` on `cible` as one squashed commit carrying `message`; the branch is kept. */
export function versementEcrase(cwd: string, branche: string, cible: string, message: string): string {
	git(cwd, ["checkout", "-q", cible]);
	git(cwd, ["merge", "--squash", "-q", branche]);
	git(cwd, ["commit", "-q", "-m", message]);
	return revision(cwd);
}
