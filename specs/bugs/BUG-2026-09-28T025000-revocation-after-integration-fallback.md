---
bug_id: BUG-2026-09-28T025000
status: open
severity: low
scope: domain
title: After an integration fallback, a revocation says revoked the reconciliation of the Git effect, whose effect holds, and leaves the outcome accepted
---

# BUG-2026-09-28T025000: After an integration fallback, a revocation says revoked a reconciliation whose effect holds, and leaves the outcome accepted

## Problem

A change accepted at G5 with an integration mandated enters its integration. The owner answers an
uncertain Git effect through IH-12, then the destination advances and the combined tree differs: the
change falls back to `verifying`, IH-10, IH-11 and IH-08 are revoked and the acceptance is withdrawn.
From there:

- **A revocation revokes the IH-12 reconciliation.** Revoking the answer to a material question takes
  the change back to clarification and revokes every valid decision but the answers and the budget
  extensions, IH-12 included. The IH-12 decision recorded whether the Git effect was applied; the
  revocation undoes nothing of that, so the report and the exported dossier say revoked a decision
  whose effect holds (M5).
- **The outcome stays `accepted`.** The change back in `verifying` after the fallback still says
  `accepted`; a re-verification that fails leaves it in `deciding`, G5 FAIL, outcome `accepted`; and a
  revocation carries `accepted` into clarification. The report prints the outcome as it stands.

Expected: a revocation says revoked only a decision whose effect it undoes, and a change says
`accepted` only while the G5 that accepted it holds.

The revocation part is introduced by the branch that adds `/495 revoke`: before it, nothing reached
that plan after an integration. The outcome that outlives the fallback predates it, and the branch
carries it into clarification.

Security impact: LOW — no security exploit path identified. The dossier misstates what was revoked and
what the change concluded; no decision is taken on either.

## Diagnosis

**Reproduce.** Throwaway kernel probes on `8f683d9`, integration enabled and mandated, Q1 answered
through IH-01:

1. G5 PASS (`integrating`, outcome `accepted`); IH-11 answered `integrate`; integration prepared,
   started, then uncertain; IH-12 answered `confirm_not_applied` (operation closed, `integrating
   ready`); destination advanced with a combined tree that differs: `verifying ready`, outcome
   `accepted`, IH-11 revoked, IH-12 valid. `question.revoke q1` is accepted: `clarifying`, outcome
   `accepted`, and a `decision.revoked` for the IH-12 decision with reason "resolution of question q1
   revoked".
2. The same fallback, then a verification whose unit control fails and G5: `deciding`, G5 FAIL,
   outcome `accepted`.

**Isolate.**

- The invalidation plan a revocation shares with a revised mandate revokes every valid human decision
  but IH-01 and IH-07. IH-07 was kept for the reason IH-12 needs: its effect does not depend on the
  mandate. IH-12 was left in on the ground that it only follows an acceptance, after which a
  revocation is refused; the fallback withdraws the acceptance without undoing the reconciliation.
- `accepted` is set by G5 PASS and by nothing else. Invalidating G5 drops the gate but leaves the
  outcome; only a revised artifact sets the outcome back to `pending`. The fallback, which invalidates
  G5, therefore leaves `accepted` behind, and every later state inherits it.

**Hypothesize.**

- H1: IH-12 is revoked because the shared plan lists it. Falsified if a plan without IH-12 still
  revokes it.
- H2: the outcome is stale from the fallback, not from the revocation. Falsified if the fallback leaves
  a pending outcome and the revocation still yields `accepted`.
- H3 (rejected): reset the outcome in the revocation alone, as the reviewer proposed. It leaves probe 2
  as it is and adds a second place that must remember to reset it.

**Verify.** With IH-12 kept out of the shared plan and G5's invalidation setting an accepted outcome
back to pending, as a temporary patch: probe 1 leaves IH-12 valid and records no `decision.revoked` for
it, the change is `verifying` with outcome `pending` after the fallback and `clarifying` with outcome
`pending` after the revocation; probe 2 is `deciding`, G5 FAIL, outcome `pending`. The rest of the
suite passes. Confirmed: two roots, one per symptom.

Risk: Low. On the paths the extension drives, G5 is invalidated with an accepted outcome only after G5
passed, that is in an integration; the outcome `integrated` is never touched. The kernel also accepts
`environment.change` and `evidence.invalidate` on a closed change, and both invalidate G5, so a closed
accepted change they reached would say `pending`; no code of the extension emits either command
(BUG-2026-09-28T103000).

## Fix approach

- The plan a revocation shares with a revised mandate keeps IH-12 valid, as it keeps IH-07.
- Invalidating G5 sets an `accepted` outcome back to `pending`, in the state the event derives, as a
  revised artifact already does.

Not covered: a change that fell back from its integration under a build before the fix keeps
`accepted` in its stored state, since the ledger applies each new event to the state it stored and
never replays the journal on its own. The report and the exported dossier read that stored state. A
replay of the same journal derives `pending`, so the ledger's integrity check would report that
change as differing from its replay; no path of the extension runs that check.

## TDD Fix Plan

1. **RED** — `test/v0-pure/change-rules.test.ts`, in the revocation block: "a revocation after an
   integration fallback keeps the reconciliation of the Git effect valid (M5)", and "a revision of the
   mandate after an integration fallback keeps it valid too". Assert the IH-12 decision stays valid and
   no `decision.revoked` names it. Fail today: the IH-12 decision is revoked.
   **GREEN** — the shared plan excludes IH-12 beside IH-01 and IH-07.
   **verify**: `node --test test/v0-pure/change-rules.test.ts`

2. **RED** — `test/v0-pure/change-rules.test.ts`, in the integration block: "a destination that advanced with
   a different combined tree withdraws the accepted outcome, and a failed re-verification is not said
   accepted"; in the revocation block: "a change taken back to clarification by a revocation after an
   integration fallback holds a pending outcome". Assert outcome `pending` after the fallback, after
   G5 FAIL, and after the revocation. Fail today: `accepted` in all three.
   **GREEN** — the derivation of a G5 invalidation sets an `accepted` outcome back to `pending`.
   **verify**: `node --test test/v0-pure/change-rules.test.ts`

**REFACTOR**: the comment on the shared plan names IH-12 beside IH-07, with the reason.

## Acceptance Criteria

- [ ] After an integration fallback, a revocation or a revised mandate leaves IH-12 valid.
- [ ] After an integration fallback, the outcome is `pending` until G5 passes again.
- [ ] A change taken back to clarification holds no accepted outcome.
- [ ] All new tests pass; Preflight (`npm run check`) is green under Node 24.

## Resolution

Fixed on the branch `reprise-de-verification-et-revocation` (`04e4450`, `1f36ec6`): a revocation or a revised mandate keeps the owner's reconciliation of a Git effect valid, and an integration fallback withdraws the accepted outcome. Held by `test/v0-pure/change-rules.test.ts`; not exercised in a real Pi. Accepted by the owner on 2026-09-28.
