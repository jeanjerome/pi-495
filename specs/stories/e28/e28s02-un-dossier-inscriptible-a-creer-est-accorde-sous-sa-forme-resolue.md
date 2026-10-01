# Un dossier inscriptible que la commande crée est accordé sous sa forme résolue

Story : e28s02
Epic : e28
Statut : à faire

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-09-29T180000 du registre. Le propriétaire qui qualifie une cible dont la copie
vit derrière un lien (par exemple sous `/tmp`, qui pointe vers `/private/tmp`) lit aujourd'hui un FAIL
sur un contrôle qui déclare un dossier inscriptible que la copie ne porte pas encore : le contrôle
unitaire de vitest (`target/495-vitest`) et celui de Maven (`target/`). Le profil Seatbelt accorde
l'écriture sous la forme symbolique du chemin, Seatbelt compare le chemin résolu, l'accord ne s'applique
pas et `mkdir` échoue en `EPERM`. Le même contrôle passe sous `$HOME` : le verdict dépend de l'endroit
où la copie vit, pas de la cible. Le verdict d'un contrôle est une preuve ; un FAIL dû au profil est un
défaut, pas une préférence.

## 2. Promesses

Scenario: Un dossier à créer derrière un lien est accordé sous sa forme résolue
  Given un lien `link` vers le dossier `real`, et une écriture déclarée sur `link/new`, dossier absent
  When le profil Seatbelt est généré
  Then le profil accorde l'écriture sous le chemin résolu de `real`, suivi de `/new`
  And le profil n'accorde pas l'écriture sous la forme `link/new`

Scenario: La commande crée le dossier déclaré derrière un lien
  Given un lien `link` vers le dossier `real`, et une écriture déclarée sur `link/new`, dossier absent
  When une commande confinée exécute `mkdir` sur `link/new`
  Then la commande sort avec le code 0
  And le dossier `real/new` existe

Scenario: Le dossier accordé reste borné à lui-même
  Given une écriture déclarée sur `link/new`, dossier absent
  When une commande confinée écrit un fichier dans `real/autre`
  Then l'écriture est refusée avec `EPERM`

Scenario: Un chemin qui existe est accordé comme avant
  Given une écriture déclarée sur un dossier existant
  When le profil Seatbelt est généré
  Then le profil accorde l'écriture sous le chemin résolu de ce dossier

## 3. Sécurité

Touche le confinement : le profil accorde l'écriture sous le chemin résolu du plus profond ancêtre
existant du dossier déclaré, suivi des segments absents, jamais sous un parent plus large. Le troisième
scénario tient que l'accord ne dépasse pas le dossier déclaré. Aucun secret ni sortie de données.

## 4. Tâches

### Tâche 1 — Le profil résout l'ancêtre existant d'un chemin absent

`real` résout le plus profond ancêtre existant du chemin et lui rend les segments absents, au lieu de
rendre le chemin tel quel quand il n'existe pas ; un chemin qui existe se résout comme avant.

- Vérifie : `node --test test/v1/sandbox.test.ts`
- Tient : `test/v1/sandbox.test.ts`, « un dossier à créer derrière un lien est accordé sous sa forme résolue : le profil porte le chemin résolu suivi de `/new` et pas `link/new` » et, sur macOS, « `mkdir` sur `link/new` sort à 0 et crée `real/new`, une écriture dans `real/autre` reste `EPERM` » ; « un chemin qui existe est accordé sous sa forme résolue »
- Rouge : `real` rend le chemin inchangé quand `realpathSync` échoue : le profil porte `link/new` et non `real/new`, et `mkdir` sur `link/new` sort à 1 avec `Operation not permitted`

## 5. Hors périmètre

- Les chemins de lecture refusés (`denied_read_paths`) : ils sont résolus par la même fonction et gardent
  leur comportement pour un chemin qui existe ; un chemin absent y est résolu de même, sans autre effet.
- Le choix des dossiers qu'un contrôle déclare inscriptibles : la story ne change aucun contrôle.
- Les autres défauts ouverts du registre.
