import Lean

/-!
Reads, in the environment of a built Lean module, what each theorem named on the command line is: the kind of its
declaration, whether its type is exactly the approved statement, the module the statement comes from, and every
axiom it reaches transitively, as `#print axioms` collects them. One JSON object per theorem on stdout, preceded by
one for each imported declaration filed under another name than its own: the kernel replay adds a declaration under
its own name and the import files it under that other name, so the two would not read the same declaration. Then one
for each name that two imported modules declare: the kernel replay skips a theorem its imports already hold under the
same name and type, while the import keeps the later copy, so the two would not read the same proof. Only the modules of
the project are replayed, so only a name a module of the project declares again is reported: Lean's own library
declares some of its equation lemmas in two modules.

Usage: lean --run Inspect.lean <module> <theorem>=<statement> ...
-/

open Lean

def kindOf : ConstantInfo → String
  | .thmInfo _ => "theorem"
  | .axiomInfo _ => "axiom"
  | .defnInfo _ => "definition"
  | .opaqueInfo _ => "opaque"
  | _ => "other"

def moduleOf (env : Environment) (name : Name) : Json :=
  match env.getModuleIdxFor? name with
  | some idx => match env.header.moduleNames[idx.toNat]? with
    | some m => toJson m.toString
    | none => Json.null
  | none => Json.null

def inspect (env : Environment) (theoremName statement : Name) : IO Json := do
  let some info := env.find? theoremName
    | return Json.mkObj [("theorem", toJson theoremName.toString), ("statement", toJson statement.toString),
        ("kind", "absent"), ("states_approved", false), ("axioms", toJson ([] : List String))]
  let ctx : Core.Context := { fileName := "<inspect>", fileMap := default }
  let (axioms, _) ← (collectAxioms theoremName : CoreM (Array Name)).toIO ctx { env }
  return Json.mkObj [
    ("theorem", toJson theoremName.toString),
    ("statement", toJson statement.toString),
    ("kind", toJson (kindOf info)),
    ("states_approved", toJson (info.type == mkConst statement)),
    ("type", toJson (toString info.type)),
    ("statement_module", moduleOf env statement),
    ("axioms", toJson (axioms.map Name.toString))]

/-- Every imported declaration the import files under another name than its own, with the module that holds it. -/
def misfiled (env : Environment) : Array Json :=
  env.constants.map₁.fold (init := #[]) fun found key info =>
    if key == info.name then found
    else found.push <| Json.mkObj [("misfiled", toJson key.toString), ("name", toJson info.name.toString),
      ("module", moduleOf env key)]

/--
Every name a module under `root` declares when an earlier imported module already does, with the module that declares
it first and the one that does again.
-/
def declaredAgain (env : Environment) (root : Name) : Array Json := Id.run do
  let mut first : Std.HashMap Name Name := {}
  let mut found := #[]
  for module in env.header.moduleNames, data in env.header.moduleData do
    for name in data.constNames do
      match first[name]? with
      | some earlier =>
        if root.isPrefixOf module then
          found := found.push <| Json.mkObj [("declared_again", toJson name.toString),
            ("first", toJson earlier.toString), ("again", toJson module.toString)]
      | none => first := first.insert name module
  return found

def main (args : List String) : IO UInt32 := do
  let module :: pairs := args | throw <| IO.userError "usage: Inspect <module> <theorem>=<statement> ..."
  initSearchPath (← findSysroot)
  let env ← importModules #[{ module := module.toName }] {} (trustLevel := 0)
  for found in misfiled env ++ declaredAgain env module.toName do
    IO.println found.compress
  for pair in pairs do
    let [theoremName, statement] := pair.splitOn "=" | throw <| IO.userError s!"not <theorem>=<statement>: {pair}"
    IO.println (← inspect env theoremName.toName statement.toName).compress
  return 0
