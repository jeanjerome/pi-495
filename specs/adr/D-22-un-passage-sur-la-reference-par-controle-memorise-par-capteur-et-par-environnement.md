# D-22: Un passage sur la référence par contrôle, mémorisé par capteur et par environnement

**Status:** Acceptée

**Décision.** À la vérification, chaque contrôle du protocole gelé s'exécute d'abord sur un
workspace reconstruit depuis l'instantané de référence, puis sur le candidat. Le passage de
référence est écrit au journal comme preuve à part entière (`subject.kind = "reference"`,
`facts.run = "reference"`) et relu au lieu d'être refait tant que le contrôle, la référence,
l'empreinte d'environnement et la révision du protocole sont les mêmes.
**Motif.** Comparer deux passages suppose qu'ils portent sur la même chose : `environment_digest`
est la condition de comparabilité, donc elle appartient à la clé. Une référence ne change pas
pendant un changement, et une tentative qui suit un refus ne doit rien coûter du côté qui n'a pas
bougé. Le journal porte déjà l'identité du capteur — commande, répertoire, environnement, arbre
observé — dans `inputs_digest` : la mémorisation n'a besoin d'aucun index de plus.
**Conséquence.** La première vérification d'un changement matérialise un workspace de plus et
exécute chaque contrôle une fois de plus ; les tentatives suivantes ne paient rien. Une révision du
protocole ou un changement d'environnement rétablit les passages, ce que l'invalidation exige déjà
pour les preuves du candidat.
