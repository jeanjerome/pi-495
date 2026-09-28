---
bug_id: BUG-2026-09-28T081300
status: open
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

Risk: Low. The key keeps its purpose — two sessions reading the same change at the same revision derive
the same key — and the pause only closes an operation that has no external effect.

## Fix approach

- The verification step derives its idempotency key from the candidate and the revision of the change
  it starts from, instead of the count of evidence. A verification started after one cut short starts
  from a later revision, since the resume or the pause recorded the interruption.
- The pause closes the verification operation it suspends, as it ends an intervention it suspends
  (shared with BUG-2026-09-28T013000). The resume then ends the pause and conducts the change, which
  runs the verification again.

Not covered: a change that a build before the fix paused during its verification keeps its operation
open, and its resume stays refused with `change is paused`; cancelling it stays its way out. Covering it
needs a test on a journal written by the earlier build.

## TDD Fix Plan

Do this bug's cycle 1 before BUG-2026-09-28T013000: that bug's fix makes the resume of a paused change
reach the reused key, so the key must be fixed first.

1. **RED** — `test/v2/harness.test.ts`: "a verification cut short by the end of its session is run
   again after a resume, and the change reaches its decision". A control runner throws a plain error
   on the first control run on the candidate; `advance` rejects; `resume`, then `advance`. Asserts the
   change stops for its acceptance decision or closes, holds evidence on the candidate, and is not
   blocked. Fails today: the change is `blocked execution_error` on the `OPERATION_ACTIVE` refusal of
   the reused key.
   **GREEN** — the verification step's idempotency key names the change's revision instead of the
   evidence count.
   **verify**: `node --test test/v2/harness.test.ts`

2. **RED** — `test/v2/harness.test.ts`: "a change paused during its verification is resumed and its
   verification is run again". A control runner calls `pause` during the first control run on the
   candidate; `advance` returns `paused`; `resume`, then `advance`. Asserts the resume is accepted, and
   the change reaches its decision with evidence on the candidate. Fails today: `resume` throws
   `PRECONDITION_FAILED: change is paused`.
   **GREEN** — the kernel's pause closes the verification operation it suspends (the same change as
   BUG-2026-09-28T013000's cycle 1, written once).
   **verify**: `node --test test/v2/harness.test.ts test/v0/change-rules.test.ts`

**REFACTOR**: none expected.

## Acceptance Criteria

- [ ] A verification cut short by the end of its session runs again after a resume.
- [ ] A change paused during its verification is resumed, and its verification runs again.
- [ ] All new tests pass; Preflight (`npm run check`) is green under Node 24.

## Resolution

<!-- filled in by validate-fix -->
