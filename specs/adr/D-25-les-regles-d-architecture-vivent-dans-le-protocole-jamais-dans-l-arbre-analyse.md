# D-25: Les règles d'architecture vivent dans le protocole, jamais dans l'arbre analysé

**Status:** Acceptée

**Décision.** `ControlDefinition.structure_rules` porte les règles qu'un capteur structurel
applique : leur portée, ce qu'elles interdisent et l'énoncé qui les justifie. Elles sont gelées avec
le protocole à G2. Le producteur en reçoit les énoncés dans son contexte
(`ContextInput.boundaries`) et n'a aucun moyen de les atteindre en écriture. Elles sont dérivées de
ce que la cible déclare déjà — direction de dépendance des POM, racine de paquet disposée par chaque
module, absence de cycle — et non d'un fichier de configuration à ajouter au dépôt.
**Motif.** ARC-04 demande qu'une architecture adoptée ne reste pas une consigne dans le contexte. Un
fichier de règles dans l'arbre est un fichier que le producteur peut éditer, et une frontière que
son auteur peut déplacer n'est pas opposable ; le mettre sous `protected_paths` reviendrait à
protéger l'arbre contre lui-même, alors que le protocole est déjà l'endroit où sont gelés la
tolérance de baseline et la règle d'instabilité. Dériver les règles des déclarations de la cible
évite par ailleurs de lui imposer un format de plus pour énoncer ce que ses POM disent déjà.
**Conséquence.** Déplacer une frontière volontairement suppose une autre révision du protocole,
c'est-à-dire l'adoption que la recette d'ARC-04 exige. Un réacteur qui ne déclare aucune direction
opposable n'obtient aucune règle de frontière, et l'insuffisance rejoint `capability_missing` plutôt
qu'une convention inventée à sa place.
