import { strict as assert } from "node:assert";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { fixtureJava, tempDir, writeFiles, removedAfterEach } from "../helpers/fixtures.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const REFS = [{ requirement_id: "R1", revision: 1 }];
const COVERAGE = "the coverage of the introduced lines is not measured on this target: ";
const MUTATION = "the mutation of the introduced lines is not measured on this target: ";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-blind-spot-wording-", cleanups);
});

/** The blind spot that starts with `phrase`, which must be followed by a reason of its own. */
function reasonAfter(blindSpots: readonly string[], phrase: string): string {
	const spot = blindSpots.find((s) => s.startsWith(phrase));
	assert.ok(spot, `no blind spot starts with "${phrase}": ${blindSpots.join(" | ")}`);
	const reason = spot.slice(phrase.length);
	assert.ok(reason.length > 0, `the blind spot "${spot}" gives no reason`);
	return reason;
}

describe("the same missing capability gets the same words in every technology", () => {
	it("given a Maven project with neither JaCoCo nor a mutation engine and a Node project under node --test with neither coverage nor Stryker, then each names its missing coverage and mutation by the common phrase followed by its reason, and the Node project names the structure it does not offer", () => {
		const maven = join(root, "maven");
		fixtureJava(maven);
		const node = join(root, "node");
		writeFiles(node, {
			"package.json": JSON.stringify({ name: "t", type: "module", scripts: { test: "node --test" } }),
			"test/a.test.js": 'import { test } from "node:test";\ntest("a", () => {});\n',
		});

		const mavenSpots = STACKS_OF_495.recognise(maven, REFS).capability_missing;
		const nodeSpots = STACKS_OF_495.recognise(node, REFS).capability_missing;

		assert.equal(reasonAfter(mavenSpots, COVERAGE), "no JaCoCo report bound outside a profile (QLT-04)");
		reasonAfter(mavenSpots, MUTATION);
		reasonAfter(nodeSpots, COVERAGE);
		reasonAfter(nodeSpots, MUTATION);
		assert.ok(
			nodeSpots.includes(
				"no dependency direction between modules is checked on this target: the node technology does not offer it",
			),
			nodeSpots.join(" | "),
		);
	});
});
