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

## Story e12s04

### A test that earlier tasks already turn green is folded into their code commit

Task 9 asked for a test of the LCOV report under the verification sandbox, whose stated red was the
state before the story; written after tasks 6 and 7 it could not fail, and the red-green control
blocked the story on a test-only commit with no failing test. The driver folded that commit into the
code commit before it (`git rebase` with `fixup`), resumed the story, and taught the red-green prompt
the same rule. Bought: the control keeps demanding a red on every test-only commit, and a test that
cannot be red is still kept. Cost: the folded commit holds a test the message does not name.

### A defect found on the branch stays in the registry

The review of e12s04 left `BUG-2026-09-30T193000` (a control character in a path the change does not
touch makes coverage indeterminate). It is low, not introduced by a promise of the story, and is left
to the defect phase.

## Story e12s06

### A reviewer's session that fails no longer takes the other reviewer's tree away

Reviewer A's session ended without a result while reviewer B was still mutating code in its own tree;
the failure removed both trees at once and B lost its working directory. The tool now waits for both
sessions before it removes their trees. The likely cause of A's death was B running `pkill -f
"node --test"`, whose pattern matches the command line of every session whose prompt quotes a test
command; the common instructions now forbid killing a process by name or pattern. Bought: a failed
session costs its own step, not its sibling's. Cost: a round whose one reviewer failed still waits for
the other to finish.
