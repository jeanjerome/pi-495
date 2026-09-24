/**
 * 495 Pi extension (CMP-PI, ADR-001, ADR-009): deterministic `/495` commands, a closed
 * conversational tool without authority, session bindings kept outside the Pi session, mode-aware
 * presentation. All normative work happens in the application controller.
 *
 * This module wires the four surfaces Pi offers — lifecycle hooks, a command, a tool and a message
 * renderer — onto one session. It holds no state and decides nothing.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { registerCommand495 } from "./command.ts";
import { ExtensionSession } from "./session.ts";
import { registerTool495 } from "./tool.ts";

export default function harness495(pi: ExtensionAPI): void {
	const session = new ExtensionSession(pi);

	pi.on("session_start", async (_event, ctx) => session.openedAt(ctx));
	pi.on("model_select", async (event, ctx) => session.modelSelected(ctx, event.model));
	pi.on("session_shutdown", async () => session.close());
	pi.on("session_before_switch", async () => (session.busy ? { cancel: true } : undefined));
	pi.on("session_before_fork", async () => (session.busy ? { cancel: true } : undefined));

	pi.registerMessageRenderer(
		"495",
		(message, _options, theme) =>
			new Text(theme.fg("accent", "495 ") + theme.fg("text", String(message.content)), 0, 0),
	);

	registerCommand495(pi, session);
	registerTool495(pi, session);
}
