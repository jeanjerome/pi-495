---- MODULE KernelAndAnswer ----
\* The kernel's assumption with only the answer of the humans' one: a paused change may still stay paused
\* forever, so no fairness on a resume hides in the kernel's assumption.
EXTENDS ChangeLifecycle

KernelAndAnswerSpec == Spec /\ WF_vars(\E option \in Options : HumanAnswer(option))
====
