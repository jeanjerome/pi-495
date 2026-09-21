# D-20: Le build 495 fait partie de l'identité d'environnement

**Status:** Acceptée
**Note:** l'identifiant D-20 est porté par deux décisions distinctes dans le journal d'origine ; l'autre est « La matrice de traçabilité porte une ligne par exigence P0 ». Le défaut est conservé tel quel, non résolu.

**Décision.** `environment_digest` couvre le digest de l'arbre exécuté (`dist/` une fois installé,
`src/` en développement) et la version du paquet, en plus de la plateforme, de Node, de Pi, du
bac à sable et des outils sondés.
**Motif.** Sans cela, une mise à jour du harness pendant un changement laissait l'identité
d'environnement inchangée : un protocole restait « qualifié » pour du code qui n'existait plus et
des preuves produites par deux builds se comparaient comme une seule.
