# Chaque promesse de la story nomme sa vérification et les interactions à examiner

Story : e38s01
Epic : e38
Statut : versée

Surface : cycle/ — préparation des stories
Dépendances : Aucune


## 1. Ce que le lecteur gagne

Le propriétaire et le conducteur du cycle voient, avant de payer une implémentation, quelles promesses sont vérifiables et quelles interactions doivent être examinées. Une liste de tests ou une étiquette « faible risque » ne suffit plus à déclarer une story prête.

Un fichier compagnon JSON, de même radical que la story et terminé par `.verification.json`, porte les données lues par l’outil. Le Markdown reste le texte du besoin. Le compagnon référence les scénarios et tâches sans recopier leurs paragraphes. Il porte : version, story, scénario identifié, catégorie (nouveau comportement, comportement conservé, structure, jugement), observation attendue, oracle et identité du cas/assertion, dépendances, interactions, moyens retenus et raison. Les moyens sont des capacités combinables : tests d’exemples, propriétés, modèle d’états, preuve Lean. Une raison explicite permet de ne pas retenir un moyen.

Ce compagnon est d’abord facultatif pour les stories historiques. Son adoption devient obligatoire pour les nouvelles stories du parcours renforcé en e38s05.

## 2. Promesses

Scenario: Un test d’une autre promesse ne couvre pas la promesse demandée
  Given deux promesses P1 et P2 et un compagnon qui ne lie une assertion qu’à P1
  When le conducteur demande le diagnostic de préparation
  Then le diagnostic nomme P2 comme sans oracle et ne la dit pas prête

Scenario: Un choix simple garde une vérification simple
  Given une correction de texte sans état ni règle de décision et des tests adaptés
  When le compagnon motive l’absence de modèle d’états et de preuve Lean
  Then le diagnostic accepte cette proportionnalité sans demander TLA+ ni Lean

Scenario: Les scénarios et références inconnus sont refusés
  Given un compagnon qui cite une tâche absente ou une dépendance vers lui-même
  When le compagnon est lu
  Then le diagnostic localise la référence invalide et indique ce qui est attendu

## 3. Sécurité

Le compagnon propose des contrôles ; il ne les exécute pas et ne donne aucun droit. Une commande du dépôt reste soumise au conducteur. Aucun changement des cinq sections, aucune réécriture des stories versées.

## 4. Tâches

### Tâche 1 — Lire et valider le compagnon

Ajouter `cycle/src/verification-contract.ts` et relier sa lecture à `cycle/src/story.ts`. Valider versions, unicité, correspondance aux scénarios/tâches, catégories et diagnostics ; conserver la lecture des anciennes stories sans compagnon.

- Vérifie : `node --test test/cycle/verification-contract.test.ts`
- Tient : `test/cycle/verification-contract.test.ts`, « P2 sans oracle reste nommée et une référence inconnue est refusée ».
- Rouge : Le lecteur actuel ne lit que les cinq sections et les commandes par tâche ; il ne produit aucun diagnostic par promesse.

### Tâche 2 — Rendre la sélection des moyens explicite

Ajouter au diagnostic les interactions déclarées (révision, reprise, ordre des événements, effet externe) et les moyens retenus ou écartés avec raison. Refuser un moyen obligatoire sans paramètres suffisants. Ne pas déduire la sûreté d’un score ni prétendre détecter toutes les interactions.

- Vérifie : `node --test test/cycle/verification-profile.test.ts`
- Tient : `test/cycle/verification-profile.test.ts`, « une simple correction n’exige aucun outil formel et un modèle choisi sans propriété est incomplet ».
- Rouge : Aucun profil lisible par l’outil ne permet actuellement cette distinction.

### Tâche 3 — Exposer le diagnostic à la rédaction

Adapter `cycle/prompts/redaction.md`, `cycle/format-de-story.md` et le contexte de rédaction dans `cycle/src/suite.ts`. Référencer le compagnon et le rendre dans l’état du cycle ; les choix de besoin restent au propriétaire.

- Vérifie : `node --test test/cycle/story.test.ts`
- Tient : `test/cycle/story.test.ts`, « le contexte cite les promesses non vérifiées sans recopier un dossier entier ».
- Rouge : Le contexte actuel ne transporte pas ce diagnostic de préparation.

### Tâche 4 — Recette par le parcours réel

Sur une copie du dépôt, lire une story historique, puis deux nouvelles stories munies d’un compagnon : l’une complète, l’autre avec P2 sans oracle. Conserver les diagnostics et vérifier que seule la seconde est déclarée incomplète. Aucun agent d’implémentation ni outil formel ne doit être lancé.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s01/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s01`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

## 5. Hors périmètre

La vérification sémantique des assertions relève de la qualification ; le graphe d’ordonnancement global reste celui de `plan.yaml`. Pas de langage de spécification universel ni de nouveau moteur de workflow.
