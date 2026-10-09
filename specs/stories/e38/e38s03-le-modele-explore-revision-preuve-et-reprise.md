# Le modèle du changement explore les révisions, les preuves tardives et les reprises

Story : e38s03
Epic : e38
Statut : en cours

Surface : Spécification commune du noyau et vérification locale
Dépendances : e38s02


## 1. Ce que le lecteur gagne

Le développeur peut vérifier les interactions de l’acceptation avant de modifier le noyau. Le premier modèle partagé porte sur un comportement déjà présent : candidat, protocole, preuves, invalidation et reprise. Il ne dépend pas de la livraison des futures stories de migration.

Le modèle abstrait représente au moins deux identités de candidat, deux révisions de protocole, deux contrôles, des résultats tardifs et une interruption/reprise. Il sépare les règles à préserver des transitions qui proposent de les préserver. Les opérations réelles de `change/decide.ts`, `change/apply.ts`, `invalidation.ts` et `gates/g5.ts` sont reliées aux actions abstraites dans une table. Ce modèle reste une spécification et ne prétend pas reproduire le runtime.

## 2. Promesses

Scenario: Une preuve tardive ne valide pas la nouvelle révision
  Given un contrôle lancé pour P1 et un protocole révisé vers P2
  When le résultat P1 arrive après une interruption et une reprise
  Then aucune acceptation du candidat sous P2 ne dépend de cette preuve

Scenario: Le budget épuisé ne transforme pas le refus en acceptation
  Given une obligation obligatoire non satisfaite et aucun essai restant
  When le changement est évalué
  Then il s’arrête sans être accepté

Scenario: Le modèle permet réellement de réussir et de s’arrêter
  Given les hypothèses déclarées de réponse des contrôles et les décisions humaines nécessaires
  When les obligations sont satisfaites ou le budget est épuisé
  Then les états accepté et arrêté sont atteignables et les propriétés de progression applicables sont vérifiées

Scenario: Les propriétés détectent des mécanismes volontairement faux
  Given des variantes qui réutilisent P1 sous P2 ou acceptent après épuisement
  When chaque variante est explorée
  Then l’invariant désigné est violé avec une trace conservée

## 3. Sécurité

Les mutants vivent hors du modèle adopté. Aucune hypothèse ne suppose déjà la conclusion à démontrer. Les attentes humaines sont des états légitimes ; leur résolution n’est jamais garantie sans hypothèse explicite. Aucune exception à la provenance humaine.

## 4. Tâches

### Tâche 1 — Écrire les invariants et la correspondance avec le noyau

Créer `specs/formal/change-lifecycle/README.md` et le modèle `.tla` avec identités distinctes, obligations all/any, décision, révision et interruption. Référencer les règles normatives déjà présentes ; relever les divergences éventuelles comme constats à arbitrer, sans modifier silencieusement la règle.

- Vérifie : `node --test test/v0-pure/formal-model-manifest.test.ts`
- Tient : `test/v0-pure/formal-model-manifest.test.ts`, « chaque invariant obligatoire cite sa règle et une action publique correspondante ».
- Rouge : Aucun manifeste de modèle ne relie actuellement ces interactions aux règles du noyau.

### Tâche 2 — Explorer sûreté et progression sur un domaine déclaré

Créer les configurations finies et leurs budgets. Vérifier absence d’acceptation périmée, refus sans obligation, budgets et reprise. Pour la progression, préciser équité et réponses supposées ; vérifier séparément l’atteignabilité des issues afin de détecter les invariants vrais par vacuité.

- Vérifie : `node --test test/v4-platform/change-model.test.ts`
- Tient : `test/v4-platform/change-model.test.ts`, « le modèle adopté termine et les issues accepté, refusé et attente humaine sont accessibles ».
- Rouge : La suite actuelle n’explore pas systématiquement les ordres de ces événements dans un modèle partagé.

### Tâche 3 — Conserver les contre-exemples de qualification

Créer les mutants de transitions et archiver leurs traces normalisées sous `specs/formal/change-lifecycle/counterexamples/`. Lier chaque trace à une propriété. Vérifier qu’une faute de syntaxe ne tient pas la place d’une violation attendue.

- Vérifie : `node --test test/v4-platform/change-model-mutants.test.ts`
- Tient : `test/v4-platform/change-model-mutants.test.ts`, « le mutant de preuve périmée viole précisément la propriété de fraîcheur ».
- Rouge : Il n’existe pas de corpus exécutable démontrant la sensibilité de ces propriétés.

### Tâche 4 — Recette par le parcours réel

Lancer le modèle adopté et ses mutants avec TLC réel. Lire une trace depuis lancement P1 jusqu’à tentative d’acceptation P2, puis vérifier les hypothèses et bornes dans le dossier. Une exploration inachevée arrête la recette.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s03/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s03`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

## 5. Hors périmètre

Intégration Git exactement une fois, moteur de migration complet et tous les états de pi-495 sont hors périmètre. Leur ajout exige un besoin concret ; un unique modèle géant n’est pas demandé.
