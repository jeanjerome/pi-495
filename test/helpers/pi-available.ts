import { execFileSync } from "node:child_process";

/** The Pi binary the real-Pi tests drive. */
export const PI = process.env.HARNESS495_PI_BIN ?? "pi";

function piAvailable(): boolean {
	try {
		execFileSync(PI, ["--version"], { stdio: "ignore", timeout: 20000 });
		return true;
	} catch {
		return false;
	}
}

/** The skip note of a suite that needs a real Pi, or `false` when the binary answers. */
export const skipWithoutPi = !piAvailable() && "pi binary not available";
