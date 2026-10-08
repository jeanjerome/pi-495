# Un chemin inscriptible dont le chemin réel sort de la copie n'est pas accordé

Story : e28s16
Epic : e28
Statut : à faire

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-10-07T190000 du registre. Le propriétaire qui fait juger un projet par 495 lui
confie une copie, et la promesse du confinement est que la commande d'un contrôle n'écrit que dans cette
copie. Aujourd'hui, un projet qui commite sous un chemin qu'un contrôle déclare inscriptible un lien vers
l'extérieur obtient l'écriture à la cible du lien : un `lines.txt` lié à un fichier du propriétaire est
écrasé par le rapport de la commande, un `target` lié à un dossier du propriétaire reçoit ce que Maven ou
vitest y écrivent. L'agent qui modifie la copie peut poser ce lien lui-même. 495 refuse ensuite de relire
le lien, mais l'écriture a eu lieu, sur la machine du propriétaire, hors de tout ce qu'il a confié. C'est
une brèche du confinement, pas une préférence.

## 2. Promesses

Scenario: Un fichier inscriptible lié hors de la copie n'est pas accordé
  Given une copie dont `lines.txt` est un lien vers le fichier `outside.txt` hors de la copie
  And un contrôle qui déclare `lines.txt` inscriptible
  When le profil du contrôle est calculé
  Then le profil n'accorde l'écriture ni sous `lines.txt` ni sous `outside.txt`

Scenario: Un dossier inscriptible sous un lien hors de la copie n'est pas accordé
  Given une copie dont `target` est un lien vers le dossier `outdir` hors de la copie
  And un contrôle qui déclare `target/495-vitest` inscriptible, dossier absent
  When le profil du contrôle est calculé
  Then le profil n'accorde l'écriture sous aucun chemin de `target` ni de `outdir`

Scenario: Un chemin voisin dont le nom prolonge celui de la copie n'est pas accordé
  Given une copie `copy` et un contrôle qui déclare inscriptible le chemin absolu `copy-other/f`, voisin de la copie
  When le profil du contrôle est calculé
  Then le profil n'accorde pas l'écriture sous `copy-other/f`

Scenario: Un chemin inscriptible de la copie reste accordé
  Given une copie atteinte par un lien, comme une copie sous `/tmp`, et un contrôle qui déclare inscriptibles un fichier `report.txt` et un dossier absent `target/reports`
  When le profil du contrôle est calculé
  Then le profil accorde l'écriture sous `report.txt` et sous `target/reports`, à leur place dans la copie

Scenario: Sous Seatbelt, la commande n'écrit pas à travers le lien
  Given la copie du premier et du deuxième scénario, `outside.txt` contenant « untouched » et `outdir` vide
  When un contrôle qui déclare `lines.txt` et `target/495-vitest` inscriptibles écrit `lines.txt` puis crée `target/495-vitest`, sous Seatbelt
  Then `outside.txt` contient toujours « untouched »
  And `outdir` reste vide

Scenario: Sous Seatbelt, la commande écrit le chemin accordé de la copie
  Given une copie dont `report.txt` est un fichier ordinaire, et un contrôle qui le déclare inscriptible
  When la commande du contrôle écrit `report.txt` sous Seatbelt
  Then `report.txt` contient ce que la commande a écrit
  And la preuve du contrôle est PASS

## 3. Sécurité

Touche le confinement. Un chemin inscriptible n'est accordé que si son chemin réel, celui de son plus
profond ancêtre existant suivi des segments absents, est la copie ou se trouve sous le chemin réel de la
copie, séparateur compris. Le filtre s'applique au profil que le moteur d'exécution remet au bac à sable,
avant tout backend : Seatbelt n'en reçoit pas l'accord, bubblewrap n'en lie pas la source, et le moteur ne
crée pas le dossier parent d'un chemin qu'il n'a pas accordé. Un chemin refusé n'est pas remplacé : la
commande s'exécute sans lui, et son écriture y est refusée par le bac à sable. Aucun secret ni sortie de
données.

## 4. Tâches

### Tâche 1 — Le profil d'un contrôle n'accorde que ce dont le chemin réel est dans la copie

`profileFor` (`src/adapters/execution/runner.ts`) résout chaque chemin inscriptible déclaré par son plus
profond ancêtre existant, suivi des segments absents, et le garde seulement quand ce chemin réel est le
chemin réel de la copie ou se trouve dessous, séparateur compris ; il compare aujourd'hui le texte du
chemin écrit au texte de la copie.

- Vérifie : `node --test test/v1-adapters/writable-path-containment.test.ts`
- Tient : `test/v1-adapters/writable-path-containment.test.ts`, « un `lines.txt` lié à un fichier hors de la copie, un `target/495-vitest` sous un `target` lié à un dossier hors de la copie et un `copy-other/f` voisin ne sont pas dans les chemins inscriptibles du profil » et « un `report.txt` et un `target/reports` absent d'une copie atteinte par un lien restent accordés, à leur place dans la copie »
- Rouge : `profileFor` filtre sur `startsWith` du texte : les chemins inscriptibles du profil portent `copy/lines.txt`, `copy/target/495-vitest` et `copy-other/f`

### Tâche 2 — Sous Seatbelt, la commande d'un contrôle n'écrit plus à travers un lien

Le moteur d'exécution, sous le backend Seatbelt réel, exécute le contrôle avec le profil de la tâche 1.

- Vérifie : `node --test test/v1-adapters/writable-path-seatbelt.test.ts`
- Tient : `test/v1-adapters/writable-path-seatbelt.test.ts`, sur macOS, « un contrôle qui écrit `lines.txt` et crée `target/495-vitest` laisse `outside.txt` à « untouched » et `outdir` vide » et « un contrôle qui écrit `report.txt`, fichier ordinaire de la copie, l'écrit et rend PASS »
- Rouge : sur `main`, la commande écrase `outside.txt` avec « written » et crée `outdir/495-vitest` (sondé le 2026-10-08)

## 5. Hors périmètre

- Refuser le contrôle en nommant le lien plutôt que l'exécuter sans l'accord : la story garde le contrôle
  exécuté, dont l'écriture refusée pèse sur son verdict comme toute écriture que le profil n'accorde pas.
- Le profil d'une installation, qui accorde le dossier que le gestionnaire dit écrire hors de la copie : il
  est déclaré par la technologie, non par le projet jugé.
- Le profil d'un rôle d'agent, qui accorde la copie elle-même : son chemin réel est la copie.
- Une sonde sous bubblewrap réel : le filtre agit sur le profil avant tout backend, et la recette sur macOS
  n'en conduit une que si elle dispose d'une machine Linux.
- Les autres défauts ouverts du registre.
