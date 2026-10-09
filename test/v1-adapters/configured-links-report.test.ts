/**
 * The links a Maven reactor establishes without an import, read against the adopted map: a full name of a class
 * the main sources declare, written in a string of a main Java source (by reflection) or in another text file
 * under `src/main/` (by configuration), is a finding at its file and line when it reaches a part the relations of
 * the map do not permit. A name in a Java comment, in a test source or in a binary file is not a link. The runner
 * and the reader are the real ones; the control runs nothing.
 */
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import {
	CONFIGURED_LINKS_REACTOR,
	linkLineOf,
	PERMITTED_LINKS_REACTOR,
	REPOSITORY_PROPERTIES,
	USER_LOADER,
} from "../helpers/configured-links-reactor.ts";
import { DEPENDENCIES_MAP } from "../helpers/dependencies-reactor.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let root: string;
const cleanups = removedAfterEach();

beforeEach(() => {
	root = tempDir("495-configured-links-", cleanups);
});

/** The control of the links established by configuration or by reflection, run on a copy of `reactor`. */
async function readLinks(reactor: Record<string, string>) {
	const workspace = join(root, "ws");
	writeFiles(workspace, reactor);
	const control = controlOf({
		control_id: "configured-links",
		parser: "configured-links",
		architecture_map: DEPENDENCIES_MAP,
	});
	const runner = new GenericControlRunner(
		new UnconfinedSandbox(),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);
	return (await runner.runControl({ ...invocationBase(), control, workspace_path: workspace, introduced_lines: {} }))
		.evidence;
}

describe("the links a Maven reactor establishes by configuration or by reflection are read against the map", () => {
	it("la chaîne io.demo.infra.UserStore passée à Class.forName dans UserLoader.java de domain donne un constat à sa ligne, marqué par réflexion, et repository.properties de domain un constat à la ligne qui nomme la classe, marqué par configuration, chacun nommant les parties domain et infrastructure", async () => {
		const evidence = await readLinks(CONFIGURED_LINKS_REACTOR);
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.deepEqual(
			evidence.findings.map((f) => `${f.path}:${f.region?.start_line ?? "-"}`),
			[
				`${USER_LOADER}:${linkLineOf(USER_LOADER, '"io.demo.infra.UserStore"')}`,
				`${REPOSITORY_PROPERTIES}:${linkLineOf(REPOSITORY_PROPERTIES, "io.demo.infra.UserStore")}`,
			],
		);
		const [reflected, configured] = evidence.findings;
		assert.match(configured!.message, /part domain depends on part infrastructure by configuration/);
		assert.match(reflected!.message, /part domain depends on part infrastructure by reflection/);
		for (const finding of evidence.findings) {
			assert.match(finding.message, /io\.demo\.infra\.UserStore/, "the finding names the class");
			assert.equal(finding.category, "structure");
		}
	});

	it("a member or a nested type written after a class designates that class, and a longer name ending with it designates none", async () => {
		const evidence = await readLinks({
			...PERMITTED_LINKS_REACTOR,
			[REPOSITORY_PROPERTIES]:
				"a=io.demo.infra.UserStore.INSTANCE\nb=io.demo.infra.UserStore$Entry\nc=com.io.demo.infra.UserStore\n",
		});
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.deepEqual(
			evidence.findings.map((f) => `${f.path}:${f.region?.start_line ?? "-"}`),
			[`${REPOSITORY_PROPERTIES}:1`, `${REPOSITORY_PROPERTIES}:2`],
		);
		for (const finding of evidence.findings) assert.match(finding.message, /naming io\.demo\.infra\.UserStore,/);
	});

	it("a configuration file or a POM past the read bound is named in the notes of the control, not skipped in silence", async () => {
		const padding = `<!-- ${"x".repeat(1024 * 1024)} -->\n`;
		const evidence = await readLinks({
			...PERMITTED_LINKS_REACTOR,
			"domain/src/main/resources/large.xml": padding,
			"app/pom.xml": `${PERMITTED_LINKS_REACTOR["app/pom.xml"]}${padding}`,
		});
		const notes = evidence.limits.notes.join("\n");
		assert.match(notes, /domain\/src\/main\/resources\/large\.xml exceeds/);
		assert.match(notes, /app\/pom\.xml exceeds/);
	});

	it("un octet nul après la ligne de repository.properties qui nomme io.demo.infra.UserStore et un autre dans un commentaire de UserLoader.java de domain font nommer ces deux fichiers dans les notes du contrôle, comme non lus parce qu'ils contiennent un octet nul, et aucun autre fichier de src/main/", async () => {
		const evidence = await readLinks({
			...CONFIGURED_LINKS_REACTOR,
			[REPOSITORY_PROPERTIES]: `${CONFIGURED_LINKS_REACTOR[REPOSITORY_PROPERTIES]}\u0000`,
			[USER_LOADER]: CONFIGURED_LINKS_REACTOR[USER_LOADER]!.replace(
				"public final class",
				"// \u0000\npublic final class",
			),
		});
		const unread = evidence.limits.notes.filter((note) => /not read because it holds a NUL byte/.test(note));
		const named = (path: string) => unread.some((note) => note.startsWith(`${path} `));
		assert.ok(named(REPOSITORY_PROPERTIES), `repository.properties is named unread: ${unread.join("; ")}`);
		assert.ok(named(USER_LOADER), `UserLoader.java is named unread: ${unread.join("; ")}`);
		const withoutNul = Object.entries(CONFIGURED_LINKS_REACTOR)
			.filter(([path, text]) => path.includes("/src/main/") && !text.includes("\u0000"))
			.map(([path]) => path)
			.filter((path) => path !== REPOSITORY_PROPERTIES && path !== USER_LOADER);
		for (const path of withoutNul) assert.ok(!named(path), `${path} holds no NUL byte and is not named`);
	});

	it("beans.xml d'app, qui nomme une classe d'une partie dont app peut dépendre, un commentaire de domain et une source de test de domain qui nomment io.demo.infra.UserStore ne donnent aucun constat", async () => {
		const evidence = await readLinks(PERMITTED_LINKS_REACTOR);
		assert.equal(evidence.verdict, "PASS", evidence.limits.notes.join("; "));
		assert.deepEqual(evidence.findings, []);
	});

	it("a string of a source and a configuration file of domain that name a class of another package of domain give no finding, a link inside a part not being judged", async () => {
		const evidence = await readLinks({
			...PERMITTED_LINKS_REACTOR,
			[USER_LOADER]:
				'package io.demo.domain.port;\n\npublic final class UserLoader {\n    Class<?> model() throws ClassNotFoundException {\n        return Class.forName("io.demo.domain.User");\n    }\n}\n',
			[REPOSITORY_PROPERTIES]: "repository.port=io.demo.domain.port.UserRepository\n",
		});
		assert.equal(evidence.verdict, "PASS", evidence.limits.notes.join("; "));
		assert.deepEqual(evidence.findings, []);
	});
});
