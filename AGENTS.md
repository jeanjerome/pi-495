# 495 (harness-495) — AI Agents

> **Multi-agent context** — This file is the canonical project context for **Cline**, **Aider**, **OpenCode**, **Codex CLI**, and other AGENTS.md-native tools. Claude Code and Cursor read it via the `CLAUDE.md` symlink.

Read CONVENTIONS.md before any GitHub or git operation.

<!-- BEGIN bigpowers:context-routing -->
## Context Routing

Load subdirectory context by file glob — no sub-AGENTS.md exists yet. `specs/README.md` indexes the documentation map; the corpus written before the switch is archived under `specs/archive/` in its original layout.
<!-- END bigpowers:context-routing -->

<!-- BEGIN bigpowers:learned-preferences -->
## Learned User Preferences

- Put an arbitration to the owner in plain French, without identifiers, scores or coded vocabulary:
  state what each option costs and what it buys. Keep the coded vocabulary for the written artefact
  that records the answer, not for the question that asks for it.
- Before asking the owner anything, ask why the question exists. A question about a mechanism the
  goal never required is not an arbitration — it is the mechanism asking to be kept. Most questions
  worth his time should have been settled when the goal was written; one that appears late usually
  marks a solution that grew past its purpose. Remove the cause rather than route the question.
- State a conclusion only once the evidence that could overturn it has been read. Reading the
  binding documents before the scenarios that exercise them produced two opposite verdicts on the
  same corpus in one sitting. When a pass is partial, say what is still unread and what would
  change the answer — a provisional finding announced as a finding costs a reversal later.
- Verify before asserting, including against the repository's own record. A plausible cause stated
  as fact has to be retracted; the same cause checked first is worth more and costs one command.
- Keep dependencies at their latest published version whenever Preflight stays green — a bound left
  behind is a divergence waiting to happen, and a caret on a `0.x` version silently locks the minor.
  The exception is a bound that guards a declared floor: `@types/node` tracks `engines.node`, not the
  newest release (`specs/adr/D-50`).

## Workspace Facts

- Shell utilities on this machine are the GNU ones, installed by Homebrew and put ahead of the
  system's on PATH through `gnubin` shims — so GNU syntax is the syntax that works: `sed -i` with no
  backup suffix, `grep -P`, `find -printf`, and GNU coreutils for `date`, `stat`, `readlink`,
  `realpath`, `head`, `sort`. Measured, not assumed: `grep` is ugrep and `find` is bfs, and both
  take the GNU flags anyway. **The exception is `awk`** — `/usr/bin/awk`, the BSD one, not gawk, so
  `gensub` and the other gawk extensions fail. Keep awk to POSIX, or call `gawk` by name.
- Pi ships its reference on the machine, offline, in the installed package: 30 doc pages under
  `node_modules/@earendil-works/pi-coding-agent/docs/` and 77 working extensions under
  `examples/extensions/`. Read them before specifying a capability or deducing a fact from outside
  Pi (`specs/adr/D-55`). `provider-payload.ts` reports in 18 lines what a Preflight control was
  written to guess from third-party source.
<!-- END bigpowers:learned-preferences -->

<!-- BEGIN bigpowers:project -->
## Project

495 drives a software change from Pi through gated, evidence-backed phases.
An agent proposes. The kernel decides from executed checks. A human arbitrates through Pi dialogues.
495 exposes no CLI, no service, and no CI job of its own — it is a Pi extension.

| Gate | Phase |
|------|-------|
| G0 | Mandate |
| G1 | Requirements |
| G2 | Frozen verification protocol |
| G3 | Design |
| G4 | Isolated candidate |
| G5 | Model-free checks |
| G6 | Local integration |
Stack: TypeScript (strict, `erasableSyntaxOnly`), Node ≥24 (`node:sqlite`, `node:test`), no framework. Peer deps: `@earendil-works/pi-ai`, `pi-coding-agent`, `pi-tui`, `typebox`.

## Commands

| Action | Command |
|--------|---------|
| Run | N/A — Pi loads the built extension; there is no standalone entry point |
| Test | `npm test` |
| Build | `npm run build` |
| Lint | `npm run lint:code && npm run lint:layers && npm run lint:architecture && npm run lint:exports && npm run lint:traceability && npm run lint:declarations && npm run lint:distribution && npm run lint:story-format` |
| Preflight | `npm run check` |
| CI | N/A — no CI job configured; run `npm run check` locally before every commit |

## Test

`npm test` runs `node --test` across `test/v0` .. `test/v4`. Run one generation at a time with `npm run test:v0` .. `test:v3` while iterating.

## Lint

`npm run lint:code && npm run lint:layers && npm run lint:architecture && npm run lint:exports && npm run lint:traceability && npm run lint:declarations && npm run lint:distribution && npm run lint:story-format`

## Build

`npm run build` (`tsc -p tsconfig.build.json`). Run `npm run contracts` after changing anything under `src/contracts/`.

## Architecture

Layers run one way: `domain/` (pure) → `ports/` → `application/` (incl. `application/phases/`) → `adapters/` (git, object-store, execution, sandbox, storage-sqlite, workspace, pi-worker, platform) → `presentation/` (structured, tui) and `export/`. Only `extension/` and `adapters/pi-worker/` import a Pi package. `scripts/check-layers.ts` enforces the import direction; `scripts/check-architecture.ts` cross-checks every `CMP-*` component id in `src/` against the catalogue in `specs/archive/amont/conception-technique.md` §4.1 and refuses import cycles.

## Conventions

- Keep dependency direction one-way. Never import a layer listed after your own in the chain above.
- Route the Pi API only through `extension/` or `adapters/pi-worker/`.
- Reach for Pi's own API before rebuilding a capability or deducing a fact from outside it. 495 is a
  Pi extension, and a fact Pi reports beats one 495 restates (`CONVENTIONS.md` § Pi is the host).
- Give every new component a `CMP-*` id and add it to `specs/archive/amont/conception-technique.md` §4.1 in the same change.
- Rebuild `dist/` from `src/` before every check. Never hand-edit `dist/`.
- Attribute every redistributed dependency in `NOTICE`. Keep peer dependencies on the permissive licence allowlist.
- Cover every `[P0]` requirement id from `specs/archive/amont/expression-besoins.md` in `specs/archive/TRACEABILITY.md`.
- Write commit messages as `<type>: <description>`, one line, describing the resulting behavior. Carry no ticket, chantier, lot, or phase reference. Carry no AI attribution.

## Never

- Never dismiss a reproducible gate failure as pre-existing or out of scope.
- Never proceed on a red Preflight (`npm run check`) — fix it before forward work.
- Never hand-edit `dist/` — rebuild it with `npm run build`.
- Never import an `@earendil-works` Pi package from `domain/`, `contracts/`, `ports/`, `application/`, `presentation/`, or `export/`.
- Never claim a `CMP-*` component id in `src/` without a matching row in `specs/archive/amont/conception-technique.md` §4.1.
- Never let an unqualified sandbox backend run unconfined. Refuse with `capability_missing` instead.
- Never run `bigpowers init` in this repository. It replaces `scripts/` with a symlink to the package tree, which would remove every Preflight control. A script a skill cites by `bash scripts/…` is reached at `$(npm root -g)/bigpowers/scripts/…` instead.

## Agent Rules

- **Workflow Mandate:** Use bigpowers skills (`plan-work`, `develop-tdd`, `orchestrate-project`) for new planning and delivery work.
- **`specs/` is the documentation surface:** new normative content goes there, in its bigpowers location. The corpus written earlier is archived under `specs/archive/` — `specs/archive/amont/` for the normative documents, `specs/archive/STATUS.md`, `TRACEABILITY.md`, `DECISIONS.md`, `RISQUES-L0.md` and `chantiers/` for implementation tracking. Archived means nothing new is written there; two Preflight controls still read it, and only keep their power to refuse because they do.
- **Always Green:** Preflight (`npm run check`) must be green before forward work.
- Read CONVENTIONS.md and the relevant `specs/` file before writing code.
- Write the minimum code that solves the stated problem.
- Run tests after every change. Show evidence before declaring done.

## Token Economy — Minimal Footprint

> Production-safe subset of the 8-rule AGENTS.md pattern (Vercel engineer, ~60B tokens).
> Rule 1 ("no backward compatibility") is excluded deliberately: it risks data loss in production.

1. **Check existing dependencies first.** DO inspect what your current dependencies already do before adding a package or writing your own code.
2. **Prefer mature, maintained libraries.** DO NOT rewrite a capability a maintained library provides without a documented reason.
3. **Copy validated patterns.** DO study how established products solve the same problem before inventing a new approach.
4. **Keep the simplest working implementation.** DO write the least code that satisfies the stated requirement. NEVER add preventive abstraction or unused config layers.
<!-- END bigpowers:project -->
