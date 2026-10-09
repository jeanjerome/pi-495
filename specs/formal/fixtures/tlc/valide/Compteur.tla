---- MODULE Compteur ----
\* A counter that climbs one step at a time from 0 to Max and stops there: the witness of a model that
\* TLC explores to the end. Borne is its safety property, Termine the reachability of its valid end.
EXTENDS Naturals
CONSTANT Max
VARIABLE x
Init == x = 0
Next == x < Max /\ x' = x + 1
Spec == Init /\ [][Next]_x /\ WF_x(Next)
Borne == x \in 0..Max
Termine == <>(x = Max)
====
