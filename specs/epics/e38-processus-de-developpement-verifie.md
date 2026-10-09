# e38 — Les règles sont éprouvées avant le code et chaque acceptation repose sur leurs preuves

Statut : à faire
Point de départ : `fa92fe5f02c6903a2804101bf1252214c2c9dfe7`, branche main lue le 9 octobre 2026.
Nature : proposition d’epic et de stories, prête à examiner et intégrer ; aucun comportement livré par ce dossier.

## Résultat pour le propriétaire

Un changement conduit par 495 arrive à l’implémentation avec des promesses vérifiables, des interactions examinées à la profondeur utile et un plan de réalisation exploitable. Son acceptation dépend de preuves applicables à chaque obligation et au candidat exact. Un test erroné dispose d’une voie de révision contrôlée. Les contrôles formels sont utilisés là où ils détectent des défauts que des exemples isolés voient mal, sans imposer TLA+ ou Lean à toute modification.

Le processus est d’abord expérimenté dans `cycle/`, qui développe encore pi-495, puis transféré au produit. Le résultat recherché est une baisse des reprises tardives à qualité maintenue ou accrue ; le gain de temps doit être mesuré et ne constitue pas une promesse préalable.

## Ce qui existe au point de départ

| Mécanisme constaté dans les sources | Conséquence pour cet epic |
| --- | --- |
| `cycle/` : six étapes, tests rejoués, Preflight centralisée, deux relecteurs/deux tours, recette, journal et export | Étendre ce conducteur. Ne pas créer un troisième orchestrateur ni changer son nombre de relecteurs sans mesure. |
| `PreparationRecord.discriminant` et observation de la suite sont globaux ; `diagnoseControlCapability` les utilise pour les exigences | e38s06 introduit des observations par exigence et distingue nouveau comportement et caractérisation. |
| `qualification.ts` comporte déjà `witnessFindings` et `witnessCases` | Ne pas réimplémenter la distinction qualification/conformité. La préserver par régression, y compris sur une référence non conforme. |
| `verification.ts` construit les obligations par contrôles/natures | Enrichir les liaisons d’observation, sans abolir les combinaisons existantes. |
| `phases/design.ts` pose `compatible_with_mandate: true` et déduit `executable` du résumé | e38s08 remplace ces raccourcis par des contrôles de plan et la revue applicable, sans prétendre prouver toute faisabilité. |
| G5 est déterministe, filtre des preuves périmées et consomme revues et décisions | Conserver cette autorité ; ajouter les nouvelles preuves et leur portée. |
| `invalidationFor` existe et invalide prudemment en aval | Réutiliser ce mécanisme pour les révisions contrôlées ; ne pas commencer par une invalidation minimale complexe. |
| Cache Preflight par contenu et `reusableQualification` déjà présents | Étendre les identités uniquement pour les nouveaux résultats ; pas de nouveau cache général redondant. |
| `fast-check` est déjà une devDependency | Utiliser ce paquet pour le pont modèle/tests ; ne pas créer un moteur de génération. |
| e11s09 versée ; e11s10 présente, encore à faire dans le plan ; e11s11–13 planifiées | Ne pas rouvrir e11s09. Premier pilote TLA+ sur le cycle de vie existant pour ne pas dépendre d’une migration encore en livraison. |

Ces constats sont issus de lecture, pas d’une campagne réexécutée. Les rouges des stories sont des attentes de régression à établir lors de leur implémentation, jamais des résultats d’essais déjà observés.

## Limites fermes

- Aucun nouveau CLI du produit : pi-495 reste une extension Pi. Les scripts cités servent au développement et aux contrôles.
- Aucune CI ajoutée. Qualification locale selon les conventions du dépôt ; disponibilité de Java/TLC et Lean vérifiée sur la machine de développement au moment de leur pilote.
- Pas de fermeture générale du réseau. Les commandes conservent une politique explicite, les entrées externes mutables limitent la réutilisation.
- Les tests et règles adoptés sont protégés ; le producteur propose une contestation, jamais son propre assouplissement.
- Agents : propositions et observations. Noyau : décisions automatiques. Humain : décisions réservées authentifiées via Pi.
- Aucune dépendance `src/` vers `cycle/`. Les composants réutilisables appartiennent aux couches du produit ; les adaptations techniques passent par les ports.
- Aucun TLA+ ou Lean obligatoire pour installer/utiliser pi-495 sur un projet sans contrôle formel adopté. Pas d’installation silencieuse d’outils sur les postes.
- Une exploration TLC prouve les propriétés vérifiées du modèle fini déclaré. Une preuve Lean porte sur ses définitions et hypothèses. Les tests de correspondance avec TypeScript ne sont pas une preuve générale de raffinement.
- Le cas de test d’une autre exigence, un compteur de tests, l’absence d’erreur ou une déclaration d’agent ne valent pas automatiquement preuve de l’exigence courante.

## Livraisons et ordre

| Story | Livraison observable | Prérequis effectifs |
| --- | --- | --- |
| e38s01 | Un diagnostic par promesse et un choix motivé des moyens de vérification | Aucun |
| e38s02 | Une exécution TLC qualifiée, bornée et traçable | s01 |
| e38s03 | Un modèle partagé de révision/preuve/reprise, avec mutants détectés | s02 |
| e38s04 | Des traces rejouées sur le vrai noyau et des séquences fast-check reproductibles | s03 |
| e38s05 | Le cycle bloque les contradictions avant l’implémentation et distingue les reprises | s01–s04 |
| e38s06 | Chaque exigence possède son propre oracle éprouvé, y compris l’existant | s05 |
| e38s07 | Un test erroné est révisable par un examen distinct avec nouveau gel | s06 |
| e38s08 | G3 juge un plan de tâches ; G4 le réalise et s’autocontrôle | s06–s07 |
| e38s09 | Revue des promesses et recette réelle alimentent G5 | s08 |
| e38s10 | Un contrôle TLC optionnel est adopté dans le protocole du produit | s02, s06, s07, s09 |
| e38s11 | Une règle stable est prouvée dans Lean et comparée au TypeScript | s04, s06 |
| e38s12 | Les calculs inchangés sont réutilisés avec des identités complètes | s05, s10 |
| e38s13 | Les gains et limites sont mesurés ; un premier dogfooding est qualifié | s06–s10, s12 ; s11 évaluée séparément |

**Jalon A — après s05 :** le nouveau processus est utilisable pour développer pi-495 avec cycle/. Aucun dogfooding n’est encore revendiqué.

**Jalon B — après s10 :** le produit tient les garanties principales du processus et accepte un contrôle formel optionnel.

**Jalon C — après s13 :** le processus a été exercé de bout en bout sur une petite story réelle ; le bilan peut recommander de généraliser, limiter certains moyens ou corriger un blocage. Il n’a pas à inventer un gain pour être recevable.

L’ordre linéaire du fragment de plan est une proposition conservatrice, compatible avec `cycle suite`. Le pilote Lean possède une dépendance plus faible et peut être conduit séparément ; il ne constitue pas un prérequis technique de s12/s13. Le présenter séparément dans le bilan évite qu’il masque le rendement des autres livraisons. La clôture de l’epic requiert néanmoins son bilan ; un abandon de ce pilote modifie explicitement le périmètre adopté.

## Mise en route sans circularité

1. Intégrer la documentation et l’entrée de plan en conservant les contrôles actuels. Ne pas interrompre une story e11 engagée.
2. Conduire s01 à s05 avec le cycle actuel ; l’ancien contrôleur reste l’autorité de leur recette. Ne pas demander au nouvel outil de se qualifier lui-même.
3. À s05, adopter le parcours renforcé pour les nouvelles stories. Les compagnons des stories e38 suivantes sont alors produits par le mécanisme de s01 avant leur implémentation ; ce dossier ne préjuge pas de son schéma définitif.
4. Implémenter s06 et suivantes dans l’ordre retenu. Une version acceptée du contrôleur reste distincte du candidat.
5. Réserver le premier dogfooding à s13, après démonstration des contrôles complets du dépôt.

Le fichier de plan livré ne porte volontairement pas `prete: oui` : dans le dépôt, ce champ autorise l’exécution sans propriétaire. Le dossier propose du travail et son ordre, pas une nouvelle autorisation globale. Une fois l’epic adopté, la première commande déjà disponible est `npm run cycle -- e38s01` ; la commande `npm run cycle -- suite` conserve les règles d’autorisation existantes.

## Raccordement aux autres epics

e38 assemble une tranche opérationnelle du processus. Il ne doit pas doubler le travail des epics existants ni les marquer achevés.

| Epic existant | Tranche réalisée par e38 | Reste hors d’e38 |
| --- | --- | --- |
| e13 | Vérifier une affirmation `satisfied_by_reference` par une caractérisation pertinente (s06) | Caractériser systématiquement un legacy peu testé et constituer ses jeux de référence. |
| e14 | Qualification par exigence, contre-exemples, contrôle formel, révision contrôlée (s02, s06, s07, s10) | Compléments génériques de couverture et autres familles de contrôles. |
| e18–e20 | Choisir des moyens selon les interactions/risques et motiver les choix locaux (s01, s08) | Disciplines et expertises hors du périmètre vérification du présent epic. |
| e21 | Mesurer reprises, coûts et défauts de ce processus (s13) | Évaluer toutes les autres dimensions de la démarche. |
| e36 | Tests par propriétés et séquences du noyau pi-495 (s04) | Offre générique de propriétés/fuzzing pour les cibles et leurs technologies. |
| e11 | Fournit des cas déjà livrés pour les régressions de qualification | Livraison des migrations/anti-patterns en cours ; modèle de migration après stabilisation du besoin. |

Le patch proposé ajoute ces références aux epics concernés en conservant leurs statuts et leurs autres exigences. Une tranche n’est marquée réalisée qu’après versement de ses stories.

## Contrat documentaire et d’implémentation

- Chaque story respecte les cinq sections actuelles, porte quatre tâches et un statut `à faire`.
- Les chemins de tests des tâches désignent les tests à créer. Ils ne sont pas déclarés présents ni passants aujourd’hui. Écrire le test sur une entrée réellement chargeable, observer son assertion métier échouer, puis implémenter. Si l’interface nouvelle n’existe pas encore, utiliser le point d’entrée public existant pour le premier rouge ; une erreur d’import ne qualifie jamais le test.
- Les nouveaux chemins de modules sont des destinations proposées. Avant leur création, relire les composants et API disponibles, puis conserver le découpage par responsabilité. Un composant nouveau reçoit son CMP et sa ligne au catalogue dans le même changement.
- Tout changement de contrat persistant met à jour TypeBox, le JSON émis et les lecteurs de dossiers. Les preuves anciennes restent consultables sans être rétroactivement enrichies ou surqualifiées.
- Les changements de garanties mettent à jour le corpus normatif (`specs/amont/`) dans leur story ; une décision structurante est enregistrée dans une ADR avec le prochain identifiant libre au moment de sa livraison. Aucun numéro d’ADR n’est réservé à l’aveugle dans ce dossier.
- Les obligations et leur combinaison sont fixées avant production. TLA+, Lean et leurs lecteurs reçoivent des témoins de qualification au même titre que les autres contrôles.
- Préserver le protocole de contrôle global : reconstruction de dist, Preflight par l’outil, revues et recette. Une commande ciblée de tâche ne remplace pas ces obligations.
- Une mutation ou une variante fautive est un témoin réalisé en copie jetable, jamais un affaiblissement des sources normatives.

## Critères de clôture

1. Deux exigences distinctes ne peuvent plus être dites couvertes par la seule discrimination globale d’une suite.
2. Une affirmation fausse sur l’existant est réfutée automatiquement par son oracle pertinent.
3. La qualification d’un contrôleur déjà livré reste distincte de la conformité du projet analysé.
4. Une contestation fondée permet nouvelle préparation et nouveau gel ; une contestation infondée ne change aucun contrôle.
5. Un contre-exemple amont pertinent empêche la production avant que le code soit écrit ; une absence d’exploration aboutie n’est pas un PASS.
6. Le corpus modèle/noyau détecte une preuve périmée, une action inconnue et un défaut de combinaison des verdicts.
7. Un modèle vert seul ne permet pas d’accepter un programme qui ne le respecte pas.
8. Une recette obligatoire absente, une preuve altérée ou une décision humaine manquante empêchent l’acceptation.
9. La réutilisation conserve les verdicts et ne confond pas identité du modèle et identité du candidat.
10. Le premier dogfooding conserve un contrôleur stable et fait bloquer les témoins négatifs aux points annoncés.
11. Le bilan Lean nomme exactement ce qui a été prouvé et ce qui reste testé seulement.
12. Le bilan de temps/coût/reprises est fondé sur des exécutions conservées, avec limites et recommandation par profil.

## Sources relues

Révision commune : https://github.com/jeanjerome/pi-495/tree/fa92fe5f02c6903a2804101bf1252214c2c9dfe7

- `AGENTS.md`, `CONVENTIONS.md`, `cycle/README.md`, `cycle/format-de-story.md`, `specs/plan.yaml`, `scripts/check-story-format.ts`, `package.json`.
- `cycle/src/story.ts`, `cycle.ts`, `automate.ts`, `suite.ts`, `journal.ts`, `controls.ts`, `preflight.ts`.
- `src/contracts/v1/protocol.ts`, `reports.ts`, `src/application/stacks/plugin.ts`.
- `src/application/preparation.ts`, `qualification.ts`, `verification.ts`, `phases/prepare.ts`, `verification-design.ts`, `design.ts`, `implement.ts`, `review.ts`.
- `src/domain/gates/g2.ts`, `g5.ts`, `src/domain/invalidation.ts`.
- `src/adapters/stacks/maven/structure/structure-control.ts`, `test/v2-kernel/architecture-map-configured-links.test.ts`, `test/v2-kernel/preparation.test.ts`.
- `specs/adr/D-14-qualification-d-une-preparation-de-tests.md`, D-88 sur bibliothèque confinée et carte cible de migration.

Références techniques de l’étude précédente : [TLC](https://learning.tlapl.us/intro/platform/), [validation des preuves Lean](https://lean-lang.org/doc/reference/latest/ValidatingProofs/), [validation de traces contre TLA+](https://arxiv.org/html/2404.16075v1). La qualification des versions d’outils et des interfaces exactes appartient aux stories correspondantes.
