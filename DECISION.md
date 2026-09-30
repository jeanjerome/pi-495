# Decisions taken while driving the stories of e12

Decisions the cycle left open and the driver settled without the owner, each with what it cost and
what it bought. A decision that belongs to the product goes to `specs/adr/` once the owner confirms it.

## Story e12s01

### The plan is marked landed by a story driven alone

`npm run cycle -- <story> auto` versed the story but left `specs/plan.yaml` at `à faire`; only
`cycle suite` marked it. The command now marks the plan and commits it once the story is landed, when
the plan lists the story as pending. Bought: the plan and the story never disagree after a story run
by hand. Cost: one more commit on `main` per story driven alone.

### The acceptance after the acceptance run is the arbitration session's

The owner asked the driver to launch and follow the stories without them; the driver ran every story
with `auto`, so an independent session decides `accepte` or `ecart` under `cycle/prompts/arbitrage.md`
and the record says the automaton decided. Bought: the acceptance rests on a session that did not
conduct the run. Cost: the owner has not seen the acceptance run themselves; each story's dossier under
`specs/verifications/<story>/` holds what they would read.

## Story e12s02

### A defect a feature story fixes is marked fixed by hand

The tool marks a registry entry fixed only for a correction story that cites it; e12s02 fixed
`BUG-2026-09-30T120000` inside a feature story, so the entry stayed `open` after the landing. The driver
marks it fixed at the landed revision after the story (`fixed_in: c8adb59`), and does the same for
`BUG-2026-09-30T150000` after e12s07. Bought: the registry does not carry a defect the code no longer
has, which the defect phase of a later suite would otherwise pick up and try to fix again.
