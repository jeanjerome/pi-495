# La conception relie les propriétés à des tâches vérifiables avant l’implémentation

Story : e38s08
Epic : e38
Statut : versée

Surface : pi-495 — G3 et boucles G4
Dépendances : e38s06, e38s07


## 1. Ce que le lecteur gagne

Le producteur reçoit un plan d’actions qui relie exigences, mécanismes, responsabilités, dépendances, périmètres et contrôles locaux. Un résumé non vide ne suffit plus à déclarer le plan exécutable. Le noyau vérifie la structure et les compatibilités observables ; la plausibilité de conception reçoit la revue prévue par le profil.

Les tâches sont réalisées avec des boucles locales courtes, puis un autocontrôle du diff. Celui-ci nomme périmètre, responsabilités, types, complexité, code mort et dépendances. Il ne vaut pas acceptation. Une évolution qui change les règles de vérification retourne vers préparation au lieu de déplacer les critères pendant le codage.

## 2. Promesses

Scenario: Un résumé ne suffit pas à valider la conception
  Given un résumé non vide sans tâche pour une exigence obligatoire
  When G3 examine la conception
  Then il nomme l’exigence non servie et ne valide pas le plan

Scenario: Les tâches sont compatibles avec le mandat
  Given une tâche qui écrit un chemin protégé ou dépend d’une tâche absente
  When G3 examine le plan
  Then cette incompatibilité est localisée avant le lancement de production

Scenario: Les contrôles locaux et l’autocontrôle préparent le candidat
  Given un plan accepté et un travail de production
  When le candidat est présenté
  Then le rapport relie tâches, contrôles locaux et constats d’autocontrôle au diff exact sans les présenter comme le verdict G5

Scenario: Un test préparé réécrit par le producteur est refusé
  Given un protocole gelé qui protège `test/` et le test préparé `test/shout.test.js`
  And un producteur qui réécrit ce test en gardant le nom de son cas
  When le candidat est figé
  Then G4 refuse le candidat avec la raison « protected path altered by the producer: test/shout.test.js »
  And le changement n’est pas accepté

Scenario: Le rapport ne prête pas au producteur ce que la préparation a écrit
  Given un plan accepté dont aucune tâche n’écrit le test préparé `test/shout.test.js`
  When le candidat porte ce test tel que la préparation l’a écrit
  Then la ligne « modifié hors de toute tâche du plan, relevé par le noyau » du rapport ne cite pas `test/shout.test.js`
  And quand le producteur a réécrit ce test, la même ligne le cite

## 3. Sécurité

Les chemins autorisés restent ceux du mandat et les tests protégés ne sont pas déverrouillés. Un test préparé que le producteur réécrit est refusé à G4 comme un test existant réécrit, même sous un répertoire protégé où un fichier ajouté est admis : cette admission ne vaut que pour un fichier que la préparation n’a pas écrit. Les sorties de l’agent sont des déclarations vérifiées ou des avis, jamais des preuves d’exécution auto-certifiées.

## 4. Tâches

### Tâche 1 — Structurer les tâches de conception

Étendre `Design` et `SpecificationReport` avec tâches identifiées, responsabilités, liens exigences/propriétés, dépendances et contrôles. Conserver le parcours court des choix locaux réversibles et la lecture des anciens rapports.

- Vérifie : `node --test test/v0-pure/design-plan.test.ts`
- Tient : `test/v0-pure/design-plan.test.ts`, « une dépendance inconnue, un cycle et une exigence non servie sont nommés ».
- Rouge : Le contrat et la phase actuels n’exigent pas ce plan de tâches vérifiables.

### Tâche 2 — Remplacer les indicateurs de G3 par des vérifications

Adapter `src/application/phases/design.ts` et la décision G3 : calculer les compatibilités vérifiables et consommer la revue de conception lorsqu’elle est requise. Ne pas prétendre démontrer la faisabilité avec un booléen.

- Vérifie : `node --test test/v2-kernel/design-gate.test.ts`
- Tient : `test/v2-kernel/design-gate.test.ts`, « un résumé seul ou un chemin protégé ne fait pas passer G3 ».
- Rouge : `compatible_with_mandate` vaut actuellement true et `executable` dépend du résumé non vide.

### Tâche 3 — Conduire les tâches et conserver l’autocontrôle

Adapter `phases/implement.ts` et le rapport producteur : progression par tâche, essais locaux référencés, autocontrôle sur le diff, signalement des écarts. Le noyau refait les contrôles d’autorité au gel du candidat.

- Vérifie : `node --test test/v2-kernel/implementation-plan.test.ts`
- Tient : `test/v2-kernel/implementation-plan.test.ts`, « une déclaration locale de succès ne remplace pas l’exécution du contrôle d’acceptation ».
- Rouge : Le parcours ne relie pas explicitement tâches, vérifications locales et autocontrôle au plan adopté.

### Tâche 4 — Recette par le parcours réel

Conduire une petite story dans Pi avec deux tâches et une dépendance. Essayer un plan incompatible, puis le plan corrigé ; constater G3, exécution, autocontrôle et jugement du candidat exact. Modifier un critère en cours de production et vérifier le retour contrôlé.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s08/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s08`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

### Tâche 5 — G4 refuse un test préparé réécrit

Dans `protectedPathsChanged` (`src/domain/gates/g4.ts`), un fichier que la préparation a écrit et que le candidat porte sous une autre empreinte est altéré, qu’il soit ajouté ou non sous un répertoire protégé : la règle « ajouté sous un répertoire protégé » ne s’applique qu’à un fichier que la préparation n’a pas écrit.

- Vérifie : `node --test test/v2-kernel/implementation-plan.test.ts`
- Tient : `test/v2-kernel/implementation-plan.test.ts`, « un test préparé que le producteur réécrit en gardant le nom de son cas est refusé à G4, qui nomme son chemin, et le changement n’est pas accepté ».
- Rouge : `protectedPathsChanged` écarte le fichier préparé dont l’empreinte a changé de la règle « gardé tel qu’écrit » (ligne 118), puis l’admet par la règle « ajouté sous un répertoire protégé » (lignes 119 à 126), puisque `test/shout.test.js` est `added` sous `test/` : il est rangé dans `allowed`, `altered` reste vide, et `evaluateG4` rend PASS.

### Tâche 6 — Le rapport ne compte pas la préparation comme production

`keepImplementation` (`src/application/phases/implement.ts`) ne cite parmi les chemins modifiés hors de toute tâche du plan que ceux que le producteur a changés : un fichier préparé que le candidat porte tel que la préparation l’a écrit n’y figure pas, un fichier préparé que le producteur a réécrit y figure.

- Vérifie : `node --test test/v2-kernel/implementation-plan.test.ts`
- Tient : `test/v2-kernel/implementation-plan.test.ts`, « un test préparé que le producteur n’a pas touché n’est pas cité comme modifié hors du plan, et le même test réécrit l’est ».
- Rouge : `keepImplementation` passe à `implementationRecord` `scope.changed`, tous les chemins du candidat qui diffèrent de la référence, préparation comprise, et `implementationRecord` ne les filtre que sur les chemins des tâches : `test/shout.test.js`, ajouté par la préparation et porté inchangé, figure dans `unplanned_paths`.

## 5. Hors périmètre

Aucun ordonnanceur parallèle nouveau, aucune limite universelle de taille des fonctions. Les seuils et règles de CONVENTIONS.md restent applicables.

Le refus d’un test préparé réécrit ne change pas G3 : une tâche dont le chemin contient un chemin protégé reste admise avant la production, comme le registre l’inscrit. Un test que le producteur ajoute sous `test/` sans que la préparation l’ait écrit reste admis, et un test préparé supprimé reste refusé à G5, qui ne voit pas passer le cas lié. Le rapport ne dit pas en quoi un fichier réécrit diffère du fichier préparé.
