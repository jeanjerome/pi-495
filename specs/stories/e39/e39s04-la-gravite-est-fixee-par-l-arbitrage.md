# La gravité d'un défaut qu'une branche introduit est fixée hors de la branche, et les défauts moyens se corrigent à la fin d'une epic conduite story par story

Story : e39s04
Epic : e39
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire qui lit le registre peut se fier à la gravité d'un défaut. Aujourd'hui, la session qui introduit un
défaut fixe aussi sa gravité : sur `e38s01` à `e38s10`, 16 des 17 entrées ajoutées sont « faible », et l'arbitrage a
dû dire qu'une régression qui faisait échouer deux fois sur trois la campagne npm de référence était sous-estimée.
Une entrée « faible » attend la fin de la suite pour être corrigée (`D-73`).

Le propriétaire sait aussi que les défauts moyens se corrigent à la fin d'une epic, même quand ses stories sont
conduites une à une : la phase de défauts ne tourne aujourd'hui que dans `cycle suite`, et le registre est passé de 73
à 90 défauts ouverts pendant que `e38` était conduite par `cycle <story> auto`.

## 2. Promesses

Scenario: L'arbitrage fixe la gravité des défauts que la branche introduit
  Given une branche qui inscrit au registre un défaut qu'elle introduit, avec la gravité que sa session a choisie
  When l'arbitrage décide de la recette
  Then sa décision donne, pour chaque défaut que la branche inscrit, la gravité retenue et sa raison, le registre porte la gravité retenue, et le journal garde la gravité inscrite et la gravité retenue

Scenario: Un arbitrage qui ne se prononce pas sur un défaut de la branche arrête la story
  Given une branche qui inscrit au registre deux défauts
  When l'arbitrage ne donne la gravité que de l'un
  Then l'outil arrête la story en nommant le défaut sans gravité retenue, et n'inscrit pas l'accord

Scenario: Le propriétaire voit la gravité des défauts de la branche avant d'accepter
  Given une branche qui inscrit au registre un défaut, conduite sans arbitrage
  When la recette attend l'accord du propriétaire
  Then la question nomme chaque défaut que la branche inscrit, avec sa gravité

Scenario: La dernière story d'une epic conduite seule lance la phase des défauts moyens
  Given une epic dont toutes les stories sauf une sont versées, et un défaut moyen ouvert au registre
  When `cycle <story> auto` verse cette dernière story
  Then l'outil lance la correction des défauts moyens, comme la suite à la fin d'une epic, et ne la lance pas après une story qui n'est pas la dernière de son epic

## 3. Sécurité

La session qui introduit un défaut ne fixe plus seule ce qu'il pèse. L'arbitrage ne peut toujours modifier que le
registre : l'outil s'arrête s'il touche un autre fichier ou laisse l'arbre modifié.

## 4. Tâches

### Tâche 1 — L'arbitrage fixe la gravité

Ajouter à la décision de l'arbitrage la gravité retenue et sa raison pour chaque défaut que la branche inscrit au
registre ; faire que le registre porte cette gravité, que le journal garde les deux, et que l'outil s'arrête quand un
défaut de la branche n'a pas de gravité retenue. Mettre `cycle/prompts/arbitrage.md` au même texte.

- Vérifie : `node --test test/cycle/arbitrage-gravite.test.ts`
- Tient : `test/cycle/arbitrage-gravite.test.ts`, « la gravité que l'arbitrage retient pour un défaut de la branche est celle du registre et du journal, et un défaut sans gravité retenue arrête la story »
- Rouge : la sortie de l'arbitrage n'a aucun champ de gravité ; le registre garde la gravité que la session de la branche a écrite et l'accord s'inscrit.

### Tâche 2 — Le propriétaire voit la gravité avant d'accepter

Faire que la question de la recette, quand elle attend le propriétaire, nomme chaque défaut que la branche inscrit au
registre avec sa gravité.

- Vérifie : `node --test test/cycle/recette-gravite.test.ts`
- Tient : `test/cycle/recette-gravite.test.ts`, « la question de la recette nomme chaque défaut que la branche inscrit au registre, avec sa gravité »
- Rouge : la question de la recette ne reprend que le compte rendu de la session et les deux commandes d'accord et d'écart.

### Tâche 3 — La phase des défauts moyens suit la dernière story d'une epic

Faire que `cycle <story> auto`, quand il verse la dernière story de son epic au plan, lance la correction des défauts
moyens que la suite lance à la fin d'une epic. Mettre `cycle/README.md` au même texte.

- Vérifie : `node --test test/cycle/auto-fin-d-epic.test.ts`
- Tient : `test/cycle/auto-fin-d-epic.test.ts`, « verser en auto la dernière story d'une epic lance la correction des défauts moyens, verser une autre story ne la lance pas »
- Rouge : `cycle <story> auto` marque la story versée au plan et s'arrête ; seule `cycle suite` lance `corrigerDefauts`.

## 5. Hors périmètre

Revoir la gravité des défauts déjà au registre : le propriétaire le fait à la main. Lancer la phase des défauts
faibles hors de la suite : elle reste en fin de suite (`D-73`). Corriger les défauts ouverts : la phase de défauts.
