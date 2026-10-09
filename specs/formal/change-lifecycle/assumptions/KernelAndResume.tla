---- MODULE KernelAndResume ----
\* The kernel's assumption with only the resume of the humans' one: a change waiting for a human decision may
\* still wait forever, so no fairness on an answer hides in the kernel's assumption.
EXTENDS ChangeLifecycle

KernelAndResumeSpec == Spec /\ WF_vars(Resume)
====
