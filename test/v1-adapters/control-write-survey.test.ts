import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { isAbsolute, join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { SeatbeltSandbox, selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import type { ControlInvocation } from "../../src/ports/execution.ts";
import { darwinOnly, outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("control-survey-", cleanups);
});

/**
 * The platform's confinement, Seatbelt or bubblewrap, with no temporary directory granted: the test tree may lie under
 * it.
 */
const platform = selectSandbox({ allow_unconfined: false, temp_paths: [] });
const confined = { skip: !platform.qualification.qualified && platform.qualification.reasons.join("; ") };

/** The paths the evidence of a surveyed control says it wrote. */
function writtenOf(facts: Record<string, unknown>): unknown {
	return facts.written;
}

describe("the survey of a control's writes", () => {
	it(
		"le relevé d'un contrôle sous le confinement de la plateforme rend test-output/run/a et src/a.txt relatifs à la copie, aucun chemin hors d'elle, et rien n'est écrit dans le dossier voisin, ni directement ni par le lien",
		confined,
		async () => {
			const copy = join(root, "copy");
			mkdirSync(join(copy, "src"), { recursive: true });
			writeFileSync(join(copy, "src", "a.txt"), "before");
			const beside = join(root, "beside");
			mkdirSync(beside);
			symlinkSync(beside, join(copy, "out"));
			const writes = [
				"const fs = require('fs');",
				"try { fs.mkdirSync('test-output/run', { recursive: true }); fs.writeFileSync('test-output/run/a', '1') } catch {}",
				"try { fs.writeFileSync('src/a.txt', 'after') } catch {}",
				"try { fs.writeFileSync(process.argv[1], 'x') } catch {}",
				"try { fs.writeFileSync('out/through-link.txt', 'x') } catch {}",
			].join("\n");
			const runner = new GenericControlRunner(
				platform.backend,
				new CasObjectStore(join(root, "objects")),
				READERS_OF_495,
			);
			const invocation: ControlInvocation = {
				...invocationBase(),
				control: controlOf({ command: [process.execPath, "-e", writes, join(beside, "direct.txt")] }),
				workspace_path: copy,
			};
			const surveyed = { ...invocation, survey_writes: true };
			const { evidence } = await runner.runControl(surveyed);
			const written = writtenOf(evidence.facts);
			assert.ok(Array.isArray(written), `the evidence carries no written paths: ${JSON.stringify(evidence.facts)}`);
			assert.ok(written.includes("test-output/run/a"), JSON.stringify(written));
			assert.ok(written.includes("src/a.txt"), JSON.stringify(written));
			assert.ok(
				written.every((p: unknown) => typeof p === "string" && !isAbsolute(p) && !p.startsWith("..")),
				JSON.stringify(written),
			);
			assert.deepEqual(readdirSync(beside), []);
		},
	);

	it(
		"sous Seatbelt, le relevé d'un contrôle qui crée tmp-run/x puis efface tmp-run rend tmp-run/x",
		darwinOnly,
		async () => {
			const copy = join(root, "copy");
			mkdirSync(copy);
			const writes = [
				"const fs = require('fs');",
				"fs.mkdirSync('tmp-run'); fs.writeFileSync('tmp-run/x', '1');",
				"try { fs.rmSync('tmp-run', { recursive: true, force: true }) } catch {}",
			].join("\n");
			const runner = new GenericControlRunner(
				new SeatbeltSandbox({ temp_paths: [] }),
				new CasObjectStore(join(root, "objects")),
				READERS_OF_495,
			);
			const invocation: ControlInvocation = {
				...invocationBase(),
				control: controlOf({ command: [process.execPath, "-e", writes] }),
				workspace_path: copy,
			};
			const { evidence } = await runner.runControl({ ...invocation, survey_writes: true });
			const written = writtenOf(evidence.facts);
			assert.ok(
				Array.isArray(written) && written.includes("tmp-run/x"),
				`written: ${JSON.stringify(written)}; ${JSON.stringify(evidence.facts)}`,
			);
		},
	);

	it(
		"sous Seatbelt, le relevé d'un contrôle ne lui laisse dans la copie que créer et écrire des fichiers : changer les modes, les drapeaux, le propriétaire, les attributs étendus ou les ACL d'un fichier lui est refusé, même sous un temporaire, et la copie se supprime ensuite",
		darwinOnly,
		async () => {
			const copy = join(root, "copy");
			const changes = ["mode", "flags", "append", "owner", "xattr", "acl"];
			mkdirSync(join(copy, "src"), { recursive: true });
			for (const name of changes) writeFileSync(join(copy, "src", `${name}.txt`), "before");
			// Each change of metadata the run tries on a file of the copy, on a file it creates and on the directory it
			// creates for it, each target its own so that no change stands in the way of another; those the kernel lets
			// through are printed.
			const attempts = [
				"const fs = require('fs'); const { execFileSync } = require('child_process');",
				"const other = process.getgroups().find((g) => g !== process.getgid()) ?? process.getgid();",
				"const changes = {",
				"  mode: (f) => fs.chmodSync(f, 0o400),",
				"  flags: (f) => execFileSync('/usr/bin/chflags', ['uchg', f], { stdio: 'ignore' }),",
				"  append: (f) => execFileSync('/usr/bin/chflags', ['uappnd', f], { stdio: 'ignore' }),",
				"  owner: (f) => fs.chownSync(f, process.getuid(), other),",
				"  xattr: (f) => execFileSync('/usr/bin/xattr', ['-w', 'com.example.survey', 'v', f], { stdio: 'ignore' }),",
				"  acl: (f) => execFileSync('/bin/chmod', ['+a', 'everyone deny delete', f], { stdio: 'ignore' }),",
				"};",
				"const allowed = [];",
				"for (const [name, change] of Object.entries(changes)) {",
				"  fs.writeFileSync(`src/${name}.txt`, 'after'); fs.mkdirSync(`made-${name}`); fs.writeFileSync(`made-${name}/f`, '1');",
				"  for (const f of [`src/${name}.txt`, `made-${name}/f`, `made-${name}`]) try { change(f); allowed.push(f) } catch {}",
				"}",
				"console.log(JSON.stringify(allowed));",
			].join("\n");
			// The copy lies under a temporary path the sandbox grants, as a copy may in use.
			const runner = new GenericControlRunner(
				new SeatbeltSandbox({ temp_paths: [root] }),
				new CasObjectStore(join(root, "objects")),
				READERS_OF_495,
			);
			const invocation: ControlInvocation = {
				...invocationBase(),
				control: controlOf({ command: [process.execPath, "-e", attempts] }),
				workspace_path: copy,
			};
			try {
				const { evidence, observation } = await runner.runControl({ ...invocation, survey_writes: true });
				assert.deepEqual(JSON.parse(new TextDecoder().decode(observation?.stdout)), []);
				const written = writtenOf(evidence.facts);
				assert.ok(
					Array.isArray(written) && changes.every((name) => written.includes(`made-${name}/f`)),
					JSON.stringify(written),
				);
				rmSync(copy, { recursive: true });
				assert.equal(existsSync(copy), false);
			} finally {
				// What the run changed is undone so that the test tree can be removed.
				for (const command of [
					["/usr/bin/chflags", "-R", "0", copy],
					["/bin/chmod", "-R", "-N", copy],
					["/bin/chmod", "-R", "u+rwx", copy],
				])
					spawnSync(command[0] ?? "", command.slice(1), { stdio: "ignore" });
			}
		},
	);

	it("le relevé d'un contrôle ne rend pas ce qu'il écrit sous un chemin qui lui est déjà donné", confined, async () => {
		const copy = join(root, "copy");
		mkdirSync(copy);
		const writes = [
			"const fs = require('fs');",
			"fs.mkdirSync('reports', { recursive: true }); fs.writeFileSync('reports/r.xml', '1');",
			"fs.mkdirSync('test-output'); fs.writeFileSync('test-output/a', '1');",
		].join("\n");
		const runner = new GenericControlRunner(
			platform.backend,
			new CasObjectStore(join(root, "objects")),
			READERS_OF_495,
		);
		const invocation: ControlInvocation = {
			...invocationBase(),
			control: controlOf({ command: [process.execPath, "-e", writes], writable_paths: ["reports/"] }),
			workspace_path: copy,
		};
		const { evidence } = await runner.runControl({ ...invocation, survey_writes: true });
		assert.deepEqual(writtenOf(evidence.facts), ["test-output", "test-output/a"]);
	});

	it(
		"le relevé d'un contrôle liste sa copie sans suivre ses liens : un fichier écrit par un lien vers un dossier que le contrôle peut écrire n'est pas rendu",
		confined,
		async () => {
			const copy = join(root, "copy");
			mkdirSync(copy);
			const beside = join(root, "beside");
			mkdirSync(beside);
			symlinkSync(beside, join(copy, "out"));
			// The directory beside the copy is a temporary path of the sandbox, so the write through the link lands there.
			const runner = new GenericControlRunner(
				selectSandbox({ allow_unconfined: false, temp_paths: [beside] }).backend,
				new CasObjectStore(join(root, "objects")),
				READERS_OF_495,
			);
			const invocation: ControlInvocation = {
				...invocationBase(),
				control: controlOf({
					command: [process.execPath, "-e", "require('fs').writeFileSync('out/through-link.txt', 'x')"],
				}),
				workspace_path: copy,
			};
			const { evidence } = await runner.runControl({ ...invocation, survey_writes: true });
			assert.deepEqual(readdirSync(beside), ["through-link.txt"], JSON.stringify(evidence.facts));
			assert.deepEqual(writtenOf(evidence.facts), []);
		},
	);

	it(
		"après le relevé d'un contrôle sous le confinement de la plateforme, un processus qu'il a détaché n'écrit plus dans la copie, ni par son répertoire, ni par un chemin absolu, ni par celui de la copie, et ne recrée ni la copie une fois supprimée, ni le chemin sous lequel elle a été relevée",
		confined,
		async () => {
			const copy = join(root, "copy");
			mkdirSync(copy);
			const marker = `survey-orphan-${randomUUID()}`;
			// Waits for the process that started it to end with the surveyed run, then tries for four seconds every write a
			// process of the run could still hold, the path the run was given included, which it is handed rather than
			// reading its own directory once the copy may have taken its name back.
			const orphan = [
				"const fs = require('fs');",
				"const [here, original, parent, surveyed] = [process.cwd(), process.argv[1], Number(process.argv[2]), process.argv[4]];",
				"const attempts = [",
				"  () => fs.writeFileSync('late-relative', '1'),",
				"  () => fs.writeFileSync(here + '/late-absolute', '1'),",
				"  () => fs.writeFileSync(original + '/late-original', '1'),",
				"  () => { fs.mkdirSync(here, { recursive: true }); fs.writeFileSync(here + '/late-recreated', '1') },",
				"  () => { fs.mkdirSync(original, { recursive: true }); fs.writeFileSync(original + '/late-recreated', '1') },",
				"  () => { fs.mkdirSync(surveyed, { recursive: true }); fs.writeFileSync(surveyed + '/late-recreated', '1') },",
				"];",
				"const end = Date.now() + 4000;",
				"const tick = () => { for (const a of attempts) try { a() } catch {} if (Date.now() < end) setTimeout(tick, 50) };",
				"const awaitEnd = () => (process.ppid === parent ? setTimeout(awaitEnd, 20) : setTimeout(tick, 300));",
				"awaitEnd();",
			].join("\n");
			const detaches = [
				"const { spawn } = require('child_process');",
				`const child = spawn(process.execPath, ['-e', ${JSON.stringify(orphan)}, process.argv[1], String(process.pid), ${JSON.stringify(marker)}, process.cwd()], { detached: true, stdio: 'ignore' });`,
				"child.unref();",
				"console.log(JSON.stringify({ pid: child.pid, cwd: process.cwd() }));",
			].join("\n");
			const runner = new GenericControlRunner(
				platform.backend,
				new CasObjectStore(join(root, "objects")),
				READERS_OF_495,
			);
			const invocation: ControlInvocation = {
				...invocationBase(),
				control: controlOf({ command: [process.execPath, "-e", detaches, copy] }),
				workspace_path: copy,
			};
			const { observation } = await runner.runControl({ ...invocation, survey_writes: true });
			const started = JSON.parse(new TextDecoder().decode(observation?.stdout)) as { pid: number; cwd: string };
			try {
				await sleep(1000);
				assert.deepEqual(
					readdirSync(copy).filter((name) => name.startsWith("late-")),
					[],
					"a process of the run wrote in the copy after its survey",
				);
				rmSync(copy, { recursive: true, force: true });
				await sleep(1000);
				assert.equal(existsSync(copy), false, "a process of the run recreated the copy after its deletion");
				assert.equal(existsSync(started.cwd), false, "a process of the run recreated where it was run");
			} finally {
				// Under bubblewrap the pid is the one the run's own namespace gave, which names no process here.
				const alive =
					process.platform === "darwin" &&
					execFileSync("ps", ["-Ao", "pid=,command="], { encoding: "utf8" })
						.split("\n")
						.some((line) => line.trim().startsWith(`${started.pid} `) && line.includes(marker));
				if (alive) process.kill(started.pid, "SIGKILL");
			}
		},
	);
});
