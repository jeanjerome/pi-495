# D-18: Une opération déterministe n'est jamais rejouée

**Status:** Acceptée
**Note:** l'identifiant D-18 est porté par deux décisions distinctes dans le journal d'origine ; l'autre est « Jalon de livraison distinct de la priorité d'exigence ». Le défaut est conservé tel quel, non résolu.

**Décision.** Le budget de reprise technique n'est consommé que si la dernière observation porte un
incident et que cet incident ne s'est pas déjà reproduit à l'identique. Sinon G5 renvoie le
candidat en correction avec les constats.
**Motif.** Réexécuter un candidat gelé sous un protocole gelé est une fonction pure. Traiter tout
INDETERMINATE comme un incident dépensait les trois reprises à produire la même preuve, puis
bloquait le changement sur `execution_error` au lieu de rendre l'échec à l'agent.
