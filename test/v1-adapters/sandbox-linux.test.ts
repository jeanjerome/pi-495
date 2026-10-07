import { strict as assert } from "node:assert";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { BubblewrapSandbox, selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import type { SandboxProfile } from "../../src/ports/execution.ts";
import { linuxOnly, outputDir, removedAfterEach } from "../helpers/fixtures.ts";

const NODE = process.execPath;
let root: string;
const cleanups = removedAfterEach();
const PATH = process.env.PATH;
beforeEach(() => {
	root = outputDir("sbx-linux-", cleanups);
	mkdirSync(join(root, "ws"));
	mkdirSync(join(root, "secret"));
	writeFileSync(join(root, "secret", "key"), "s3cret");
});
afterEach(() => {
	process.env.PATH = PATH;
});

function profile(over: Partial<SandboxProfile> = {}): SandboxProfile {
	return {
		profile_id: "implement",
		read_paths: [root],
		write_paths: [join(root, "ws")],
		network: "denied",
		env_allowlist: ["PATH", "HOME", "TMPDIR"],
		env: { HARNESS495_TEST: "1" },
		...over,
	};
}

async function confined(sbx: BubblewrapSandbox, p: SandboxProfile, script: string): Promise<string> {
	const obs = await sbx.run(p, {
		command: [NODE, "-e", script],
		cwd: join(root, "ws"),
		timeout_ms: 20000,
		max_output_bytes: 65536,
	});
	assert.equal(obs.exit_code, 0, `${obs.spawn_error ?? ""} ${new TextDecoder().decode(obs.stderr)}`);
	return new TextDecoder().decode(obs.stdout).trim();
}

/** Opens a server on 127.0.0.1, connects to it, then tries a host outside: `self:<outcome>,remote:<outcome>`. */
const REACH_SELF_THEN_ELSEWHERE = [
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

/** A `bwrap` first on PATH that runs the script `body`. */
function fakeBwrap(body: string): void {
	const bin = join(root, "bin");
	mkdirSync(bin);
	writeFileSync(join(bin, "bwrap"), `#!/bin/sh\n${body}\n`);
	chmodSync(join(bin, "bwrap"), 0o755);
	process.env.PATH = `${bin}:${PATH}`;
}

describe("bubblewrap on Linux (SEC-01, SEC-02, ADR-013)", () => {
	it(
		"bubblewrap qualifies for linux-<architecture> and confines writes, protected reads, symlink escapes and the home directory",
		linuxOnly,
		async () => {
			const selected = selectSandbox({ allow_unconfined: false });
			assert.equal(selected.backend.backend, "bubblewrap");
			assert.equal(selected.qualification.qualified, true, selected.qualification.reasons.join("; "));
			assert.equal(selected.qualification.platform, `linux-${process.arch}`);
			const sbx = new BubblewrapSandbox({ denied_read_paths: [join(root, "secret")] });
			const text = await confined(
				sbx,
				profile(),
				[
					'const fs=require("fs");const out=[];',
					'try{fs.writeFileSync("in-ws.txt","1");out.push("ws:ok")}catch(e){out.push("ws:"+e.code)}',
					`try{fs.writeFileSync(${JSON.stringify(join(root, "outside.txt"))},"x");out.push("outside:ok")}catch(e){out.push("outside:"+e.code)}`,
					`try{fs.readFileSync(${JSON.stringify(join(root, "secret", "key"))});out.push("secret:ok")}catch(e){out.push("secret:"+e.code)}`,
					`try{fs.symlinkSync(${JSON.stringify(join(root, "secret", "key"))},"lnk");fs.readFileSync("lnk");out.push("symlink:ok")}catch(e){out.push("symlink:"+e.code)}`,
					'try{fs.writeFileSync(require("os").homedir()+"/.495-sbx-probe","x");out.push("home:ok")}catch(e){out.push("home:"+e.code)}',
					'console.log(out.join(","))',
				].join(""),
			);
			assert.equal(text, "ws:ok,outside:EROFS,secret:ENOENT,symlink:ENOENT,home:EROFS");
			assert.equal(existsSync(join(root, "outside.txt")), false);
			assert.equal(existsSync(join(homedir(), ".495-sbx-probe")), false);
			assert.equal(readFileSync(join(root, "ws", "in-ws.txt"), "utf8"), "1");
		},
	);
	it(
		"a protected file, not only a directory, cannot be read by a confined command, which gets EACCES",
		linuxOnly,
		async () => {
			const sbx = new BubblewrapSandbox({ denied_read_paths: [join(root, "secret", "key")] });
			const text = await confined(
				sbx,
				profile(),
				`try{console.log("secret:"+require("fs").readFileSync(${JSON.stringify(join(root, "secret", "key"))},"utf8"))}catch(e){console.log("secret:"+e.code)}`,
			);
			assert.equal(text, "secret:EACCES");
		},
	);
	it(
		"under a denied and a loopback network the command reaches itself, and 93.184.216.34:80 answers ENETUNREACH",
		linuxOnly,
		async () => {
			const sbx = new BubblewrapSandbox();
			assert.equal(
				await confined(sbx, profile({ network: "denied" }), REACH_SELF_THEN_ELSEWHERE),
				"self:ok,remote:ENETUNREACH",
			);
			assert.equal(
				await confined(sbx, profile({ network: "loopback" }), REACH_SELF_THEN_ELSEWHERE),
				"self:ok,remote:ENETUNREACH",
			);
		},
	);
	it(
		"a server the host opens on 127.0.0.1 is refused to a command under a denied or a loopback network, and answers it under an allowed one",
		linuxOnly,
		async () => {
			const server = createServer((s) => s.end("hi"));
			await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
			const { port } = server.address() as AddressInfo;
			const reachHost = [
				`const c=require("net").connect(${port},"127.0.0.1");`,
				'c.on("data",()=>{console.log("host:ok");process.exit(0)});',
				'c.on("error",(e)=>{console.log("host:"+e.code);process.exit(0)});',
			].join("");
			try {
				const sbx = new BubblewrapSandbox();
				assert.equal(await confined(sbx, profile({ network: "denied" }), reachHost), "host:ECONNREFUSED");
				assert.equal(await confined(sbx, profile({ network: "loopback" }), reachHost), "host:ECONNREFUSED");
				assert.equal(await confined(sbx, profile({ network: "allowed" }), reachHost), "host:ok");
			} finally {
				server.close();
			}
		},
	);
	it("under an allowed network 127.0.0.1:9 answers ECONNREFUSED, not ENETUNREACH", linuxOnly, async () => {
		const text = await confined(
			new BubblewrapSandbox(),
			profile({ network: "allowed" }),
			'require("net").connect(9,"127.0.0.1").on("error",e=>{console.log(e.code)})',
		);
		assert.equal(text, "ECONNREFUSED");
	});
	it(
		"a bwrap that exits 1 with « bwrap: No permissions to create new namespace » leaves a refusal citing that message",
		linuxOnly,
		() => {
			fakeBwrap('echo "bwrap: No permissions to create new namespace" >&2\nexit 1');
			const q = new BubblewrapSandbox().qualify(profile());
			assert.equal(q.qualified, false);
			assert.ok(
				q.reasons.some((r) => r.includes("bwrap: No permissions to create new namespace")),
				q.reasons.join("; "),
			);
		},
	);
	it(
		"the qualification has bwrap run a null command under the read-only root and in a network namespace of its own, not merely answer",
		linuxOnly,
		() => {
			const args = join(root, "bwrap-args");
			fakeBwrap(`printf '%s\\n' "$@" > ${JSON.stringify(args)}`);
			assert.equal(new BubblewrapSandbox().qualify(profile()).qualified, true);
			const asked = readFileSync(args, "utf8").trimEnd().split("\n");
			assert.ok(asked.join(" ").includes("--ro-bind / /"), asked.join(" "));
			assert.ok(asked.includes("--unshare-net"), asked.join(" "));
			assert.deepEqual(asked.slice(-2), ["--", "true"]);
		},
	);
	it("without bwrap in PATH the refusal says « bwrap not found in PATH »", linuxOnly, () => {
		const empty = join(root, "empty");
		mkdirSync(empty);
		process.env.PATH = empty;
		const q = new BubblewrapSandbox().qualify(profile());
		assert.equal(q.qualified, false);
		assert.ok(q.reasons.includes("bwrap not found in PATH"), q.reasons.join("; "));
	});
	it("a bwrap in PATH that cannot be executed leaves a refusal citing the spawn error", linuxOnly, () => {
		const bin = join(root, "bin");
		mkdirSync(bin);
		writeFileSync(join(bin, "bwrap"), "#!/bin/sh\n");
		chmodSync(join(bin, "bwrap"), 0o644);
		process.env.PATH = bin;
		const q = new BubblewrapSandbox().qualify(profile());
		assert.equal(q.qualified, false);
		assert.ok(
			q.reasons.some((r) => r.includes("EACCES")),
			q.reasons.join("; "),
		);
	});
});
