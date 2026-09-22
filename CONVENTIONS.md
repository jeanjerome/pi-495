# Conventions

Shared rules for every AI agent working on 495. `AGENTS.md` (symlinked as `CLAUDE.md`) carries the
project spine — stack, commands, architecture, never-do list. This file carries the deeper doctrine.

## Commit Messages

Format: `<type>: <description>` — one line, no scope, space after the colon.

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

Describe the resulting behavior in technical terms. Never describe the process that produced it.

- Carry no ticket, chantier, lot, or phase reference (`chantier #24`, `Lot 3`, `(P1)`, `D12`).
- Carry no session or planning metadata (which PR, which plan, which review round).
- Carry no AI attribution. Carry no `Co-Authored-By` trailer.

Example: instead of `fix: rsync+restart exposes no live image query (design 6.8)`, write
`fix: a generic rsync+restart deploy exposes no live image query, so the running image digest
cannot be read back`.

## Git & GitHub Operations

- Route non-trivial work through a feature branch or worktree (`kickoff-branch`). Merge to `main`
  with a clean, descriptive commit.
- Prefer `gh` over the GitHub web UI when scripting repository operations.
- Never push to `main` from an automated flow without an explicit human decision.
- Never call the GitHub REST API directly (curl, fetch). Use `gh`.
- Never create GitHub issues from automated workflows. Produce a local file in `specs/bugs/` instead.

## Always Green / Shift Left

A solo developer owns the whole codebase. **Always Green** means Preflight is green before any
forward work — not "green enough for this task."

**Shift Left (1-10-100):** a defect costs roughly 1× to fix in development, 10× in integration,
100× in production (IBM Systems Sciences Institute; CloudQA benchmarks). Fix a red gate now.

**Preflight** is `npm run check` — typecheck, test, and the `lint:*` scripts chained together.
Preflight MUST pass before a kickoff, develop, or verify phase advances.

## Discovered Defects

Treat any reproducible gate failure found during unrelated work as a discovered defect, not
background noise.

**fix-or-log ladder:**

1. **quick-fix** — a trivial, data-only, single-file fix within guardrails.
2. **fix-bug** — when quick-fix guardrails abort, or the failure needs investigation
   (`specs/bugs/BUG-*.md` + TDD).
3. **Log** — only when reproduction stays blocked after a good-faith attempt. Write a bug spec and
   stop forward work on the original task until triaged.

Ship a discovered fix in the same change as the original work, in a separate commit.

### Banned dismissive phrases

Never use these phrases, or a close paraphrase, to wave off a reproducible failure:

| Banned phrase | Do this instead |
|---------------|------------------|
| Pre-existing / pre-existing issue | Run fix-or-log. If truly unrelated, prove it with a passing repro after revert. |
| Unrelated to this session | Same — a session boundary does not waive Always Green. |
| Not introduced by my changes | Bisect it or fix it anyway. A solo owner owns the whole tree. |
| Out of scope | Invoke quick-fix or fix-bug. Scope-minimization never overrides Always Green. |

## specs/ — the documentation surface

`specs/` carries the documentation of 495, at its bigpowers location. The corpus written before the
switch is archived under `specs/archive/`, in its original layout: `specs/archive/amont/` holds the
normative documents, `specs/archive/STATUS.md`, `TRACEABILITY.md`, `DECISIONS.md` and
`RISQUES-L0.md` track implementation, `specs/archive/chantiers/` tracks open work, and
`specs/archive/revues/` holds the six mandatory reviews.

Archived means nothing new is written there. It does not mean inert: two Preflight controls read
that corpus and only keep their power to refuse because it is hand-maintained.

| File | Owns |
|------|------|
| `specs/state.yaml` | Active session, handoff, `workflow_mode: solo-git` |
| `specs/release-plan.yaml` | bigpowers-tracked epic ordering |
| `specs/execution-status.yaml` | bigpowers story/epic status |
| `specs/bugs/registry.yaml` | Bug intake queue, generated |
| `specs/bugs/BUG-*.md` | Bug RCA + fix plan (`investigate-bug`) |
| `specs/verifications/` | Verify-work evidence, audit reports |
| `specs/adr/ADR-*.md` | One architecture decision per file |
| `specs/tech-architecture/tech-stack.md` | Stack, layering and observed conventions, derived from the code by `map-codebase` |
| `specs/archive/` | The corpus written before the switch, read by two Preflight controls |

A file a skill regenerates is never a place to hand-write something that must last: `map-codebase`
rewrites `tech-stack.md` whole, `build-epic` regenerates `TRACEABILITY_LATEST.md`, `scope-work`
rewrites `SCOPE_LATEST.yaml`. Durable hand-written content belongs in `specs/adr/`, `specs/epics/`,
`specs/bugs/BUG-*.md` or `specs/archive/`.

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

## Comments

- Keep existing comments on a refactor. They carry intent and provenance.
- Write why, never what. The code already says what it does.
- Never write an obvious comment that restates the code.
- Never leave commented-out code. Delete it and rely on git history.

## Tests (F.I.R.S.T)

- Run the whole suite headless with one command: `npm test`.
- Give every new function a test. Give every bug fix a regression test.
- Name a fake used for external I/O as a fake class, not an inline stub.
- Keep every test Fast, Independent, Repeatable, Self-Validating, and Timely.
- Never skip or ignore a test without a written note on what stays unresolved.
- Test every boundary condition: empty input, maximum, minimum, and the off-by-one case.
- Assert only through the public interface — return values, contracts, view state. Never assert on
  private state.

## Dependencies

- Inject a dependency through a constructor or parameter. Never reach for a global or a bare import.
- Wrap a third-party library behind a project-owned port (see `src/ports/`).

## Pi is the host, not one dependency among others

495 is an extension of Pi. Pi is what keeps 495 from rebuilding what already exists, and what lets
it state a fact instead of inferring one. Reach for Pi's own API first — before writing the
capability, and before deducing from the outside what Pi can report from the inside.

- **Look for the API before building.** A hook, an event, a runtime or a typed result Pi already
  publishes beats a table 495 maintains, a file 495 parses, or a fact 495 reads out of a package's
  code.
- **Read the documentation the pinned package ships.** It is already on disk, at the exact version
  installed, with no tag to get wrong: `node_modules/@earendil-works/pi-coding-agent/docs/`, and
  `extensions.md` there carries the event list. Prefer it to any URL. The same corpus is tagged on
  the web — `https://github.com/earendil-works/pi/blob/v<pinned>/packages/coding-agent/docs/` — and
  <https://pi.dev/docs/latest> tracks the newest Pi, so it shows what is coming, not what this
  repository has. The difference is not theoretical: read against `latest` while pinned at 0.86.1,
  `context_with_system` and `agent_before_settle` both looked available, and neither existed. Reading
  the packaged copy would not have raised the question at all.
- **Confirm in the pinned surface before building on it.** The tagged docs say what that release
  documents; `@earendil-works/pi-coding-agent/dist/**/*.d.ts` and the peer packages say what it
  ships. What is built on an API names the version it was confirmed against.
- **Prefer an observed fact to a restated one.** What Pi hands over was measured; what 495 restates
  is believed, and drifts the day the host changes. Where both exist, the observed one is the source
  and the restated one is at most an expectation. Say in the code which of the two a value is.
- **A workaround names what it replaces.** When no API covers the need, write where the workaround
  lives what was looked for and not found, so it can be deleted the day it arrives.
- **Leaning on Pi never bends the layering.** The Pi API is reached through `extension/` or
  `adapters/pi-worker/` and nowhere else (`AGENTS.md` § Architecture).

## Structure

- Follow the layering already declared in `AGENTS.md` § Architecture.
- Keep paths predictable: one adapter per external system, one port per capability.

## Formatting

- Lint and format with Biome (`npm run lint:code`) and type with `tsc --noEmit`. No style debates beyond that.
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
