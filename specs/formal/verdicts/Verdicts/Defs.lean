/-!
# The combination of the verdicts of an obligation under G5

The reference of `combine` in `src/domain/gates/g5.ts`: the verdicts the controls of one obligation answered,
combined under the rule the obligation declares. NOT_APPLICABLE is left out of the calculation; an obligation
with no verdict at all is NOT_RUN, one whose every verdict is NOT_APPLICABLE is NOT_APPLICABLE. Whether the
requirement is mandatory, and every other condition of G5, lie outside this definition.
-/

namespace Verdicts

inductive Verdict where
  | PASS
  | FAIL
  | INDETERMINATE
  | NOT_RUN
  | NOT_APPLICABLE
  deriving DecidableEq, Repr

/-- `all` is the rule `all_pass` of an obligation, `any` the rule `any_pass`. -/
inductive Mode where
  | all
  | any
  deriving DecidableEq, Repr

open Verdict

/-- all: every verdict must PASS; any: one PASS suffices. NOT_APPLICABLE is excluded from the calculation. -/
def combine (mode : Mode) (verdicts : List Verdict) : Verdict :=
  let v := verdicts.filter (· != NOT_APPLICABLE)
  if v.isEmpty then (if verdicts.isEmpty then NOT_RUN else NOT_APPLICABLE)
  else match mode with
    | .any =>
      if v.contains PASS then PASS
      else if v.contains FAIL then FAIL
      else if v.contains INDETERMINATE then INDETERMINATE
      else NOT_RUN
    | .all =>
      if v.contains FAIL then FAIL
      else if v.contains INDETERMINATE then INDETERMINATE
      else if v.contains NOT_RUN then NOT_RUN
      else PASS

end Verdicts
