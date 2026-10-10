import Verdicts.Statements

namespace Verdicts

open Verdict

/-- `combine` read on the membership of each verdict in the list itself, NOT_APPLICABLE set aside. -/
theorem combine_eq (mode : Mode) (verdicts : List Verdict) :
    combine mode verdicts =
      if ∀ v ∈ verdicts, v = NOT_APPLICABLE then (if verdicts = [] then NOT_RUN else NOT_APPLICABLE)
      else match mode with
        | .any =>
          if PASS ∈ verdicts then PASS
          else if FAIL ∈ verdicts then FAIL
          else if INDETERMINATE ∈ verdicts then INDETERMINATE
          else NOT_RUN
        | .all =>
          if FAIL ∈ verdicts then FAIL
          else if INDETERMINATE ∈ verdicts then INDETERMINATE
          else if NOT_RUN ∈ verdicts then NOT_RUN
          else PASS := by
  cases mode <;> simp [combine, List.filter_eq_nil_iff, List.mem_filter]

theorem allPassNeedsEveryPass : AllPassNeedsEveryPass := by
  intro verdicts
  rw [combine_eq]
  constructor
  · intro h
    by_cases hna : ∀ v ∈ verdicts, v = NOT_APPLICABLE
    · rw [ite_eq_left hna] at h
      split at h <;> simp at h
    · rw [ite_eq_right hna] at h
      by_cases hf : FAIL ∈ verdicts
      · simp [hf] at h
      by_cases hi : INDETERMINATE ∈ verdicts
      · simp [hf, hi] at h
      by_cases hr : NOT_RUN ∈ verdicts
      · simp [hf, hi, hr] at h
      have every : ∀ v ∈ verdicts, v = PASS ∨ v = NOT_APPLICABLE := by
        intro v hv
        cases v <;> simp_all
      refine ⟨?_, every⟩
      apply Classical.byContradiction
      intro hp
      apply hna
      intro v hv
      rcases every v hv with rfl | rfl
      · exact absurd hv hp
      · rfl
  · rintro ⟨hp, every⟩
    have hna : ¬ ∀ v ∈ verdicts, v = NOT_APPLICABLE := fun h => by simpa using h PASS hp
    have hf : FAIL ∉ verdicts := fun h => by simpa using every FAIL h
    have hi : INDETERMINATE ∉ verdicts := fun h => by simpa using every INDETERMINATE h
    have hr : NOT_RUN ∉ verdicts := fun h => by simpa using every NOT_RUN h
    simp [hna, hf, hi, hr]

theorem allPassRejectsBlocking : AllPassRejectsBlocking := by
  intro verdicts v hv hb h
  rcases (allPassNeedsEveryPass verdicts).mp h with ⟨_, every⟩
  rcases every v hv with rfl | rfl <;> simp at hb

theorem anyPassKeepsPass : AnyPassKeepsPass := by
  intro verdicts hp
  have hna : ¬ ∀ v ∈ verdicts, v = NOT_APPLICABLE := fun h => by simpa using h PASS hp
  rw [combine_eq, ite_eq_right hna]
  simp [hp]

theorem emptyIsNotRun : EmptyIsNotRun := by
  intro mode
  cases mode <;> rfl

theorem passNeedsAPass : PassNeedsAPass := by
  intro mode verdicts h
  cases mode
  · exact ((allPassNeedsEveryPass verdicts).mp h).1
  · apply Classical.byContradiction
    intro hp
    rw [combine_eq] at h
    by_cases hna : ∀ v ∈ verdicts, v = NOT_APPLICABLE
    · rw [ite_eq_left hna] at h
      split at h <;> simp at h
    · rw [ite_eq_right hna] at h
      simp only [hp, ite_eq_right, not_false_eq_true] at h
      split at h
      · simp at h
      · split at h <;> simp at h

theorem onlyNotApplicable : OnlyNotApplicable := by
  intro mode verdicts hne hall
  rw [combine_eq, ite_eq_left hall, ite_eq_right hne]

theorem notApplicableIsNeutral : NotApplicableIsNeutral := by
  intro mode before after ⟨v, hv, hne⟩
  have hinserted : ¬ ∀ w ∈ before ++ NOT_APPLICABLE :: after, w = NOT_APPLICABLE := fun h =>
    hne (h v (by rcases List.mem_append.mp hv with hv | hv <;> simp [hv]))
  have hwithout : ¬ ∀ w ∈ before ++ after, w = NOT_APPLICABLE := fun h => hne (h v hv)
  rw [combine_eq, combine_eq, ite_eq_right hinserted, ite_eq_right hwithout]
  cases mode <;> simp

end Verdicts
