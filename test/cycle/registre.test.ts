import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defautDeLaStory, defautsOuverts, marquerCorrige } from "../../cycle/src/registre.ts";
import { tempDir } from "../helpers/fixtures.ts";

const REGISTRE = `bugs:
  - bug_id: BUG-2026-09-01T100000
    date: "2026-09-01"
    title: "A low defect"
    severity: low
    priority: p3
    what_happened: >
      Text that says status: open and severity: high inside a folded block.
    status: open
  - bug_id: BUG-2026-09-02T100000
    date: "2026-09-02"
    title: "A medium defect"
    severity: medium
    status: open
  - bug_id: BUG-2026-09-03T100000
    date: "2026-09-03"
    title: "A fixed defect"
    severity: high
    status: fixed
    fixed_in: abc1234
  - bug_id: BUG-2026-09-04T100000
    date: "2026-09-04"
    title: "A high defect"
    severity: high
    status: open
`;

function racine(): string {
	const root = tempDir();
	mkdirSync(join(root, "specs", "bugs"), { recursive: true });
	writeFileSync(join(root, "specs", "bugs", "registry.yaml"), REGISTRE);
	return root;
}

describe("the registry as the cycle reads it", () => {
	it("lists the open defects at or above a severity, most severe first, and ignores what a folded text says", () => {
		const root = racine();
		assert.deepEqual(
			defautsOuverts(root, "medium").map((d) => [d.id, d.gravite, d.titre]),
			[
				["BUG-2026-09-04T100000", "high", "A high defect"],
				["BUG-2026-09-02T100000", "medium", "A medium defect"],
			],
		);
		assert.deepEqual(
			defautsOuverts(root, "low").map((d) => d.id),
			["BUG-2026-09-04T100000", "BUG-2026-09-02T100000", "BUG-2026-09-01T100000"],
		);
	});

	it("moves an entry fixed at a revision to the archive, and touches no other line of the registry", () => {
		const root = racine();
		marquerCorrige(root, "BUG-2026-09-02T100000", "def5678");
		const entree =
			'  - bug_id: BUG-2026-09-02T100000\n    date: "2026-09-02"\n    title: "A medium defect"\n    severity: medium\n';
		assert.equal(
			readFileSync(join(root, "specs", "bugs", "registry.yaml"), "utf8"),
			REGISTRE.replace(`${entree}    status: open\n`, ""),
		);
		assert.equal(
			readFileSync(join(root, "specs", "bugs", "registry-fixed.yaml"), "utf8"),
			`bugs:\n${entree}    status: fixed\n    fixed_in: def5678\n`,
		);
		marquerCorrige(root, "BUG-2026-09-04T100000", "fed9876");
		assert.match(
			readFileSync(join(root, "specs", "bugs", "registry-fixed.yaml"), "utf8"),
			/fixed_in: def5678\n {2}- bug_id: BUG-2026-09-04T100000[\s\S]*fixed_in: fed9876\n$/,
		);
		assert.deepEqual(
			defautsOuverts(root, "low").map((d) => d.id),
			["BUG-2026-09-01T100000"],
		);
	});

	it("refuses to mark an entry that is unknown or not open", () => {
		const root = racine();
		assert.throws(() => marquerCorrige(root, "BUG-2026-09-09T100000", "x"), /not found/);
		assert.throws(() => marquerCorrige(root, "BUG-2026-09-03T100000", "x"), /is not open/);
	});

	it("reads the registry entry a correction story cites", () => {
		assert.equal(
			defautDeLaStory("Corrige BUG-2026-09-29T130000, puis BUG-2026-09-29T150000."),
			"BUG-2026-09-29T130000",
		);
		assert.equal(defautDeLaStory("aucune entrée citée"), null);
	});
});
