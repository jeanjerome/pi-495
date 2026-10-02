import { strict as assert } from "node:assert";
import dns from "node:dns";
import net from "node:net";
import { describe, it } from "node:test";
import { locateModel } from "../../src/domain/policy.ts";

const ON_MACHINE = [
	"http://127.0.0.1:8000/v1",
	"http://localhost:1234",
	"http://[::1]:8080",
	"http://LOCALHOST:1234/v1",
	"http://127.255.255.254:8000",
	// The URL parser normalizes this IPv4 shorthand to 127.0.0.1; the rule reads the normalized form.
	"http://127.1:8000",
];

const OFF_MACHINE: Array<string | undefined> = [
	"https://api.example.com/v1",
	undefined,
	"",
	"not an address",
	// Without a scheme, `localhost` is read as the scheme and the host is empty.
	"localhost:1234",
	"http://localhost.example.com",
	"http://127.0.0.1.nip.io:8000",
	"http://0.0.0.0:8000",
	"http://localhost@api.example.com",
	"http://128.0.0.1:8000",
	// A private network is still off this machine, even when it stays on the network.
	"http://192.168.1.10:8000",
	// Only ::1 is named loopback for IPv6; a mapped IPv4 form is not.
	"http://[::ffff:127.0.0.1]:8000",
];

describe("where a model sits, read from the address Pi holds for it (SEC-05)", () => {
	for (const address of ON_MACHINE)
		it(`situates ${address} on this machine`, () => {
			assert.equal(locateModel(address), "on_machine");
		});

	for (const address of OFF_MACHINE)
		it(`situates ${JSON.stringify(address)} off this machine`, () => {
			assert.equal(locateModel(address), "off_machine", "whatever is not a loopback address leaves the machine");
		});

	it("resolves no name and opens no connection to decide", (t) => {
		const touched = [
			t.mock.method(dns, "lookup"),
			t.mock.method(dns, "resolve"),
			t.mock.method(dns, "resolve4"),
			t.mock.method(dns, "resolve6"),
			t.mock.method(dns.promises, "lookup"),
			t.mock.method(dns.promises, "resolve"),
			t.mock.method(net, "connect"),
			t.mock.method(net, "createConnection"),
		];
		for (const address of [...ON_MACHINE, ...OFF_MACHINE]) {
			const location: unknown = locateModel(address);
			assert.equal(typeof location, "string", "the location is read at once, never awaited");
		}
		assert.deepEqual(
			touched.map((m) => m.mock.callCount()),
			touched.map(() => 0),
			"reading the location reached the network",
		);
	});
});
