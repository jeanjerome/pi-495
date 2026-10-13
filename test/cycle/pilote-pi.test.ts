import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { conduire, mener, repondeur } from "../../cycle/src/pilote-pi.ts";
import { PiRpcClient } from "../helpers/rpc-client.ts";
import { NODE } from "../helpers/cycle.ts";
import { removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

const OPTIONS = ["later — decide later", "integrate — merge into main", "accept — accept the candidate"];

describe("the owner a campaign plays", () => {
	it("chooses the first option offered among those the campaign names, confirms, and cancels anything else", () => {
		const dogfood = repondeur(["adopt", "accept", "integrate"]);
		assert.deepEqual(dogfood({ method: "select", title: "G5", options: OPTIONS }), {
			value: "integrate — merge into main",
		});
		assert.deepEqual(dogfood({ method: "confirm" }), { confirmed: true });
		assert.deepEqual(dogfood({ method: "input" }), { cancelled: true });

		const reference = repondeur(["adopt", "accept"]);
		assert.deepEqual(reference({ method: "select", options: OPTIONS }), { value: "accept — accept the candidate" });
		assert.deepEqual(
			reference({ method: "select", options: ["integrate — merge into main"] }),
			{ cancelled: true },
			"an option the campaign does not name is never chosen",
		);
		assert.deepEqual(
			reference({ method: "select", options: ["acceptable — a prefix is not an option id"] }),
			{ cancelled: true },
			"an option id is matched whole",
		);
	});
});

/** Answers `/495 start` and no other command, as a Pi whose `/495 resume` runs on. */
const PI_QUI_NE_REPOND_QU_AU_START = `
import { writeFileSync } from "node:fs";
writeFileSync(process.argv[2], String(process.pid));
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (let i = buffer.indexOf("\\n"); i >= 0; i = buffer.indexOf("\\n")) {
    const command = JSON.parse(buffer.slice(0, i));
    buffer = buffer.slice(i + 1);
    if (command.id === "commande-0") process.stdout.write(JSON.stringify({ type: "response", id: command.id }) + "\\n");
  }
});
`;

/** A dossier whose change is running, and a Pi that answers `/495 start` only, whose pid it writes beside the dossier. */
function piQuiNeRepondPlus(): { client: PiRpcClient; dossier: string; pid: () => number } {
	const racine = tempDir("495-", cleanups);
	const dossier = join(racine, "dossier");
	mkdirSync(dossier);
	const base = new DatabaseSync(join(dossier, "state.sqlite"));
	base.exec(
		"create table changes (state text); create table evidence (control_id text, verdict text, document text, recorded_at text)",
	);
	base.prepare("insert into changes values (?)").run(JSON.stringify({ status: "running", gates: {} }));
	base.close();
	const [pi, pidFile] = [join(racine, "pi.mjs"), join(racine, "pid")];
	writeFileSync(pi, PI_QUI_NE_REPOND_QU_AU_START);
	const client = new PiRpcClient({ bin: NODE, args: [pi, pidFile], cwd: racine, env: process.env });
	return { client, dossier, pid: () => Number(readFileSync(pidFile, "utf8")) };
}

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

describe("the driver of a campaign", () => {
	it("given a /495 resume that outlasts its delay, then it stops asking and returns that the campaign was cut", {
		timeout: 15_000,
	}, async () => {
		const { client, dossier } = piQuiNeRepondPlus();
		try {
			const issue = await conduire(client, dossier, "an objective", 300);

			assert.equal(issue, "coupee", "a command that outlasts its delay ends the campaign instead of throwing");
		} finally {
			await client.close();
		}
	});

	it("given a /495 resume that outlasts its delay, then it stops Pi and judges the dossier as it stands, saying it was cut", {
		timeout: 15_000,
	}, async () => {
		const { client, dossier, pid } = piQuiNeRepondPlus();

		const verdict = await mener(client, dossier, "an objective", 300);

		assert.ok(
			verdict.defauts.includes("the campaign was cut by its delay of 300 ms while the change was running"),
			verdict.defauts.join(" | "),
		);
		assert.ok(verdict.constats.includes("status running"));
		assert.equal(alive(pid()), false, "Pi is stopped before the dossier is read");
	});

	it("given a Pi that exits before answering, then the failure is raised and not taken for a delay", {
		timeout: 15_000,
	}, async () => {
		const racine = tempDir("495-", cleanups);
		const client = new PiRpcClient({ bin: NODE, args: ["-e", "process.exit(3)"], cwd: racine, env: process.env });
		try {
			await assert.rejects(conduire(client, racine, "an objective", 5_000), /Pi exited with code 3/);
		} finally {
			await client.close();
		}
	});
});
