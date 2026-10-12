import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { SeatbeltSandbox } from "../../src/adapters/sandbox/backends.ts";
import { darwinOnly, outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = realpathSync(outputDir("unconfined-control-", cleanups));
});

// No temporary directory is granted: the test tree may itself live under $TMPDIR, where a write would
// succeed whatever the control declares.
const runner = () =>
	new GenericControlRunner(
		new SeatbeltSandbox({ temp_paths: [] }),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);

describe("a control the owner declares unconfined", darwinOnly, () => {
	it("le contrôle déclaré hors confinement écrit hors de sa copie et applique son propre profil Seatbelt : l'évidence est PASS, sandbox vaut unconfined et une note dit qu'il a tourné hors confinement sur décision du propriétaire ; sans la déclaration, la même commande ne l'écrit pas, l'évidence est FAIL et sandbox vaut seatbelt", async () => {
		const outside = (name: string) => join(root, `${name}.txt`);
		const commandWriting = (name: string) => [
			"/bin/sh",
			"-c",
			`echo written > '${outside(name)}' && /usr/bin/sandbox-exec -p '(version 1)(allow default)' /usr/bin/true`,
		];
		const run = async (name: string, unconfined: boolean) => {
			const copy = join(root, `copy-${name}`);
			mkdirSync(copy);
			return (
				await runner().runControl({
					...invocationBase(),
					control: { ...controlOf({ command: commandWriting(name) }), ...(unconfined ? { unconfined: true } : {}) },
					workspace_path: copy,
				})
			).evidence;
		};

		const declared = await run("declared", true);
		assert.equal(existsSync(outside("declared")), true, "the declared control writes outside its copy");
		assert.equal(declared.verdict, "PASS", JSON.stringify(declared.limits.notes));
		assert.equal(declared.facts.sandbox, "unconfined");
		assert.ok(
			declared.limits.notes.includes("ran outside confinement, by the owner's decision"),
			JSON.stringify(declared.limits.notes),
		);

		const confined = await run("confined", false);
		assert.equal(existsSync(outside("confined")), false, "the same command, not declared, cannot write there");
		assert.equal(confined.verdict, "FAIL", JSON.stringify(confined.limits.notes));
		assert.equal(confined.facts.sandbox, "seatbelt");
		assert.ok(!confined.limits.notes.includes("ran outside confinement, by the owner's decision"));
	});
});
