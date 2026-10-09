# Un contrôle formel optionnel est qualifié et gelé avec les autres contrôles de pi-495

Story : e38s10
Epic : e38
Statut : à faire

Surface : pi-495 — contrôle TLC opt-in, G2/G5 et rapport
Dépendances : e38s02, e38s06, e38s07, e38s09


## 1. Ce que le lecteur gagne

Un projet qui dispose d’un modèle TLA+ adopté peut demander à pi-495 de l’utiliser comme moyen de vérification. Le contrôle est déclaré explicitement, qualifié puis gelé avec son périmètre. Il ne devient pas obligatoire pour les projets qui n’en ont pas besoin.

Le noyau distingue une preuve sur le modèle et les tests qui relient ce modèle à l’implémentation. Une obligation portant sur le comportement du programme ne peut pas être satisfaite par le seul résultat TLC. Le protocole retient également les contrôles de correspondance adoptés ; le rapport affiche la limite de la garantie.

## 2. Promesses

Scenario: Un projet sans modèle reste utilisable sans Java ni Lean
  Given un changement dont le profil ne retient aucun outil formel
  When la vérification est préparée
  Then aucun outil formel n’est recherché, installé ni lancé

Scenario: Le modèle adopté est immuable pendant la production
  Given un contrôle TLC qualifié avec ses propriétés et sa configuration
  When le producteur tente de supprimer une propriété ou de réduire la configuration protégée
  Then la modification ne produit pas une preuve valable et suit la contestation si elle est justifiée

Scenario: Un PASS du modèle ne prouve pas seul le programme
  Given une exploration completed et un contrôle de correspondance requis absent ou en échec
  When G5 juge l’obligation de comportement
  Then cette obligation n’est pas satisfaite

Scenario: Un modèle modifié entraîne une nouvelle qualification
  Given une nouvelle version approuvée du modèle
  When la préparation reprend
  Then les preuves de l’ancienne identité sont inapplicables

## 3. Sécurité

Déclaration explicite dans les moyens adoptés ; aucun exécutable choisi dans un rapport d’agent n’est lancé sans qualification. Réutiliser `ControlDefinition`, les politiques réseau et les chemins protégés. Les règles ne viennent pas d’un fichier candidat modifiable. Aucun import du code de cycle/ depuis src/.

## 4. Tâches

### Tâche 1 — Déclarer et charger le paquet formel adopté

Étendre les contrats de moyens de vérification avec références de modèle/configuration/propriétés, outil disponible et contrôles de correspondance. Choisir une capacité explicite indépendante de la détection Java/Node : ne pas déclarer la cible TypeScript comme « technologie TLA+ » ni dupliquer TLC dans chaque stack. Documenter le point de composition dans `extension/runtime.ts`.

- Vérifie : `node --test test/v0-pure/formal-control-contract.test.ts`
- Tient : `test/v0-pure/formal-control-contract.test.ts`, « un paquet incomplet est refusé et un projet sans modèle ne réclame aucun outil ».
- Rouge : Les contrats actuels n’identifient pas un paquet formel adopté ni sa portée modèle.

### Tâche 2 — Réutiliser le lecteur et les témoins dans le noyau

Brancher l’adaptateur TLC de e38s02 dans le registre de lecteurs et les ports d’exécution existants. Qualifier positif, violation attendue et incident ; écrire les objets approuvés dans une copie de contrôle et les protéger. Ne pas reconstruire un second runner.

- Vérifie : `node --test test/v2-kernel/formal-control-qualification.test.ts`
- Tient : `test/v2-kernel/formal-control-qualification.test.ts`, « un contrôle qualifié distingue contre-exemple, absence d’outil et exploration interrompue ».
- Rouge : Le parcours local de cycle/ n’est pas encore disponible dans la préparation de pi-495.

### Tâche 3 — Relier portée, invalidation et décision

Étendre gel, preuves, affichage et export pour exiger l’identité exacte du paquet et les contrôles de correspondance d’une obligation programme. Ajouter le cas modèle vert mais programme faux aux tests de G5 et de reprise.

- Vérifie : `node --test test/v2-kernel/formal-control-acceptance.test.ts`
- Tient : `test/v2-kernel/formal-control-acceptance.test.ts`, « TLC seul ne satisfait pas une obligation programme et un paquet révisé invalide ses anciens résultats ».
- Rouge : G5 ne distingue pas encore cette catégorie de preuve et sa liaison au programme.

### Tâche 4 — Recette par le parcours réel

Depuis Pi réel, conduire un projet de démonstration avec modèle et replay. Montrer trois issues : modèle et tests verts, modèle fautif, modèle vert mais code divergent. Rejouer la même démonstration sans outil disponible, puis une story ordinaire sans modèle. Exécuter les campagnes Node et Maven.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s10/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s10`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

## 5. Hors périmètre

Lean comme contrôle générique des projets utilisateurs, autoformalisation intégrale d’une story, preuve automatique de raffinement et détection implicite de tout modèle restent hors périmètre.
