---- MODULE AcceptExhausted ----
\* A deliberately wrong kernel, kept out of the adopted model: once G5 has failed and no attempt remains, it
\* closes the change as accepted instead of stopping it, still asking the human acceptance its policy
\* requires. AcceptanceNeedsObligations must catch it.
EXTENDS ChangeLifecycle

AcceptWhenExhausted ==
    /\ phase = "deciding"
    /\ status = "ready"
    /\ g5 = "FAIL"
    /\ attempt = MaxAttempts
    /\ humanPolicy => HumanAccepted
    /\ outcome' = "accepted"
    /\ phase' = "closed"
    /\ retained' = Current
    /\ UNCHANGED <<humanPolicy, status, saved, interruptions, attempt, open, cand, rev, runs, evidence, decisions,
                   g5>>

MutantSpec == Init /\ [][Next \/ AcceptWhenExhausted]_vars
====
