# Project Context

## Stack

- **TypeScript**, strict beyond the usual: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `erasableSyntaxOnly`.
  Target ES2022, module NodeNext.
- **Node >= 24**, for `node:sqlite` and `node:test`. No test runner, no build tool, no framework.
- **Zero runtime dependencies.** `package.json` declares no `dependencies` block at all. Persistence
  is `node:sqlite`, the suite is `node:test`, process control is `node:child_process`.
- **TypeBox** describes every boundary contract; `npm run contracts` emits them to `contracts/*.json`.
- **fast-check** drives generated-property tests (`test/v0/properties.test.ts`, `contracts.test.ts`,
  `review-model.test.ts`).
- **Biome 2.5** for lint and format, at 120 columns.
- Distributed as a **Pi extension**, not an application: `package.json` `pi.extensions` points at
  `dist/extension/index.js`. There is no CLI, no service, and no CI job of its own. The four
  `@earendil-works/pi-*` packages are peer dependencies.

98 TypeScript modules under `src/`, 31 test files under `test/v0` .. `test/v4`.

## Architecture

Dependencies run one way and never back:

```
domain/ (pure, 17)  ->  ports/ (3)  ->  application/ (31)  ->  adapters/ (17)  ->  presentation/ (10), export/ (1)
```

`extension/` (8 modules) sits on top and wires the whole onto a Pi session.

- **`domain/` is kept pure by lint, not by convention.** `scripts/check-layers.ts` forbids it from
  importing `node:fs`, `node:child_process`, `node:net`, `node:http`, `node:sqlite` or any
  `@earendil-works` package.
- **The Pi API enters through two doors only** — `extension/` and `adapters/pi-worker/`. Every other
  layer is host-agnostic, which is what keeps the review model renderable from TUI, print, JSON, RPC
  and an SDK host alike.
- **A change is an event-sourced state machine.** `src/domain/change/` splits into `commands.ts`,
  `decide.ts`, `events.ts`, `apply.ts`, `state.ts`: commands produce events, events fold into state.
  Gates `G0`..`G6` (`src/domain/gates/`) decide from recorded evidence, never from a model's claim.
- **Phases are thin.** Each file under `src/application/phases/` drives one phase and delegates the
  decision to the domain.
- **One adapter per external system**: git, object-store (content-addressed), execution, sandbox,
  storage-sqlite, workspace, pi-worker, platform.

Four hand-written scripts enforce what a generic linter cannot see, all wired into `npm run check`:

| Script | Refuses |
|---|---|
| `scripts/check-layers.ts` | an import that runs against the dependency direction |
| `scripts/check-architecture.ts` | a `CMP-*` id in `src/` with no row in the component catalogue; an import cycle |
| `scripts/check-exports.ts` | an exported symbol nothing outside its module reads |
| `scripts/check-traceability.ts` | a `[P0]` requirement id absent from the traceability matrix |

## Conventions (Observed)

- **`any` is genuinely absent.** One real occurrence in all of `src/`:
  `src/adapters/pi-worker/worker-main.ts:147`, typing the Pi SDK's own generic `ToolDefinition`.
  Every other grep hit is the English word in prose.
- **Errors are data, not strings.** `DomainError` (`src/domain/errors.ts`) carries a closed
  `DomainErrorCode` union, a category resolved from a lookup table, plus `retryable`, `effectState`
  and `nextActions`, and serialises through `toCanonical()` into the versioned `CanonicalError`
  contract. Conventions say to throw rather than return an error code, and the code does.
- **Contracts are versioned and emitted.** `src/contracts/v1/` holds the TypeBox schemas;
  `src/contracts/registry.ts` is the single published surface. Changing anything there requires
  `npm run contracts`.
- **A capability that cannot be guaranteed refuses.** `SandboxPort` implementations qualify
  themselves before running (`src/adapters/sandbox/backends.ts`); an unqualified backend returns
  `capability_missing` rather than running a target unconfined. `startupIncident()` separates a
  confinement tool that failed to start from a target that genuinely failed — the first is an
  incident, not a verdict.
- **Almost no logging.** The only `console.*` calls in `src/` are the three in
  `src/export/export-service.ts`. Everything else renders through the presentation layer.
- **Imports are grouped by layer, not sorted.** `biome.jsonc` disables `organizeImports` on purpose:
  alphabetical order would scatter the grouping that makes the dependency direction readable.
- **Dependencies are injected**, through a constructor or a parameter, and every third-party library
  sits behind a port in `src/ports/`.

## Signals / Active Considerations

- **IT-5 is the active edge.** Increments IT-0..IT-4 are delivered and qualified on the reference
  machine; IT-5 (program, preparation, target stacks) is partial. The newest and least settled code
  is `src/application/program/program.ts` and `src/application/stacks/`.
- **The Node stack adapter lags the Maven one.** `src/application/stacks/node.ts` is markedly
  thinner than `maven.ts`, and the `unit` control is reported as not passing against a vitest
  reference. Check this before building on it.
- **Ten transverse chantiers are open**, one partial. The recurring theme is not missing features
  but edge behaviour: a structured output refused because the parser searches from the end, a human
  answer that reaches G0 but not the requirements, a stopped change whose state reads wrong.
- **Linux is not claimed.** The sandbox is qualified on macOS arm64 under Seatbelt only; the refusal
  path itself was exercised on Linux.
- **The quality and architecture requirements for a target are absent from the kernel.**
  `QLT-01..03`, `QLT-05` and `ARC-01..03` are unstarted. The kernel can judge a candidate against a
  reference, but cannot yet say what the reference itself is worth.
- **Self-checks are still hardening.** Recent work tightened the export and architecture gates
  themselves rather than application code, which suggests the enforcement surface is not yet settled.
