---- MODULE HumansAlone ----
\* The human assumption without the kernel's: if it settled the change on its own, it would assume the
\* conclusion it is meant to lead to.
EXTENDS ChangeLifecycle

HumansAloneSpec == Init /\ [][Next]_vars /\ HumansRespond
====
