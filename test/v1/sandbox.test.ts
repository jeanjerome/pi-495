import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { SeatbeltSandbox, UnconfinedSandbox, BubblewrapSandbox, selectSandbox, startupIncident } from "../../src/adapters/sandbox/backends.ts";
import { incidentOf, parseExitCode } from "../../src/adapters/execution/parsers.ts";
import type { SandboxProfile } from "../../src/ports/execution.ts";
import { mkdtempSync } from "node:fs";

const NODE = process.execPath;
let root: string;
beforeEach(() => { mkdirSync(join(process.cwd(), "test-output"), { recursive: true }); root = mkdtempSync(join(process.cwd(), "test-output", "sbx-")); mkdirSync(join(root, "ws")); mkdirSync(join(root, "secret")); writeFileSync(join(root, "secret", "key"), "s3cret"); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

function profile(over: Partial<SandboxProfile> = {}): SandboxProfile {
	return { profile_id: "implement", read_paths: [root], write_paths: [join(root, "ws")], network: "denied", env_allowlist: ["PATH", "HOME", "TMPDIR"], env: { HARNESS495_TEST: "1" }, ...over };
}

const darwinOnly = process.platform === "darwin" ? it : it.skip;

describe("sandbox backends (SEC-01, SEC-02, ADR-013, C-SEC)", () => {
	darwinOnly("seatbelt qualifies on macOS and confines writes, sensitive reads, symlink escapes and network", async () => {
		const sbx = new SeatbeltSandbox({ denied_read_paths: [join(root, "secret")] });
		const q = sbx.qualify(profile());
		assert.equal(q.qualified, true, q.reasons.join(";"));
		const script = [
			'const fs=require("fs");const out=[];',
			'try{fs.writeFileSync("in-ws.txt","1");out.push("ws:ok")}catch(e){out.push("ws:"+e.code)}',
			`try{fs.writeFileSync(${JSON.stringify(join(root, "outside.txt"))},"x");out.push("outside:ok")}catch(e){out.push("outside:"+e.code)}`,
			`try{fs.readFileSync(${JSON.stringify(join(root, "secret", "key"))});out.push("secret:ok")}catch(e){out.push("secret:"+e.code)}`,
			`try{fs.symlinkSync(${JSON.stringify(join(root, "secret", "key"))},"lnk");fs.readFileSync("lnk");out.push("symlink:ok")}catch(e){out.push("symlink:"+e.code)}`,
			'try{fs.writeFileSync(require("os").homedir()+"/.495-sbx-probe","x");out.push("home:ok")}catch(e){out.push("home:"+e.code)}',
			'require("http").get("http://127.0.0.1:9",()=>{out.push("net:ok");done()}).on("error",e=>{out.push("net:"+e.code);done()});',
			'function done(){console.log(out.join(","))}',
		].join("");
		const obs = await sbx.run(profile(), { command: [NODE, "-e", script], cwd: join(root, "ws"), timeout_ms: 20000, max_output_bytes: 65536 });
		const text = new TextDecoder().decode(obs.stdout).trim();
		assert.equal(obs.exit_code, 0, new TextDecoder().decode(obs.stderr));
		assert.match(text, /ws:ok/);
		assert.match(text, /outside:EPERM/);
		assert.match(text, /secret:EPERM/);
		assert.match(text, /symlink:EPERM/);
		assert.match(text, /home:EPERM/);
		assert.match(text, /net:EPERM|net:ECONNREFUSED/);
		assert.equal(existsSync(join(root, "outside.txt")), false);
		assert.equal(existsSync(join(homedir(), ".495-sbx-probe")), false);
		assert.equal(readFileSync(join(root, "ws", "in-ws.txt"), "utf8"), "1");
	});
	darwinOnly("seatbelt lets a loopback profile reach itself and no other host (VER-04)", async () => {
		// A mutation engine forks worker processes and talks to them over a socket. The narrowest grant
		// that lets such a tool run is the loopback interface: the confinement SEC-02 claims is kept,
		// because no host but this one is reachable.
		const sbx = new SeatbeltSandbox();
		const script = [
			'const net=require("net");const out=[];',
			'const srv=net.createServer((s)=>s.end("hi")).listen(0,"127.0.0.1",()=>{',
			'const c=net.connect(srv.address().port,"127.0.0.1");',
			'c.on("data",()=>{out.push("self:ok");c.end();srv.close();elsewhere()});',
			'c.on("error",(e)=>{out.push("self:"+e.code);srv.close();elsewhere()});});',
			'srv.on("error",(e)=>{out.push("bind:"+e.code);elsewhere()});',
			'function elsewhere(){const r=net.connect(80,"93.184.216.34");',
			'r.on("error",(e)=>{out.push("remote:"+e.code);done()});r.on("connect",()=>{out.push("remote:ok");done()});}',
			'function done(){console.log(out.join(","));process.exit(0)}',
		].join("");
		const obs = await sbx.run(profile({ network: "loopback" }), { command: [NODE, "-e", script], cwd: join(root, "ws"), timeout_ms: 20000, max_output_bytes: 4096 });
		assert.equal(new TextDecoder().decode(obs.stdout).trim(), "self:ok,remote:EPERM", new TextDecoder().decode(obs.stderr));
	});
	darwinOnly("seatbelt allows network only when the mandate says so", async () => {
		const sbx = new SeatbeltSandbox();
		const obs = await sbx.run(profile({ network: "allowed" }), { command: [NODE, "-e", 'require("net").connect(9,"127.0.0.1").on("error",e=>{console.log(e.code)})'], cwd: join(root, "ws"), timeout_ms: 10000, max_output_bytes: 4096 });
		assert.equal(new TextDecoder().decode(obs.stdout).trim(), "ECONNREFUSED");
	});
	it("unconfined never qualifies and declares missing confinement capabilities", () => {
		const q = new UnconfinedSandbox().qualify(profile());
		assert.equal(q.qualified, false);
		assert.equal(q.capabilities.filesystem_confinement, false);
		const sel = selectSandbox({ allow_unconfined: true });
		assert.equal(sel.backend.backend, "unconfined");
		assert.equal(sel.qualification.qualified, false);
	});
	it("bubblewrap never qualifies, whatever the machine offers, because Linux is not claimed", () => {
		const q = new BubblewrapSandbox().qualify(profile());
		assert.equal(q.qualified, false);
		assert.ok(q.reasons.includes(BubblewrapSandbox.NOT_CLAIMED), q.reasons.join("; "));
		const sel = selectSandbox({ allow_unconfined: false }, "linux");
		assert.equal(sel.backend.backend, "bubblewrap");
		assert.equal(sel.qualification.qualified, false);
	});
	it("a confinement tool that could not start reports an incident, not a verdict on the target (RM-016)", () => {
		const base = { signal: null, timed_out: false, spawn_error: null, stdout: new Uint8Array(), stdout_truncated: false, stderr_truncated: false, started_at: "t", ended_at: "t", duration_ms: 0 };
		const text = (s: string) => new TextEncoder().encode(s);
		// bwrap refuses before the command runs: nothing about the target was measured.
		const refused = startupIncident({ ...base, exit_code: 1, stderr: text("bwrap: Creating new namespace failed: Operation not permitted\n") }, "bwrap: ", 1, "fallback");
		assert.equal(refused?.exit_code, null, "no exit code is attributed to a command that never ran");
		assert.equal(refused?.spawn_error, "bwrap: Creating new namespace failed: Operation not permitted");
		assert.equal(incidentOf(refused!), "spawn error: bwrap: Creating new namespace failed: Operation not permitted");
		assert.equal(parseExitCode(refused!).verdict, "INDETERMINATE");
		// A control of the target that genuinely failed keeps its verdict.
		assert.equal(startupIncident({ ...base, exit_code: 1, stderr: text("1 test failed\n") }, "bwrap: ", 1, "fallback"), null);
		assert.equal(startupIncident({ ...base, exit_code: 0, stderr: text("bwrap: noise\n") }, "bwrap: ", 1, "fallback"), null);
	});
	it("the process runner enforces timeout, kills the process group and bounds output (NFR-04, §12.3)", async () => {
		const sbx = new UnconfinedSandbox();
		const t0 = Date.now();
		const obs = await sbx.run(profile(), { command: [NODE, "-e", 'require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"]);setInterval(()=>{},1000)'], cwd: root, timeout_ms: 500, max_output_bytes: 1024 }, undefined);
		assert.equal(obs.timed_out, true);
		assert.ok(Date.now() - t0 < 5000);
		const big = await sbx.run(profile(), { command: [NODE, "-e", 'process.stdout.write("x".repeat(10000))'], cwd: root, timeout_ms: 10000, max_output_bytes: 1000 });
		assert.equal(big.stdout.byteLength, 1000);
		assert.equal(big.stdout_truncated, true);
		assert.equal(big.exit_code, 0);
		const missing = await sbx.run(profile(), { command: ["/nonexistent/binary-495"], cwd: root, timeout_ms: 1000, max_output_bytes: 100 });
		assert.ok(missing.spawn_error);
		assert.equal(missing.exit_code, null);
	});
	it("environment is built from the allowlist only, no shell is involved", async () => {
		process.env.HARNESS495_LEAK = "leak";
		const sbx = new UnconfinedSandbox();
		const obs = await sbx.run(profile(), { command: [NODE, "-e", 'console.log(JSON.stringify({leak:process.env.HARNESS495_LEAK||null,test:process.env.HARNESS495_TEST,argv:process.argv.slice(1)}))', "$HOME", "a b"], cwd: root, timeout_ms: 10000, max_output_bytes: 4096 });
		const parsed = JSON.parse(new TextDecoder().decode(obs.stdout));
		assert.equal(parsed.leak, null);
		assert.equal(parsed.test, "1");
		assert.deepEqual(parsed.argv, ["$HOME", "a b"]);
		delete process.env.HARNESS495_LEAK;
	});
});
