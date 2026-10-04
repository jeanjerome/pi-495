import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { PiRpcClient } from "../helpers/rpc-client.ts";

describe("the RPC client a campaign drives Pi with", () => {
	it("fails a wait as soon as Pi exits, with its exit code and what it wrote on stderr", async () => {
		const client = new PiRpcClient({
			bin: process.execPath,
			args: ["-e", 'console.error("Model not found"); process.exit(3)'],
			cwd: process.cwd(),
			env: process.env,
		});
		const debut = Date.now();
		await assert.rejects(
			client.waitFor(() => false, 60_000),
			/Pi exited with code 3 .*Model not found/,
		);
		assert.ok(Date.now() - debut < 10_000, "the wait ends with Pi, not with its timeout");
		await client.close();
	});
});
