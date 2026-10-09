# Le cycle vérifie les interactions retenues avant de lancer l’implémentation

Story : e38s05
Epic : e38
Statut : versée

Surface : cycle/ — premier parcours renforcé utilisable
Dépendances : e38s01, e38s02, e38s03, e38s04


## 1. Ce que le lecteur gagne

Le conducteur dispose d’un point de contrôle après rédaction de la story et avant rouge-vert. Il valide le compagnon, exécute les moyens amont adoptés et bloque si une propriété requise manque, si une exploration reste indéterminée ou si une contradiction n’a pas été traitée. Il conserve les six étapes publiques du cycle ; la préparation est une sous-étape de la story.

Une erreur de modèle ou d’exigence revient à la préparation. Un code qui viole une règle adoptée revient à rouge-vert. Le dossier distingue ces deux causes et ne consomme pas aveuglément une nouvelle tentative d’implémentation pour une spécification impossible. Les commandes existantes restent les entrées du cycle.

## 2. Promesses

Scenario: Un contre-exemple bloque avant toute implémentation
  Given une story du parcours renforcé dont une propriété requise est violée
  When le conducteur atteint rouge-vert
  Then aucune session de production n’est lancée et la trace est proposée à la préparation

Scenario: Une correction de règle invalide l’ancienne préparation
  Given une préparation verte puis un changement du modèle ou d’une promesse
  When le cycle reprend
  Then il réexamine la préparation et ne réutilise pas son ancien feu vert

Scenario: Une story simple poursuit sans outil formel
  Given un compagnon complet qui retient seulement des tests d’exemples
  When la préparation est validée
  Then le cycle poursuit les étapes existantes sans lancer TLC ni Lean

## 3. Sécurité

Le modèle ne donne jamais un accord humain. Les mandats et `prete: oui` gardent leur sens. L’ancien cycle conduit les premières stories ; cette story active le parcours renforcé pour les suivantes, sans auto-validation rétroactive.

## 4. Tâches

### Tâche 1 — Ajouter la sous-étape de préparation au conducteur

Brancher le diagnostic et les contrôles requis dans `cycle/src/cycle.ts`, `cycle/src/automate.ts` et `cycle/src/suite.ts`. Garder les commandes actuelles et une adoption explicite du nouveau parcours ; les dossiers historiques restent lisibles.

- Vérifie : `node --test test/cycle/verification-gate.test.ts`
- Tient : `test/cycle/verification-gate.test.ts`, « une préparation incomplète empêche le lancement de la session rouge-vert ».
- Rouge : Le conducteur passe de la story au rouge-vert sans exploration des interactions.

### Tâche 2 — Journaliser les résultats une seule fois

Étendre `cycle/src/journal.ts`, l’export et l’affichage : empreinte de préparation, résultats, traces, origine du blocage, reprises. Les prompts référencent les objets conservés et reçoivent un résumé borné.

- Vérifie : `node --test test/cycle/verification-journal.test.ts`
- Tient : `test/cycle/verification-journal.test.ts`, « un redémarrage retrouve le blocage et la trace sans réécrire une seconde preuve ».
- Rouge : Les événements actuels ne décrivent pas cette sous-étape et ses invalidations.

### Tâche 3 — Séparer correction de code et révision de règle

Adapter les prompts de rédaction, écart et reprise. Une proposition de révision crée une nouvelle identité ; un besoin humain modifié attend la décision applicable. Une contradiction de test n’est pas traitée par affaiblissement silencieux.

- Vérifie : `node --test test/cycle/verification-revision.test.ts`
- Tient : `test/cycle/verification-revision.test.ts`, « une règle modifiée retire la préparation précédente et une simple correction de code la conserve ».
- Rouge : Le parcours actuel ne distingue pas ces reprises à partir d’un contrat de vérification versionné.

### Tâche 4 — Recette par le parcours réel

Conduire avec le vrai outil une story témoin simple et une story témoin à états, d’abord avec le mutant puis avec le modèle corrigé. Vérifier le blocage avant session, la reprise, les deux tours de revue au maximum et la recette finale. Conserver temps et interventions dès ce premier pilote.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s05/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s05`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

## 5. Hors périmètre

Le nombre de relecteurs du cycle reste inchangé. Les verdicts formels ne remplacent ni rouge-vert ni recette. Aucun élargissement de l’autonomie des epics.
