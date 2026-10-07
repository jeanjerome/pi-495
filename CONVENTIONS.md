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
| `lint:architecture` | a `CMP-*` id claimed in `src/` without a row in `specs/amont/conception-technique.md` §4.1, or an import cycle |
| `lint:exports` | an export nothing reads outside its module (`specs/adr/D-44`) |
| `lint:distribution` | a published surface that drifts from `src/` |
| `lint:story-format` | a story of `specs/stories/` that departs from `cycle/format-de-story.md` |

## Principles

Twelve principles, applied with judgement. Each says what it serves in 495; a threshold is a trigger to look at
the structure, never a target to meet. Part of them is enforced by § Preflight; the rest is held at self-review
and review.

1. **One clear responsibility per component.** A responsibility is a reason to change. A function performs one
   coherent operation; a module owns one concept of 495, the ones `specs/amont/conception-technique.md` §4.1 names
   and their `CMP-*` id claims. Keep levels of abstraction apart: a phase of `application/phases/` orchestrates
   and names its steps, while parsing, file reading and command building sit below it, in the module that owns
   them. A long function that reads straight down can stay; extract when the extraction names a responsibility or
   lets the caller read as orchestration.
2. **Deep modules behind simple interfaces.** What the kernel asks of the outside goes through a port of
   `src/ports/` with few typed operations; a technology answers through the interface of `src/application/stacks/`,
   and only the common layer asks it. A module may be large when its responsibility is coherent and its interface
   small: `domain/change/decide.ts` is one reducer. Never split to meet a size, never add a layer that forwards
   calls without hiding a decision. Keep a seam where a test or a second implementation uses it: a fake of a port,
   a fictitious technology.
3. **Explicit contracts and dependencies.** What crosses a boundary is typed, and what is persisted or exchanged
   has a TypeBox schema in `src/contracts/` (`npm run contracts`). Never `any`, never an untyped public function.
   A dependency arrives through a constructor or a parameter, wired at the composition root
   (`src/extension/runtime.ts`), and points at a port or an interface rather than a concrete adapter or a
   module-level singleton. The import direction of `AGENTS.md` § Architecture is the direction of dependencies.
4. **Intent visible in the code.** One precise meaning per name, distinctive enough to be found by a search; no
   `data`, `handler`, `Manager`, `Service`; a name says its side effect (`writeWitnesses`, not `prepare`). Name a
   constant or a condition the reader would otherwise decode. Prefer the positive form and the early return.
   Judge difficulty by branches, states to follow and interactions, which Biome's cognitive complexity measures
   better than a line count.
5. **The present need, with the least complexity.** Build what the story's promises and a verified need ask —
   not a parameter, an option, a registry or a hook for a use nobody has shown. An abstraction earns its place by
   a second concrete user or a test seam in use. Before writing a capability, look at what Pi publishes (§ Pi is
   the host) and what an installed dependency already does.
6. **No duplication to maintain in step.** One rule lives in one place: a fact about a technology in its
   directory, a policy in `domain/`, a text for the owner in `presentation/`. Merge two copies that change
   together; leave apart two lookalikes that would change for different reasons. The generalisation that removes
   a duplication makes both callers simpler, or it is not made.
7. **Code easy to explore, by people and by agents.** A predictable tree — one directory per layer, one per
   technology and, inside it, one per capability — and file names that say what they hold, so that a change's
   code, contract, port and tests are found from names and imports. Thresholds are calibrated on this tree and on
   what the agents of the cycle reliably read and change: a file past 400 lines (the ninth decile of `src/`), or a
   function past a cognitive complexity of 15 (`complexity/noExcessiveCognitiveComplexity`), triggers a look at its
   structure when a change writes it or makes it cross the threshold. The look ends in a split along a
   responsibility it found, or in one sentence saying why the whole is cohesive. When restructuring is what the
   change is for, every threshold its scope crosses is examined there. A threshold crossed by code outside that
   scope is written down as a refactoring (`specs/reprises.md`), not reworked in passing.
8. **Errors that say what to do.** A message names the value at fault, the expected form and, when there is
   one, the way out: `report path ../ws2/r.txt escapes the workspace`, not `invalid path`. Errors propagate
   explicitly: a `DomainError` with its code where a caller or the owner decides, an `Error` with its `cause` for
   a failure of the machine; never a `null`, a `false` or an error code standing for a failure. A `catch` that
   carries on says why.
9. **Comments carry the why.** A comment states the constraint or decision the code cannot show, and a decision
   of consequence points to its ADR in `specs/adr/`. Never a paraphrase, never commented-out code. Keep existing
   comments on a refactor: they carry intent and provenance. Describe the behaviour, never the process that
   produced it: no ticket, story, review round or session.
10. **Targeted, informed changes.** Before changing a function, read its callers and its tests; before changing
    a contract, its readers and the dossiers already written, which stay readable. Stay within the need, follow
    the conventions of the file, and leave what you touched cleaner, removing what became useless. A restructuring
    a story's promises ask for is that story's work; one nobody asked for is not slipped into its diff, and a
    refactoring that changes no behaviour and needs no promise takes its own path (`specs/adr/D-80`).
11. **Behaviours tested through public interfaces.** § Tests.
12. **Correctness from executable checks.** A story states observable promises before the code, its test fails
    on the stated assertion first, and a change is shown working by a real run (`cycle/README.md`). An ambiguity is
    settled before implementing, never decided silently in the code.

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
  that code exists (`cycle/README.md` § The six steps).

## Dependencies

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
- A technology is one directory under `src/adapters/stacks/` that implements `StackPlugin`
  (`src/application/stacks/plugin.ts`), plus its place in the list of technologies
  `src/extension/runtime.ts` hands the kernel. `<tech>.ts` declares its identifier, the files that signal
  it at a project root, its recognition of a project and the readers of the report formats only it writes;
  `project/` holds the model of the project its capabilities share; `tests/`, `coverage/`, `mutation/`,
  `quality/` and `structure/` each implement the interface of that capability, with its controls, its
  witnesses and its readers; `install/` says how its package manager brings, inspects and presents a
  complement. A capability a technology does not declare is one it does not offer. No module outside a
  technology's directory imports it, another technology included, but `src/extension/runtime.ts`
  (`npm run lint:layers`).
- A technology reads the project only through the `ProjectView` the common layer opens on the copy, never
  through `node:fs`. The common layer (`src/application/stacks/`) recognises the technology of a copy,
  asks each capability and assembles the answers once; the kernel asks a project only through its
  registry. What a capability adds per technology is declared in that technology's directory, never in a
  central table nor in a condition on the name of a technology.

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
