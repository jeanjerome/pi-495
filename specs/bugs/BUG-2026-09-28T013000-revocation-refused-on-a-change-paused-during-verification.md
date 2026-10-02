---
bug_id: BUG-2026-09-28T013000
status: open
severity: low
scope: domain
title: A change paused while its verification ran cannot have a question's resolution revoked, though nothing runs
---

# BUG-2026-09-28T013000: A change paused while its verification ran cannot have a question's resolution revoked

## Problem

The owner pauses a change while its frozen controls run, then asks `/495 revoke q1`. The revocation is
refused with `OPERATION_ACTIVE: verification operation <op> is in progress`, although nothing runs:
the pause holds the change and the conduct that ran the controls has returned. The owner's only way on
is `/495 resume`, which today fails (BUG-2026-09-28T081300) and, once that is fixed, runs the
verification again: under the default automatic acceptance, G5 can then close the change on the answer
the owner wanted to revoke, after which a revocation is refused for good.

A session that ends while the controls run leaves the change in the same state but `running`. The
revocation is refused the same way, and pausing does not help today, since the pause leaves the
verification operation open. A session that ends while an intervention runs is revocable once paused:
the pause ends the intervention first.

Expected: a paused change runs nothing, and its resolution can be revoked. A change whose session
ended is paused first, as one whose intervention was cut short already is, and the refusal says so.

Introduced by the branch that adds `/495 revoke`: before it, nothing read an open verification
operation on a paused change.

Security impact: LOW — no security exploit path identified. The owner can be kept from withdrawing a
mistaken answer before an automatic acceptance; cancelling the change stays possible.

## Diagnosis

**Reproduce.** Throwaway probes on `8f683d9`.

1. Kernel: a change with Q1 answered through IH-01, taken to a frozen candidate; `verification.start`,
   then `change.pause`: the change is `verifying paused` with the verification operation still open;
   `question.revoke q1` is refused `OPERATION_ACTIVE: verification operation op_v1 is in progress`.
2. Kernel, end of session: the same without the pause — refused the same way. Adding the pause leaves
   it refused.
3. Kernel, intervention cut short: `intervention.start`, then the intervention finished `cancelled`
   and `change.pause`, as the harness pauses: the revocation is accepted.
4. Harness: a control runner that pauses the change during the first control run on the candidate.
   The conduct returns `paused`; the state is `verifying paused` with the operation open; the harness
   revocation is refused `OPERATION_ACTIVE`.

**Isolate.** The kernel's pause refuses a running intervention and an external effect in flight, and
records a resume point, but closes no operation. The revocation refuses any open operation as work in
progress, since what it writes would rest on the revoked resolution. The kernel cannot tell a
verification a session left open from one another session runs (no lease between sessions; the story
does not presume one). Inside one session, `/495 revoke` is already refused while another 495
operation holds the session.

**Hypothesize.**

- H1: the pause leaves the verification operation open, and that alone refuses the revocation.
  Falsified if a pause that closes it still leaves the revocation refused.
- H2 (rejected): the revocation should read an operation of a paused change as suspended. It would add
  a second reader of the same stale state, and leave the resume (BUG-2026-09-28T081300) and the
  session-end case as they are.

**Verify.** With the pause closing the verification operation it suspends, as a temporary patch, probe 1
accepts the revocation, probe 4 accepts it at the harness, and probe 2 is accepted once the change is
paused. Confirmed: one root, shared with the paused path of BUG-2026-09-28T081300.

Risk: Low. A verification's operation carries no external effect. A verification still running when
the pause commits cannot record its evidence: its next commit loses to the pause and the conduct
returns `paused`, as it already does today.

## Fix approach

- The pause closes the verification operation it suspends (one change, shared with
  BUG-2026-09-28T081300).
- The revocation's refusal while an intervention runs or an operation is open names `pause`: within a
  session the refusal is only met when nothing of that session runs, and the pause stops what it
  finds. It closes a verification it suspends, and closes one a build before the fix left open on a
  change already paused.
- A blocked change runs nothing: the block ends a running intervention and closes the verification it
  stops, so its resolution is revoked. A verification a build before the fix left open with its block
  is closed by the revocation itself, since the pause refuses a blocked change. Naming the resume
  there instead would lead away from the revocation: the resume runs the verification again, and
  under the default automatic acceptance G5 can close the change on the answer the owner wanted to
  revoke.
- The next action reaches an RPC or JSON host, in the refusal's details. The text a screen shows is
  `495 error: CODE: message`, without it, as for every kernel refusal `/495` shows
  (BUG-2026-09-28T103200).

## TDD Fix Plan

Write cycle 1's red beside cycle 2's red of BUG-2026-09-28T081300, after that bug's cycle 1: both are
held by the same change to the pause.

1. **RED** — `test/v0-pure/change-rules.test.ts`, in the revocation block: "a change paused while its
   verification ran has its answer revoked, and stays paused". Asserts `question.revoke` is accepted,
   the change is `clarifying paused` with the IH-01 asking Q1 again, and no operation is left open.
   Fails today: refused `OPERATION_ACTIVE`, verification operation in progress.
   Same file: "a change whose session ended during its verification is revocable once paused" — the
   verification started and never finished, then `change.pause`, then `question.revoke` accepted.
   Fails today the same way.
   `test/v2-kernel/answer-revocation.test.ts`: "the owner revokes an answer on a change paused during its
   verification" — the harness path of probe 4. Fails today the same way.
   **GREEN** — the kernel's pause emits the close of an open verification operation before it saves
   the resume point.
   **verify**: `node --test test/v0-pure/change-rules.test.ts test/v2-kernel/answer-revocation.test.ts`

2. **RED** — `test/v0-pure/change-rules.test.ts`: "a revocation refused while a verification or an
   intervention is open names the pause that stops it". Asserts the refusal's next actions are
   `["pause"]`, once with a verification operation open and once with an intervention running. Fails
   today: the refusal carries no next action.
   **GREEN** — both `OPERATION_ACTIVE` refusals of the revocation carry `pause` as next action.
   **verify**: `node --test test/v0-pure/change-rules.test.ts`

**REFACTOR**: none expected.

## Acceptance Criteria

- [ ] A change paused during its verification has its resolution revoked, and stays paused.
- [ ] A change whose session ended during its verification is revocable once paused.
- [ ] A change blocked during its verification has its resolution revoked.
- [ ] The refusal while something is open names the pause.
- [ ] All new tests pass; Preflight (`npm run check`) is green under Node 24.

## Resolution

Fixed on the branch `reprise-de-verification-et-revocation` (`ded5f28`): pausing a change closes the verification it suspends, so a paused change runs nothing and its answer can be revoked; the resume runs the verification again. Shown in a real Pi on 2026-09-28: a revocation asked while the change was paused during its controls is accepted at the branch head and refused by the build before it (`~/.495-campagnes/reprise-b-pause-revoque-*`). Accepted by the owner the same day.
