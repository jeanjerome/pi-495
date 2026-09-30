import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { makeHarness, specReport, type PolicyOverride, type TestHarness } from "../helpers/harness-fixture.ts";
import {
	fixtureJava,
	fixtureTs,
	fixtureTsWithoutTests,
	fixtureVitestWithoutProvider,
	gitCmd,
	initRepo,
	SHOUT_IMPL,
	tempDir,
} from "../helpers/fixtures.ts";
import { FakeMavenControls, FakeMavenSandbox } from "../helpers/fake-maven.ts";
import { FakeNpmSandbox, FakeVitestControls, PROVIDER_FILES } from "../helpers/fake-npm.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import type { HumanOrigin } from "../../src/contracts/v1/decision.ts";
import { exportChange, verifyExport } from "../../src/export/export-service.ts";
import { GitIntegrator } from "../../src/adapters/git/integrator.ts";

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});
function project(): string {
	const p = tempDir("495-proj-");
	cleanups.push(p);
	fixtureTs(p);
	initRepo(p);
	return p;
}
function track(t: TestHarness): TestHarness {
	cleanups.push(t.root);
	return t;
}
const origin = (): HumanOrigin => ({
	actor: HUMAN,
	host: "tui",
	session_id: "s1",
	asserted_at: "2026-09-16T12:00:00.000Z",
});
const RIGHT =
	"export function greet(name) {\n  return `Hello, ${name}`;\n}\nexport const SECRET = 'sk-abcdefghijklmnop1234';\n";
const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: true, notes: [] });

/** A harness whose producer writes `content` to src/greet.js and reports that one path done. */
function writingHarness(content: string, policy?: PolicyOverride): TestHarness {
	return track(
		makeHarness({
			// `exactOptionalPropertyTypes` refuses an explicit `policy: undefined`, so the key is omitted
			// rather than passed empty.
			...(policy ? { policy } : {}),
			scripts: {
				implement: {
					steps: [
						{ kind: "write", path: "src/greet.js", content },
						{ kind: "complete", output: report(["src/greet.js"]) },
					],
				},
			},
		}),
	);
}

async function acceptedChange(t: TestHarness, p: string) {
	const { change } = await t.harness.start({ project_path: p, request_text: "tidy greet", actor: HUMAN });
	const result = await t.harness.advance(change.change_id, { max_steps: 30 });
	return { change, result };
}

describe("export dossier (EVD-01, SA-036, RM-071, RM-072)", () => {
	it("writes a self-contained, verifiable dossier; redaction removes sentinels and says so", async () => {
		const p = project();
		const t = writingHarness(RIGHT);
		const { change, result } = await acceptedChange(t, p);
		assert.equal(result.view.change?.outcome, "accepted");
		const full = await exportChange(t.ledger, t.objects, {
			change_id: change.change_id,
			destination: join(t.root, "export-full"),
			redact: false,
			now: "t",
			producer: "test",
		});
		assert.equal(full.missing.length, 0);
		assert.ok(
			existsSync(join(full.path, "manifest.json")) &&
				existsSync(join(full.path, "events.jsonl")) &&
				existsSync(join(full.path, "schemas", "evidence.json")),
		);
		assert.equal((await verifyExport(full.path)).ok, true);
		const evidenceFiles = readFileSync(join(full.path, "manifest.json"), "utf8");
		assert.match(evidenceFiles, /evidence\//);
		const red = await exportChange(t.ledger, t.objects, {
			change_id: change.change_id,
			destination: join(t.root, "export-red"),
			redact: true,
			now: "t",
			producer: "test",
		});
		assert.ok(red.redactions >= 1, "sentinel found in a candidate excerpt or output");
		const redactions = JSON.parse(readFileSync(join(red.path, "redactions.json"), "utf8")) as { redactions: unknown[] };
		assert.ok(redactions.redactions.length >= 1);
		const all = JSON.parse(readFileSync(join(red.path, "manifest.json"), "utf8")) as {
			files: { path: string }[];
			profile: string;
		};
		assert.equal(all.profile, "redacted");
		for (const f of all.files)
			if (!f.path.startsWith("objects/") && !f.path.endsWith(".jsonl"))
				assert.ok(!readFileSync(join(red.path, f.path), "utf8").includes("sk-abcdefghijklmnop1234"), f.path);
		assert.equal((await verifyExport(red.path)).ok, true);
		writeFileSync(join(full.path, "program.json"), "{}");
		assert.equal((await verifyExport(full.path)).ok, false);
	});

	it("names what a redaction removed by location and count only, never by value (SEC-05)", async () => {
		const p = project();
		const t = writingHarness(RIGHT);
		const { change } = await acceptedChange(t, p);
		const red = await exportChange(t.ledger, t.objects, {
			change_id: change.change_id,
			destination: join(t.root, "export-signal"),
			redact: true,
			now: "t",
			producer: "test",
		});
		const { redactions } = JSON.parse(readFileSync(join(red.path, "redactions.json"), "utf8")) as {
			redactions: { path: string; count: number; kind: string }[];
		};
		assert.ok(redactions.length >= 1, "the sentinel in the fixture was not found");
		for (const r of redactions) {
			assert.equal(
				Object.keys(r).sort().join(","),
				"count,kind,path",
				"a redaction record names where and how many, and nothing else",
			);
			assert.ok(r.path.length > 0, "an unnamed location tells a reader nothing to act on");
			assert.ok(r.count >= 1);
			assert.equal(
				JSON.stringify(r).includes("sk-abcdefghijklmnop1234"),
				false,
				"the record carries the removed value",
			);
		}
	});

	it("carries its own verifier, which a third party runs with nothing but Node (RM-072)", async () => {
		const p = project();
		const t = writingHarness(RIGHT);
		const { change } = await acceptedChange(t, p);
		const full = await exportChange(t.ledger, t.objects, {
			change_id: change.change_id,
			destination: join(t.root, "export-verifier"),
			redact: false,
			now: "t",
			producer: "test",
		});
		const run = (dossier: string) =>
			spawnSync(process.execPath, [join(dossier, "verify.mjs"), dossier], { encoding: "utf8" });
		const intact = run(full.path);
		assert.equal(intact.status, 0, intact.stderr);
		assert.match(intact.stdout, /verified/);
		// A redacted dossier verifies too: its altered objects are declared, not corrupted.
		const red = await exportChange(t.ledger, t.objects, {
			change_id: change.change_id,
			destination: join(t.root, "export-verifier-red"),
			redact: true,
			now: "t",
			producer: "test",
		});
		const redacted = run(red.path);
		assert.equal(redacted.status, 0, redacted.stderr);
		assert.match(redacted.stdout, /redacted profile/);
		// An object altered without being declared is caught by its own address, not only by the manifest.
		const objects = (
			JSON.parse(readFileSync(join(full.path, "manifest.json"), "utf8")) as { files: { path: string }[] }
		).files.filter((f) => f.path.startsWith("objects/"));
		writeFileSync(join(full.path, objects[0]!.path), "tampered");
		const tampered = run(full.path);
		assert.equal(tampered.status, 1);
		assert.match(tampered.stderr, /NOT VERIFIED/);
		assert.match(tampered.stderr, /content changed since export/);
	});
});

describe("git integration (GIT-03, GIT-05, SA-020, SA-021, REC-08, REC-09)", () => {
	it("integrates the exact accepted candidate as a local commit after IH-11, with a receipt and G6", async () => {
		const p = project();
		const t = writingHarness("export function greet(name) {\n  return `Hello, ${name}`; // integrated\n}\n", {
			integration_enabled: true,
		});
		t.harness.integrator = new GitIntegrator(t.harness).step;
		const { change, result } = await acceptedChange(t, p);
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		assert.equal(t.requested.at(-1)?.interaction, "IH-11");
		const req = t.requested.at(-1)!;
		const before = gitCmd(p, ["rev-parse", "HEAD"]).trim();
		const answer = t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "integrate",
				free_text: null,
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		assert.equal(answer.error, null);
		const done = await t.harness.advance(change.change_id, { max_steps: 10 });
		assert.equal(done.stopped_because, "closed", done.steps.join(" | "));
		assert.equal(done.view.change?.outcome, "integrated");
		const after = gitCmd(p, ["rev-parse", "HEAD"]).trim();
		assert.notEqual(after, before);
		assert.match(gitCmd(p, ["log", "-1", "--pretty=%B"]), /495: integrate candidate/);
		assert.equal(gitCmd(p, ["status", "--porcelain"]).trim(), "", "working tree clean after integration");
		assert.match(readFileSync(join(p, "src", "greet.js"), "utf8"), /integrated/);
		assert.equal(gitCmd(p, ["remote"]).trim(), "", "no push target exists");
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.integration?.destination_after, after);
		assert.ok(t.ledger.listArtifacts(change.change_id, "integration").length === 1);
	});
	it("a destination that advanced before integration is detected and re-verified, never merged silently", async () => {
		const p = project();
		const t = writingHarness("export function greet(name) {\n  return `Hello, ${name}`; // v2\n}\n", {
			integration_enabled: true,
		});
		t.harness.integrator = new GitIntegrator(t.harness).step;
		const { change } = await acceptedChange(t, p);
		writeFileSync(join(p, "README.md"), "# advanced by the user\n");
		gitCmd(p, ["commit", "-qam", "user moved on"]);
		const req = t.requested.at(-1)!;
		t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "integrate",
				free_text: null,
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		const res = await t.harness.advance(change.change_id, { max_steps: 3 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.status, "blocked");
		assert.equal(state.stop_reason, "integration_conflict");
		assert.ok(state.outcome !== "integrated");
		assert.match(gitCmd(p, ["log", "-1", "--pretty=%s"]), /user moved on/, "no 495 commit was made");
		assert.equal(res.stopped_because, "blocked");
	});
	it("export-only declines integration and keeps the change accepted", async () => {
		const p = project();
		const t = writingHarness("export function greet(name) {\n  return `Hello, ${name}`; //x\n}\n", {
			integration_enabled: true,
		});
		t.harness.integrator = new GitIntegrator(t.harness).step;
		const { change } = await acceptedChange(t, p);
		const req = t.requested.at(-1)!;
		const a = t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "export_only",
				free_text: null,
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		assert.equal(a.view.change?.outcome, "accepted");
		assert.equal(a.view.change?.status, "blocked");
		assert.equal(gitCmd(p, ["status", "--porcelain"]).trim(), "");
	});
});

describe("what the integration indexes of the files it copies", () => {
	/** A project whose .gitignore says `ignored`, and a harness whose producer writes `files` and reports them done. */
	function projectAndProducer(ignored: string, files: Record<string, string>): { p: string; t: TestHarness } {
		const p = tempDir("495-proj-");
		cleanups.push(p);
		fixtureTs(p);
		if (ignored) writeFileSync(join(p, ".gitignore"), ignored);
		initRepo(p);
		const t = track(
			makeHarness({
				policy: { integration_enabled: true },
				scripts: {
					implement: {
						steps: [
							...Object.entries(files).map(([path, content]) => ({ kind: "write" as const, path, content })),
							{ kind: "complete", output: report(Object.keys(files)) },
						],
					},
				},
			}),
		);
		t.harness.integrator = new GitIntegrator(t.harness).step;
		return { p, t };
	}

	/** Carries the change to its acceptance, then answers the integration question with `integrate`. */
	async function integrated(
		p: string,
		t: TestHarness,
	): Promise<{ change_id: string; outcome: string | undefined; steps: string }> {
		const { change } = await acceptedChange(t, p);
		const req = t.requested.at(-1)!;
		assert.equal(req.interaction, "IH-11");
		t.harness.answerDecision(
			change.change_id,
			{
				decision_id: req.decision_id,
				option_id: "integrate",
				free_text: null,
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		const done = await t.harness.advance(change.change_id, { max_steps: 10 });
		return { change_id: change.change_id, outcome: done.view.change?.outcome, steps: done.steps.join(" | ") };
	}

	const committedPaths = (p: string): string[] =>
		gitCmd(p, ["show", "--name-only", "--pretty=format:", "HEAD"]).split("\n").filter(Boolean).sort();

	it("given a project ignoring coverage/ and a candidate adding coverage/report.txt and modifying src/greet.js, then the file is in the project, the commit holds src/greet.js only and the receipt says the integration is done", async () => {
		const { p, t } = projectAndProducer("coverage/\n", {
			"src/greet.js": "export function greet(name) {\n  return `Hello, ${name}`; // covered\n}\n",
			"coverage/report.txt": "lines: 100%\n",
		});

		const done = await integrated(p, t);

		assert.equal(done.outcome, "integrated", done.steps);
		assert.equal(readFileSync(join(p, "coverage", "report.txt"), "utf8"), "lines: 100%\n");
		assert.deepEqual(committedPaths(p), ["src/greet.js"]);
		const state = t.ledger.loadChange(done.change_id)!.state;
		assert.equal(
			state.integration?.destination_after,
			gitCmd(p, ["rev-parse", "HEAD"]).trim(),
			"the integration is recorded as done, not left uncertain",
		);
		assert.equal(t.ledger.listArtifacts(done.change_id, "integration").length, 1);
	});

	it("given a project ignoring coverage/ and a candidate adding only coverage/report.txt, then nothing is committed, not even a file the project holds untracked, and the integration does not claim to be done", async () => {
		const { p, t } = projectAndProducer("coverage/\n", { "coverage/report.txt": "lines: 100%\n" });
		writeFileSync(join(p, "notes.txt"), "the owner's own untracked file\n");
		const headBefore = gitCmd(p, ["rev-parse", "HEAD"]).trim();

		const done = await integrated(p, t);

		assert.notEqual(done.outcome, "integrated", done.steps);
		assert.equal(gitCmd(p, ["rev-parse", "HEAD"]).trim(), headBefore);
		assert.equal(t.ledger.loadChange(done.change_id)!.state.integration?.destination_after ?? null, null);
	});

	it("given a project that does not ignore node_modules/ and a candidate modifying package.json and adding packages/app/node_modules/x/index.js, then the file is in the project and the commit holds package.json and no path of node_modules/", async () => {
		const p = tempDir("495-proj-");
		cleanups.push(p);
		fixtureTsWithoutTests(p);
		initRepo(p);
		const unjudgeable = specReport({
			objective: "add shout(name) returning the greeting in upper case",
			requirements: [
				{
					requirement_id: "R1",
					statement: "shout(name) returns greet(name) upper-cased",
					mandatory: true,
					criterion: "unit test on shout passes",
					category: "functional",
					satisfied_by_reference: false,
				},
			],
		});
		// A node_modules/ at the project root is protected at G4 and only an adopted complement writes there, so
		// the dependency the candidate adds sits in a workspace package, which the integration leaves out of the commit all the same.
		const dependency = "packages/app/node_modules/x/index.js";
		const files = { "src/greet.js": SHOUT_IMPL, [dependency]: "module.exports = 1;\n" };
		const t = track(
			makeHarness({
				policy: { integration_enabled: true },
				defaultScript: { steps: [{ kind: "complete", output: unjudgeable }] },
				scripts: {
					prepare: { steps: [{ kind: "complete", output: report([]) }] },
					implement: {
						steps: [
							...Object.entries(files).map(([path, content]) => ({ kind: "write" as const, path, content })),
							{ kind: "complete", output: report(Object.keys(files)) },
						],
					},
				},
			}),
		);
		t.harness.integrator = new GitIntegrator(t.harness).step;
		const answer = (optionId: string): void => {
			const [pending] = t.harness.pendingDecisions(changeId);
			const answered = t.harness.answerDecision(
				changeId,
				{
					decision_id: pending!.decision_id,
					option_id: optionId,
					free_text: null,
					reason: null,
					subject_revision: pending!.subject.revision,
					scope: null,
					expires_at: null,
				},
				origin(),
			);
			assert.equal(answered.error, null);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const changeId = change.change_id;
		await t.harness.advance(changeId, { max_steps: 40 });
		// package.json is a file of the candidate only through the complement the owner adopts.
		answer("adopt_complement");
		await t.harness.advance(changeId, { max_steps: 40 });
		answer("assign_review");
		let result = await t.harness.advance(changeId, { max_steps: 40 });
		for (let step = 0; step < 4 && result.stopped_because === "decision_required"; step++) {
			const [asked] = t.harness.pendingDecisions(changeId);
			answer(asked!.interaction === "IH-11" ? "integrate" : "accept");
			result = await t.harness.advance(changeId, { max_steps: 40 });
		}

		assert.equal(result.view.change?.outcome, "integrated", result.steps.join(" | "));
		assert.equal(readFileSync(join(p, dependency), "utf8"), files[dependency]);
		assert.deepEqual(committedPaths(p), ["package.json", "src/greet.js"]);
	});

	it("given an accepted candidate carrying an installed complement, then the local commit holds package.json and package-lock.json and no node_modules path, and the installed provider is in the project", async () => {
		const p = tempDir("495-proj-");
		cleanups.push(p);
		fixtureVitestWithoutProvider(p, "package-lock.json");
		const unjudgeable = specReport({
			objective: "add shout(name) returning the greeting in upper case",
			requirements: [
				{
					requirement_id: "R1",
					statement: "shout(name) returns greet(name) upper-cased",
					mandatory: true,
					criterion: "unit test on shout passes",
					category: "functional",
					satisfied_by_reference: false,
				},
			],
		});
		const introducedOnCandidate: (Record<string, number[]> | null | undefined)[] = [];
		const t = track(
			makeHarness({
				policy: { integration_enabled: true },
				defaultScript: { steps: [{ kind: "complete", output: unjudgeable }] },
				scripts: {
					prepare: { steps: [{ kind: "complete", output: report([]) }] },
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: SHOUT_IMPL },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
				backend: (real) => new FakeNpmSandbox(real, "installs"),
				controls: (real) => {
					const vitest = new FakeVitestControls(real);
					return {
						runControl: async (invocation, signal) => {
							if (invocation.subject.kind === "candidate") introducedOnCandidate.push(invocation.introduced_lines);
							return vitest.runControl(invocation, signal);
						},
					};
				},
			}),
		);
		t.harness.integrator = new GitIntegrator(t.harness).step;
		const answer = (optionId: string): void => {
			const [pending] = t.harness.pendingDecisions(changeId);
			const answered = t.harness.answerDecision(
				changeId,
				{
					decision_id: pending!.decision_id,
					option_id: optionId,
					free_text: null,
					reason: null,
					subject_revision: pending!.subject.revision,
					scope: null,
					expires_at: null,
				},
				origin(),
			);
			assert.equal(answered.error, null);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const changeId = change.change_id;
		await t.harness.advance(changeId, { max_steps: 40 });
		answer("adopt_complement");
		await t.harness.advance(changeId, { max_steps: 40 });
		answer("assign_review");
		let result = await t.harness.advance(changeId, { max_steps: 40 });
		assert.equal(
			gitCmd(p, ["status", "--porcelain"]).trim(),
			"",
			"nothing is written in the project before the integration",
		);
		for (let step = 0; step < 4 && result.stopped_because === "decision_required"; step++) {
			const [asked] = t.harness.pendingDecisions(changeId);
			answer(asked!.interaction === "IH-11" ? "integrate" : "accept");
			result = await t.harness.advance(changeId, { max_steps: 40 });
		}

		assert.equal(result.view.change?.outcome, "integrated", result.steps.join(" | "));
		assert.ok(introducedOnCandidate.length > 0, "the controls ran on the candidate");
		for (const introduced of introducedOnCandidate)
			assert.deepEqual(
				Object.keys(introduced ?? {}),
				["src/greet.js"],
				"the installed tree and the manifests the complement wrote are not lines this change introduced",
			);
		assert.deepEqual(committedPaths(p), ["package-lock.json", "package.json", "src/greet.js"]);
		assert.match(readFileSync(join(p, "package.json"), "utf8"), /"@vitest\/coverage-v8": "3\.2\.4"/);
		for (const [path, text] of Object.entries(PROVIDER_FILES))
			assert.equal(readFileSync(join(p, path), "utf8"), text, path);
		assert.equal(gitCmd(p, ["remote"]).trim(), "", "nothing is pushed");
	});

	it("given an accepted candidate carrying the adopted declaration of a Maven plugin, then the local commit holds the pom.xml with the declaration and only the files of the candidate, and the project is not written before the integration", async () => {
		const p = tempDir("495-proj-");
		cleanups.push(p);
		fixtureJava(p);
		initRepo(p);
		const greeter = "src/main/java/io/h495/Greeter.java";
		const shouted = `package io.h495;\n\npublic final class Greeter {\n    private Greeter() {}\n\n    public static String greet(String name) {\n        return "Hello, " + name;\n    }\n\n    public static String shout(String name) {\n        return greet(name).toUpperCase();\n    }\n}\n`;
		const unjudgeable = specReport({
			objective: "add shout(name) returning the greeting in upper case",
			requirements: [
				{
					requirement_id: "R1",
					statement: "shout(name) returns greet(name) upper-cased",
					mandatory: true,
					criterion: "unit test on shout passes",
					category: "functional",
					satisfied_by_reference: false,
				},
			],
		});
		const t = track(
			makeHarness({
				policy: { integration_enabled: true },
				defaultScript: { steps: [{ kind: "complete", output: unjudgeable }] },
				scripts: {
					prepare: { steps: [{ kind: "complete", output: report([]) }] },
					implement: {
						steps: [
							{ kind: "write", path: greeter, content: shouted },
							{ kind: "complete", output: report([greeter]) },
						],
					},
				},
				backend: (real) => new FakeMavenSandbox(real, "resolves"),
				controls: (real) => new FakeMavenControls(real),
			}),
		);
		t.harness.integrator = new GitIntegrator(t.harness).step;
		const answer = (optionId: string): void => {
			const [pending] = t.harness.pendingDecisions(changeId);
			const answered = t.harness.answerDecision(
				changeId,
				{
					decision_id: pending!.decision_id,
					option_id: optionId,
					free_text: null,
					reason: null,
					subject_revision: pending!.subject.revision,
					scope: null,
					expires_at: null,
				},
				origin(),
			);
			assert.equal(answered.error, null);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const changeId = change.change_id;
		await t.harness.advance(changeId, { max_steps: 40 });
		answer("adopt_complement");
		await t.harness.advance(changeId, { max_steps: 40 });
		answer("assign_review");
		let result = await t.harness.advance(changeId, { max_steps: 40 });
		assert.equal(
			gitCmd(p, ["status", "--porcelain"]).trim(),
			"",
			"nothing is written in the project before the integration",
		);
		for (let step = 0; step < 4 && result.stopped_because === "decision_required"; step++) {
			const [asked] = t.harness.pendingDecisions(changeId);
			answer(asked!.interaction === "IH-11" ? "integrate" : "accept");
			result = await t.harness.advance(changeId, { max_steps: 40 });
		}

		assert.equal(result.view.change?.outcome, "integrated", result.steps.join(" | "));
		assert.deepEqual(committedPaths(p), ["pom.xml", greeter]);
		assert.match(
			readFileSync(join(p, "pom.xml"), "utf8"),
			/<artifactId>jacoco-maven-plugin<\/artifactId>\s*<version>0\.8\.15<\/version>/,
		);
		assert.equal(gitCmd(p, ["remote"]).trim(), "", "nothing is pushed");
	});

	it("given a project with no ignored path and two modified files, then the commit holds exactly those two files", async () => {
		const { p, t } = projectAndProducer("", {
			"src/greet.js": "export function greet(name) {\n  return `Hello, ${name}`; // two\n}\n",
			"README.md": "# two files\n",
		});

		const done = await integrated(p, t);

		assert.equal(done.outcome, "integrated", done.steps);
		assert.deepEqual(committedPaths(p), ["README.md", "src/greet.js"]);
		assert.match(gitCmd(p, ["log", "-1", "--pretty=%B"]), /495: integrate candidate/);
	});
});
