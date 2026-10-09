/**
 * The configuration 495 writes for Knip 6.40.0 outside the copy and names on its command line, so that no
 * `knip.json`, `knip.ts` or other configuration file of the package is read, nor run: every source of the package
 * is an entry, out of `node_modules` and of what its tools write, so that a source nothing imports is read all
 * the same, and one the package's `.gitignore` lists too, since Knip lists entries without following it
 * (`dist/graph/build.js`); the packages 495 installs in the copy are left out of the comparison.
 *
 * Knip still merges the `knip` key of `package.json` under it, key by key (`Object.assign({}, manifest.knip, …)`,
 * `dist/util/create-options.js`), so it sets every key of the root of Knip's schema, and the root workspace, to
 * Knip's own default but those the rule asks for: none of the package's ignores, rules, issue types, paths,
 * workspaces or preprocessors stays.
 * The keys of its plugins are left to the package: one names the files of a tool Knip reads, and JSON has no value
 * that gives a plugin back to its detection.
 */
import { NODE_OUTPUTS } from "../shared.ts";
import { INSTALLED_BY_495 } from "./map-analysers.ts";

/** Every JavaScript or TypeScript source, outside of what the tools of the package write into the copy. */
const EVERY_SOURCE = ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}", ...NODE_OUTPUTS.map((output) => `!${output}**`)];

/**
 * What Knip's schema lets a workspace set, as the rule asks or at Knip's default. It is also the configuration of
 * the root workspace, `.`, which would otherwise be the package's own when its `knip` key names one.
 */
const ROOT_WORKSPACE = {
	entry: EVERY_SOURCE,
	project: EVERY_SOURCE,
	ignoreDependencies: INSTALLED_BY_495,
	paths: {},
	ignore: [],
	ignoreFiles: [],
	ignoreBinaries: [],
	ignoreGlobalBinaries: true,
	ignoreMembers: [],
	ignoreUnresolved: [],
	ignoreExportsUsedInFile: false,
	ignoreIssues: {},
	includeEntryExports: false,
};

/** The text of the configuration the dependencies control names. */
export function knipConfiguration(): string {
	const configuration = {
		...ROOT_WORKSPACE,
		rules: {},
		include: [],
		exclude: [],
		cycles: {},
		ignoreWorkspaces: [],
		compilers: {},
		asyncCompilers: {},
		tags: [],
		treatConfigHintsAsErrors: false,
		treatTagHintsAsErrors: false,
		preprocessor: [],
		preprocessorOptions: {},
		workspaces: { ".": ROOT_WORKSPACE },
	};
	return `${JSON.stringify(configuration, null, 2)}\n`;
}
