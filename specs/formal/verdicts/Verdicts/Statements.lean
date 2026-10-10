import Verdicts.Defs

/-!
# What is proved of the combination

Each statement is a proposition about `combine`, approved with the definitions before any proof is sought. A
proof proves one of them by name: `theorem allPassRejectsBlocking : AllPassRejectsBlocking`.
-/

namespace Verdicts

open Verdict

/-- all_pass: a FAIL, INDETERMINATE or NOT_RUN among the verdicts keeps the combination from PASS. -/
def AllPassRejectsBlocking : Prop :=
  ∀ (verdicts : List Verdict) (v : Verdict),
    v ∈ verdicts → (v = FAIL ∨ v = INDETERMINATE ∨ v = NOT_RUN) → combine .all verdicts ≠ PASS

/-- all_pass: PASS exactly when one verdict passes and every verdict passes or does not apply. -/
def AllPassNeedsEveryPass : Prop :=
  ∀ verdicts : List Verdict,
    combine .all verdicts = PASS ↔ (PASS ∈ verdicts ∧ ∀ v ∈ verdicts, v = PASS ∨ v = NOT_APPLICABLE)

/-- any_pass: one PASS suffices, whatever the other verdicts. -/
def AnyPassKeepsPass : Prop :=
  ∀ verdicts : List Verdict, PASS ∈ verdicts → combine .any verdicts = PASS

/-- An obligation with no verdict is NOT_RUN, under either rule. -/
def EmptyIsNotRun : Prop :=
  ∀ mode : Mode, combine mode [] = NOT_RUN

/-- No rule passes without a PASS: neither the empty list nor a list of NOT_APPLICABLE passes. -/
def PassNeedsAPass : Prop :=
  ∀ (mode : Mode) (verdicts : List Verdict), combine mode verdicts = PASS → PASS ∈ verdicts

/-- Verdicts that are all NOT_APPLICABLE combine to NOT_APPLICABLE, under either rule. -/
def OnlyNotApplicable : Prop :=
  ∀ (mode : Mode) (verdicts : List Verdict),
    verdicts ≠ [] → (∀ v ∈ verdicts, v = NOT_APPLICABLE) → combine mode verdicts = NOT_APPLICABLE

/-- A NOT_APPLICABLE inserted anywhere among verdicts that are not all NOT_APPLICABLE changes nothing. -/
def NotApplicableIsNeutral : Prop :=
  ∀ (mode : Mode) (before after : List Verdict),
    (∃ v ∈ before ++ after, v ≠ NOT_APPLICABLE) →
      combine mode (before ++ NOT_APPLICABLE :: after) = combine mode (before ++ after)

end Verdicts
