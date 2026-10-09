# Une exploration TLA+ produit un résultat traçable sans confondre interruption et succès

Story : e38s02
Epic : e38
Statut : en cours

Surface : Outillage local de développement, réutilisable via un adaptateur
Dépendances : e38s01


## 1. Ce que le lecteur gagne

Le conducteur exécute un modèle fini avec TLC et obtient un résultat exploitable : exploration terminée, contre-exemple ou incident. Le rapport donne le modèle, les modules transitifs, la configuration, les propriétés effectivement activées, les bornes, hypothèses, version et empreinte des outils, durée, états explorés et trace éventuelle.

Le contrat distingue `completed`, `counterexample`, `inconclusive` et `error`. Seul `completed` avec toutes les propriétés requises activées et une exploration exhaustive terminée vaut PASS dans le périmètre annoncé. Simulation, arrêt à une profondeur, dépassement de budget, sortie tronquée ou processus tué ne valent jamais ce PASS. Le contrôle de vivacité n’est revendiqué que s’il a été demandé et terminé.

## 2. Promesses

Scenario: Un modèle valide termine l’exploration annoncée
  Given un modèle témoin fini avec une propriété de sûreté et une issue valide atteignable
  When TLC termine la vérification exhaustive
  Then le rapport nomme les propriétés vérifiées, les bornes et le résultat completed

Scenario: Une violation conserve son chemin d’accès
  Given le même témoin avec une transition fautive
  When TLC viole l’invariant attendu
  Then le rapport conserve le contre-exemple et conclut counterexample

Scenario: Un calcul interrompu ne devient pas vert
  Given un modèle exécuté sous budget ou une sortie illisible
  When le calcul expire, est annulé ou ne peut être interprété
  Then le résultat est inconclusive ou error et aucune preuve PASS n’est produite

## 3. Sécurité

Commande construite en argv, ressources bornées, dossier de travail jetable, sorties dans l’object store. Outils et versions déclarés ; pas de téléchargement opportuniste ni d’installation automatique sur le poste utilisateur. Le réseau suit la politique autorisée, sans fermeture générale nouvelle.

## 4. Tâches

### Tâche 1 — Définir le résultat et le lecteur TLC

Créer l’adaptateur `src/adapters/formal/tlc.ts` derrière le port d’exécution existant et un résultat typé, avec enregistrement CMP si nécessaire. Qualifier le parsing sur sorties officielles de la version retenue ; un simple exit code 0 ne suffit pas. Garder la portée modèle distincte de la portée programme.

- Vérifie : `node --test test/v1-adapters/tlc-result.test.ts`
- Tient : `test/v1-adapters/tlc-result.test.ts`, « la sortie interrompue et celle privée de propriété ne sont pas PASS ».
- Rouge : Le dépôt ne contient aucun lecteur TLC ni résultat d’exploration formelle.

### Tâche 2 — Exécuter sous une identité et un budget explicites

Ajouter `scripts/check-formal.ts` pour les contrôles de développement, en réutilisant les ports et l’exécuteur du projet. Prendre un manifeste approuvé, vérifier outils/modules/configuration et enregistrer le résultat brut puis normalisé. Rendre une capacité manquante actionnable.

- Vérifie : `node --test test/v1-adapters/tlc-execution.test.ts`
- Tient : `test/v1-adapters/tlc-execution.test.ts`, « un outil absent ou un timeout n’est ni un succès ni une violation de règle métier ».
- Rouge : Aucun parcours actuel ne distingue ces issues pour une exécution TLC.

### Tâche 3 — Qualifier le contrôle avec trois témoins

Créer `specs/formal/fixtures/tlc/` avec modèle valide, mutant qui viole la propriété attendue et incident provoqué. Le témoin négatif échoue sur cet invariant, pas sur une syntaxe invalide. Documenter la commande locale et l’outillage de développement requis.

- Vérifie : `node --test test/v4-platform/tlc-qualification.test.ts`
- Tient : `test/v4-platform/tlc-qualification.test.ts`, « les trois témoins rendent respectivement completed, counterexample et error ou inconclusive ».
- Rouge : La qualification existante ne dispose pas de ces témoins pour TLC.

### Tâche 4 — Recette par le parcours réel

Exécuter les trois témoins avec le vrai TLC sur la machine de référence ; conserver version, empreintes et rapports. Rejouer avec un budget insuffisant et vérifier que le conducteur bloque la poursuite applicable. Les mocks du lecteur ne valent pas cette recette.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s02/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s02`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

## 5. Hors périmètre

Aucune preuve sur le TypeScript, aucune activation dans G2/G5 à ce stade. Pas de service externe, de CI ni de CLI du produit. La version exacte des outils est choisie et mesurée dans cette story, pas inventée dans le plan.
