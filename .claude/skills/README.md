# Skills

Claude Code discovers each `<name>/SKILL.md` here and advertises its name and description to every
session run from this tree, interactive or `claude -p`, including the sessions `cycle/` launches and
the detached trees of its reviewers. The full text loads only when a task matches the description.

| Skill | Source | Copied at |
|---|---|---|
| `node` | https://github.com/mcollina/skills `skills/node` | commit `856efd2`, 2026-08-17 |
| `typescript-magician` | https://github.com/mcollina/skills `skills/typescript-magician` | commit `856efd2`, 2026-08-17 |

Both are MIT; the licence is `LICENSE-mcollina-skills`. Each `SKILL.md` opens with a Provenance
section that says what was removed and why. The rule files not named there are verbatim copies.

To refresh: clone the source at its head, diff `skills/<name>/rules/` against `<name>/rules/` here,
carry over what applies, and update the commit above. The adapted files (`SKILL.md`, and under
`node/rules/`: `typescript.md`, `modules.md`, `testing.md`, `error-handling.md`) are maintained here,
not re-copied.
