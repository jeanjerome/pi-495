# La préparation met à jour le test que la demande contredit

Story : e04s01
Epic : e04
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui demande un changement de comportement déjà affirmé par un test — « greet doit
finir par ! » sur une cible dont `test/greet.test.js` affirme `Hello, x` — voit aujourd'hui le
changement s'arrêter sans issue. La préparation n'est invitée qu'à ajouter des tests (« only add
tests that will fail until it exists ») : elle ajoute celui du nouveau comportement et laisse
l'ancien. L'implémenteur n'a pas le droit de toucher aux tests ; aucun candidat ne peut satisfaire
les deux, et le changement s'arrête en stagnation. C'est arrivé avec Sonnet 5 le 2026-09-25
(`demo-readme-refus-stagnation` : « 2 identical candidates without measurable progress »).

C'est le seul défaut de consigne que les campagnes menées avec un vrai modèle depuis le
2026-09-20 montrent. Le défaut est dans la consigne, pas dans le modèle : le noyau retient déjà une
modification d'un test existant sous les racines de la préparation, mais rien ne dit au producteur
qu'il doit la faire. Et le propriétaire doit voir, dans le dossier, qu'une préparation a réécrit ce
qu'un test garantissait jusque-là.

## 2. Promesses

Scenario: La préparation est invitée à mettre à jour le test que les exigences contredisent
  Given une cible dont un test existant affirme un comportement que les exigences adoptées changent
  When l'intervention de préparation reçoit son objectif
  Then l'objectif lui demande de mettre à jour le test existant qui affirme l'ancien comportement, en plus d'écrire ceux qui manquent
  And il ne lui dit plus de seulement ajouter des tests

Scenario: Une préparation qui réécrit un test existant est adoptée, et le relevé le nomme
  Given une préparation qui modifie test/greet.test.js pour affirmer « Hello, x! »
  When la préparation est jugée
  Then la suite préparée est adoptée comme discriminante
  And le relevé de la préparation nomme test/greet.test.js comme un test existant qu'elle a modifié

Scenario: Une préparation qui n'ajoute que des tests neufs ne nomme aucun test modifié
  Given une préparation qui n'écrit qu'un fichier de test nouveau
  When la préparation est jugée
  Then son relevé ne nomme aucun test existant modifié

Scenario: Avec un vrai modèle, le changement qui contredit un test existant aboutit
  Given la cible greet de la démonstration, dont le test affirme « Hello, x », et la demande « greet must end with an exclamation mark »
  When le changement est conduit dans un vrai Pi avec un vrai modèle
  Then la préparation met à jour test/greet.test.js et le candidat passe G5
  And sur la construction d'avant la story, le relevé dit ce que le même modèle a fait de la même demande

## 3. Sécurité

- Chemins protégés : inchangés. La préparation pouvait déjà modifier un fichier sous ses racines ;
  la story le lui dit, sans élargir ses racines ni ses droits.
- Provenance : une préparation qui réécrit un test existant change ce que la cible garantissait. Le
  relevé le nomme, pour que le propriétaire le voie avant de décider sur le candidat ; la
  préparation reste une proposition que seul le noyau adopte.

## 4. Tâches

### Tâche 1 — L'objectif demande de mettre à jour le test contredit

L'objectif de la préparation demande d'écrire les tests qui manquent et de mettre à jour un test
existant qui affirme le comportement que les exigences changent. Il ne dit plus « only add tests ».

- Vérifie : `node --test test/v2/preparation.test.ts`
- Tient : `test/v2/preparation.test.ts`, « the preparation objective asks to update an existing test that asserts the behaviour the requirements change, not only to add tests »
- Rouge : `preparationObjective` écrit « only add tests that will fail until it exists »

### Tâche 2 — Le relevé nomme le test existant modifié

Le relevé d'une préparation distingue, parmi les fichiers retenus, ceux qui existaient sur la
référence et qu'elle a modifiés.

- Vérifie : `node --test test/v2/preparation.test.ts`
- Tient : `test/v2/preparation.test.ts`, « a preparation that rewrites an existing test is adopted, and its record names the test it modified, while one that only adds a test names none »
- Rouge : `PreparationRecord` ne porte que `files`, sans dire lequel existait sur la référence ; le relevé ne nomme aucun test modifié

## 5. Hors périmètre

- Le reste de l'epic e04 — découpage des consignes par rôle, fichiers de consignes versionnés,
  sélection par phase et par modèle : aucune campagne ne montre un défaut qu'il réparerait. Il est
  mis en attente dans le plan jusqu'à ce qu'une campagne en montre un.
- Un contrôle du noyau qui détecterait, avant l'implémentation, un test existant contredit par les
  exigences : la stagnation l'attrape aujourd'hui, et aucune campagne ne montre qu'un contrôle plus
  tôt épargnerait autre chose qu'une minute.
- Les consignes des rôles `review` et `observe` : aucun vrai modèle ne les a exercées depuis le
  2026-09-20.
