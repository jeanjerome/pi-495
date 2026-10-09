# Une exigence ne franchit la qualification que si son propre oracle a été éprouvé

Story : e38s06
Epic : e38
Statut : à faire

Surface : pi-495 — préparation, G2 et obligations G5
Dépendances : e38s05


## 1. Ce que le lecteur gagne

Le propriétaire n’obtient plus une couverture implicite de toutes les exigences parce qu’un seul test de la suite est rouge, ni parce que quelques tests existants sont exécutés. Chaque exigence obligatoire possède une liaison à des observations identifiables.

Pour un nouveau comportement, la préparation observe le rouge métier attendu sur la référence, assertion par assertion ou cas isolé lorsque le runner ne distingue pas les assertions. Pour un comportement annoncé déjà satisfait, elle exécute une caractérisation pertinente qui doit passer ; aucun rouge artificiel n’est requis. La pertinence de la liaison est examinée distinctement de la capacité du runner à rendre des résultats. Cette tranche complète e13/e14 ; elle réutilise les qualifications de contrôles déjà présentes.

## 2. Promesses

Scenario: Le rouge de R1 ne prouve pas R2
  Given deux exigences nouvelles et une préparation qui ne fait échouer que le cas de R1
  When G2 évalue la préparation
  Then R2 reste non vérifiée et le protocole ne la gèle pas comme couverte

Scenario: Une affirmation sur l’existant est éprouvée sans confirmation humaine de substitution
  Given R2 déclarée satisfied_by_reference et un test pertinent qui la contredit
  When la caractérisation s’exécute
  Then la contradiction est nommée et la déclaration seule ne permet pas G2

Scenario: Un incident ne tient pas lieu de rouge métier
  Given un test qui échoue par import ou une assertion non exécutée
  When sa préparation est qualifiée
  Then elle ne devient pas une preuve discriminante de l’exigence

Scenario: Un contrôleur fiable juge une référence non conforme
  Given le contrôle de liens configurés qualifié sur ses témoins et une violation dans la référence
  When l’état des lieux est exécuté
  Then la qualification reste distincte du FAIL de conformité du projet

## 3. Sécurité

Les tests d’acceptation adoptés restent protégés. Le producteur ne choisit pas quels échecs retirer. Un lecteur incapable de localiser un cas déclare cette limite ; la couverture n’est jamais inventée à partir du compteur global.

## 4. Tâches

### Tâche 1 — Porter la liaison par exigence dans les artefacts

Étendre `src/application/preparation.ts`, `src/contracts/v1/protocol.ts` et les rapports de préparation avec les références de cas, observations attendues et obtenues, catégorie et qualification de la liaison. Versionner la lecture des anciens artefacts sans leur attribuer une preuve inexistante.

- Vérifie : `node --test test/v0-pure/requirement-verification.test.ts`
- Tient : `test/v0-pure/requirement-verification.test.ts`, « R1 et R2 gardent des observations distinctes et un ancien dossier reste lisible sans être surqualifié ».
- Rouge : `PreparationRecord.discriminant` est global et `diagnoseControlCapability` dispense toutes les exigences quand il est vrai.

### Tâche 2 — Observer et qualifier chaque cas pertinent

Adapter `phases/prepare.ts` et `verification.ts` aux cas remontés par les lecteurs de la technologie. Séparer chargement, exécution, cause métier et correspondance au besoin ; isoler l’exécution si nécessaire. Ajouter les fixtures de caractérisation vraie et fausse.

- Vérifie : `node --test test/v2-kernel/requirement-preparation.test.ts`
- Tient : `test/v2-kernel/requirement-preparation.test.ts`, « le rouge de R1 ne couvre pas R2 et une caractérisation fausse est signalée avant gel ».
- Rouge : La préparation actuelle retient `onReference === FAIL` pour la suite et la présence de tests exécutés pour l’existant.

### Tâche 3 — Faire consommer ces liaisons par G2 et G5

Adapter `phases/verification-design.ts`, `domain/gates/g2.ts`, la construction des obligations et le filtrage G5. Conserver all_pass/any_pass et les décisions humaines assignées, sans autoriser qu’un PASS étranger à la liaison suffise. Afficher les exigences encore sans oracle.

- Vérifie : `node --test test/v2-kernel/requirement-evidence-gates.test.ts`
- Tient : `test/v2-kernel/requirement-evidence-gates.test.ts`, « seules les observations des liaisons adoptées satisfont les obligations correspondantes ».
- Rouge : Les obligations actuelles regroupent des contrôles ; elles ne garantissent pas cette qualification par assertion.

### Tâche 4 — Recette par le parcours réel

Dans Pi réel, conduire un changement à deux exigences avec une seule couverte, constater le blocage de la seconde, compléter la préparation et finir. Rejouer le cas existant de liens configurés sur référence non conforme. Exécuter les campagnes Node et Maven requises par le cycle.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s06/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s06`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

## 5. Hors périmètre

Caractérisation exhaustive de tout legacy, fuzzing général et nouvelle politique de baseline sont hors périmètre. Ne pas remplacer `witnessFindings` déjà livré ni réécrire e11s09.
