import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GitWorkspace, DEFAULT_WORKSPACE_POLICY } from "../../src/adapters/workspace/git-workspace.ts";
import { readContent } from "../../src/application/review.ts";
import { submodulePathsChanged } from "../../src/domain/gates/g4.ts";
import type { AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { fixtureTs, gitCmd, initRepo, tempDir, writeFiles, removedAfterEach } from "../helpers/fixtures.ts";
import { makeHarness } from "../helpers/harness-fixture.ts";

let root: string;
let ws: GitWorkspace;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-special-", cleanups);
	ws = new GitWorkspace(join(root, "workspaces"));
});

/**
 * A clean project carrying `a.txt`, whatever `fill` writes, and the submodule `vendor/sub-lib`, checked
 * out at the returned commit.
 */
function projectWithSubmodule(fill: (project: string) => void = () => {}): { project: string; commit: string } {
	const library = join(root, "sub-lib");
	writeFiles(library, { "lib.txt": "library\n" });
	initRepo(library);
	const project = join(root, "project");
	fill(project);
	writeFiles(project, { "a.txt": "a\n" });
	initRepo(project);
	gitCmd(project, ["-c", "protocol.file.allow=always", "submodule", "add", "-q", library, "vendor/sub-lib"]);
	gitCmd(project, ["commit", "-qm", "add the library"]);
	return { project, commit: gitCmd(library, ["rev-parse", "HEAD"]).trim() };
}

describe("a special file the working copy cannot hold is not a deletion (§9.1, UX-10)", () => {
	it("un projet portant un tube nommé donne, sans action de l'agent, un candidat dont l'entrée pipe.fifo est special et unchanged et dont selected_paths est vide", async () => {
		const p = join(root, "project");
		writeFiles(p, { "a.txt": "a\n" });
		execFileSync("mkfifo", [join(p, "pipe.fifo")]);
		initRepo(p);
		const reference = await ws.captureReference(p, DEFAULT_WORKSPACE_POLICY);
		const handle = await ws.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);

		const candidate = await ws.snapshotCandidate(handle, reference, DEFAULT_WORKSPACE_POLICY);

		const pipe = candidate.entries.find((e) => e.path === "pipe.fifo");
		assert.deepEqual([pipe?.kind, pipe?.baseline_state], ["special", "unchanged"]);
		assert.deepEqual(candidate.selected_paths, []);
	});
});

describe("the Git plumbing below the root is not content of the project (§9.1)", () => {
	it("la référence d'un projet portant un sous-module n'a aucune entrée sous vendor/sub-lib/.git et sa copie de travail ne porte pas vendor/sub-lib/.git", async () => {
		const { project } = projectWithSubmodule();

		const reference = await ws.captureReference(project, DEFAULT_WORKSPACE_POLICY);
		const handle = await ws.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);

		assert.deepEqual(
			reference.entries.filter((e) => e.path === "vendor/sub-lib/.git" || e.path.startsWith("vendor/sub-lib/.git/")),
			[],
		);
		assert.equal(existsSync(join(handle.path, "vendor/sub-lib/.git")), false);
	});
	it("la référence d'un projet portant un dépôt imbriqué n'a aucune entrée sous nested/.git", async () => {
		const project = join(root, "project");
		writeFiles(project, { "a.txt": "a\n", "nested/n.txt": "n\n" });
		initRepo(join(project, "nested"));

		const reference = await ws.captureReference(project, DEFAULT_WORKSPACE_POLICY);

		assert.deepEqual(
			reference.entries.filter((e) => e.path === "nested/.git" || e.path.startsWith("nested/.git/")).map((e) => e.path),
			[],
		);
	});
});

describe("the boundary of a submodule is inventoried with its commit (§9.1, UX-10)", () => {
	it("la référence d'un projet portant un sous-module a une entrée submodule à vendor/sub-lib qui nomme le commit extrait, et vendor/sub-lib/lib.txt reste un fichier", async () => {
		const { project, commit } = projectWithSubmodule();

		const reference = await ws.captureReference(project, DEFAULT_WORKSPACE_POLICY);

		const boundary = reference.entries.find((e) => e.path === "vendor/sub-lib");
		assert.equal(boundary?.kind, "submodule");
		assert.ok(
			boundary.limits?.notes.some((n) => n.includes(commit)),
			`the entry names ${commit}: ${JSON.stringify(boundary)}`,
		);
		assert.equal(reference.entries.find((e) => e.path === "vendor/sub-lib/lib.txt")?.kind, "file");
	});
	it("un candidat qui ne modifie que a.txt garde l'entrée submodule de vendor/sub-lib unchanged", async () => {
		const { project } = projectWithSubmodule();
		const reference = await ws.captureReference(project, DEFAULT_WORKSPACE_POLICY);
		const handle = await ws.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
		writeFileSync(join(handle.path, "a.txt"), "changed\n");

		const candidate = await ws.snapshotCandidate(handle, reference, DEFAULT_WORKSPACE_POLICY);

		const boundary = candidate.entries.find((e) => e.path === "vendor/sub-lib");
		assert.deepEqual([boundary?.kind, boundary?.baseline_state], ["submodule", "unchanged"]);
		assert.deepEqual(candidate.selected_paths, ["a.txt"]);
	});
	it("la page de contenu de vendor/sub-lib côté candidat n'a pas de texte et ses métadonnées disent submodule et le commit", async () => {
		const { project, commit } = projectWithSubmodule();
		const reference = await ws.captureReference(project, DEFAULT_WORKSPACE_POLICY);
		const handle = await ws.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
		const manifest = await ws.snapshotCandidate(handle, reference, DEFAULT_WORKSPACE_POLICY);

		const page = await readContent(
			{ referencePath: project, workspacePath: handle.path, reference, manifest, maxBytes: 1024 * 1024 },
			"vendor/sub-lib",
			"new",
			{ start_line: 1, limit: 50 },
		);

		assert.equal(page.metadata.kind, "submodule", JSON.stringify(page));
		assert.notEqual(page.kind, "text");
		assert.deepEqual(page.lines, []);
		assert.ok(JSON.stringify(page.metadata).includes(commit), `the metadata name ${commit}: ${JSON.stringify(page)}`);
	});
});

describe("G4 refuses a candidate that touches a submodule (§9.1)", () => {
	/** A change on a tested project carrying `vendor/sub-lib`, whose producer runs `steps`, advanced past G4. */
	async function judged(steps: AgentScript["steps"]) {
		const { project } = projectWithSubmodule(fixtureTs);
		const head = gitCmd(project, ["rev-parse", "HEAD"]).trim();
		const changed = steps.flatMap((s) => (s.kind === "write" || s.kind === "delete" ? [s.path] : []));
		const t = makeHarness({
			policy: { budgets: { max_attempts: 1 } },
			scripts: {
				implement: {
					steps: [
						...steps,
						{
							kind: "complete",
							output: { summary: "done", changed_paths: changed, tests_claimed: true, notes: [] },
						},
					],
				},
			},
		});
		const { change } = await t.harness.start({ project_path: project, request_text: "tidy", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const events = t.ledger.readChangeEvents(change.change_id).map((e) => e.event);
		return {
			project,
			head,
			g4: events.flatMap((e) => (e.type === "gate.decided" && e.decision.gate === "G4" ? [e.decision] : [])),
			verified: events.some((e) => e.type === "operation.opened" && e.kind === "verification"),
		};
	}

	for (const [touched, steps] of [
		["vendor/sub-lib/lib.txt", [{ kind: "write", path: "vendor/sub-lib/lib.txt", content: "patched\n" }]],
		["vendor/sub-lib/added.txt", [{ kind: "write", path: "vendor/sub-lib/added.txt", content: "new\n" }]],
		["vendor/sub-lib/lib.txt", [{ kind: "delete", path: "vendor/sub-lib/lib.txt" }]],
	] as const) {
		it(`un candidat qui ${steps[0].kind === "delete" ? "supprime" : touched.endsWith("added.txt") ? "ajoute" : "modifie"} ${touched} échoue à G4 avec une raison qui nomme ce chemin et le sous-module vendor/sub-lib, aucune vérification n'est lancée et le projet est inchangé`, async () => {
			const { project, head, g4, verified } = await judged([...steps]);

			assert.ok(g4.length > 0, "the candidate reaches G4");
			assert.ok(
				g4.every(
					(d) =>
						d.verdict === "FAIL" &&
						d.reasons.some((r) => r.includes(touched) && r.includes("submodule vendor/sub-lib")),
				),
				JSON.stringify(g4),
			);
			assert.equal(verified, false, "no verification of the candidate is opened");
			assert.equal(gitCmd(project, ["rev-parse", "HEAD"]).trim(), head);
			assert.equal(gitCmd(project, ["status", "--porcelain"]).trim(), "", "the project is not written");
		});
	}

	it("un candidat qui supprime le répertoire vendor/sub-lib change la frontière et ses fichiers, et vendor/sub-lib-fork, qui partage son préfixe, n'est pas dans le sous-module", async () => {
		const { project } = projectWithSubmodule();
		const reference = await ws.captureReference(project, DEFAULT_WORKSPACE_POLICY);
		const handle = await ws.createWorkspace(reference, DEFAULT_WORKSPACE_POLICY);
		rmSync(join(handle.path, "vendor/sub-lib"), { recursive: true });
		mkdirSync(join(handle.path, "vendor/sub-lib-fork"));
		writeFileSync(join(handle.path, "vendor/sub-lib-fork/lib.txt"), "fork\n");

		const candidate = await ws.snapshotCandidate(handle, reference, DEFAULT_WORKSPACE_POLICY);

		assert.deepEqual(submodulePathsChanged(candidate, reference.entries), [
			{ path: "vendor/sub-lib", submodule: "vendor/sub-lib" },
			{ path: "vendor/sub-lib/lib.txt", submodule: "vendor/sub-lib" },
		]);
	});
	it("un candidat qui ne modifie que a.txt passe G4 sans raison qui nomme le sous-module", async () => {
		const { g4 } = await judged([{ kind: "write", path: "a.txt", content: "changed\n" }]);

		assert.deepEqual(
			g4.map((d) => d.verdict),
			["PASS"],
			JSON.stringify(g4),
		);
		assert.equal(
			g4.some((d) => d.reasons.some((r) => r.includes("vendor/sub-lib"))),
			false,
		);
	});
});
