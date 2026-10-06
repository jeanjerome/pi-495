import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { Component, KeybindingsManager, TUI } from "@earendil-works/pi-tui";

type CustomFactory = (
	tui: unknown,
	theme: unknown,
	keybindings: KeybindingsManager,
	done: (result: unknown) => void,
) => Component;

/** A real TUI of `pi-tui`, and where Pi mounts the component `ctx.ui.custom()` returns in it. */
interface Screen {
	tui: TUI;
	mount(component: Component): void;
}

/**
 * Pi's interactive screen as `ctx.ui.custom()` lends it: the factory receives a TUI of 24 rows, an
 * unstyled theme, the keybindings manager the user configured and the completion callback, and the
 * component it returns is what the test draws and types into. Given a screen, the factory receives
 * its TUI and the component is mounted in it, as Pi mounts it in place of its editor.
 */
export class FakeCustomUi {
	component: Component | null = null;
	closed = false;
	private readonly keybindings: KeybindingsManager;
	private readonly screen: Screen | undefined;

	constructor(keybindings: KeybindingsManager, screen?: Screen) {
		this.keybindings = keybindings;
		this.screen = screen;
	}

	context(): ExtensionCommandContext {
		const tui = this.screen?.tui ?? { terminal: { rows: 24 }, requestRender: () => {} };
		const theme = {
			fg: (_color: string, s: string) => s,
			bg: (_color: string, s: string) => s,
			bold: (s: string) => s,
		};
		const custom = (factory: CustomFactory) =>
			new Promise<unknown>((resolve) => {
				this.component = factory(tui, theme, this.keybindings, (result) => {
					this.closed = true;
					resolve(result);
				});
				this.screen?.mount(this.component);
			});
		return { ui: { custom } } as unknown as ExtensionCommandContext;
	}
}
