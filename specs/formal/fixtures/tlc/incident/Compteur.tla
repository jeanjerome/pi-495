---- MODULE Compteur ----
\* The counter of the valid witness, unchanged. Its configuration sets Max so high that the exploration
\* cannot end within the budget of its manifest: the witness of an exploration stopped before its end.
EXTENDS Naturals
CONSTANT Max
VARIABLE x
Init == x = 0
Next == x < Max /\ x' = x + 1
Spec == Init /\ [][Next]_x /\ WF_x(Next)
Borne == x \in 0..Max
Termine == <>(x = Max)
====
