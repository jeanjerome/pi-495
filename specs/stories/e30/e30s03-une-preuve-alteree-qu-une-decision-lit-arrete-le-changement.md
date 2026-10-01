# Une preuve altérée qu'une décision lit arrête le changement au lieu d'être lue comme absente

Story : e30s03
Epic : e30
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui lit un dossier compte sur une règle de la spécification : l'altération d'une
preuve invalide toute décision courante qui en dépend (`RM-070`). La lecture d'un artefact refuse
déjà des octets dont l'empreinte ne correspond plus (`EVIDENCE_STALE`), mais deux lectures dont une
décision dépend rattrapent ce refus comme une absence :

- l'index des fichiers du candidat, qui sert à calculer les lignes introduites que la couverture et
  la mutation jugent : altéré, il est lu comme vide, et le verdict se rend avec une note « octets du
  candidat indisponibles » ;
- les rapports de spécification relus pour décider si la spécification doit être rouverte : un
  rapport altéré disparaît de la liste, et la règle de réouverture juge sans lui.

Dans les deux cas, une décision se prend sur une preuve altérée sans que le dossier nomme
l'altération. C'est un défaut et non une préférence : la règle est écrite, et le code la contourne.

## 2. Promesses

Scenario: Un index des fichiers du candidat altéré arrête le changement
  Given un changement dont l'objet de l'index des fichiers du candidat a été altéré dans le magasin
  When la vérification calcule les lignes que le candidat introduit
  Then le changement est arrêté, et le détail de l'arrêt nomme `EVIDENCE_STALE` et l'empreinte de l'objet altéré

Scenario: Un index des fichiers du candidat absent garde le comportement d'aujourd'hui
  Given un changement dont l'index des fichiers du candidat n'a jamais été écrit
  When la vérification calcule les lignes que le candidat introduit
  Then le calcul se fait sans ces octets, et le changement n'est pas arrêté

Scenario: Un rapport de spécification altéré arrête le changement
  Given un changement dont l'objet d'un rapport de spécification antérieur a été altéré dans le magasin
  When le noyau relit les rapports pour juger la spécification
  Then le changement est arrêté, et le détail de l'arrêt nomme `EVIDENCE_STALE` et l'empreinte de l'objet altéré

## 3. Sécurité

La story touche la provenance : une preuve dont l'empreinte ne correspond plus cesse d'être lue comme
une absence dans les deux lectures nommées, et l'arrêt du changement porte l'empreinte en cause.

## 4. Tâches

### Tâche 1 — L'index altéré des fichiers du candidat arrête le changement

La lecture de l'index des fichiers du candidat et de celui de la référence ne rattrape plus que
`EVIDENCE_MISSING` ; toute autre erreur remonte, et la boucle de conduite arrête le changement comme
pour toute erreur du noyau.

- Vérifie : `node --test test/v2/altered-evidence.test.ts`
- Tient : `test/v2/altered-evidence.test.ts`, « un changement dont l'objet de `files_<candidat>` est altéré est arrêté, et le détail de l'arrêt nomme EVIDENCE_STALE et l'empreinte de l'objet » et « un changement dont `files_<candidat>` n'existe pas n'est pas arrêté par le calcul des lignes introduites »
- Rouge : `introducedLines` rattrape toute erreur de lecture par `.catch(() => ({}))` : l'index altéré est lu comme vide, la vérification continue et le changement n'est pas arrêté

### Tâche 2 — Un rapport de spécification altéré arrête le changement

La relecture des rapports de spécification ne rattrape plus que `EVIDENCE_MISSING` ; une altération
remonte et arrête le changement.

- Vérifie : `node --test test/v2/altered-evidence.test.ts`
- Tient : `test/v2/altered-evidence.test.ts`, « un changement dont l'objet d'un rapport de spécification antérieur est altéré est arrêté à la relecture des rapports, et le détail de l'arrêt nomme EVIDENCE_STALE »
- Rouge : `readReports` rattrape toute erreur par `.catch(() => null)` et retire le rapport altéré de la liste : la spécification est jugée sans lui et le changement n'est pas arrêté

## 5. Hors périmètre

- Les autres lectures qui rattrapent une erreur : la qualification d'un protocole antérieur, dont la
  perte ne fait que requalifier le capteur, le retour d'un essai à l'implémenteur, et les vues de
  lecture (état, rapport, revue). Elles ne fondent pas une décision du noyau ; la reprise qui leur
  écrit pourquoi l'abandon est sans conséquence est dans `specs/reprises.md`.
- L'invalidation des portes qu'une preuve altérée a déjà fondées (`evidence_lost`), que le noyau porte
  déjà par ailleurs.
- Distinguer une absence légitime d'une perte : un index absent garde son comportement d'aujourd'hui.
