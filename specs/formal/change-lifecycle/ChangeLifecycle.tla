---- MODULE ChangeLifecycle ----
\* The acceptance of a change by the kernel of 495, as a finite specification. A candidate is verified under
\* a frozen protocol revision; its controls answer late, after a revision, an interruption or a resume; a
\* failed candidate is corrected within an attempt budget; G5 accepts on the evidence it retains. The model
\* abstracts the kernel, whose command carries out each action (manifest.json); it does not reproduce the
\* runtime. The properties judge what a control really ran on, which no transition reads: the transitions
\* propose to preserve them, the properties say what must be preserved.
EXTENDS Naturals, FiniteSets

CONSTANTS
    Controls,          \* the controls the frozen protocol runs, as model values
    MaxAttempts,       \* the attempt budget: attempt i may freeze a candidate of identity i
    MaxRevisions,      \* the protocol goes through revisions 1..MaxRevisions
    MaxInterruptions   \* how many times the change may be interrupted

\* Two mandatory obligations over the controls, one per combination rule (RM-019): "all" holds when every
\* control passes and none fails, "any" when one passes.
Obligations == {"all", "any"}
Verdicts == {"PASS", "FAIL"}
Options == {"accept", "reject"}
Candidates == 1..MaxAttempts
Revisions == 1..MaxRevisions

VARIABLES
    humanPolicy,    \* the policy asks a human acceptance (IH-10) before G5 passes
    phase,          \* "qualification", "implementation", "verifying", "deciding" or "closed"
    status,         \* "ready", "paused", "decision_required" or "blocked"
    saved,          \* the status the resume point keeps while the change is paused
    interruptions,  \* interruptions so far
    attempt,        \* attempts consumed
    open,           \* an attempt is open and has not frozen its candidate yet
    cand,           \* identity of the frozen candidate
    rev,            \* revision of the frozen protocol
    runs,           \* controls launched whose result has not arrived
    evidence,       \* evidence recorded, valid or invalidated
    decisions,      \* human answers IH-10, valid or revoked
    g5,             \* the G5 verdict on the current candidate, "none" until G5 is evaluated
    outcome,        \* "pending" or "accepted"
    retained        \* the evidence G5 relied on when it accepted

vars == <<humanPolicy, phase, status, saved, interruptions, attempt, open, cand, rev, runs, evidence, decisions,
          g5, outcome, retained>>

\* A run, and the evidence its result becomes, carry the candidate and the protocol revision the kernel reads
\* (`cand`, `rev`) and the revision the control really ran under (`ran`), which only the properties read.
Run(k) == [control |-> k, cand |-> cand, rev |-> rev, ran |-> rev]
Runs == [control : Controls, cand : Candidates, rev : Revisions, ran : Revisions]

\* What G5 retains: valid evidence of the frozen candidate under the frozen revision (evaluateG5 sets the rest
\* aside as invalidated, other candidate or other protocol revision).
Usable(e) == e.valid /\ e.cand = cand /\ e.rev = rev
Current == {e \in evidence : Usable(e)}
Evidenced(k) == \E e \in Current : e.control = k
Running(k) == \E r \in runs : r.control = k /\ r.cand = cand /\ r.rev = rev

Satisfies(o, S) ==
    LET passed == {e.control : e \in {x \in S : x.verdict = "PASS"}}
        failed == {e.control : e \in {x \in S : x.verdict = "FAIL"}}
    IN IF o = "all" THEN passed = Controls /\ failed = {} ELSE passed # {}

HumanAccepted == \E d \in decisions : d.valid /\ d.cand = cand /\ d.option = "accept"
HumanRefused == \E d \in decisions : d.valid /\ d.cand = cand /\ d.option = "reject"
Revoked(ds) == {[d EXCEPT !.valid = FALSE] : d \in ds}

Accepted == outcome = "accepted"
Stopped == status = "blocked"
AwaitingHuman == status \in {"decision_required", "paused"}

\* The candidate of the first attempt is frozen under the first revision: G0 to G4 lie before the model.
Init ==
    /\ humanPolicy \in BOOLEAN
    /\ phase = "verifying"
    /\ status = "ready"
    /\ saved = "ready"
    /\ interruptions = 0
    /\ attempt = 1
    /\ open = FALSE
    /\ cand = 1
    /\ rev = 1
    /\ runs = {}
    /\ evidence = {}
    /\ decisions = {}
    /\ g5 = "none"
    /\ outcome = "pending"
    /\ retained = {}

\* A control of the frozen protocol is launched on the frozen candidate, unless it already ran or runs on it.
Launch(k) ==
    /\ phase = "verifying"
    /\ status = "ready"
    /\ ~Evidenced(k)
    /\ ~Running(k)
    /\ runs' = runs \cup {Run(k)}
    /\ UNCHANGED <<humanPolicy, phase, status, saved, interruptions, attempt, open, cand, rev, evidence, decisions,
                   g5, outcome, retained>>

\* A result arrives, whatever happened since its launch. The kernel records it only while verifying, and only
\* for the frozen candidate under the frozen revision; any other result is rejected and leaves no evidence.
Deliver(r, v) ==
    /\ r \in runs
    /\ runs' = runs \ {r}
    /\ evidence' =
        IF phase = "verifying" /\ r.cand = cand /\ r.rev = rev
        THEN evidence \cup {[control |-> r.control, cand |-> r.cand, rev |-> r.rev, ran |-> r.ran,
                             verdict |-> v, valid |-> TRUE]}
        ELSE evidence
    /\ UNCHANGED <<humanPolicy, phase, status, saved, interruptions, attempt, open, cand, rev, decisions, g5,
                   outcome, retained>>

\* Every control has its evidence on the candidate: the change goes to G5.
Complete ==
    /\ phase = "verifying"
    /\ status = "ready"
    /\ \A k \in Controls : Evidenced(k)
    /\ phase' = "deciding"
    /\ g5' = "none"
    /\ UNCHANGED <<humanPolicy, status, saved, interruptions, attempt, open, cand, rev, runs, evidence, decisions,
                   outcome, retained>>

\* G5 combines the evidence it retains against the obligations and, under a policy that asks it, the human
\* acceptance of this candidate. Obligations met without that acceptance ask a human (IH-10).
EvaluateG5 ==
    /\ phase = "deciding"
    /\ status = "ready"
    /\ g5 = "none"
    /\ IF (\A o \in Obligations : Satisfies(o, Current)) /\ (~humanPolicy \/ HumanAccepted)
       THEN /\ g5' = "PASS"
            /\ outcome' = "accepted"
            /\ phase' = "closed"
            /\ retained' = Current
            /\ UNCHANGED status
       ELSE IF (\A o \in Obligations : Satisfies(o, Current)) /\ ~HumanRefused
       THEN /\ g5' = "INDETERMINATE"
            /\ status' = "decision_required"
            /\ UNCHANGED <<outcome, phase, retained>>
       ELSE /\ g5' = "FAIL"
            /\ UNCHANGED <<outcome, phase, retained, status>>
    /\ UNCHANGED <<humanPolicy, saved, interruptions, attempt, open, cand, rev, runs, evidence, decisions>>

\* A human accepts or refuses the candidate presented; G5 is evaluated again. Only this action records a
\* human answer: no other actor's output stands for one.
HumanAnswer(option) ==
    /\ status = "decision_required"
    /\ decisions' = decisions \cup {[cand |-> cand, option |-> option, valid |-> TRUE]}
    /\ status' = "ready"
    /\ g5' = "none"
    /\ UNCHANGED <<humanPolicy, phase, saved, interruptions, attempt, open, cand, rev, runs, evidence, outcome,
                   retained>>

\* G5 failed and an attempt remains: a new attempt opens and the decisions on the candidate are revoked. The
\* evidence stays valid; G5 sets it aside once the new candidate has another identity.
Correct ==
    /\ phase = "deciding"
    /\ status = "ready"
    /\ g5 = "FAIL"
    /\ attempt < MaxAttempts
    /\ attempt' = attempt + 1
    /\ open' = TRUE
    /\ phase' = "implementation"
    /\ g5' = "none"
    /\ decisions' = Revoked(decisions)
    /\ UNCHANGED <<humanPolicy, status, saved, interruptions, cand, rev, runs, evidence, outcome, retained>>

\* G5 failed and no attempt remains: the change stops on its exhausted budget.
ExhaustOnCorrection ==
    /\ phase = "deciding"
    /\ status = "ready"
    /\ g5 = "FAIL"
    /\ attempt = MaxAttempts
    /\ status' = "blocked"
    /\ UNCHANGED <<humanPolicy, phase, saved, interruptions, attempt, open, cand, rev, runs, evidence, decisions,
                   g5, outcome, retained>>

\* Implementation starts again after a revision: a new attempt opens while the budget allows it.
StartAttempt ==
    /\ phase = "implementation"
    /\ status = "ready"
    /\ ~open
    /\ attempt < MaxAttempts
    /\ attempt' = attempt + 1
    /\ open' = TRUE
    /\ UNCHANGED <<humanPolicy, phase, status, saved, interruptions, cand, rev, runs, evidence, decisions, g5,
                   outcome, retained>>

\* Implementation would start again with no attempt left: the change stops on its exhausted budget.
ExhaustOnStart ==
    /\ phase = "implementation"
    /\ status = "ready"
    /\ ~open
    /\ attempt = MaxAttempts
    /\ status' = "blocked"
    /\ UNCHANGED <<humanPolicy, phase, saved, interruptions, attempt, open, cand, rev, runs, evidence, decisions,
                   g5, outcome, retained>>

\* The open attempt freezes its candidate: the same tree as the previous one, hence the same identity, or a
\* new one. G4 passes.
Freeze ==
    /\ phase = "implementation"
    /\ status = "ready"
    /\ open
    /\ cand' \in {cand, attempt}
    /\ open' = FALSE
    /\ phase' = "verifying"
    /\ UNCHANGED <<humanPolicy, status, saved, interruptions, attempt, rev, runs, evidence, decisions, g5, outcome,
                   retained>>

\* The protocol is revised: the change rolls back to qualification, every evidence is invalidated and the
\* decisions on the candidate are revoked. Controls already launched may still answer.
ReviseProtocol ==
    /\ rev < MaxRevisions
    /\ phase \in {"implementation", "verifying", "deciding"}
    /\ rev' = rev + 1
    /\ phase' = "qualification"
    /\ status' = "ready"
    /\ g5' = "none"
    /\ evidence' = {[e EXCEPT !.valid = FALSE] : e \in evidence}
    /\ decisions' = Revoked(decisions)
    /\ UNCHANGED <<humanPolicy, saved, interruptions, attempt, open, cand, runs, outcome, retained>>

\* G5 refused the candidate, the producer contested a frozen case of it, and an examination distinct from the
\* producer found the test wrong: the preparation that froze the case is revised, with the effects of a protocol
\* revision. A contestation found unfounded changes nothing the model represents, and the correction that follows
\* is Correct.
Contest ==
    /\ phase = "deciding"
    /\ status = "ready"
    /\ g5 = "FAIL"
    /\ ReviseProtocol

\* The revised protocol is frozen (G2) and the design adopted again (G3): implementation resumes.
Requalify ==
    /\ phase = "qualification"
    /\ status = "ready"
    /\ phase' = "implementation"
    /\ UNCHANGED <<humanPolicy, status, saved, interruptions, attempt, open, cand, rev, runs, evidence, decisions,
                   g5, outcome, retained>>

\* The change is interrupted: the resume point keeps its status. Controls already launched may still answer.
Pause ==
    /\ phase # "closed"
    /\ status \in {"ready", "decision_required"}
    /\ interruptions < MaxInterruptions
    /\ saved' = status
    /\ status' = "paused"
    /\ interruptions' = interruptions + 1
    /\ UNCHANGED <<humanPolicy, phase, attempt, open, cand, rev, runs, evidence, decisions, g5, outcome, retained>>

\* The change resumes from its resume point, without giving back any counter.
Resume ==
    /\ status = "paused"
    /\ status' = saved
    /\ UNCHANGED <<humanPolicy, phase, saved, interruptions, attempt, open, cand, rev, runs, evidence, decisions,
                   g5, outcome, retained>>

Next ==
    \/ \E k \in Controls : Launch(k)
    \/ \E r \in Runs, v \in Verdicts : Deliver(r, v)
    \/ Complete
    \/ EvaluateG5
    \/ \E option \in Options : HumanAnswer(option)
    \/ Correct
    \/ ExhaustOnCorrection
    \/ StartAttempt
    \/ ExhaustOnStart
    \/ Freeze
    \/ ReviseProtocol
    \/ Contest
    \/ Requalify
    \/ Pause
    \/ Resume

\* What the controls and the kernel are assumed to do: every control launched eventually answers, and the
\* kernel takes every step that stays enabled. Nothing is assumed of a human: an interruption, a revision, a
\* contestation, a resume or an answer may never come.
KernelAndControlsProceed ==
    /\ WF_vars(\E k \in Controls : Launch(k))
    /\ WF_vars(\E r \in Runs, v \in Verdicts : Deliver(r, v))
    /\ WF_vars(Complete)
    /\ WF_vars(EvaluateG5)
    /\ WF_vars(Correct)
    /\ WF_vars(ExhaustOnCorrection)
    /\ WF_vars(StartAttempt)
    /\ WF_vars(ExhaustOnStart)
    /\ WF_vars(Freeze)
    /\ WF_vars(Requalify)

Spec == Init /\ [][Next]_vars /\ KernelAndControlsProceed

\* The explicit assumption under which a human wait ends: whoever paused resumes, whoever is asked answers.
HumansRespond == WF_vars(Resume) /\ WF_vars(\E option \in Options : HumanAnswer(option))

SpecHumansRespond == Spec /\ HumansRespond

----
\* Properties.

TypeOK ==
    /\ humanPolicy \in BOOLEAN
    /\ phase \in {"qualification", "implementation", "verifying", "deciding", "closed"}
    /\ status \in {"ready", "paused", "decision_required", "blocked"}
    /\ saved \in {"ready", "decision_required"}
    /\ interruptions \in 0..MaxInterruptions
    /\ attempt \in Candidates
    /\ open \in BOOLEAN
    /\ cand \in Candidates
    /\ rev \in Revisions
    /\ g5 \in {"none", "PASS", "FAIL", "INDETERMINATE"}
    /\ outcome \in {"pending", "accepted"}

\* What G5 accepted rests only on controls that ran on the accepted candidate under the revision in force.
FreshAcceptance ==
    Accepted => retained # {} /\ \A e \in retained : e.cand = cand /\ e.ran = rev

\* An acceptance rests on evidence that satisfies every mandatory obligation, by its combination rule.
AcceptanceNeedsObligations ==
    Accepted => \A o \in Obligations : Satisfies(o, retained)

\* The change never consumes more attempts than its budget, and it stops only once the budget is spent.
AttemptBudget ==
    /\ attempt <= MaxAttempts
    /\ Stopped => attempt = MaxAttempts

\* Under a policy that asks it, an accepted candidate carries a valid human acceptance of this very candidate.
HumanAcceptance ==
    Accepted /\ humanPolicy => HumanAccepted

\* A valid decision is recorded only by a human answer: no step of the kernel, a resume, a correction or a
\* revision, records one in a human's place.
HumanProvenance ==
    [][\A d \in decisions' \ decisions : d.valid => \E option \in Options : HumanAnswer(option)]_vars

\* A resume, a revision or a correction never gives back a consumed attempt or interruption.
CountersNeverReset ==
    [][attempt' >= attempt /\ interruptions' >= interruptions]_vars

\* A change stopped by its exhausted budget is never accepted afterwards.
StopIsFinal ==
    [](Stopped => [](~Accepted))

\* Assuming only the kernel and the controls: the change ends accepted, stopped, or waiting for a human.
Progress ==
    <>(Accepted \/ Stopped \/ AwaitingHuman)

\* Assuming moreover that humans respond: the change ends accepted or stopped.
Settles ==
    <>(Accepted \/ Stopped)

----
\* Reachability probes, never required: each is expected to be violated, and its counterexample is a path that
\* reaches the outcome. An outcome no path reaches would make the properties above true by vacuity.

AcceptanceIsUnreachable == ~Accepted
RefusalIsUnreachable == g5 # "FAIL"
HumanWaitIsUnreachable == status # "decision_required"
StopIsUnreachable == ~Stopped

====
