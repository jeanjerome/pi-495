# e01s03 — seul l'humain clôt une question matérielle

Relevé le 2026-09-27 sur `seul-l-humain-clot-une-question`, sous Node 26.9.0. Chaque commande de
tâche est rejouée sur le commit de test seul, puis sur le commit qui le rend vert, chacun dans un
arbre de travail détaché, `node_modules` lié par symlink. Le script `verify-tdd-red-commit.sh`
juge le dépôt du paquet bigpowers, pas celui-ci.

Les rouges des tâches 1 à 4 n'avaient été relevés que verts, à la tête de la branche : ils sont
établis ici. Ceux des tâches 6 et 7 l'avaient été au develop-tdd de la boucle des écarts, et sont
rejoués à l'identique.

## Cycle rouge-vert

| Comportement | Rouge (test seul) | Vert |
| --- | --- | --- |
| IH-01 offre répondre, clore et abandonner, en français et en anglais ; clore inscrit la clôture sous l'acteur au lieu d'une réponse, refusée à une sortie de modèle ou à un appel d'outil ; la question close n'est pas reposée, et le mandat la porte close avec le propriétaire (tâche 1) | `ecae006` — 5 échecs sur 99 : deux options au lieu de trois, et `choose close` enregistre une réponse. Le test d'IH-01 qui préexistait échoue sur la même liste d'options | `df1e2a3` |
| Une commande du noyau clôt une question devant l'arrêt et lève l'arrêt comme une reprise ; elle est refusée hors de la clarification, pour une question inconnue, non matérielle ou déjà close, pendant une intervention ou une décision en attente, et sans provenance humaine qualifiée ; l'arrêt nomme `close` (tâche 2) | `d87746b` — 18 échecs sur 70. Quatorze sont des tests d'e01s02 qui passent par `assertStoppedBeforeG0`, qui exige désormais `close` dans le détail de l'arrêt, et échouent tous sur « close is not named in » | `c66855e` |
| « Non observable » est une proposition : sans clôture, le rapport qui la fait arrête le changement avant G0, et G1 refuse une telle réponse ; clore la confirme au-delà de G1, reprendre la refuse (6c à 6g, tâche 3) | `8d74555` — 4 échecs sur 108 : G1 passe une réponse déclarée non observable dont la question n'est pas close | `33a3bd6` |
| `/495 close` exige une liaison, une question, une provenance humaine et la confirmation, affiche le refus du noyau, et conduit le changement comme après une reprise ; l'outil de conversation n'offre aucune clôture (tâche 4) | `767dadb` — 6 échecs sur 7 avec le test de 6k renforcé à `7d70995` (5 avant) : la sous-commande n'existe pas, et l'aide s'affiche. L'épinglage de l'outil passe dès le rouge : il fixe une propriété qui tenait déjà | `102bf49` |
| Le mandat porte une question close que le rapport qui le fonde ne pose plus, avec l'acteur (tâche 6) | `558cdd9` — 2 échecs sur 22 : le mandat a `open_questions: []` | `21771be` |
| Le document des exigences recopie une question close `observable: false`, liée à aucune exigence, quoi que dise le rapport (tâche 7) | `b88c567` — 2 échecs sur 75 : la déclaration du rapport est recopiée telle quelle, `observable: true` | `e662755` |

```
ecae006 (test seul)      node --test test/v0/change-rules.test.ts test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=1  (5 échecs sur 99)
df1e2a3 (implémentation) node --test test/v0/change-rules.test.ts test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=0  (99 sur 99)
d87746b (test seul)      node --test test/v0/change-rules.test.ts test/v2/specification-reopening.test.ts   exit=1  (18 échecs sur 70)
c66855e (implémentation) node --test test/v0/change-rules.test.ts test/v2/specification-reopening.test.ts   exit=0  (70 sur 70)
8d74555 (test seul)      node --test test/v0/change-rules.test.ts test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=1  (4 échecs sur 108)
33a3bd6 (implémentation) node --test test/v0/change-rules.test.ts test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=0  (108 sur 108)
767dadb (test seul)      node --test test/v3/question-closure.test.ts   exit=1  (5 échecs sur 7)
767dadb + test de 7d70995 node --test test/v3/question-closure.test.ts   exit=1  (6 échecs sur 7)
102bf49 (implémentation) node --test test/v3/question-closure.test.ts   exit=0  (7 sur 7)
558cdd9 (test seul)      node --test test/v2/specification-reopening.test.ts   exit=1  (2 échecs sur 22)
21771be (implémentation) node --test test/v2/specification-reopening.test.ts   exit=0  (22 sur 22)
b88c567 (test seul)      node --test test/v0/change-rules.test.ts test/v2/specification-reopening.test.ts   exit=1  (2 échecs sur 75)
e662755 (implémentation) node --test test/v0/change-rules.test.ts test/v2/specification-reopening.test.ts   exit=0  (75 sur 75)
```

Chaque échec du rouge est une assertion sur le comportement attendu, pas une erreur d'import ou de
chargement.

## Le test de 6k, renforcé

À `767dadb`, le test « refuser la confirmation n'inscrit rien » passait déjà : sans sous-commande
`close`, rien n'est inscrit non plus. Il ne vérifiait pas que la confirmation avait été demandée.
`7d70995` compte les confirmations du faux contexte et exige qu'une seule ait été demandée avant
que rien ne soit inscrit. Rejoué dans l'arbre de `767dadb`, ce test échoue sur « the closure is put
to the owner before anything is inscribed » ; il passe à la tête de la branche.
