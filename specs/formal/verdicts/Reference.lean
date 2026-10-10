import Verdicts.Defs

/-!
The interface the tests evaluate the reference through: one case per line on stdin, its rule then its verdicts
separated by spaces (`all PASS FAIL`, or `any` alone for an obligation with no verdict), and on stdout, one per line,
the verdict the approved `combine` gives it. Nothing here defines the combination: it reads and prints.
-/

namespace Verdicts

def Verdict.ofName? : String → Option Verdict
  | "PASS" => some .PASS
  | "FAIL" => some .FAIL
  | "INDETERMINATE" => some .INDETERMINATE
  | "NOT_RUN" => some .NOT_RUN
  | "NOT_APPLICABLE" => some .NOT_APPLICABLE
  | _ => none

def Verdict.name : Verdict → String
  | .PASS => "PASS"
  | .FAIL => "FAIL"
  | .INDETERMINATE => "INDETERMINATE"
  | .NOT_RUN => "NOT_RUN"
  | .NOT_APPLICABLE => "NOT_APPLICABLE"

def Mode.ofName? : String → Option Mode
  | "all" => some .all
  | "any" => some .any
  | _ => none

def evaluate (line : String) : Except String Verdict := do
  match (line.splitOn " ").filter (· ≠ "") with
  | [] => throw "an empty line names no rule"
  | rule :: names =>
    let some mode := Mode.ofName? rule | throw s!"unknown rule {rule}"
    let verdicts ← names.mapM fun name =>
      match Verdict.ofName? name with
      | some v => pure v
      | none => throw s!"unknown verdict {name}"
    pure (combine mode verdicts)

end Verdicts

def main : IO UInt32 := do
  let stdin ← IO.getStdin
  let mut line ← stdin.getLine
  while line ≠ "" do
    match Verdicts.evaluate (line.replace "\n" "") with
    | .ok v => IO.println v.name
    | .error e =>
      IO.eprintln e
      return 1
    line ← stdin.getLine
  return 0
