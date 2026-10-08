import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { sourceFolders } from "../../src/adapters/stacks/node/structure/source-folders.ts";
import { openProjectView } from "../../src/adapters/stacks/project-view.ts";
import { removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

describe("the folders of the main sources of a Node package", () => {
	it("are the folders that hold a JavaScript or TypeScript file which is not a test, outside the installed packages, what the tools write, the hidden directories and the root", () => {
		const root = tempDir("495-node-folders-", cleanups);
		writeFiles(root, {
			"package.json": "{}\n",
			"eslint.config.js": "export default [];\n",
			"src/index.ts": "export {};\n",
			"src/domain/model/user.ts": "export {};\n",
			"src/domain/types.d.ts": "export {};\n",
			"src/web/page.test.tsx": "export {};\n",
			"src/web/__tests__/page.js": "export {};\n",
			"src/web/page.css": "a {}\n",
			"lib/legacy.cjs": "module.exports = {};\n",
			"test/helpers/users.js": "export {};\n",
			"tests/unit.mjs": "export {};\n",
			"node_modules/left-pad/index.js": "module.exports = 1;\n",
			"dist/index.js": "export {};\n",
			"target/report.js": "export {};\n",
			".stryker-tmp/sandbox/src/index.js": "export {};\n",
			".husky/hook.js": "export {};\n",
		});
		assert.deepEqual(sourceFolders(openProjectView(root)), ["lib", "src", "src/domain/model"]);
	});

	it("are none in a package whose sources are all at its root", () => {
		const root = tempDir("495-node-folders-", cleanups);
		writeFiles(root, { "package.json": "{}\n", "index.js": "export {};\n" });
		assert.deepEqual(sourceFolders(openProjectView(root)), []);
	});
});
