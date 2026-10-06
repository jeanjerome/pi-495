import type { Terminal } from "@earendil-works/pi-tui";

/** A terminal of a fixed size that keeps everything a TUI writes to it, and sends nothing back. */
export class FakeTerminal implements Terminal {
	written = "";
	readonly columns: number;
	readonly rows: number;
	readonly kittyProtocolActive = false;

	constructor(columns: number, rows: number) {
		this.columns = columns;
		this.rows = rows;
	}

	/** What the terminal received, with its control sequences removed. */
	text(): string {
		// biome-ignore lint/suspicious/noControlCharactersInRegex: the control sequences are what is removed
		return this.written.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[=>78]/g, "");
	}

	start(): void {}
	stop(): void {}
	async drainInput(): Promise<void> {}
	write(data: string): void {
		this.written += data;
	}
	moveBy(): void {}
	hideCursor(): void {}
	showCursor(): void {}
	clearLine(): void {}
	clearFromCursor(): void {}
	clearScreen(): void {}
	setTitle(): void {}
	setProgress(): void {}
}
