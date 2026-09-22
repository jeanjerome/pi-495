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
- Keep dependencies at their latest published version whenever Preflight stays green — a bound left
  behind is a divergence waiting to happen, and a caret on a `0.x` version silently locks the minor.
  The exception is a bound that guards a declared floor: `@types/node` tracks `engines.node`, not the
  newest release (`specs/adr/D-50`).

## Workspace Facts

- (none yet — durable facts discovered across sessions)
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
| Lint | `npm run lint:code && npm run lint:layers && npm run lint:architecture && npm run lint:exports && npm run lint:traceability && npm run lint:distribution && npm run lint:story-format` |
| Preflight | `npm run check` |
| CI | N/A — no CI job configured; run `npm run check` locally before every commit |

## Test

`npm test` runs `node --test` across `test/v0` .. `test/v4`. Run one generation at a time with `npm run test:v0` .. `test:v3` while iterating.

## Lint

`npm run lint:code && npm run lint:layers && npm run lint:architecture && npm run lint:exports && npm run lint:traceability && npm run lint:distribution && npm run lint:story-format`

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
