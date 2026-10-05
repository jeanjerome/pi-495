---
bug_id: BUG-2026-09-28T081300
status: fixed
severity: medium
scope: application
title: A verification cut short by a pause or by the end of its session is never run again, so the change can only be cancelled
---

# BUG-2026-09-28T081300: A verification cut short by a pause or by the end of its session is never run again

## Problem

A verification runs the frozen controls on the frozen candidate under a verification operation the
ledger holds open until the evidence is recorded. When that run is cut short, the change can never be
verified again:

- **The session ends while the controls run** (Pi killed, host crash). The change stays `verifying
  running` with its operation open. `/495 resume` closes the operation as interrupted and conducts the
  change. The next verification is refused by the ledger — `OPERATION_ACTIVE: operation <op> already
  holds the idempotency key verify:<candidate>:0; <op'> would run the same verification a second
  time` — and the change is blocked `execution_error`. A resume lifts that stop into the same refusal.
- **The owner pauses the change while the controls run.** The change is `verifying paused` with its
  operation open. `/495 resume` fails at once with `PRECONDITION_FAILED: change is paused`, and the
  change stays paused. `/495 verify` is refused on a paused change too.

In both cases only `/495 cancel` is left.

Expected: a verification cut short is run again once the change is resumed, on the same frozen
candidate, and the change goes on to its decision.

Security impact: NONE — no security exploit path identified. The defect loses a change, it does not
widen what any actor may do.

## Diagnosis

**Reproduce.** Two throwaway harness probes on `8f683d9` (real ledger, workspace and control runner,
scripted agent), each driving a change with one material question answered through IH-01 up to its
verification:

1. A control runner that throws a plain error on the first control run on the candidate, so the
   conduct ends as a killed session would. State afterwards: `verifying running`, operation open.
   `resume`, then `advance`: `blocked execution_error`, detail the `OPERATION_ACTIVE` refusal above.
2. A control runner that calls `pause` on the change during the first control run on the candidate.
   The conduct returns `paused`, the step's next commit having lost to the pause (`REVISION_CONFLICT`,
   read as the pause's own). State: `verifying paused`, operation open. `resume` throws
   `PRECONDITION_FAILED: change is paused`.

**Isolate.** Two causes, one per path.

- *End of session.* The verification step derives its idempotency key from the candidate digest and
  the number of evidence items the change holds. A run cut short records none, so the run that follows
  derives the same key. The ledger keeps a key for good once an operation was opened under it, closed
  or not, and refuses a second operation under it: that refusal exists so that two sessions reading
  the same change cannot run the same effect twice. Present since the ledger refused a reused key
  (`bd7c5be`, 2026-09-17).
- *Pause.* The pause ends a running intervention before it is recorded, but leaves a running
  verification's operation open. The resume re-runs an interrupted verification before it ends the
  pause, and the kernel refuses to re-run the verification of a paused change. Present since the first
  kernel (`a685c7d`). The same open operation is what refuses a revocation on a paused change
  (BUG-2026-09-28T013000).

**Hypothesize.**

- H1: the key, not the kernel, refuses the re-run after the end of a session. Falsified if a key that
  differs after the interruption still leaves the change blocked.
- H2: the operation the pause leaves open is what makes the resume fail. Falsified if a pause that
  closes the verification operation still leaves the resume refused.
- H3 (rejected): the resume should end the pause before it closes the interrupted verification. It
  would answer the paused path alone, and leave the open operation that refuses the revocation.

**Verify.** With both changes applied as a temporary patch — the key naming the revision the
verification starts from, and the pause closing the verification operation it suspends — probe 1
reaches the decision after `resume`, probe 2 resumes to `verifying ready` with no operation open and
verifies again, and the whole suite passes but for the three tests of BUG-2026-09-28T025100 that the
same patch changed on purpose (575 of 578 with the probes). One root per path, confirmed.

Risk: Low. The key no longer refuses anything within a change: a second session that read the same
revision is refused by the ledger's revision check before the key is read, and one that read a later
revision derives another key. The pause and the block only close a verification, which has no external
effect.

## Fix approach

- The verification step derives its idempotency key from the candidate and the revision of the change
  it starts from, instead of the count of evidence. A verification started after one cut short starts
  from a later revision, since the resume or the pause recorded the interruption.
- The pause closes the verification operation it suspends, as it ends an intervention it suspends
  (shared with BUG-2026-09-28T013000). The resume then ends the pause and conducts the change, which
  runs the verification again.
- `/495 resume` is refused while another 495 operation holds the session: accepted while the controls
  the pause suspended still run, it would end the pause under them, and their next commit would block
  the change it resumed. The resume is inscribed under the hold the conduct takes. `/495 verify` goes
  through the same hold: it used to release the session under another holder, which let a resume
  through (BUG-2026-09-27T220000).
- The block closes the verification it stops, as the pause does. A session whose record loses on the
  revision, to a second live session's write, blocks the change while its controls run; no failure of
  one session is known to, and the tests stand for one with a control runner that throws, which its
  port says never happens. The resume then lifts only a stop a resume may lift, where a verification
  left open would have had the resume run it again, lifting any stop.

Not covered:

- A change that a build before the fix paused during its verification keeps its operation open, and
  its resume stays refused with `change is paused`, naming the resume. Pausing it again closes that
  verification (BUG-2026-09-28T013000), after which it resumes and verifies again. One that such a
  build blocked during its verification keeps its operation open too, and its resume lifts the stop
  whatever it is (BUG-2026-09-28T113000).
- A second live session that resumes the change while the first one's controls run closes the first
  one's verification and runs the controls again in the same workspace, both passes at once. When the
  first pass commits first, its record loses and it blocks the change, which closes the second pass's
  verification, whose record loses too: the change is left `blocked execution_error` with no
  verification open, and a resume verifies it again. When the second pass commits first, it records
  and the change goes on to its decision; the first pass's record loses, and it blocks the change
  where the second left it, unless the second left it stopped — on a decision, paused, blocked or
  closed —, where it returns on that stop instead. A revocation accepted in one session while the
  other's controls run thus holds: the other session's record loses, and it returns on the question
  asked again (BUG-2026-09-28T130000). Refusing the second session needs a lease between sessions,
  which the story does not presume.
- The report lists the observations of the pass the pause suspended as valid, beside those the kernel
  recorded from the pass run again, as it already does after a technical rerun
  (BUG-2026-09-28T103100).

## TDD Fix Plan

Do this bug's cycle 1 before BUG-2026-09-28T013000: that bug's fix makes the resume of a paused change
reach the reused key, so the key must be fixed first.

1. **RED** — `test/v2-kernel/harness.test.ts`: "a verification cut short by the end of its session is run
   again after a resume, and the change reaches its decision". A control runner throws a plain error
   on the first control run on the candidate; `advance` rejects; `resume`, then `advance`. Asserts the
   change stops for its acceptance decision or closes, holds evidence on the candidate, and is not
   blocked. Fails today: the change is `blocked execution_error` on the `OPERATION_ACTIVE` refusal of
   the reused key.
   **GREEN** — the verification step's idempotency key names the change's revision instead of the
   evidence count.
   **verify**: `node --test test/v2-kernel/harness.test.ts`

2. **RED** — `test/v2-kernel/harness.test.ts`: "a change paused during its verification is resumed and its
   verification is run again". A control runner calls `pause` during the first control run on the
   candidate; `advance` returns `paused`; `resume`, then `advance`. Asserts the resume is accepted, and
   the change reaches its decision with evidence on the candidate. Fails today: `resume` throws
   `PRECONDITION_FAILED: change is paused`.
   **GREEN** — the kernel's pause closes the verification operation it suspends (the same change as
   BUG-2026-09-28T013000's cycle 1, written once).
   **verify**: `node --test test/v2-kernel/harness.test.ts test/v0-pure/change-rules.test.ts`

**REFACTOR**: none expected.

## Acceptance Criteria

- [ ] A verification cut short by the end of its session runs again after a resume.
- [ ] A change paused during its verification is resumed, and its verification runs again.
- [ ] All new tests pass; Preflight (`npm run check`) is green under Node 24.

## Resolution

Fixed on the branch `reprise-de-verification-et-revocation` (`c258255`, `897ff02`): a verification derives its idempotency key from the revision it starts from, and a pause, a block, a revocation or a rerun closes the verification it stops, so a resume runs it again on the same frozen candidate. Shown in a real Pi on 2026-09-28: Pi killed while the candidate's controls ran, then `/495 resume` reruns the verification and reaches the acceptance at the branch head, and blocks on `OPERATION_ACTIVE` with no way out on the build before it (`~/.495-campagnes/reprise-a1-coupe-*`, `reprise-a2-reprise-*`). Accepted by the owner the same day.
