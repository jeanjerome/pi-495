---
bug_id: BUG-2026-09-28T025100
status: fixed
severity: low
scope: application
title: The prepared suite is written as a free-text note of every control's qualification, found again by its prefix and read as a reason the control is not qualified
---

# BUG-2026-09-28T025100: The prepared suite is a free-text note of every qualification

## Problem

When a change prepared a suite, each control's qualification in the frozen protocol carries the note
`prepared suite on the bare reference: <verdict> (discriminant | not discriminant)`. Two things follow:

- A qualification taken up from an earlier protocol drops every note that starts with that text and
  writes the one judged now. Nothing keeps another note from starting that way, and a note of the
  suite worded otherwise would be kept beside the new one.
- A qualification's notes are read as the reasons its control is not qualified: the G2 refusal and the
  engineering report list them under `control <id> is not qualified: …`. A control that fails its
  qualification beside a discriminant suite is said not qualified, among other reasons, because
  "prepared suite on the bare reference: FAIL (discriminant)" — which is the prepared suite doing what
  it must, and says nothing of the control.

Expected: the reasons a control is not qualified are what its witnesses answered, and the prepared suite
is recorded once, where the preparation is.

The prefix match is introduced by the branch that adds `/495 revoke`, with the fix of the note doubled
at every take-up. The note itself, and its reading as a reason, predate it (`bdd0566`).

Security impact: NONE — no security exploit path identified.

## Diagnosis

**Reproduce.** A throwaway harness probe on `8f683d9`: the preparation scenario of
`test/v2-kernel/preparation.test.ts` (a project without tests, a `prepare` intervention writing a discriminant
suite), with a control runner that answers FAIL for every qualification run of the `unit` control. The
change stops `capability_missing`, and both the stop detail and the report end the reasons of `control
unit is not qualified` with `prepared suite on the bare reference: FAIL (discriminant)`.

**Isolate.** The verification coordinator appends the note to every qualification it writes, qualified
or not, and to every one it takes up. The verdict the note repeats is already recorded: the preparation
is an artifact of its own — adopted by the kernel when the suite qualifies — carrying the verdict on
the reference, whether the suite is discriminant, loadable and qualified, and the exported dossier
holds it with the other artifacts. No code reads the note back but the take-up that replaces it, and
the two readers of a qualification's notes take them as reasons it is not qualified. A qualification from an older
build is never taken up, since the environment digest names the harness build.

**Hypothesize.**

- H1: the note is the only place the qualification carries the suite, so removing it loses nothing the
  dossier does not hold elsewhere. Falsified if any reader of the protocol needs the suite beside the
  qualification.
- H2 (rejected): give the qualification a structured field for the suite, as first proposed. It changes
  the protocol contract to hold a second copy of what the preparation artifact holds.

**Verify.** With the note removed from written and taken-up qualifications, as a temporary patch, the
whole suite passes but for the three tests of the revocation story that count the note per control —
they assert the note that is removed (575 of 578 with the probes). No other reader of the note exists.
Confirmed.

Risk: Low. The protocol contract does not change; the notes of new qualifications lose one line.

## Fix approach

The verification coordinator no longer notes the prepared suite in any qualification: the prefix and
the function that matched it go. A qualification taken up is carried as it was written. The prepared
suite stays recorded by the preparation artifact.

## TDD Fix Plan

1. **RED** — `test/v2-kernel/preparation.test.ts`: "the reasons a control is not qualified name what its
   witnesses answered, not the prepared suite judged beside it". The probe's scenario; asserts the stop
   detail and the report's `control unit is not qualified` line do not mention the prepared suite, and
   that the adopted preparation record says FAIL on the reference and discriminant. Fails today: both
   end with `prepared suite on the bare reference: FAIL (discriminant)`.
   The three take-up tests of `test/v2-kernel/answer-revocation.test.ts` ("… notes the prepared suite of the
   rebuilt change alone", "… without a preparation notes no prepared suite …", "… with a preparation
   notes its prepared suite …") are rewritten in the same test-only commit: they hold that no
   qualification of the frozen protocol, first build or rebuilt, notes a prepared suite, and that the
   rebuilt change's adopted preparation is its own or absent. They fail today on the first build's
   note.
   **GREEN** — remove the note and its prefix from the verification coordinator.
   **verify**: `node --test test/v2-kernel/preparation.test.ts test/v2-kernel/answer-revocation.test.ts`

**REFACTOR**: the coordinator's comment on qualifying says the prepared suite is judged separately and
recorded by the preparation, not noted here.

## Acceptance Criteria

- [ ] No qualification notes the prepared suite, written afresh or taken up.
- [ ] The G2 refusal and the report give as reasons only what the witnesses answered.
- [ ] The adopted preparation still records the suite's verdict on the reference.
- [ ] All new tests pass; Preflight (`npm run check`) is green under Node 24.

## Resolution

<!-- filled in by validate-fix -->
