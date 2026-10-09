---- MODULE ForgedAcceptance ----
\* A deliberately wrong kernel, kept out of the adopted model: resuming a change paused while a human acceptance
\* was asked, it records that acceptance itself, as if the human had answered. HumanProvenance must catch it.
EXTENDS ChangeLifecycle

ResumeRecordingAcceptance ==
    /\ status = "paused"
    /\ saved = "decision_required"
    /\ decisions' = decisions \cup {[cand |-> cand, option |-> "accept", valid |-> TRUE]}
    /\ status' = "ready"
    /\ g5' = "none"
    /\ UNCHANGED <<humanPolicy, phase, saved, interruptions, attempt, open, cand, rev, runs, evidence, outcome,
                   retained>>

MutantSpec == Init /\ [][Next \/ ResumeRecordingAcceptance]_vars
====
