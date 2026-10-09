---- MODULE StaleProof ----
\* A deliberately wrong kernel, kept out of the adopted model: on resume, it adopts the controls still running
\* under the protocol revision now in force, as if they had been launched under it. A result launched under
\* P1 then arrives labelled P2, and G5 relies on it. FreshAcceptance must catch it.
EXTENDS ChangeLifecycle

ResumeAdoptingRuns ==
    /\ status = "paused"
    /\ status' = saved
    /\ runs' = {[r EXCEPT !.rev = rev] : r \in runs}
    /\ UNCHANGED <<humanPolicy, phase, saved, interruptions, attempt, open, cand, rev, evidence, decisions, g5,
                   outcome, retained>>

MutantSpec == Init /\ [][Next \/ ResumeAdoptingRuns]_vars
====
