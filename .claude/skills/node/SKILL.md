---
name: node
description: Node.js practices for the pi-495 tree, where TypeScript runs by type stripping under Node 24 (`node x.ts`, `node --test` on `.ts`), tests use `node:test` with `describe`/`it` and `strict as assert`, errors are `DomainError` with a code or `Error` with a `cause`, and a fact about a dependency is read under `node_modules/`. Use when writing or debugging anything under `src/`, `cycle/src/`, `scripts/` or `test/`; when `node --test` hangs, does not exit, or fails only in the full suite; when a `.ts` file fails to load; when child processes, timers or AbortController are involved; when streams carry a process's output; or when a fact about Pi or another installed package must be read rather than guessed.
metadata:
  tags: node, nodejs, typescript, type-stripping, node-test, pi-495
---

## Provenance

Adapted from the `node` skill of mcollina/skills (MIT, commit 856efd2 of 2026-08-17; the licence is
in `../LICENSE-mcollina-skills`). The rules on HTTP servers, pino logging, caching libraries, `.env`
configuration, graceful shutdown of servers and load testing were removed: pi-495 is a Pi extension
with no server, no framework and, under `src/`, no process of its own. Where a kept rule names a
third-party package, `CONVENTIONS.md` § Dependencies decides: inspect what the tree already has,
wrap a library behind a port, attribute it in `NOTICE`.

## What is already settled in this tree

- Node ≥ 24; every entry point runs TypeScript by type stripping: `node scripts/x.ts`,
  `node cycle/src/main.ts`, `node --test` on `.ts`. No ts-node, no tsx, no build before a test.
  `npm run build` emits `dist/` for Pi only, and `dist/` is rebuilt before `npm run check`.
- `tsconfig.json` sets `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`. Relative imports carry `.ts`.
- Tests: `node:test`, `describe`/`it`, `import { strict as assert } from "node:assert"`, under
  `test/v0-pure` .. `test/v4-platform`, run with `--test-concurrency=1`. A fake for external I/O is a class in
  `test/helpers/`. The test is written first and seen failing before the code.
- Errors: `DomainError` (`src/domain/errors.ts`) with a code and a category in the domain; a plain
  `Error` with `cause` in the adapters. No global handlers.
- Commands: `npm run typecheck`, `npm test` or `npm run test:v0` .. `test:v4` and `test:cycle`, `npm run check`
  (Preflight, green before forward work and before every commit).

## Common workflows

**A `.ts` file fails to load** (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, `ERR_MODULE_NOT_FOUND`,
`ERR_UNKNOWN_FILE_EXTENSION`): look for an enum, a namespace, a parameter property, a relative import
without `.ts`, or a type imported as a value → [rules/typescript.md](rules/typescript.md),
[rules/modules.md](rules/modules.md).

**`node --test` hangs or does not exit**: isolate the file, then the test name → rerun with
`--test-timeout` and the spec reporter → dump the live handles with `why-is-node-running` through
`npx`, without adding it to the tree → fix the teardown where the resource is created → rerun the
file, the generation, then `npm test` →
[rules/stuck-processes-and-tests.md](rules/stuck-processes-and-tests.md).

**A test passes alone and fails in the suite**: shared state, a timer, a listener registered after
the emit, a temp dir or port reused → [rules/flaky-tests.md](rules/flaky-tests.md),
[rules/testing.md](rules/testing.md).

**A fact about a dependency** (what Pi exports, which version is installed, what a package's
`exports` map allows, what a provider payload contains): read it under `node_modules/`, never from
memory → [rules/node-modules-exploration.md](rules/node-modules-exploration.md). Pi ships its
reference offline in `node_modules/@earendil-works/pi-coding-agent/docs/` and its working extensions
in `examples/extensions/`; a fact Pi reports beats one 495 restates.

**Several things at once** (sessions, controls, child processes): `Promise.all` only when every item
may run together; bound the concurrency; cancel with `AbortController`; never an async constructor →
[rules/async-patterns.md](rules/async-patterns.md).

**Reading a process's output as it arrives** (a Claude Code session's stream-json, a control's
stdout): `pipeline` from `node:stream/promises`, an async generator for the line split, backpressure
left to `pipeline` → [rules/streams.md](rules/streams.md).

**A failure to report**: a code the kernel can name is a `DomainError`; anything below is an `Error`
with `cause`; nothing is swallowed → [rules/error-handling.md](rules/error-handling.md).

## Rules

- [rules/typescript.md](rules/typescript.md) - Type stripping, what it refuses, the compiler options that bite, TypeScript 7
- [rules/modules.md](rules/modules.md) - ESM, `.ts` extensions, exports that are read, the layer direction
- [rules/testing.md](rules/testing.md) - The shape and place of a test, fakes, isolation, running one generation
- [rules/flaky-tests.md](rules/flaky-tests.md) - Finding the test that fails intermittently or times out
- [rules/stuck-processes-and-tests.md](rules/stuck-processes-and-tests.md) - A runner or process that does not exit
- [rules/async-patterns.md](rules/async-patterns.md) - async/await, bounded concurrency, cancellation
- [rules/streams.md](rules/streams.md) - `pipeline`, async generators, backpressure
- [rules/error-handling.md](rules/error-handling.md) - `DomainError`, `cause` chains, no swallowing, no global handlers
- [rules/node-modules-exploration.md](rules/node-modules-exploration.md) - Reading what an installed package really is
