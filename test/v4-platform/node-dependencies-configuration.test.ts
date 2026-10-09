/**
 * What the package carries to configure Knip 6.40.0 besides its configuration files, checked on the package `users`
 * once dependency-cruiser, swc and Knip are installed in its copy: the `knip` key of `package.json`, which Knip
 * merges under the configuration it is given key by key, and `.gitignore`, whose files Knip does not read when it
 * follows it. Neither silences a gap: the configuration 495 writes sets every key the `knip` key could set, and
 * makes every source an entry, which Knip lists without following `.gitignore`.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import {
	adoptedCopy,
	assertStoryGaps,
	located,
	PG_LINE,
	qualifiedAndPassed,
	REPOSITORY,
	USED_UNDECLARED,
	USERS_MANIFEST,
} from "../helpers/node-dependencies-copy.ts";

describe("no configuration of Knip the package carries silences a gap", () => {
	const cleanups = removedAfterEach();

	it("une clé knip de package.json qui fait ignorer lodash et src/adapters/** laisse le contrôle des dépendances qualifié et la passe de référence rapporte l'usage de pg et la déclaration inutilisée de lodash", async () => {
		const root = outputDir("node-dependencies-key-", cleanups);
		const manifest = { ...USERS_MANIFEST, knip: { ignoreDependencies: ["lodash"], ignore: ["src/adapters/**"] } };
		const reference = adoptedCopy(root, { "package.json": `${JSON.stringify(manifest, null, 2)}\n` });
		const { qualification: q, pass } = await qualifiedAndPassed(root, reference);
		assert.deepEqual([q.positive, q.negative, q.qualified], ["PASS", "FAIL", true], JSON.stringify(q.notes));
		assertStoryGaps(reference, pass);
	});

	it("un .gitignore qui liste src/adapters/ laisse le contrôle qualifié et la passe de référence rapporte l'usage de pg", async () => {
		const root = outputDir("node-dependencies-gitignore-", cleanups);
		const reference = adoptedCopy(root, { ".gitignore": "node_modules/\nsrc/adapters/\n" });
		const { qualification: q, pass } = await qualifiedAndPassed(root, reference);
		assert.deepEqual([q.positive, q.negative, q.qualified], ["PASS", "FAIL", true], JSON.stringify(q.notes));
		assert.ok(
			located(pass.findings).includes(`${USED_UNDECLARED} | ${REPOSITORY}:${PG_LINE}`),
			`the use of pg is reported: ${located(pass.findings).join("\n")}; ${pass.limits.notes.join("; ")}`,
		);
	});
});
