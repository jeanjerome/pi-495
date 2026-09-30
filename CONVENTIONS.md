# Conventions

The standards the code of 495 meets. `AGENTS.md` (symlinked as `CLAUDE.md`) carries the project
spine — stack, commands, architecture, never-do list. How a change is made — the six steps, the
review, the acceptance run, the landing, the commit messages — is `cycle/README.md`.

## Preflight

**Preflight** is `npm run check`: typecheck, the test suite and the `lint:*` scripts chained
together, under Node 24, the declared floor (`specs/adr/D-50`). It is green before any forward work,
not "green enough for this task". A defect costs roughly 1× to fix in development, 10× in
integration, 100× in production: fix a red gate now.

| Control | Refuses |
|---------|---------|
| `lint:code` | what Biome refuses (`specs/adr/D-42`, `D-43`) |
| `lint:layers` | an import against the direction of `AGENTS.md` § Architecture |
| `lint:architecture` | a `CMP-*` id claimed in `src/` without a row in `specs/archive/amont/conception-technique.md` §4.1, or an import cycle |
| `lint:exports` | an export nothing reads outside its module (`specs/adr/D-44`) |
| `lint:traceability` | a `[P0]` requirement of `specs/archive/amont/expression-besoins.md` absent from `specs/archive/TRACEABILITY.md` |
| `lint:declarations`, `lint:distribution` | a published surface that drifts from `src/` |
| `lint:story-format` | a story of `specs/stories/` that departs from `cycle/format-de-story.md` |

## Code Style

- One thing per function, one responsibility per module (SRP).
- Prefer small, focused modules over god files. Split a file when it grows a second responsibility.
- Give every name a specific, unique meaning. Avoid `data`, `handler`, `Manager`, `Service`.
- Type everything explicitly. Never use `any`. Never leave a public function untyped.
- Extract shared logic into one function or module. Never duplicate logic.
- Prefer an early return over a nested `if`.
- Throw an exception instead of returning an error code or a boolean sentinel.
- Delete dead code. Never comment it out — git history already holds it.
- Boy Scout Rule: leave every file you touch at least as clean as you found it.
- Write the minimum code that solves the stated problem. No preventive abstraction, no unused
  configuration layer. Inspect what the dependencies already do before adding a package or writing
  a capability a maintained library provides.

## Comments

- Keep existing comments on a refactor. They carry intent and provenance.
- Write why, never what. The code already says what it does.
- Never write an obvious comment that restates the code.
- Never leave commented-out code. Delete it and rely on git history.
- Describe the behavior of the code, never the process that produced it: no ticket, story, review
  round or session reference in a comment.

## Tests (F.I.R.S.T)

- Run the whole suite headless with one command: `npm test`.
- Give every new function a test. Give every bug fix a regression test.
- Name a fake used for external I/O as a fake class, not an inline stub.
- Keep every test Fast, Independent, Repeatable, Self-Validating, and Timely.
- Never skip or ignore a test without a written note on what stays unresolved.
- Test every boundary condition: empty input, maximum, minimum, and the off-by-one case.
- Assert only through the public interface — return values, contracts, view state. Never assert on
  private state.
- A test is written before the code it pins, and fails on the assertion the story states before
  that code exists (`cycle/README.md` § Les six pas).

## Dependencies

- Inject a dependency through a constructor or parameter. Never reach for a global or a bare import.
- Wrap a third-party library behind a project-owned port (see `src/ports/`).
- Keep a dependency at its latest published version whenever Preflight stays green; a caret on a
  `0.x` version silently locks the minor. `@types/node` tracks `engines.node`, not the newest
  release (`specs/adr/D-50`).

## Pi is the host, not one dependency among others

495 is an extension of Pi. Pi is what keeps 495 from rebuilding what already exists, and what lets
it state a fact instead of inferring one. Reach for Pi's own API first — before writing the
capability, and before deducing from the outside what Pi can report from the inside
(`specs/adr/D-55`).

- **Look for the API before building.** A hook, an event, a runtime or a typed result Pi already
  publishes beats a table 495 maintains, a file 495 parses, or a fact 495 reads out of a package's
  code.
- **Read the documentation the pinned package ships.** It is already on disk, at the exact version
  installed: `node_modules/@earendil-works/pi-coding-agent/docs/`, and `extensions.md` there carries
  the event list. Prefer it to any URL: <https://pi.dev/docs/latest> tracks the newest Pi, not the
  one this repository has.
- **Confirm in the pinned surface before building on it.** `@earendil-works/pi-coding-agent/dist/**/*.d.ts`
  and the peer packages say what the release ships. What is built on an API names the version it
  was confirmed against.
- **Prefer an observed fact to a restated one.** What Pi hands over was measured; what 495 restates
  is believed, and drifts the day the host changes. Say in the code which of the two a value is.
- **A workaround names what it replaces.** When no API covers the need, write where the workaround
  lives what was looked for and not found, so it can be deleted the day it arrives.
- **Leaning on Pi never bends the layering.** The Pi API is reached through `extension/` or
  `adapters/pi-worker/` and nowhere else (`AGENTS.md` § Architecture).

## Structure

- Follow the layering declared in `AGENTS.md` § Architecture.
- Keep paths predictable: one adapter per external system, one port per capability.
- A technology is one module under `src/application/stacks/` that declares its stack identifier, the
  files that signal it at a project root and its detection, plus one line in the adapter list of
  `src/application/target.ts`. What a capability adds per technology is declared in that adapter,
  never in a central table nor in a condition on the name of a technology.

## Formatting

- Lint and format with Biome (`npm run lint:code`) and type with `tsc --noEmit`. No style debates
  beyond that.
- The formatter runs at 120 columns. Import order is not machine-sorted: imports are grouped by the
  architectural layer they come from, which is how the one-way dependency direction stays readable.

## Logging

- Emit structured, redaction-aware output through the existing presentation layer.
- Never print a raw secret, token, or unredacted workspace path to a shared channel.

## Defensive Code

- **Retry** — bounded retry already backs execution, the Pi worker, and git integration
  (`src/adapters/execution/`, `src/adapters/pi-worker/`, `src/adapters/git/integrator.ts`).
- **Timeout** — every sandboxed process and agent session runs under a budget
  (`src/adapters/sandbox/process.ts`, `src/application/harness.ts`, `policy.budgets.intervention_ms`).
- **Graceful degradation** — an unqualified capability refuses with `capability_missing` instead of
  running unconfined (`src/domain/errors.ts`).
- **Circuit breaker** — a change's retry budget is bounded; once exhausted, the gate refuses further
  automatic retries and asks a human to resume or decide (`src/domain/gates/g2.ts`,
  `src/domain/change/decide.ts`).

The agent implements defensive code only for the categories listed here.
