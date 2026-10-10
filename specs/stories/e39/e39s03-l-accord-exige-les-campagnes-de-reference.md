# L'accord exige les deux campagnes de référence vertes à la tête quand la branche touche une technologie, un contrôle ou l'exécuteur

Story : e39s03
Epic : e39
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire sait qu'une story qui touche ce que 495 exécute n'est acceptée que si un vrai modèle a mené les deux
projets de référence jusqu'au bout sur le code exact qu'il accepte. `cycle/README.md` l'exige déjà, mais rien ne le
fait tenir : la session de recette déclare elle-même les campagnes qu'elle dit avoir jouées, et l'accord, du
propriétaire comme de l'arbitrage, s'inscrit sans les regarder. `e38s09` et `e38s10` ont été acceptées sans
campagne, et c'est une campagne Maven qui a montré sur `e38s06` une régression qui bloquait toute cible JUnit.

L'outil joue lui-même les deux campagnes à la tête de la branche quand elle touche une technologie, un contrôle ou
l'exécuteur, et refuse l'accord tant qu'elles ne sont pas vertes à cette révision (`D-89`).

## 2. Promesses

Scenario: Les campagnes sont jouées par l'outil quand la branche touche ce que 495 exécute
  Given une branche qui change un fichier sous `src/application/stacks/`, `src/adapters/stacks/`, `src/adapters/execution/`, `src/adapters/sandbox/` ou `src/domain/gates/`
  When l'outil prépare la recette
  Then il a joué `npm run campagne -- npm` et `npm run campagne -- maven` à la tête, et le journal garde le verdict de chacune avec sa révision

Scenario: Une branche qui ne touche pas ce que 495 exécute ne joue aucune campagne
  Given une branche qui ne change que l'outil du cycle, la documentation ou des stories
  When l'outil prépare la recette
  Then aucune campagne ne tourne, et l'accord s'inscrit comme avant

Scenario: L'accord est refusé sans les deux campagnes vertes à la tête
  Given une branche qui touche ce que 495 exécute, dont une campagne est en échec, manquante ou jouée à une autre révision que la tête
  When le propriétaire accepte ou que l'arbitrage décide d'accepter
  Then l'outil refuse l'accord en nommant la campagne en cause, et la story ne passe pas au versement

## 3. Sécurité

L'accord, qu'il vienne du propriétaire ou de l'arbitrage, ne s'inscrit pas sans les preuves que la story exige : ce
que la session de recette ou l'arbitrage déclare dans sa sortie ne tient jamais lieu d'une campagne que l'outil n'a
pas jouée lui-même à la tête. Une session qui falsifierait le journal ou la configuration git dans le dos de l'outil
reste hors de cette garantie, tant que les sessions du cycle tournent sans confinement (`D-89`, précision du
2026-10-10). Une campagne ouvre le réseau pour installer ce que sa cible déclare, comme aujourd'hui, et pour rien
d'autre.

## 4. Tâches

### Tâche 1 — L'outil joue les campagnes à la tête

Écrire en un seul endroit de l'outil les chemins qui exigent les campagnes. Quand la branche en change un, faire jouer
les deux campagnes par l'exécuteur du cycle à la tête, au pas de recette, avant la session de recette, et garder leurs
verdicts au journal avec leur révision. Rendre la commande de campagne réglable, pour que les tests en jouent une
fausse. Mettre `cycle/README.md` au même texte.

- Vérifie : `node --test test/cycle/recette-campagnes.test.ts`
- Tient : `test/cycle/recette-campagnes.test.ts`, « une branche qui touche l'exécuteur fait jouer les deux campagnes à la tête et le journal garde leurs verdicts, une branche de documentation n'en joue aucune »
- Rouge : la recette n'inscrit que les campagnes que sa session déclare dans sa sortie ; l'outil n'en joue aucune.

### Tâche 2 — L'accord exige les campagnes vertes

Faire que l'accord du propriétaire (`cycle <story> accepte`) et celui de l'arbitrage soient refusés, la campagne en
cause nommée, quand la branche exige les campagnes et que l'une manque, échoue ou date d'une autre révision que la
tête.

- Vérifie : `node --test test/cycle/accord-campagnes.test.ts`
- Tient : `test/cycle/accord-campagnes.test.ts`, « l'accord du propriétaire et celui de l'arbitrage sont refusés quand une campagne exigée manque, échoue ou date d'une autre révision »
- Rouge : `accepter` (`cycle/src/cycle.ts`) inscrit l'accord sans regarder aucune campagne.

## 5. Hors périmètre

Exiger un vrai modèle dans les autres campagnes de la recette : la session de recette garde le choix de l'agent
scripté, qu'elle déclare. Rejouer les campagnes après le versement. Les autres règles de l'accord : `e39s04` pour la
gravité des défauts.
