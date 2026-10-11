# Un pilote mesure le nouveau processus et qualifie un premier développement de pi-495 par pi-495

Story : e38s13
Epic : e38
Statut : versée

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

Scenario: Le contrôleur stable mène une modification réelle de pi-495 jusqu’au jugement de sa suite préparée
  Given le contrôleur stable identifié et une copie de pi-495 dont la suite entière, lancée dans le bac à sable, dépasse dix minutes et contient des tests qui lancent eux-mêmes un bac à sable
  When la campagne de dogfooding conduit un changement réel jusqu’à la qualification
  Then la suite préparée est jugée PASS ou FAIL sur la référence, sans la note « prepared suite is not loadable or produced no test: timeout »

Scenario: Le profil à états se lit dans le compagnon de la story, pas dans une étiquette
  Given une story dont le compagnon ne retient pas le moyen `modele-d-etats`
  When `cycle mesures` la reçoit sous le profil à états (TLA+)
  Then il refuse le bilan en nommant la story et le moyen `modele-d-etats` que son compagnon ne retient pas, et n’écrit aucune recommandation pour ce profil
  And une story dont le compagnon retient `modele-d-etats` avec un manifeste est mesurée sous ce profil

## 3. Sécurité

La promotion du candidat exige sa qualification et le mandat applicable ; pas d’auto-mise à jour. Aucun push automatique, aucune nouvelle CI, aucune fermeture réseau générale. Un candidat n’écrit pas les preuves normatives de son contrôleur. Un candidat ne restreint pas ce que lance le contrôle qui juge ses exigences et n’en allonge pas le délai : ni l’un ni l’autre ne se lit dans un fichier qu’il modifie, et ce contrôle tourne dans le bac à sable de la plateforme, sans bac à sable emboîté ni exécution hors du bac.

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

### Tâche 5 — La suite préparée de pi-495 est jugée dans son délai sous le contrôleur stable

Sur une copie de pi-495, le contrôle qui juge la suite préparée sur la référence rend un verdict avant son délai, confiné, sans bac à sable emboîté, et sur une cible façonnée comme pi-495 G2 fige le protocole. Ce que ce contrôle lance et son délai ne se lisent dans aucun fichier que le candidat modifie.

- Vérifie : `node --test test/v4-platform/dogfood-preparation.test.ts`
- Tient : `test/v4-platform/dogfood-preparation.test.ts`, « sur une cible façonnée comme pi-495, dont des tests lancent eux-mêmes un bac à sable et dont la suite entière dépasse le délai du contrôle, la suite préparée est jugée PASS ou FAIL sur la référence, jamais INDETERMINATE par un dépassement de délai, et G2 fige le protocole ».
- Rouge : le contrôle `unit` que la technologie Node offre pour une suite `node --test` (`nodeTestControl`, `src/adapters/stacks/node/tests/unit-controls.ts`) lance `node --test --test-reporter=tap` sans motif, donc tout l’arbre de pi-495, générations `v1` à `v4` comprises, sous un délai fixe de `10 * 60_000` ms ; `projectControlsOf` (`src/application/project-controls.ts`) ajoute les contrôles déclarés, lus au code de sortie, sans rien changer à celui-là ; `judgePreparedSuite` (`src/application/verification.ts`) range le verdict INDETERMINATE en suite non chargeable. La recette a lu deux fois « prepared suite is not loadable or produced no test: timeout after 600035 ms », puis une question IH-04, sans G2 ni candidat.

### Tâche 6 — Le bilan lit le profil à états dans le compagnon de la story

`cycle mesures` refuse une story donnée sous le profil à états (TLA+) quand son compagnon ne retient pas `modele-d-etats` avec un manifeste, en nommant la story et le moyen absent ; une story dont le compagnon le retient est mesurée sous ce profil. Les stories que les tests existants mesurent sous ce profil reçoivent le compagnon qui le justifie, sans qu’aucune assertion adoptée ne soit retirée. La recette de la tâche 4 mesure une story réelle dont le compagnon retient un modèle d’états exploré par TLC.

- Vérifie : `node --test test/cycle/process-measurements.test.ts`
- Tient : `test/cycle/process-measurements.test.ts`, « une story dont le compagnon ne retient pas de modèle d’états, donnée sous le profil à états, est refusée en nommant la story et le moyen modele-d-etats, sans recommandation pour ce profil ».
- Rouge : `bilan` (`cycle/src/mesures.ts`) coupe `<profil>=<story>` sur le `=` et range la story sous l’étiquette telle qu’écrite, sans lire son compagnon : les tests mesurent `tla=e01s06` sur une story qui n’en a pas, et la recette a obtenu une recommandation pour « formel » sur une story dont le compagnon ne retient que `exemples` — aucun compagnon du dépôt, e39 compris, ne retient `modele-d-etats`.

## 5. Hors périmètre

Aucun gain chiffré promis à l’avance ni généralisation statistique à partir de trois stories. L’autonomie sur tout le backlog et la prise en charge d’autres stacks restent des décisions ultérieures.

Sur pi-495 réel, la campagne de dogfooding n’atteint pas encore G2 : ses tests préparés créent leur dossier sous `test-output/`, que le contrôle `unit` n’ouvre pas en écriture, et un droit lu par son chemin réel s’élargirait à toute la copie si le candidat y commitait un lien. Ce droit, et la campagne menée jusqu’à l’intégration, relèvent de l’epic e40. L’écart du dogfooding ne corrige pas `BUG-2026-10-11T013000` : les générations `v1` à `v4` restent jugées par la Preflight non confinée et par la machine virtuelle de qualification, pas dans le bac à sable du contrôleur. Le pilote de la campagne continue de ne répondre qu’aux options qu’elle nomme et laisse une autre question en attente plutôt que de la trancher. Le contrôle `unit` que la technologie Node offre aux autres cibles garde sa commande et son délai par défaut. L’écart du bilan ne retire pas le profil à états et ne le remplace par aucun autre moyen ; il ne juge pas les étiquettes `simple`, `refactoring` ni le bilan Lean, qui reste à part.
