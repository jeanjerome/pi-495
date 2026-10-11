import { strict as assert } from "node:assert";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { gitCmd, removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-control-git-signature-", cleanups);
});

describe("a control runs git without the host's global or system configuration", () => {
	it("sous un hôte qui signe ses commits avec une clé absente, un contrôle commite dans un dépôt de sa copie et son évidence est PASS", async () => {
		const home = join(root, "home");
		writeFiles(home, {
			".gitconfig": [
				"[user]",
				"\tname = host",
				"\temail = host@example.invalid",
				`\tsigningkey = ${join(home, ".ssh", "absent_ed25519.pub")}`,
				"[gpg]",
				"\tformat = ssh",
				"[commit]",
				"\tgpgsign = true",
				"",
			].join("\n"),
		});
		const ws = join(root, "ws");
		writeFiles(ws, { "repo/README": "a repository of the copy\n" });
		gitCmd(join(ws, "repo"), ["-c", "init.defaultBranch=main", "init", "-q"]);
		const runner = new GenericControlRunner(
			new UnconfinedSandbox(),
			new CasObjectStore(join(root, "objects")),
			READERS_OF_495,
		);

		const { evidence, observation } = await runner.runControl({
			...invocationBase(),
			control: controlOf({
				command: [
					"git",
					"-c",
					"user.name=control",
					"-c",
					"user.email=control@example.invalid",
					"commit",
					"--allow-empty",
					"-q",
					"-m",
					"a commit of the control",
				],
				cwd: "repo",
				env: { HOME: home },
			}),
			workspace_path: ws,
		});

		assert.equal(evidence.verdict, "PASS", new TextDecoder().decode(observation?.stderr));
		assert.doesNotMatch(
			gitCmd(join(ws, "repo"), ["cat-file", "commit", "HEAD"]),
			/^gpgsig /m,
			"the commit is unsigned",
		);
	});
});
