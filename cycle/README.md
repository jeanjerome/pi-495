# The 495 development cycle

This directory holds the way a change to 495 is made: the six steps, the review and landing rules,
the story format, and the tool that drives them all. It says nothing about the product. What 495 is,
what it still has to do and what it has proved live in `specs/`.

The cycle depends on no outside package. On 2026-09-28 it replaced the bigpowers skills and the script
that chained them, after measurement: a 3,900-line story cost 5 hours of agent time and $88, and the
fix cycle for its four defects 7 hours and $105, stopped at a cap of five review rounds. More than
half of that time went to reviewers who replayed mutations by hand and found another corner of the
state machine at every round; per story, a thousand lines of records were written by hand and read
again by every session; across all of `specs/`, a single tracking file was read by a check.

## A dedicated cycle, and a laboratory

495 drives a software change through gated, evidence-backed phases, but it cannot yet drive its own.
Until 495 can be used to develop 495, its changes go through this dedicated cycle, with its own tool
and Claude Code sessions in place of 495's confined Pi worker.

The cycle is also a laboratory. Each change it carries tries out ways of driving a change an agent
makes, and shows which hold and which fail under real work and real cost:
- a story written before the code;
- a red seen on the announced assertion;
- two independent reviewers bounded to two rounds;
- a registry for what review leaves;
- an acceptance run with a negative control;
- an independent session that accepts in the owner's place.

A practice that holds is a candidate for 495's own phases. One that fails is dropped together with
the measurement that sank it, so that 495 does not inherit it. The cycle itself came out of such a
measurement. The decisions that shape it are recorded in `specs/adr/`, like those of the product.

## How the cycle differs from 495

The cycle and 495 answer the same question, how to accept a change an agent made, and they do not
answer it the same way. Each difference below is one of three kinds:
- **interim**: it goes away once 495 drives its own changes;
- **under trial**: a different choice that the laboratory weighs against 495's;
- **deliberate**: the cycle keeps it whatever 495 does.

495's side is stated by the text that holds it, and only cited here.

- **Who writes the tests: under trial.**
  - The cycle: the session that writes the code writes its tests first, and the tool replays the
    test-only commit to see it fail.
  - 495: a separate preparation intervention writes the tests before any candidate exists, and the
    kernel judges them on the bare reference and freezes them with the protocol at G2
    (`src/application/phases/prepare.ts`, `D-14`).
  - At stake: the separation keeps tests from being cut to fit the code. It costs a frozen test that
    no implementation can satisfy, which today stops the change (`specs/bugs/registry.yaml`).
- **Who reviews: under trial.**
  - The cycle: every story gets two model reviewers, for two rounds, and a promise the code does not
    keep blocks it.
  - 495: a review is a role the frozen protocol may require (`required_reviews`, empty by default).
    When one is required, a rejection or a blocking finding fails G5 (`src/domain/gates/g5.ts`).
  - At stake: whether systematic review earns what it costs.
- **Who accepts: under trial.**
  - The cycle: the owner accepts or names a gap. In an unattended run, a fresh model session decides
    in the owner's place, and the record says `origine: automate`.
  - 495: G5 combines evidence, reviews and human decisions deterministically against the frozen
    protocol. Acceptance follows from G5 by default, or from an IH-10 decision when the policy asks
    for one. A model call never yields a human decision (`ADR-014`), and only a human undoes what a
    human decided (`D-70`).
  - At stake: the cycle lets a model stand in for the owner, which 495 refuses by design. The
    laboratory measures what that substitution gets right and what it lets through.
- **Where a human answer comes from: interim.**
  - The cycle: whoever types `accepte` or `ecart`.
  - 495: an answer counts only through a Pi dialogue whose provenance the host vouches for, and never
    through JSON or print mode (`ADR-014`, `D-08`, `D-12`).
- **Where the agent runs: interim.**
  - The cycle: Claude Code sessions with the whole repository in reach.
  - 495: a confined Pi worker that cannot reach the normative storage (`ADR-004`).
- **Where the checks run: deliberate.**
  - The cycle: checks run unconfined, because this repository's suite qualifies Seatbelt itself and
    sandboxes do not nest.
  - 495: checks run under explicit sandbox profiles and refuse rather than run unconfined
    (`ADR-013`).
- **What makes a check an authority: interim.**
  - The cycle: Preflight is trusted as it stands.
  - 495: every check used as an authority is qualified first by a positive, a targeted negative and,
    when it has a runner, an incident case (`specs/amont/conception-verification.md` §2.1).
- **What the record is: interim.**
  - The cycle: an append-only journal of JSON lines beside 495's object store, exported at landing.
  - 495: a SQLite ledger whose events form a digest chain, with the same object store (`ADR-005`).

## The six steps

A story starts on a branch from `main`, on a green Preflight, and comes back to it in one commit.

1. **The story.** Written with the owner in the format of `format-de-story.md`: what the reader
   gains, the promises as scenarios, security, the tasks, what is out of scope. Each task gives the
   command that holds it, written red because it names a test that does not exist yet, the test and
   its assertion in the words of the story, and what the code does today that makes it fail. What
   needs a hand is written as such. `scripts/check-story-format.ts` refuses a story that misses this
   shape. A story that carries a verification companion (`format-de-story.md` § Compagnon de
   vérification) has a preparation, a sub-step of the story the tool examines before any red-green
   session: an incomplete companion, an undetermined exploration or a counterexample of an adopted
   model sends the story back to its preparation, naming the trace, without spending a red-green
   attempt. A story reopened on an unchanged preparation is a code correction; a changed model or
   promise withdraws the previous preparation, which is examined again.
2. **Red-green.** Task by task: the test first, its red seen on the announced assertion, a test-only
   commit, then the code and a green commit. A missing file, an import or type error, or a red
   obtained by setting code aside is not that red. The tool replays each test-only commit of the
   pass in a detached tree and reads which tests fail, not only the exit code. A test that a later
   step adds, already green because the code keeps the promise, is not a commit of the pass. The step
   ends on a green Preflight.
3. **Self-review.** A review of the branch diff against the standards of `CONVENTIONS.md`, with the
   checklist of `prompts/autocontrole.md`: scope kept, dead code, types, one test per function, a
   single responsibility, unique names. What it finds is fixed on the branch before review.
4. **Review.** Two fresh reviewers, with no shared context, in parallel, each in its own copy of the
   tree. The first round reviews the branch against `main`; the second, the diff since the reviewed
   revision and the findings already handled. There is no third round.
5. **The acceptance run.** A real execution: the extension loaded from `dist/` into a real Pi, a real
   model or a scripted agent declared as such, a campaign carried to its verdict, then the record
   read back from SQLite and the object store. A negative control goes with the green campaign: the
   same setup deprived of what the story adds, and the refusal it produces. A list backed by tests is
   not an acceptance run. A story that touches `src/application/stacks/`, the controls or the
   executor adds to its acceptance run the two reference campaigns of `cycle/campagnes/`
   (`npm run campagne -- npm` and `-- maven`), which were not cut to fit it; they also run before
   every release. The owner accepts, or names the gap.
6. **Landing.** The branch reaches `main` as one squashed commit, whose message states the resulting
   behaviour, in English, on one line. The branch is kept: the record cites its commits. The story's
   record is exported under `specs/verifications/<story>/`, the story becomes `versée`, and nothing
   is pushed: pushing is the owner's.

A gap found at the acceptance run goes back to step 2 for the gap alone, then to one review round on
its diff, then to the acceptance run.

## Review

What reviewers check: the promises of the story and its security section, and nothing else. For
each scenario: does the code keep it, and does a test hold it, one that a one-line mutation of the
line keeping the promise must make fail. A promise the code does not keep is blocking; a promise no
test holds is to be fixed. Conventions, design and smells belong to the self-review, which comes
first. For the promises, the prompt offers the reviewers no scenario, state or interleaving of its
own invention: a defect on a path no promise covers will be found by the acceptance run, by use, or
by the story that makes it a promise.

The security section is reviewed by attacking it (`specs/adr/D-89`): for every guarantee of that
section, each reviewer looks for a concrete path, through the public entries the branch exposes, that
obtains what the guarantee refuses. A path found is a bypass, marked as such in the finding with the
guarantee it gets around. A bypass is blocking and holds the gate whatever its location; it never
goes to the registry, and after the last round it is put to the owner as a promise the code does not
keep. The answer to a round cannot class it elsewhere: a bypass it does not answer as fixed by a
commit it made, whether contested, registered or claimed fixed without one, holds the next round's
gate as it stands. One it answers as fixed holds that gate too, until each reviewer of the next round
has replayed its path on the head of the branch and found it closed: a commit alone does not show
what it fixes. A bypass the last round sends back to step 2 holds, in the same way, the gate of the
round that follows the reopening. A review step relaunched after a block resumes at the round that
follows the last one answered, with the bypasses that answer left open or claimed fixed.

A finding is located before it is handled. A defect the branch introduces or makes reachable belongs
to it, even when the faulty line predates it; a defect it neither introduces nor makes reachable goes
to the registry and does not hold the review back.

The answer to a round fixes what is blocking or to be fixed. A suggestion whose fix adds no behaviour
is fixed in the round; a suggestion whose fix would add a refusal, a state or a mechanism goes to the
registry. A fix that adds a mechanism is designed before it is put in: where the state is born, who
reads it, how many entries lead to it; removing a second entry is better than keeping it. A finding
that touches only text is fixed without being reviewed by fresh reviewers: the coordinator checks the
fix against its finding.

The gate closes without a percentage. After the second round, what remains goes to the registry
`specs/bugs/registry.yaml`, named as introduced by the branch when it is, except a promise the code
does not keep, a bypass of the security section included, which is put to the owner: they decide
between landing and a fix, which goes back through step 2 and one round on its diff.

Records do not move during review. The revision, timestamps and test count of a record are set when
the gate passes. A record lagging behind the reviewed revision is not a finding, any more than the
subject of a branch commit, which never reaches `main`.

## Preflight and defects found along the way

Preflight is `npm run check`. It is green before every step, and before every commit that touches
`src/`, `test/`, `scripts/`, `bench/`, `contracts/`, `README.md`, `NOTICE`, `LICENSE`,
`package.json`, `package-lock.json`, a `tsconfig*.json` or `biome.json`. A story under
`specs/stories/` calls for `npm run lint:story-format`; an archive file calls for the check that
reads it. A green Preflight holds as long as no file of the first list has changed: cite its
revision and time rather than run it again. Only a run under Node 24 counts.

In a run of the tool, only the tool runs Preflight: a session runs what its change touches — the tests
concerned, the typecheck, the lint — and hands its output back. After the red-green, the self-review
and an answer to a review round, a red Preflight goes to a correction session with the failures the tool
read, then runs again, at most twice before the step blocks. The base of a story and the squashed
landing have no session behind them: a red Preflight there blocks at once, and so does one after a
refactoring.

A reproducible failure met along the way is a defect found, never background noise. It is fixed at
once, in its own commit, with its regression test, when the fix adds no behaviour; otherwise it gets
an entry in `specs/bugs/registry.yaml` and its own cycle. It is recorded without a fix only if its
reproduction fails after a good-faith attempt. "Already there before", "unrelated to the session",
"out of scope" are not answers.

## Git and commits

One branch per story or per fix cycle. Commit message: `<type>: <description>`, one line, in English,
whatever the language of the session or of the file changed; the types are `feat`, `fix`,
`refactor`, `docs`, `test`, `chore`, `perf`, `ci`. The message states the resulting behaviour, never
the process that produced it: no work-package reference, no review round, no attribution, no
`Co-Authored-By`. Nothing is pushed by an automaton; `gh` for every GitHub operation, never the API
directly; no issue is created by an automaton.

## What is written by hand, and what is observed

By hand: a product decision in `specs/adr/`, the order of the work in `specs/plan.yaml`, where
the owner marks `prete: oui` the epics that run without them, and, for every epic added to the plan,
its dossier in `specs/epics/`, which the plan entry cites as `source:` and the session that writes
its stories reads. The story and the registry entry are
written by hand when the owner drives the story; in a run without them, a session writes them under
the rules of this file. Everything else is observed and recorded by the tool at the moment it
observes it: a red and its message, a Preflight and its revision, a review round and its findings,
the acceptance run and the owner's agreement, the landing. Evidence is written once, in the record of
the step that produced it; elsewhere it is cited. A copy drifts from the code it describes.

## The cycle without the owner

`npm run cycle -- suite` runs, one after the other, the epics that `specs/plan.yaml` marks
`prete: oui`, in the order of the plan. For each: the next story of the plan is written by a session
when none is listed to do, it is driven to landing as above, the plan marks it landed, and the epic
becomes `versé` when a session finds that its stories deliver its purpose. The run starts from `main`
with a clean tree and stops at the first block, saying why; it never pushes.
`npm run cycle -- <story> auto` does the same for a single story.

Three of the owner's answers are delegated, each an act recorded in the record:

- **Agreement after the acceptance run.** A fresh session, which drove neither the acceptance run
  nor the review, reads the story, the report of the acceptance run and the defects the branch
  records in the registry, then decides `accepte` or `ecart` (`prompts/arbitrage.md`). A gap is a
  written promise or a security guarantee not kept, a case the previous code stopped and the branch
  lets through, or a defect of the branch that weakens a guarantee of the story; otherwise the
  agreement carries a note naming what remains in the registry and what the acceptance run did not
  exercise. A defect the arbitration finds and the registry does not carry, it records there and
  commits; the tool stops if it touches another file or leaves the tree modified. A product question
  the story does not settle is settled by the behaviour that stops. The decision is recorded with
  `origine: automate`.
- **The gap.** Whether the arbitration names it or the acceptance run reopens it, a session writes it
  into the story (a scenario, the security sentence, a task whose red is checked in the code) and
  commits it before red-green starts again: without a written promise, review cannot judge the fix.
  The tool reads the story again, requires that it gained a scenario or a task and that the tree is
  clean.
- **A promise review did not get kept.** It goes back to red-green: it was not the owner's to waive.

**Registry defects** are fixed too, at the right time (`D-73`): at the end of each epic, before the
next one, those of medium or high severity; at the end of the run, the low ones. A session picks the
first open defect that needs no product decision, writes its fix story under epic `e28` (which the
plan never marks ready) citing the registry entry, and the tool drives it through the six steps; at
landing, the entry moves from the registry to `specs/bugs/registry-fixed.yaml`, marked fixed at the
landed revision. The defects the session sets aside because they need the owner are named at the end
of the run, with the reason, without stopping it. One phase fixes at most `CYCLE_495_DEFAUTS_MAX`
defects (5 by default); `npm run cycle -- defauts [severity]` runs that phase alone.

The run stops, and hands back control, when a story has been sent back to red-green three times,
when it has spent more than `CYCLE_495_PLAFOND_USD` ($80 by default), when a session does not return
its output, or when a step blocks: a defect of the tool itself, a test that cannot be red, a red
Preflight. Writing a story stops the same way on what it cannot write without choosing in the owner's
place (`bloque`, with the choice named), and an epic with no possible first story stays the owner's.

## Refactorings

A refactoring changes no behaviour: same events, same artifacts, same verdicts, same refusals, same
contracts, same texts meant for the owner or the model. It has no promise to review, no red to see,
nothing to show at an acceptance run; so it does not go through the six steps, and takes the short
path of `D-80`. What changes a behaviour, even slightly, is a story.

Refactorings are written in `specs/reprises.md`, one section per refactoring, in the order they are
done. `npm run cycle -- reprises` drives them one after the other, from `main` and a clean tree:

1. Preflight is green on `main`, after rebuilding `dist/`, and the tool reads its test count.
2. A session does the refactoring on the branch `reprise-<id>` (`prompts/reprise.md`). It may set it
   aside, with the reason, when the refactoring would change a behaviour or the code contradicts it:
   the tool writes that into the list, commits, and moves to the next one.
3. The tool checks, without trusting the session: at least one commit, a clean tree, the list
   untouched, no assertion line of `test/` removed without coming back identical, Preflight green
   after rebuilding `dist/`, and no fewer tests than before.
4. A fresh session reviews the diff in a detached copy (`prompts/reprise-relecture.md`) and says
   whether a behaviour changes or the diff overflows the refactoring. There is no second round.
5. The branch reaches `main` in one commit, which marks the refactoring `versée` in the list; the
   branch is deleted, the log under `~/.495/cycle/<id>/` keeps the transcripts.

The run stops, and hands back control, at the first check that fails or at a review that sees a
change: the branch stays checked out so it can be read, `main` and the list do not move. To resume,
go back to `main` (`git checkout main`): the next run starts the same refactoring from a fresh branch,
or it is set aside by hand in the list with the reason. When review refuses what the refactoring
itself asks for, running again replays the same refusal: reduce the refactoring to its constant part,
saying in `Limite` what it does not do, and the rest goes to the registry or to a story.
`CYCLE_495_REPRISES_MAX` caps the number of refactorings in one run. Nothing is pushed.

## The tool

`npm run cycle -- <story>` drives the remaining steps, in order, until a step needs the owner or
blocks; `npm run cycle -- <story> etat` says where it stands;
`npm run cycle -- <story> suivre` follows, from another terminal, the story that is running;
`npm run cycle -- suite` runs the epics marked ready, without the owner;
`npm run cycle -- defauts [severity]` fixes the open defects of the registry, without running an epic;
`npm run cycle -- reprises` drives the behaviour-preserving refactorings of `specs/reprises.md`;
`npm run cycle -- <story> auto` drives a single story the same way;
`npm run cycle -- <story> accepte [note]` records the agreement after the acceptance run;
`npm run cycle -- <story> ecart "<what is missing>"` sends it back to red-green for the named gap,
with a single review round on its diff. The record lives under `~/.495/cycle/<story>/` during the
story (`CYCLE_495_DIR` moves it).

While it runs, the command shows in the terminal where the story stands: each step opens with its
place among the six, with the time and cost already spent; each session prints one line per agent
text, tool call, commit, test total or failed call, prefixed with its name when two reviewers run
together; each check says when it starts and how it ends; each step closes on its outcome, duration,
cost and commits. The terminal title names the current step and how long nothing has been printed. A
sound and a notification say that a step waits for the owner, that it blocks or that the story has
landed (`CYCLE_495_SON` changes the sound). The same lines go to `en-direct.log`, in the story's
directory, which `npm run cycle -- <story> suivre` follows from another terminal until Ctrl-C; a new
run empties that file. Nothing in this display is evidence: the log and the kept transcripts are.

The tool depends on 495 and never the reverse. It takes from the kernel the object store, where the
transcripts, check outputs and reviewer reports go; the check executor and its report readers,
through which Preflight, each task's command and the replay of each red pass; and the shape of
evidence. Checks run unconfined, and each piece of evidence says so: this repository's suite
qualifies Seatbelt itself, and sandboxes do not nest.

The steps that need a model run in Claude Code sessions, one per step, started with no background
task and no possible question, with a structured output the tool reads: red-green, self-review, the
two reviewers of each round in parallel in their detached trees, the answer, the acceptance run, the
landing message. Their prompts are in `prompts/`. The story itself is written with the owner, in an
ordinary session.

What the tool checks itself, without trusting the session: each test-only commit of the pass,
replayed in a detached tree, fails on a test it reads; each task command passes at the branch head;
Preflight is green at the cited revision; review stops at two rounds; the branch reaches `main` in
one commit; the record is exported at landing.

Before the first review round, the tool mutates the lines the branch introduces in the TypeScript
sources of `src/`, `cycle/src/` and `scripts/`, with Stryker and the test files the tasks' commands
name, in a detached tree removed afterwards; it keeps the report in the record and gives the reviewers
the mutants that survive (`D-89`). A mutation that fails or runs past its budget
(`CYCLE_495_MUTATION_MIN`, 30 minutes by default) does not hold the round back: the reviewers are told
it did not complete, and why.

What is still missing: 495's confined Pi worker in place of the Claude Code sessions.
