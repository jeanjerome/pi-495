import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { stripVTControlCharacters } from "node:util";
import { cloture, duree, ligneDuJournal, lignesDuFlux, ouverture } from "../../cycle/src/affichage.ts";

const REPO = "/tmp/depot";

// The lines as the owner reads them, without the colours a terminal would draw.
const flux = (evenement: unknown): string[] =>
	lignesDuFlux(JSON.stringify(evenement), REPO).map((l) => stripVTControlCharacters(l));

const assistant = (...content: unknown[]) => ({ type: "assistant", message: { content } });
const resultat = (content: unknown) => ({ type: "user", message: { content: [{ type: "tool_result", content }] } });

describe("the lines a session's stream shows", () => {
	it("shows nothing for a line that is not JSON", () => {
		assert.deepEqual(lignesDuFlux("npm warn config", REPO), []);
		assert.deepEqual(lignesDuFlux("{not json", REPO), []);
	});

	it("shows the agent's text, each of its lines indented", () => {
		assert.deepEqual(flux(assistant({ type: "text", text: "Je lis le code.\nPuis j'écris le test." })), [
			"  Je lis le code.\n  Puis j'écris le test.",
		]);
	});

	it("shows a Bash call with its command and its description", () => {
		assert.deepEqual(
			flux(assistant({ type: "tool_use", name: "Bash", input: { command: "npm test", description: "Run the suite" } })),
			["  $ npm test   # Run the suite"],
		);
	});

	it("hides the structured output a session returns", () => {
		assert.deepEqual(flux(assistant({ type: "tool_use", name: "StructuredOutput", input: { status: "faite" } })), []);
	});

	it("shows each commit a git commit result reports", () => {
		assert.deepEqual(flux(resultat("[reprise-r98 a9a7064] test: the display is tested\n 1 file changed")), [
			"  ● commit a9a7064 test: the display is tested",
		]);
	});

	it("shows the totals of a node:test run that has a failure", () => {
		assert.deepEqual(flux(resultat([{ type: "text", text: "# tests 13\n# pass 12\n# fail 1" }])), [
			"  ✗ tests : 1 en échec, 12 passent",
		]);
	});
});

describe("the duration a line shows", () => {
	it("rounds to the second, then counts minutes, then hours", () => {
		assert.equal(duree(59_499), "59 s");
		assert.equal(duree(59_500), "1 min 00 s");
		assert.equal(duree(3_600_000), "1 h 00");
	});
});

describe("the lines a step opens and closes on", () => {
	it("places the step among the six, with the time and cost already spent", () => {
		assert.equal(
			stripVTControlCharacters(ouverture("e10s01", "relecture", 65_000, 3.5)),
			"\n▶ e10s01 · relecture — deux relecteurs neufs, deux tours au plus\n" +
				"  ✓ story  ✓ rouge-vert  ✓ autocontrole  ▶ relecture  · recette  · versement\n" +
				"  depuis 1 min 05 s · 3,50 $",
		);
	});

	it("names each outcome, with the duration, the cost and the commits", () => {
		const commits = [{ sha: "a9a70649af648855450e036df855499ab1dfe279", sujet: "refactor: one thing", fichiers: [] }];
		assert.equal(
			stripVTControlCharacters(cloture("rouge-vert", "fini", 125_000, 1.234, commits)),
			"■ rouge-vert · ✓ fini  2 min 05 s · 1,23 $\n  ● a9a7064 refactor: one thing",
		);
		assert.equal(
			stripVTControlCharacters(cloture("recette", "proprietaire", 5_000, 0, [])),
			"■ recette · ? décision attendue  5 s · 0,00 $",
		);
		assert.equal(
			stripVTControlCharacters(cloture("relecture", "bloque", 5_000, 0, [])),
			"■ relecture · ✗ bloqué  5 s · 0,00 $",
		);
	});
});

describe("the line a journal event shows", () => {
	it("shows a failed control with its verdict, revision, duration and first five failures", () => {
		const ligne = ligneDuJournal({
			at: "2026-10-04T10:01:05.000Z",
			pas: "rouge-vert",
			genre: "controle",
			controle: "preflight",
			verdict: "FAIL",
			revision: "a9a70649af648855450e036df855499ab1dfe279",
			started_at: "2026-10-04T10:00:00.000Z",
			ended_at: "2026-10-04T10:01:05.000Z",
			echecs: ["un", "deux", "trois", "quatre", "cinq", "six"],
		});
		assert.equal(
			stripVTControlCharacters(ligne ?? ""),
			"  ✗ preflight · FAIL à a9a7064 · 1 min 05 s\n    un\n    deux\n    trois\n    quatre\n    cinq",
		);
	});

	it("shows a green preparation with each exploration's outcome, and a preparation cited by its fingerprint", () => {
		const verte = ligneDuJournal({
			at: "2026-10-04T10:00:00.000Z",
			pas: "rouge-vert",
			genre: "preparation",
			verte: true,
			empreinte: `sha256:${"a".repeat(64)}`,
			resultats: [{ manifeste: "specs/formal/a/manifest.json", issue: "completed" }],
		});
		assert.equal(
			stripVTControlCharacters(verte ?? ""),
			"  ✓ préparation verte · specs/formal/a/manifest.json completed",
		);
		const retenue = ligneDuJournal({
			at: "2026-10-04T10:00:00.000Z",
			pas: "rouge-vert",
			genre: "preparation-retenue",
			empreinte: `sha256:${"a".repeat(64)}`,
		});
		assert.equal(stripVTControlCharacters(retenue ?? ""), "  ↺ préparation retenue, empreinte sha256:aaaaaaaaaaaa");
	});
});
