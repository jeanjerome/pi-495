import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = realpathSync(outputDir("writable-directory-", cleanups));
});

const runner = () =>
	new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")), READERS_OF_495);

const run = (control: ControlDefinition, copy: string) =>
	runner().runControl({ ...invocationBase(), control, workspace_path: copy });

describe("the directory a control is given to write in its copy", () => {
	it("un contrôle qui écrit un fichier directement dans test-output/, absent de la copie, le trouve créé par le contrôleur et son évidence est PASS", async () => {
		const copy = join(root, "copy");
		mkdirSync(copy);
		const { evidence } = await run(
			controlOf({
				command: [process.execPath, "-e", "require('node:fs').writeFileSync('test-output/f', 'written')"],
				writable_paths: ["test-output/"],
			}),
			copy,
		);
		assert.equal(
			existsSync(join(copy, "test-output", "f")) ? readFileSync(join(copy, "test-output", "f"), "utf8") : null,
			"written",
			"the file is written in test-output/, which the controller created",
		);
		assert.equal(evidence.verdict, "PASS", JSON.stringify(evidence.limits.notes));
	});

	it("un lien posé sur le chemin inscriptible ou sur un dossier qui y mène, vers la copie, vers src, hors de la copie ou vers un chemin absent, fait refuser le contrôle : aucune commande ne tourne, ran n'existe pas, rien n'est créé hors de la copie, et l'évidence est INDETERMINATE avec une note qui nomme le chemin et le lien", async () => {
		const writesRan = [process.execPath, "-e", "require('node:fs').writeFileSync('ran', '')"];
		const cases = [
			{ name: "test-output -> .", writable: "test-output/", link: "test-output", target: "." },
			{ name: "test-output -> src", writable: "test-output/", link: "test-output", target: "src" },
			{ name: "test-output -> outside", writable: "test-output/", link: "test-output", target: "../outside" },
			{ name: "test-output -> absent", writable: "test-output/", link: "test-output", target: "gone/out" },
			{ name: "out -> . under out/test-output/", writable: "out/test-output/", link: "out", target: "." },
		];
		const observed = [];
		for (const [index, given] of cases.entries()) {
			const copy = join(root, `copy-${index}`);
			mkdirSync(join(copy, "src"), { recursive: true });
			mkdirSync(join(root, "outside"), { recursive: true });
			symlinkSync(given.target, join(copy, given.link));
			const before = readdirSync(copy).sort();
			const { evidence, observation } = await run(
				controlOf({ command: writesRan, writable_paths: [given.writable] }),
				copy,
			);
			const path = given.writable.replace(/\/$/, "");
			observed.push({
				case: given.name,
				process: observation !== null,
				ran: existsSync(join(copy, "ran")),
				created: readdirSync(copy)
					.sort()
					.filter((entry) => !before.includes(entry)),
				outside: readdirSync(join(root, "outside")),
				absent: existsSync(join(copy, "gone")),
				verdict: evidence.verdict,
				findings: evidence.findings,
				named: evidence.limits.notes.some((note) => note.includes(path) && note.includes(`${given.link} is a link`)),
			});
		}
		assert.deepEqual(
			observed,
			cases.map((given) => ({
				case: given.name,
				process: false,
				ran: false,
				created: [],
				outside: [],
				absent: false,
				verdict: "INDETERMINATE",
				findings: [],
				named: true,
			})),
		);
	});

	it("un fichier ordinaire posé à la place de test-output/ fait refuser le contrôle : aucune commande ne tourne, ran n'existe pas, et l'évidence est INDETERMINATE avec une note qui nomme le chemin et le fichier", async () => {
		const copy = join(root, "copy");
		mkdirSync(copy);
		writeFileSync(join(copy, "test-output"), "a file of the candidate");
		const { evidence, observation } = await run(
			controlOf({
				command: [process.execPath, "-e", "require('node:fs').writeFileSync('ran', '')"],
				writable_paths: ["test-output/"],
			}),
			copy,
		);
		assert.deepEqual(
			{
				process: observation !== null,
				ran: existsSync(join(copy, "ran")),
				verdict: evidence.verdict,
				findings: evidence.findings,
				named: evidence.limits.notes.some((note) => note.includes("test-output is a file")),
			},
			{ process: false, ran: false, verdict: "INDETERMINATE", findings: [], named: true },
			JSON.stringify(evidence.limits.notes),
		);
		assert.equal(
			readFileSync(join(copy, "test-output"), "utf8"),
			"a file of the candidate",
			"the file is left as it is",
		);
	});
});
