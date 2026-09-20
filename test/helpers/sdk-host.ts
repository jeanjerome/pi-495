/**
 * The SDK entry of the V3 campaign: a host process that loads the 495 package through
 * `createAgentSession` and a `DefaultResourceLoader`, instead of letting the `pi` CLI discover it.
 *
 * Pi has four extension modes — tui, rpc, json, print — so an SDK host is not a fifth mode but a
 * fifth way of loading the package; it binds the mode it wants. This host binds `json`, which is
 * the one that carries the canonical view in `details`.
 *
 * Usage: node test/helpers/sdk-host.ts <cwd> <extension> <mode> <prompt>...
 * Writes one JSON line on stdout, prefixed with a sentinel so the package's own output cannot be
 * mistaken for it.
 */
import {
	createAgentSession,
	DefaultResourceLoader,
	SessionManager,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";

const SENTINEL = "495-SDK-HOST:";
const [cwd, extension, mode, ...prompts] = process.argv.slice(2);
if (!cwd || !extension || !mode) throw new Error("usage: sdk-host.ts <cwd> <extension> <mode> <prompt>...");

const loader = new DefaultResourceLoader({
	cwd,
	agentDir: getAgentDir(),
	noExtensions: true,
	noSkills: true,
	noPromptTemplates: true,
	noThemes: true,
	noContextFiles: true,
	additionalExtensionPaths: [extension],
});
await loader.reload();
const { session, extensionsResult } = await createAgentSession({
	cwd,
	resourceLoader: loader,
	sessionManager: SessionManager.inMemory(),
});
await session.bindExtensions({ mode: mode as "json" | "print" | "rpc" | "tui" });

const messages: { content: string; details: Record<string, unknown> }[] = [];
session.subscribe((event) => {
	if (event.type !== "message_end") return;
	const message = event.message as { customType?: string; content?: unknown; details?: Record<string, unknown> };
	if (message?.customType === "495")
		messages.push({ content: String(message.content ?? ""), details: message.details ?? {} });
});
for (const prompt of prompts) await session.prompt(prompt);
process.stdout.write(`${SENTINEL}${JSON.stringify({ errors: extensionsResult.errors, messages })}\n`);
session.dispose();
process.exit(0);
