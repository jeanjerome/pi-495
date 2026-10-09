# Un pilote mesure le nouveau processus et qualifie un premier développement de pi-495 par pi-495

Story : e38s13
Epic : e38
Statut : à faire

Surface : Expérimentation mesurée et promotion du contrôleur
Dépendances : e38s06 à e38s10, e38s12 ; bilan Lean d’e38s11 séparé


## 1. Ce que le lecteur gagne

Le propriétaire peut décider de généraliser sur des faits : temps jusqu’à intégration, reprises, défauts tardifs, coût des contrôles et limites restantes. Trois cas sont mesurés : une story simple sans outil formel, une story à états avec TLA+ et un refactoring à comportement constant. Le bilan Lean reste distinct pour ne pas masquer son coût dans la moyenne.

Le dogfooding utilise une version stable identifiée de pi-495 comme contrôleur et une autre copie comme candidat. Une première petite story réelle est choisie dans le travail ouvert, après vérification de ses prérequis. Les tests de sandbox continuent dans leur environnement de qualification dédié ; aucun emboîtement de sandboxes n’est contourné.

## 2. Promesses

Scenario: Le contrôleur ne se remplace pas en cours de campagne
  Given une version stable identifiée qui conduit une modification de pi-495
  When le candidat produit une nouvelle extension
  Then le contrôleur et ses contrôles d’autorité restent ceux identifiés au départ

Scenario: Le dossier distingue vitesse et qualité
  Given les trois campagnes terminées avec leurs traces
  When le bilan est produit
  Then il sépare durée totale, interventions, revues, reprises de code, révisions de tests, incidents et défauts découverts en recette

Scenario: L’absence de gain ne conduit pas à affaiblir les obligations
  Given un profil formel plus coûteux sur une story simple
  When le bilan propose une adaptation
  Then il propose de réserver ce moyen aux risques qui le justifient et ne supprime pas une obligation pour obtenir un meilleur temps

## 3. Sécurité

La promotion du candidat exige sa qualification et le mandat applicable ; pas d’auto-mise à jour. Aucun push automatique, aucune nouvelle CI, aucune fermeture réseau générale. Un candidat n’écrit pas les preuves normatives de son contrôleur.

## 4. Tâches

### Tâche 1 — Définir le protocole de mesure et les témoins

Créer `specs/experiments/e38/` avec mesures fixées avant campagne : médiane/détail des durées, coût si observé, interventions, défauts par moment de découverte, taille/périmètre et limites. Utiliser les dossiers antérieurs comme contexte, pas comme essai causal comparable sans réserve.

- Vérifie : `node --test test/cycle/process-measurements.test.ts`
- Tient : `test/cycle/process-measurements.test.ts`, « les valeurs manquantes restent manquantes et les révisions de test sont séparées des corrections de code ».
- Rouge : Les journaux portent temps et coûts mais aucun bilan comparable de ce parcours renforcé.

### Tâche 2 — Déclarer les contrôles complets du dépôt cible

Configurer le contrôleur stable pour tests, typage, couches, architecture, exports, distribution et format de stories ; reconstruire dist selon les conventions. Ne pas assimiler la détection de node --test à npm run check. Documenter les campagnes de sandbox extérieures au worker.

- Vérifie : `node --test test/v4-platform/dogfood-controls.test.ts`
- Tient : `test/v4-platform/dogfood-controls.test.ts`, « un échec du contrôle de couches bloque la story même si les tests unitaires passent ».
- Rouge : Le développement du dépôt reste conduit par cycle/ ; la détection d’une suite de tests ne garantit pas tout son contrat de contrôles.

### Tâche 3 — Conduire une petite story réelle avec le contrôleur stable

Ajouter la campagne de dogfooding et ses témoins : test non lié à une exigence, preuve périmée, recette absente et faute de couches. Identifier les versions contrôleur/candidat, l’arbre intégré et la décision de promotion. Produire un bilan avec recommandation par profil, même si aucun gain n’est mesuré.

- Vérifie : `node --test test/v4-platform/dogfood-process.test.ts`
- Tient : `test/v4-platform/dogfood-process.test.ts`, « les quatre témoins bloquent au point attendu et le candidat conforme est intégré sous le contrôleur initial ».
- Rouge : Aucune campagne ne qualifie encore l’ensemble de ce nouveau parcours sur le développement de pi-495.

### Tâche 4 — Recette par le parcours réel

Exécuter réellement les trois profils sur la machine de référence et le premier dogfooding dans Pi. Publier les durées mesurées, les défauts injectés détectés et les limitations. Comparer avec/sans réutilisation sur le même cas ; répéter uniquement si la variabilité empêche la décision. Une démonstration simulée doit être nommée et ne clôt pas la recette.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s13/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s13`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

## 5. Hors périmètre

Aucun gain chiffré promis à l’avance ni généralisation statistique à partir de trois stories. L’autonomie sur tout le backlog et la prise en charge d’autres stacks restent des décisions ultérieures.
