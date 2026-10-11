import { strict as assert } from "node:assert";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { READERS_OF_495 } from "../helpers/technologies.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-control-git-scopes-", cleanups);
});

/** A global configuration of the host, whose identity a control must never see. */
const HOST_CONFIGURATION = "[user]\n\tname = host\n\temail = host@example.invalid\n";

/**
 * The lines of `git config --list --show-<shown>` a control running `over` prints in a copy of its own; the control
 * has to pass, or an empty listing would only say that git did not run.
 */
async function configSeenBy(shown: "scope" | "origin", over: Partial<ControlDefinition>): Promise<string[]> {
	const ws = join(root, "ws");
	writeFiles(ws, { README: "a copy\n" });
	const runner = new GenericControlRunner(
		new UnconfinedSandbox(),
		new CasObjectStore(join(root, "objects")),
		READERS_OF_495,
	);
	const { evidence, observation } = await runner.runControl({
		...invocationBase(),
		control: controlOf({ command: ["git", "config", "--list", `--show-${shown}`], ...over }),
		workspace_path: ws,
	});
	assert.equal(evidence.verdict, "PASS", new TextDecoder().decode(observation?.stderr));
	return new TextDecoder().decode(observation?.stdout).split("\n").filter(Boolean);
}
const scopesSeenBy = (over: Partial<ControlDefinition>) => configSeenBy("scope", over);

/** Sets `variables` in the host's environment for the time of `run`, then gives the host back what it had. */
async function underHost(variables: Record<string, string>, run: () => Promise<void>): Promise<void> {
	const host = Object.fromEntries(Object.keys(variables).map((name) => [name, process.env[name]]));
	Object.assign(process.env, variables);
	try {
		await run();
	} finally {
		for (const [name, value] of Object.entries(host)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	}
}

describe("a control sees no git configuration of the host", () => {
	it("la configuration git qu'un contrôle voit n'a aucune entrée de portée globale ni système, même quand son environnement déclaré ou sa liste blanche pose GIT_CONFIG_GLOBAL", async () => {
		const home = join(root, "home");
		const gitconfig = join(home, ".gitconfig");
		writeFiles(home, { ".gitconfig": HOST_CONFIGURATION });
		const globalOrSystem = (lines: string[]) => lines.filter((l) => /^(global|system)\t/.test(l));

		assert.deepEqual(globalOrSystem(await scopesSeenBy({ env: { HOME: home } })), [], "under a HOME with a .gitconfig");
		await underHost({ GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_SYSTEM: gitconfig }, async () => {
			assert.deepEqual(
				globalOrSystem(
					await scopesSeenBy({
						env: { HOME: home, GIT_CONFIG_GLOBAL: gitconfig },
						env_allowlist: ["PATH", "HOME", "TMPDIR", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"],
					}),
				),
				[],
				"under a declared GIT_CONFIG_GLOBAL and an allowlist that passes the host's GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM",
			);
		});
	});

	it("aucune variable de configuration git que le contrôle déclare ou laisse passer ne lui fait relire la configuration globale de l'hôte, pas même par include.path", async () => {
		const home = join(root, "home");
		const gitconfig = join(home, ".gitconfig");
		writeFiles(home, { ".gitconfig": HOST_CONFIGURATION });
		const fromHost = (lines: string[]) => lines.filter((l) => l.includes(gitconfig));
		const include = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "include.path", GIT_CONFIG_VALUE_0: gitconfig };
		const parameters = { GIT_CONFIG_PARAMETERS: `'include.path'='${gitconfig}'` };

		for (const [declared, env] of Object.entries({
			"GIT_CONFIG_COUNT, GIT_CONFIG_KEY_0 and GIT_CONFIG_VALUE_0": include,
			GIT_CONFIG_PARAMETERS: parameters,
			GIT_CONFIG: { GIT_CONFIG: gitconfig },
		}))
			assert.deepEqual(
				fromHost(await configSeenBy("origin", { env: { HOME: home, ...env } })),
				[],
				`under a declared ${declared}`,
			);
		await underHost({ ...include, ...parameters, GIT_CONFIG: gitconfig }, async () => {
			assert.deepEqual(
				fromHost(
					await configSeenBy("origin", {
						env: { HOME: home },
						env_allowlist: [
							"PATH",
							"HOME",
							"TMPDIR",
							"GIT_CONFIG",
							...Object.keys(include),
							...Object.keys(parameters),
						],
					}),
				),
				[],
				"under an allowlist that passes the host's GIT_CONFIG, GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT, GIT_CONFIG_KEY_0 and GIT_CONFIG_VALUE_0",
			);
		});

		// The directory of the host's second global file, `.config/git/config`, is a template directory to git: a
		// repository the control initialises would copy that file as its own local configuration. Each case initialises
		// its own repository: git keeps the configuration of one it only reinitialises.
		const templates = join(home, ".config", "git");
		writeFiles(templates, { config: HOST_CONFIGURATION });
		const initialised = (repository: string) => ({
			command: ["sh", "-c", `git init -q ${repository} && git -C ${repository} config --list --show-origin`],
			env: { HOME: home },
		});
		const hostSettings = (lines: string[]) => lines.filter((l) => /\tuser\.(name|email)=host/.test(l));
		assert.deepEqual(
			hostSettings(
				await configSeenBy("origin", { ...initialised("declared"), env: { HOME: home, GIT_TEMPLATE_DIR: templates } }),
			),
			[],
			"in a repository initialised under a declared GIT_TEMPLATE_DIR",
		);
		await underHost({ GIT_TEMPLATE_DIR: templates }, async () => {
			assert.deepEqual(
				hostSettings(
					await configSeenBy("origin", {
						...initialised("allowlisted"),
						env_allowlist: ["PATH", "HOME", "TMPDIR", "GIT_TEMPLATE_DIR"],
					}),
				),
				[],
				"in a repository initialised under an allowlist that passes the host's GIT_TEMPLATE_DIR",
			);
		});
	});

	it("une variable déclarée ou laissée passer qui ne donne pas de configuration à git parvient encore au contrôle", async () => {
		await underHost({ JAVA_HOME: "/host/jdk" }, async () => {
			const seen = await configSeenBy("origin", {
				command: ["sh", "-c", 'printf "%s\\n%s\\n" "$MAVEN_OPTS" "$JAVA_HOME"'],
				env: { MAVEN_OPTS: "-Xmx1g" },
				env_allowlist: ["PATH", "HOME", "TMPDIR", "JAVA_HOME"],
			});
			assert.deepEqual(seen, ["-Xmx1g", "/host/jdk"], "a declared MAVEN_OPTS and an allowlisted JAVA_HOME");
		});
	});
});
