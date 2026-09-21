# D-27: Un contrôle coûteux reçoit sa portée du candidat gelé, avant tout lancement

**Status:** Acceptée

**Décision.** `ControlDefinition` porte un `scope_argument` : un argument que le protocole gèle,
dont `{classes}` est remplacé au lancement par les classes que le sujet introduit. Le runner calcule
cette portée avant d'ouvrir le bac à sable, et deux cas se décident sans rien exécuter — un sujet
qui n'introduit aucune classe ne lance rien et rend `PASS`, un sujet dont personne n'a établi les
lignes ne lance rien et rend `INDETERMINATE`. L'argument effectivement passé est celui que la preuve
enregistre, et celui que digère `inputs_digest`.
**Motif.** La règle est gelée à G2, avant que le candidat existe ; la portée, elle, ne peut être
connue qu'après. Un essai de mutation sur l'arbre entier dépenserait le budget d'un changement à
observer ce que ce changement n'a pas touché, et l'inverse — pas d'argument du tout — reviendrait à
muter tout ce que la cible contient dès qu'un fichier bouge. La portée est dérivée du manifeste et
des lignes introduites, calculées depuis des octets adressés par contenu : le producteur ne la
déclare pas, il la subit.
**Conséquence.** Le passage de référence d'un tel contrôle ne coûte rien, comme celui de la
couverture. La commande enregistrée dans la preuve n'est plus toujours celle du protocole : c'est
celle qui a tourné, et les deux passages restent comparables puisque la référence n'introduit rien
et ne reçoit donc aucun argument de portée.
