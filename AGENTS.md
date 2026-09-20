# 495 (harness-495) — AI Agents

> **Multi-agent context** — This file is the canonical project context for **Cline**, **Aider**, **OpenCode**, **Codex CLI**, and other AGENTS.md-native tools. Claude Code and Cursor read it via the `CLAUDE.md` symlink.

Read CONVENTIONS.md before any GitHub or git operation.

<!-- BEGIN bigpowers:context-routing -->
## Context Routing

Load subdirectory context by file glob — no sub-AGENTS.md exists yet. `docs/README.md` indexes the project's own documentation map (amont/, suivi, chantiers/).
<!-- END bigpowers:context-routing -->

<!-- BEGIN bigpowers:learned-preferences -->
## Learned User Preferences

- (none yet — updated via `session-state`)

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
| Lint | `npm run lint:code && npm run lint:layers && npm run lint:architecture && npm run lint:exports && npm run lint:traceability && npm run lint:distribution` |
| Preflight | `npm run check` |
| CI | N/A — no CI job configured; run `npm run check` locally before every commit |

## Test

`npm test` runs `node --test` across `test/v0` .. `test/v4`. Run one generation at a time with `npm run test:v0` .. `test:v3` while iterating.

## Lint

`npm run lint:code && npm run lint:layers && npm run lint:architecture && npm run lint:exports && npm run lint:traceability && npm run lint:distribution`

## Build

`npm run build` (`tsc -p tsconfig.build.json`). Run `npm run contracts` after changing anything under `src/contracts/`.

## Architecture

Layers run one way: `domain/` (pure) → `ports/` → `application/` (incl. `application/phases/`) → `adapters/` (git, object-store, execution, sandbox, storage-sqlite, workspace, pi-worker, platform) → `presentation/` (structured, tui) and `export/`. Only `extension/` and `adapters/pi-worker/` import a Pi package. `scripts/check-layers.ts` enforces the import direction; `scripts/check-architecture.ts` cross-checks every `CMP-*` component id in `src/` against the catalogue in `docs/amont/conception-technique.md` §4.1 and refuses import cycles.

## Conventions

- Keep dependency direction one-way. Never import a layer listed after your own in the chain above.
- Route the Pi API only through `extension/` or `adapters/pi-worker/`.
- Give every new component a `CMP-*` id and add it to `docs/amont/conception-technique.md` §4.1 in the same change.
- Rebuild `dist/` from `src/` before every check. Never hand-edit `dist/`.
- Attribute every redistributed dependency in `NOTICE`. Keep peer dependencies on the permissive licence allowlist.
- Cover every `[P0]` requirement id from `docs/amont/expression-besoins.md` in `docs/TRACEABILITY.md`.
- Write commit messages as `<type>: <description>`, one line, describing the resulting behavior. Carry no ticket, chantier, lot, or phase reference. Carry no AI attribution.

## Never

- Never dismiss a reproducible gate failure as pre-existing or out of scope.
- Never proceed on a red Preflight (`npm run check`) — fix it before forward work.
- Never hand-edit `dist/` — rebuild it with `npm run build`.
- Never import an `@earendil-works` Pi package from `domain/`, `contracts/`, `ports/`, `application/`, `presentation/`, or `export/`.
- Never claim a `CMP-*` component id in `src/` without a matching row in `docs/amont/conception-technique.md` §4.1.
- Never let an unqualified sandbox backend run unconfined. Refuse with `capability_missing` instead.

## Agent Rules

- **Workflow Mandate:** Use bigpowers skills (`plan-work`, `develop-tdd`, `orchestrate-project`) for new planning and delivery work.
- **docs/ stays authoritative:** `docs/amont/` remains the normative specification. `docs/STATUS.md`, `docs/TRACEABILITY.md`, `docs/DECISIONS.md`, `docs/RISQUES-L0.md`, and `docs/chantiers/` keep tracking implementation as they already do. `specs/` carries bigpowers workflow bookkeeping only — it does not replace `docs/`.
- **Always Green:** Preflight (`npm run check`) must be green before forward work.
- Read CONVENTIONS.md and the relevant `docs/` file before writing code.
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
