/**
 * V3 — the reference path through the two entries `pi-entries` leaves out: an RPC client driving
 * `pi --mode rpc`, and a host loading the package through the Pi SDK (C-PI, F-PIHOST, UX-02,
 * UX-11, REC-39, SA-029, SA-030, SA-031, D-12). Real `pi`, scripted agent, no model called.
 */
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PiRpcClient, type RpcEvent } from "../helpers/rpc-client.ts";
import { fixtureTs, initRepo } from "../helpers/fixtures.ts";

const PI = process.env.HARNESS495_PI_BIN ?? "pi";
const EXT = join(process.cwd(), "src", "extension", "index.ts");
const SDK_HOST = join(process.cwd(), "test", "helpers", "sdk-host.ts");
const ESC = String.fromCharCode(27);
const SENTINEL = "495-SDK-HOST:";

let root: string;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "v3rpc-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function piAvailable(): boolean {
	try {
		execFileSync(PI, ["--version"], { stdio: "ignore", timeout: 20000 });
		return true;
	} catch {
		return false;
	}
}
const skip = !piAvailable() && "pi binary not available";

const SPEC = {
	objective: "tidy greet",
	facts: [],
	assumptions: [],
	questions: [],
	answers: [],
	out_of_scope: [],
	risks: [],
	requirements: [
		{
			requirement_id: "R1",
			statement: "greet unchanged",
			mandatory: true,
			criterion: "tests pass",
			category: "functional",
			satisfied_by_reference: true,
		},
	],
	design: { summary: "touch src/greet.js", components: [], interfaces: [], risks: [] },
};
const RIGHT = "export function greet(name) {\n  return `Hello, ${name}`; // tidy\n}\n";
const REQUEST = "/495 start tidy greet without behaviour change";

/** One project, one data directory and one scripted agent per channel: nothing is shared but the fixture. */
function channel(name: string): { project: string; env: Record<string, string> } {
	const project = join(root, `proj-${name}`);
	fixtureTs(project);
	initRepo(project);
	const agent = join(root, `agent-${name}.json`);
	writeFileSync(
		agent,
		JSON.stringify({
			default: { steps: [{ kind: "complete", output: SPEC }] },
			roles: {
				implement: {
					steps: [
						{ kind: "write", path: "src/greet.js", content: RIGHT },
						{
							kind: "complete",
							output: { summary: "d", changed_paths: ["src/greet.js"], tests_claimed: false, notes: [] },
						},
					],
				},
			},
		}),
	);
	const env: Record<string, string> = {
		HARNESS495_DATA_DIR: join(root, `data-${name}`),
		HARNESS495_SCRIPTED_AGENT: agent,
	};
	if (process.platform !== "darwin") env.HARNESS495_ALLOW_UNCONFINED = "1";
	return { project, env };
}

interface ChangeView {
	outcome: string;
	status: string;
	gates: { gate: string; verdict: string }[];
	candidate: { candidate_id: string; manifest_digest: string } | null;
	evidence: { control_id: string; verdict: string }[];
}
/** The facts and verdicts a channel is required to agree on, whatever it looks like on screen. */
interface Facts {
	outcome: string;
	gates: string;
	candidate: string;
	evidence: string;
}

function factsOf(view: ChangeView): Facts {
	return {
		outcome: view.outcome,
		gates: view.gates.map((g) => `${g.gate}=${g.verdict}`).join(" "),
		candidate: view.candidate?.manifest_digest ?? "none",
		evidence: view.evidence.map((e) => `${e.control_id}=${e.verdict}`).join(" "),
	};
}

/** Print mode has no structured payload: the same facts are read back from the text it prints. */
function factsOfPrint(text: string): Facts {
	const read = (re: RegExp) => re.exec(text)?.[1]?.trim() ?? "";
	return {
		outcome: read(/^Résultat: (\S+)$/m) || read(/Résultat: (\S+)/),
		gates: read(/^Gates: (.+)$/m),
		candidate: read(/^Candidat: \S+ (\S+)$/m),
		evidence: read(/^Preuves: (.+)$/m),
	};
}

function views(messages: { details: Record<string, unknown> }[]): ChangeView[] {
	return messages
		.map((m) => (m.details as { view?: { change?: ChangeView } }).view?.change)
		.filter((c): c is ChangeView => Boolean(c));
}

function runPrint(cwd: string, env: Record<string, string>, prompt: string): string {
	const r = spawnSync(PI, ["-ne", "-p", "--no-session", "-e", EXT, prompt], {
		cwd,
		encoding: "utf8",
		timeout: 300_000,
		env: { ...process.env, ...env },
		maxBuffer: 64 * 1024 * 1024,
	});
	if (r.error) throw r.error;
	return `${r.stdout}${r.stderr}`;
}

function runJson(
	cwd: string,
	env: Record<string, string>,
	prompt: string,
): { content: string; details: Record<string, unknown> }[] {
	const r = spawnSync(PI, ["-ne", "--mode", "json", "--no-session", "-e", EXT, prompt], {
		cwd,
		encoding: "utf8",
		timeout: 300_000,
		env: { ...process.env, ...env },
		maxBuffer: 64 * 1024 * 1024,
	});
	if (r.error) throw r.error;
	return r.stdout
		.split("\n")
		.filter(Boolean)
		.flatMap((line) => {
			let event: {
				type?: string;
				message?: { customType?: string; content?: unknown; details?: Record<string, unknown> };
			};
			try {
				event = JSON.parse(line) as typeof event;
			} catch {
				return [];
			}
			if (event.type !== "message_end" || event.message?.customType !== "495") return [];
			return [{ content: String(event.message.content ?? ""), details: event.message.details ?? {} }];
		});
}

function runSdk(
	cwd: string,
	env: Record<string, string>,
	prompts: string[],
): { content: string; details: Record<string, unknown> }[] {
	const r = spawnSync(process.execPath, [SDK_HOST, cwd, EXT, "json", ...prompts], {
		cwd,
		encoding: "utf8",
		timeout: 300_000,
		env: { ...process.env, ...env },
		maxBuffer: 64 * 1024 * 1024,
	});
	if (r.error) throw r.error;
	const line = r.stdout.split("\n").find((l) => l.startsWith(SENTINEL));
	assert.ok(
		line,
		`SDK host produced no result line; stdout: ${r.stdout.slice(0, 500)} stderr: ${r.stderr.slice(0, 1000)}`,
	);
	const parsed = JSON.parse(line.slice(SENTINEL.length)) as {
		errors: unknown[];
		messages: { content: string; details: Record<string, unknown> }[];
	};
	assert.deepEqual(parsed.errors, [], "the SDK host loaded the package without error");
	return parsed.messages;
}

async function runRpc(
	cwd: string,
	env: Record<string, string>,
	prompts: string[],
	respond?: (r: RpcEvent) => Record<string, unknown> | null,
): Promise<PiRpcClient> {
	const client = new PiRpcClient({
		bin: PI,
		args: ["-ne", "--mode", "rpc", "--no-session", "-e", EXT],
		cwd,
		env: { ...process.env, ...env },
		respond,
	});
	for (let i = 0; i < prompts.length; i++) {
		client.send({ id: `r${i}`, type: "prompt", message: prompts[i] });
		await client.waitFor((e) => e.type === "response" && e.id === `r${i}`, 60_000);
		await client.waitQuiet();
	}
	return client;
}

describe("Pi entries: RPC client and SDK host (C-PI, F-PIHOST)", { skip }, () => {
	it("the same reference path yields the same facts and the same verdicts in RPC, in an SDK host, in print and in JSON (REC-39, UX-02)", async () => {
		const rpcChannel = channel("rpc");
		const client = await runRpc(rpcChannel.project, rpcChannel.env, [REQUEST]);
		const rpcFacts = factsOf(views(client.messages()).at(-1)!);
		await client.close();

		const sdkChannel = channel("sdk");
		const sdkFacts = factsOf(views(runSdk(sdkChannel.project, sdkChannel.env, [REQUEST])).at(-1)!);

		const jsonChannel = channel("json");
		const jsonFacts = factsOf(views(runJson(jsonChannel.project, jsonChannel.env, REQUEST)).at(-1)!);

		const printChannel = channel("print");
		const printFacts = factsOfPrint(runPrint(printChannel.project, printChannel.env, REQUEST));

		assert.equal(rpcFacts.outcome, "accepted", JSON.stringify(rpcFacts));
		assert.equal(rpcFacts.gates, "G0=PASS G1=PASS G2=PASS G3=PASS G4=PASS G5=PASS");
		assert.deepEqual(sdkFacts, rpcFacts, "the SDK host agrees with the RPC client");
		assert.deepEqual(jsonFacts, rpcFacts, "the JSON entry agrees with the RPC client");
		// Print truncates the digest it shows; the rest of its facts are compared as they are.
		assert.equal(printFacts.outcome, rpcFacts.outcome);
		assert.equal(printFacts.gates, rpcFacts.gates);
		assert.equal(printFacts.evidence, rpcFacts.evidence);
		assert.ok(
			printFacts.candidate.length > 10 && rpcFacts.candidate.startsWith(printFacts.candidate),
			`${printFacts.candidate} is the prefix of ${rpcFacts.candidate}`,
		);
		// The digest is derived from the candidate's content alone, so four channels that produced
		// the same candidate must name the same one.
		assert.match(rpcFacts.candidate, /^sha256:[0-9a-f]{64}$/);
	});

	it("a review reads the same snapshot in RPC, in an SDK host, in JSON and in print (UX-11, §10.6)", async () => {
		const rpcChannel = channel("rvw-rpc");
		const client = await runRpc(rpcChannel.project, rpcChannel.env, [REQUEST, "/495 review"]);
		const rpcMessages = client.messages();
		await client.close();
		const rpcReview = rpcMessages.at(-1)!;
		const rpcSnapshot = (rpcReview.details as { snapshot?: Record<string, unknown> }).snapshot;
		assert.ok(rpcSnapshot, "RPC carries the review snapshot as structured data");

		const sdkChannel = channel("rvw-sdk");
		const sdkReview = runSdk(sdkChannel.project, sdkChannel.env, [REQUEST, "/495 review"]).at(-1)!;
		const sdkSnapshot = (sdkReview.details as { snapshot?: Record<string, unknown> }).snapshot!;

		const jsonChannel = channel("rvw-json");
		runJson(jsonChannel.project, jsonChannel.env, REQUEST);
		const jsonReview = runJson(jsonChannel.project, jsonChannel.env, "/495 review").at(-1)!;
		const jsonSnapshot = (jsonReview.details as { snapshot?: Record<string, unknown> }).snapshot!;

		const printChannel = channel("rvw-print");
		runPrint(printChannel.project, printChannel.env, REQUEST);
		const printText = runPrint(printChannel.project, printChannel.env, "/495 review");

		// The snapshot identity is derived from the reference tree and the candidate manifest, so
		// four channels reviewing the same candidate must name the same snapshot and the same paths.
		const identity = (s: Record<string, unknown>) => ({
			snapshot_id: s.snapshot_id,
			candidate: (s.candidate as { manifest_digest: string } | null)?.manifest_digest ?? null,
			counts: s.counts,
			complete: s.complete,
			fresh: s.fresh,
			limits: s.limits,
		});
		assert.deepEqual(identity(sdkSnapshot), identity(rpcSnapshot));
		assert.deepEqual(identity(jsonSnapshot), identity(rpcSnapshot));
		// The first line names the change and the commit of this run's repository; everything below
		// it describes the comparison itself and must be identical from one channel to the next.
		const header = (text: string) => text.split("\n")[0]!;
		const body = (text: string) => text.split("\n").slice(1).join("\n");
		assert.equal(body(rpcReview.content), body(sdkReview.content), "the same textual review");
		assert.equal(body(rpcReview.content), body(jsonReview.content));
		const digest = (rpcSnapshot.candidate as { manifest_digest: string }).manifest_digest;
		for (const text of [rpcReview.content, sdkReview.content, jsonReview.content])
			assert.ok(header(text).includes(digest), "every channel names the same candidate digest");
		for (const line of body(rpcReview.content).split("\n"))
			assert.ok(printText.includes(line), `print carries the review line: ${line}`);
		assert.match(rpcReview.content, /modified\s+src\/greet\.js/);
	});

	it("a decision stays pending for an undeclared RPC client and is recorded from a declared one (D-12, SA-030, SA-031)", async () => {
		const undeclared = channel("dec-open");
		const openClient = await runRpc(undeclared.project, { ...undeclared.env, HARNESS495_HUMAN_ACCEPTANCE: "1" }, [
			REQUEST,
		]);
		const openText = openClient
			.messages()
			.map((m) => m.content)
			.join("\n");
		const dialogs = openClient.uiRequests.filter(
			(r) => r.method === "select" || r.method === "confirm" || r.method === "input",
		);
		await openClient.close();
		assert.match(openText, /decision_required/);
		assert.match(openText, /IH-10/);
		assert.deepEqual(dialogs, [], "no decision dialog is opened for a client that carries no declared identity");
		const openView = views(openClient.messages()).at(-1)!;
		assert.equal(openView.outcome, "pending");
		assert.equal(openView.status, "decision_required");

		const declared = channel("dec-qualified");
		const answers: string[] = [];
		const qualifiedClient = await runRpc(
			declared.project,
			{ ...declared.env, HARNESS495_HUMAN_ACCEPTANCE: "1", HARNESS495_RPC_HUMAN_ACTOR: "alice" },
			[REQUEST, "/495 report"],
			(request) => {
				if (request.method !== "select") return null;
				const options = request.options as string[];
				const accept = options.find((o) => o.startsWith("accept"))!;
				answers.push(accept);
				return { value: accept };
			},
		);
		const qualifiedMessages = qualifiedClient.messages();
		await qualifiedClient.close();
		assert.equal(answers.length, 1, "exactly one decision dialog travelled over the UI sub-protocol");
		const text = qualifiedMessages.map((m) => m.content).join("\n");
		assert.match(text, /Décision enregistrée: hd_/);
		// The report names the authority that answered: the identity the host declared, not the model.
		assert.match(qualifiedMessages.at(-1)!.content, /\[humain\] alice: IH-10 accept/);
	});

	it("RPC presents the harness without a terminal widget (ADR-010, §5.2)", async () => {
		const rpcChannel = channel("widget");
		const client = await runRpc(rpcChannel.project, rpcChannel.env, [REQUEST, "/495 review"]);
		const raw = client.raw;
		const uiMethods = new Set(client.uiRequests.map((r) => r.method));
		await client.close();
		assert.ok(!raw.includes(ESC), "no terminal escape sequence reaches an RPC client");
		assert.ok(!uiMethods.has("custom"), "no custom component is requested outside the TUI");
		// What RPC does use is the fire-and-forget part of the sub-protocol: status and notifications.
		assert.ok(uiMethods.has("setStatus"), `status updates reach the client: ${[...uiMethods].join(",")}`);
	});
});
