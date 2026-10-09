---- MODULE Compteur ----
\* The counter of the valid witness with one faulty transition, two steps at a time: it overshoots Max,
\* which violates the invariant Borne. It parses and type-checks like the valid one.
EXTENDS Naturals
CONSTANT Max
VARIABLE x
Init == x = 0
Next == x < Max /\ x' = x + 2
Spec == Init /\ [][Next]_x /\ WF_x(Next)
Borne == x \in 0..Max
Termine == <>(x = Max)
====
