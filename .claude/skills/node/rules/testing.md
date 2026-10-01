---
name: testing
description: Testing with node:test in the pi-495 tree
metadata:
  tags: testing, node-test, fakes, isolation, assert
---

# Testing with `node:test`

## Shape of a test

```typescript
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { digestValue } from "../../src/contracts/digest.ts";
import { DomainError } from "../../src/domain/errors.ts";

describe("digestValue", () => {
	it("gives the same digest to two values that differ only by key order", () => {
		assert.equal(digestValue({ a: 1, b: [2, 3] }), digestValue({ b: [2, 3], a: 1 }));
	});

	it("names the algorithm in the digest", () => {
		assert.match(digestValue(""), /^sha256:[0-9a-f]{64}$/);
	});
});

describe("Program.open", () => {
	it("refuses to open a program that already exists", () => {
		const program = programWithOneOpen();
		assert.throws(
			() => program.open(sameRequest()),
			(error: unknown) => {
				assert.ok(error instanceof DomainError, String(error));
				assert.equal(error.code, "PRECONDITION_FAILED");
				return true;
			},
		);
	});
});
```

- `import { strict as assert } from "node:assert"` and `describe`/`it`, as the whole tree does. Not
  `t.assert`, not `node:assert` loose mode: one style keeps a grep over `test/` meaningful.
- An error is checked by `instanceof DomainError` and its `code`, through `assert.rejects` or
  `assert.throws`; never by matching a message alone.
- Assert only through the public interface: return values, contracts, view state. Never on private
  state (`CONVENTIONS.md` § Tests).
- Test every boundary: empty input, maximum, minimum, the off-by-one.

## Where a test goes

```
test/
  v0/ .. v4/     generations; a test lives in the generation of the behaviour it pins
  helpers/       fakes (FakePi, FakeNpmSandbox, FakeWorker...), fixtures builders, the RPC client
  fixtures/      recorded reports (jest, junit, lcov) and the review corpus
  cycle/         the tests of cycle/src
```

Tests are not colocated with sources. A new function gets a test; a bug fix gets a regression test.

A test is written before the code it pins and seen failing on the assertion the story states, then
the code is written (`cycle/README.md` § Les six pas). The tool replays each test-only commit in a
detached tree and refuses a red that does not fail on a read test.

## Fakes, not mocks

A fake for external I/O is a class in `test/helpers/`, named `Fake<Thing>`, implementing the port
the code depends on: `FakePi`, `FakeNpmSandbox`, `FakeMavenControls`. The code under test receives
it through its constructor or parameter, exactly as production receives the real adapter
(`CONVENTIONS.md` § Dependencies).

```typescript
class FakeClock implements Clock {
	now = 1_700_000_000_000;
	tick(ms: number): void {
		this.now += ms;
	}
	read(): number {
		return this.now;
	}
}
```

`t.mock.fn` and `t.mock.method` are not used on modules of the tree: a dependency reached through a
port needs no module mock. `t.mock.timers` is acceptable to pin a timeout without waiting for it.

## Isolation and independence

Tests must not share mutable state, nor depend on their order: `npm test` runs with
`--test-concurrency=1`, so a leak shows up as a failure in a later file, not in the one that leaks.

```typescript
// BAD - shared mutable state
let counter = 0;
it("first", () => { counter++; assert.equal(counter, 1); });
it("second", () => { counter++; assert.equal(counter, 2); }); // depends on the first

// GOOD - each test owns its state
it("first", () => { let counter = 0; counter++; assert.equal(counter, 1); });
```

A test that writes to disk creates its own directory (`mkdtempSync`) and removes it in `afterEach`.
A test that spawns a process waits for its exit before the test returns.

## EventEmitter timing

Register the listener before the action that emits. An `emit()` that runs before `on()`, `once()` or
`events.once()` is lost, and the test hangs or fails intermittently.

```typescript
import { EventEmitter, once } from "node:events";

it("waits for the ready event", async () => {
	const emitter = new EventEmitter();
	const ready = once(emitter, "ready"); // subscribe first
	startWorkThatEmitsReady(emitter);
	const [payload] = await ready;
	assert.equal(payload.status, "ok");
});
```

## Lifecycle hooks

```typescript
import { afterEach, beforeEach, describe, it } from "node:test";

describe("Ledger", () => {
	let dir: string;
	beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ledger-")); });
	afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
	it("records an event once", () => { /* ... */ });
});
```

`before`/`after` for a resource shared by a whole `describe` is acceptable only when the resource is
read-only for every test in it.

## Running

```bash
npm test                                  # whole suite, concurrency 1, what Preflight runs
npm run test:v2                           # one generation while iterating
node --test test/v2/foo.test.ts           # one file
node --test --test-name-pattern "digest" test/v2/foo.test.ts
node --test --test-only test/v2/foo.test.ts   # with it.only / test.only on the one to isolate
```

No coverage tool is configured, and no snapshot testing is used. Never skip a test without a written
note on what stays unresolved.

See [flaky-tests.md](./flaky-tests.md) when a test fails only in the suite, and
[stuck-processes-and-tests.md](./stuck-processes-and-tests.md) when the runner does not exit.
