import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Journal } from "../../cycle/src/journal.ts";
import { lancerSession, lireFlux } from "../../cycle/src/session.ts";
import { tempDir, removedAfterEach } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

/** A stand-in for `claude -p` that echoes what it was asked and answers the schema it was given. */
function fauxClaude(lines: string[]): string {
	const path = join(tempDir("495-", cleanups), "claude");
	writeFileSync(
		path,
		`#!/usr/bin/env node\nconst args = process.argv.slice(2);\nconst invite = args[args.indexOf("-p") + 1];\nconst schema = args[args.indexOf("--json-schema") + 1];\nconst consignes = args[args.indexOf("--append-system-prompt") + 1];\nconst q = (s) => JSON.stringify(s).slice(1, -1);\nprocess.stdout.write(${JSON.stringify(lines.join("\n"))}.replaceAll("INVITE", q(invite)).replaceAll("SCHEMA", q(schema)).replaceAll("SHELL", q(process.env.CLAUDE_CODE_SHELL ?? "")).replaceAll("CONSIGNES", q(consignes.split("\\n").at(-1))) + "\\n");\n`,
	);
	chmodSync(path, 0o755);
	return path;
}

describe("a Claude Code session run by the cycle", () => {
	it("hands the prompt, the schema and the step's instructions over, reads the structured output and keeps the transcript", async () => {
		const claude = fauxClaude([
			'{"type":"system","subtype":"init","session_id":"s1"}',
			'{"type":"assistant","text":"INVITE"}',
			'{"type":"result","subtype":"success","is_error":false,"num_turns":3,"duration_ms":1200,"total_cost_usd":0.5,"session_id":"s1","result":"done","structured_output":{"echo":"SCHEMA","shell":"SHELL","consignes":"CONSIGNES"}}',
		]);
		const journal = new Journal("e01s05", tempDir("495-", cleanups));
		const session = await lancerSession(
			{ invite: "say hi", schema: { type: "object" }, consignes: "step rules", cwd: process.cwd(), claude },
			journal,
		);
		assert.equal(session.ok, true);
		assert.deepEqual(session.sortie, {
			echo: '{"type":"object"}',
			shell: "/opt/homebrew/bin/bash",
			consignes: "step rules",
		});
		assert.equal(session.cout_usd, 0.5);
		assert.equal(session.tours, 3);
		assert.equal(session.session_id, "s1");
		const transcript = new TextDecoder().decode((await journal.objets.get(session.transcript)) ?? new Uint8Array());
		assert.ok(transcript.includes('"text":"say hi"'));
	});

	it("is not ok when the stream has no result, or when a task was still running at the result", async () => {
		const journal = new Journal("e01s05", tempDir("495-", cleanups));
		const sans = await lancerSession(
			{ invite: "x", schema: {}, cwd: process.cwd(), claude: fauxClaude(['{"type":"system","subtype":"init"}']) },
			journal,
		);
		assert.equal(sans.ok, false);
		assert.equal(sans.resume, "no result line in the stream");
		const tuee = await lancerSession(
			{
				invite: "x",
				schema: {},
				cwd: process.cwd(),
				claude: fauxClaude([
					'{"type":"result","subtype":"success","is_error":false,"structured_output":{"a":1}}',
					'{"type":"system","subtype":"task","status":"killed"}',
				]),
			},
			journal,
		);
		assert.equal(tuee.ok, false);
		assert.match(tuee.resume, /killed unread/);
	});

	it("reads the last result line of a stream and ignores a line it cannot parse", () => {
		const { resultat, tueeEnCours } = lireFlux(
			'{"type":"result","result":"first"}\n{"type":"result", broken\n{"type":"result","result":"last"}\n',
		);
		assert.equal(resultat?.result, "last");
		assert.equal(tueeEnCours, false);
	});
});
