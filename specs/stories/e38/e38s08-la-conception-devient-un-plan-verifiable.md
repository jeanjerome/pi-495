# La conception relie les propriétés à des tâches vérifiables avant l’implémentation

Story : e38s08
Epic : e38
Statut : à faire

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

## 3. Sécurité

Les chemins autorisés restent ceux du mandat et les tests protégés ne sont pas déverrouillés. Les sorties de l’agent sont des déclarations vérifiées ou des avis, jamais des preuves d’exécution auto-certifiées.

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

## 5. Hors périmètre

Aucun ordonnanceur parallèle nouveau, aucune limite universelle de taille des fonctions. Les seuils et règles de CONVENTIONS.md restent applicables.
