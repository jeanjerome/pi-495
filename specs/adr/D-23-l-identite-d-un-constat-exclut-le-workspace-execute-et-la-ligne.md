# D-23: L'identité d'un constat exclut le workspace exécuté et la ligne

**Status:** Acceptée

**Décision.** `Finding.fingerprint` digère l'outil, la règle, le symbole, le chemin relatif et le
texte du message privé de sa localisation ; le runner retire du message le chemin absolu du
workspace et en extrait `path` et `region`. L'appariement des constats se fait ensuite en trois
passes : identité exacte, puis renommage prouvé par le manifeste (mêmes octets sous un autre nom),
puis déplacement non prouvé mais sans ambiguïté — un seul constat non apparié de chaque côté, dans
un fichier que le candidat ne porte plus.
**Motif.** Les deux passages s'exécutent dans deux répertoires : un message qui porte son chemin
absolu ne s'apparie jamais avec le même message observé de l'autre côté. Une ligne bouge dès qu'on
édite au-dessus d'elle. QLT-04 demande explicitement que déplacements et renommages ne masquent pas
une dette, ce qu'une empreinte qui contient la ligne et le répertoire ne peut pas tenir.
**Conséquence.** Un appariement ambigu n'est pas deviné : le constat du candidat reste introduit et
celui de la référence devient `removed`. Le défaut conservateur va vers le blocage, jamais vers la
disparition silencieuse d'une dette.
