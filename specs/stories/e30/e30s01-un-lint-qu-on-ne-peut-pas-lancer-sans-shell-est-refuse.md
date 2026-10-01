# Un script lint qui demande un shell est refusé et nommé, et un lint qui n'est pas une commande ne fait pas tomber la détection

Story : e30s01
Epic : e30
Statut : en cours

## 1. Ce que le lecteur gagne

Le propriétaire d'une cible Node dont `scripts.lint` enchaîne des commandes (`eslint . && prettier
--check .`) lit aujourd'hui un protocole gelé qui porte un contrôle `lint` lancé par `/bin/sh -c`.
L'en-tête de l'adaptateur Node, le commentaire de la fonction qui lit le script et le traitement de
`scripts.test` disent tous qu'un script qui demande un shell est refusé : seul le lint est lancé par
un shell, sans que le dossier le dise. Le propriétaire a tranché le 2026-10-01 : un lint qui demande
un shell est refusé et nommé, comme la commande de test (`D-79`). Il garde le contrôle de ses tests,
et le protocole note pourquoi aucun lint n'est opposé.

Le même lecteur dont le `package.json` porte un `scripts.lint` qui n'est pas une chaîne voit
aujourd'hui la détection lever une `TypeError` : le changement s'arrête sur une erreur d'exécution au
lieu de juger la cible avec ses tests. L'en-tête de la détection dit pourtant qu'un `package.json`
invalide est un fait, pas une erreur. C'est un défaut et non une préférence : deux textes du code
promettent un comportement que le code ne tient pas.

## 2. Promesses

Scenario: Un script lint qui enchaîne des commandes par un shell est refusé et nommé
  Given une cible Node dont `scripts.test` vaut `node --test` et `scripts.lint` vaut `eslint . && prettier --check .`
  When la pile de la cible est détectée
  Then la détection ne déclare aucun contrôle `lint`
  And la détection déclare le contrôle `unit`
  And les capacités manquantes nomment « scripts.lint chains commands through a shell (eslint . && prettier --check .), which 495 cannot run »

Scenario: Un script lint sans syntaxe de shell garde son contrôle
  Given une cible Node dont `scripts.test` vaut `node --test` et `scripts.lint` vaut `node scripts/lint.js`
  When la pile de la cible est détectée
  Then la détection déclare un contrôle `lint` dont la commande est le binaire Node suivi de `scripts/lint.js`
  And aucune capacité manquante ne nomme `scripts.lint`

Scenario: Un script lint qui n'est pas une chaîne n'est pas un lint
  Given une cible Node dont `scripts.test` vaut `node --test` et `scripts.lint` vaut le nombre 42
  When la pile de la cible est détectée
  Then la détection déclare le contrôle `unit` et aucun contrôle `lint`

## 3. Sécurité

La story retire le seul chemin par lequel un fichier de la cible faisait lancer un shell à 495 pour
un contrôle. Le contrôle tournait sous le même confinement que les autres, réseau refusé : la story
ne change pas ce confinement, elle supprime une commande que la cible composait librement.

## 4. Tâches

### Tâche 1 — Un lint à syntaxe de shell est refusé et nommé

La lecture de `scripts.lint` refuse un script qui contient une syntaxe de shell, avec la même
expression que celle qui refuse `scripts.test`, et ajoute le refus aux capacités manquantes au lieu
de déclarer le contrôle. Un script sans syntaxe de shell garde sa commande. Le premier tableau mort de
la commande du lint et le cas inatteignable d'un script vide disparaissent avec la branche du shell,
et le commentaire de la fonction dit ce que le code fait.

- Vérifie : `node --test test/v1/node-lint.test.ts`
- Tient : `test/v1/node-lint.test.ts`, « un lint `eslint . && prettier --check .` ne déclare aucun contrôle `lint`, garde le contrôle `unit`, et les capacités manquantes nomment scripts.lint chains commands through a shell » et « un lint `node scripts/lint.js` déclare un contrôle `lint` dont la commande est le binaire Node suivi de `scripts/lint.js`, et aucune capacité manquante ne nomme scripts.lint »
- Rouge : `commandFromScript` rend `["/bin/sh", "-c", script]` pour un script à syntaxe de shell : la détection déclare un contrôle `lint` et ses capacités manquantes ne nomment pas `scripts.lint`

### Tâche 2 — Un lint qui n'est pas une chaîne ne fait pas tomber la détection

La détection ne lit `scripts.lint` que s'il est une chaîne, comme elle le fait déjà pour
`scripts.test` ; sinon la cible n'a pas de lint.

- Vérifie : `node --test test/v1/node-lint.test.ts`
- Tient : `test/v1/node-lint.test.ts`, « un `scripts.lint` qui vaut 42 laisse la détection déclarer le contrôle `unit` et aucun contrôle `lint` »
- Rouge : `scripts.lint` est vrai, donc `commandFromScript` appelle `script.trim()` sur un nombre et la détection lève `TypeError: script.trim is not a function` au lieu de rendre ses contrôles

## 5. Hors périmètre

- Lancer un lint qui demande un shell : il faudrait un shell sous le confinement, que `D-79` écarte.
- Les autres scripts du `package.json`, que la détection ne lit pas.
- La pile Maven, qui ne lit aucun script.
- Les autres constats de l'audit du 2026-10-01 sur l'adaptateur Node, traités en reprises
  (`specs/reprises.md`).
