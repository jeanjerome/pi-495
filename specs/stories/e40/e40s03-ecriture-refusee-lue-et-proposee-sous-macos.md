# Sous macOS, une écriture refusée est lue dans les refus que le noyau publie en direct et proposée au propriétaire, qui seul l'accorde

Story : e40s03
Epic : e40
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire dont la cible écrit dans un dossier que personne n'a déclaré apprend lequel, et peut le donner au
contrôle d'un mot. Aujourd'hui, il ne voit qu'une suite préparée refusée, avec une erreur `EPERM` noyée dans la sortie
des tests. Le 11 octobre, il a fallu lire cette sortie à la main pour comprendre que les tests de pi-495 créaient
`test-output/`. Depuis e40s02, le propriétaire peut donner ce dossier dans la configuration du contrôleur, encore faut-il
qu'il sache lequel donner.

Sous macOS, le noyau publie chaque écriture que Seatbelt refuse, avec le processus, l'opération et le chemin réel. 495
lit ces refus pendant que le contrôle tourne, les garde dans l'évidence et, quand ils ont fait refuser la suite
préparée, propose au propriétaire de donner le dossier en cause au contrôle. Rien n'est accordé sans sa réponse
(`D-90`).

## 2. Promesses

Scenario: Sous Seatbelt, l'observation d'un lancement porte les écritures que le noyau lui a refusées, et seulement les siennes
  Given deux lancements concurrents sous Seatbelt, refusés en écriture chacun sur un chemin différent
  When chacun se termine
  Then l'observation de chacun porte son chemin refusé, avec le processus et l'opération, et ne porte pas celui de l'autre

Scenario: L'évidence d'un contrôle nomme les écritures refusées
  Given un contrôle qui tourne sous Seatbelt et tente de créer `test-output` dans sa copie et un fichier dans un dossier hors de la copie
  When le contrôle se termine
  Then son évidence porte les deux écritures refusées, `test-output` relatif à la copie et l'autre par son chemin hors de la copie

Scenario: Une suite préparée refusée en écriture dans la copie fait proposer le dossier au propriétaire
  Given des préparations refusées dont la suite, jugée sur la référence, a été refusée en écriture sur `test-output/run/a` et sur un chemin hors de la copie
  When la question d'une exigence qu'aucun test ne peut juger est posée au propriétaire
  Then elle offre de donner `test-output/` au contrôle de la suite, avec les écritures lues, et ne propose rien pour le chemin hors de la copie

Scenario: Sans écriture refusée lue, rien n'est proposé
  Given des préparations refusées dont la suite n'a été refusée en écriture nulle part
  When la question d'une exigence qu'aucun test ne peut juger est posée au propriétaire
  Then elle n'offre de donner aucun dossier

Scenario: Le dossier accordé est écrit dans la configuration du contrôleur et porté par le protocole figé
  Given la question qui offre de donner `test-output/` au contrôle `unit`, et une configuration du contrôleur qui porte d'autres réglages
  When le propriétaire choisit de donner le dossier
  Then `config.json` porte `test-output/` sous `policy.writable_paths.unit` et garde ses autres réglages, la préparation suivante est accordée, et le contrôle `unit` figé porte `test-output/`

Scenario: Sans l'accord du propriétaire, rien n'est accordé
  Given la question qui offre de donner `test-output/` au contrôle `unit`
  When le propriétaire choisit une autre issue
  Then `config.json` n'est pas modifié, et aucun contrôle figé ne porte `test-output/`

## 3. Sécurité

Aucun droit ne s'accorde sans le propriétaire. La proposition est une issue de plus de la question IH-04, qui ne compte
que par un dialogue Pi, comme toute réponse humaine. Une exécution sans propriétaire ne l'adopte jamais : rien ne choisit
cette issue à sa place.

Le refus proposé vient du noyau, pas du contrôle :
- 495 ne lit que les lignes émises par l'extension Sandbox du noyau (expéditeur `Sandbox`), qu'aucun processus confiné
  ne peut émettre à sa place ;
- il ne garde que celles qui portent le repère de ce lancement, posé dans le profil, si bien que le refus d'un autre
  lancement ou d'un autre programme n'est jamais attribué au contrôle ;
- la sortie du contrôle n'est jamais lue pour proposer un droit.

Le chemin, lui, est celui que le code a tenté d'écrire. Le propriétaire voit donc le chemin exact et le dossier proposé
avant de répondre.

Ce qui peut s'accorder reste borné :
- seul un dossier de la copie, son premier niveau sous la copie, est proposé ; une écriture refusée hors de la copie,
  un cache ou le dossier personnel par exemple, est gardée dans l'évidence et jamais proposée (`D-76`) ;
- le dossier accordé est soumis à e40s02 : créé par le contrôleur, et un lien ou un fichier posé à sa place fait
  refuser le contrôle.

495 écrit désormais `config.json`, et seulement sur cette réponse : il y ajoute le dossier sans toucher au reste. Le
fichier reste illisible pour les contrôles et pour l'agent. L'accord vaut pour ce contrôle dans toutes les cibles que
ce contrôleur juge, comme tout réglage de `policy.writable_paths`.

## 4. Tâches

### Tâche 1 — Seatbelt lit les écritures que le noyau refuse au lancement

`SeatbeltSandbox.run` (`src/adapters/sandbox/backends.ts`) ajoute au `(deny default)` du profil un message, un repère
propre à ce lancement : `(deny default (with message "<repère>"))`. Avant la commande, il lance `/usr/bin/log stream
--style ndjson` filtré sur l'expéditeur `Sandbox` et sur ce repère, et attend sa première ligne. Après la commande, un
refus témoin portant le même repère clôt la lecture. Chaque ligne `Sandbox: <processus>(<pid>) deny(1) <opération>
<chemin>` dont l'opération commence par `file-write` donne une entrée de `refused_writes` dans l'observation : processus,
opération, chemin réel. Le test, sous `darwinOnly`, lance en parallèle deux commandes sous Seatbelt, sans temporaire
inscriptible. L'une crée `a/x` dans un dossier non accordé, l'autre `b/y`.

Essai du 11 octobre sur cette machine : un refus isolé a été lu 20 fois sur 20, l'écoute étant prête avant la commande.
Dans une rafale de trente refus d'un même processus, les premiers ont manqué 2 fois sur 9.

- Vérifie : `node --test test/v1-adapters/seatbelt-refused-writes.test.ts`
- Tient : `test/v1-adapters/seatbelt-refused-writes.test.ts`, « deux lancements concurrents sous Seatbelt portent chacun dans leur observation l'écriture que le noyau leur a refusée, avec le processus et l'opération, et pas celle de l'autre »
- Rouge : `run` lance `sandbox-exec` sans marquer le profil ni lire le journal ; l'observation ne porte aucune écriture refusée.

### Tâche 2 — L'évidence d'un contrôle nomme ses écritures refusées

`GenericControlRunner.runControl` (`src/adapters/execution/runner.ts`) range les écritures refusées de l'observation
dans les faits de l'évidence, sous `refused_writes`. Un chemin de la copie y est relatif à la copie, son chemin réel
compris ; un chemin hors de la copie garde son chemin absolu. Le test, sous `darwinOnly`, lance par `SeatbeltSandbox`
sans temporaire inscriptible un contrôle `node -e` qui tente `mkdir test-output` dans sa copie et l'écriture d'un
fichier dans un dossier voisin de la copie.

- Vérifie : `node --test test/v1-adapters/control-refused-writes.test.ts`
- Tient : `test/v1-adapters/control-refused-writes.test.ts`, « l'évidence d'un contrôle refusé en écriture sous Seatbelt porte test-output relatif à la copie et le fichier voisin par son chemin absolu, avec le processus et l'opération »
- Rouge : `runControl` ne range dans les faits que la commande, le dossier, le bac à sable et la durée ; `refused_writes` est absent.

### Tâche 3 — La question IH-04 propose les dossiers de la copie que la suite préparée n'a pas pu écrire

Le relevé de préparation (`src/application/phases/prepare.ts`) garde les écritures refusées de la suite jugée sur la
référence. Quand la question IH-04 est posée après des préparations refusées (`src/application/phases/verification-design.ts`),
elle reçoit les dossiers proposés : le premier niveau sous la copie de chaque écriture refusée dans la copie, pour le
contrôle de la suite. Si la liste n'est pas vide, `src/application/decisions.ts` ajoute l'issue `grant_writable`, en
français et en anglais. Son libellé nomme le contrôle et les dossiers, et son effet cite les écritures lues.

Le test, dans le harnais du noyau, enveloppe le bac à sable pour qu'il rende, à la suite préparée, deux écritures
refusées : `test-output/run/a` dans la copie et un chemin hors de la copie. Il mène le changement jusqu'à la question
IH-04, puis refait le même parcours sans écriture refusée.

- Vérifie : `node --test test/v2-kernel/writable-proposal.test.ts`
- Tient : `test/v2-kernel/writable-proposal.test.ts`, « après des préparations dont la suite a été refusée en écriture sur test-output/run/a et hors de la copie, la question IH-04 offre grant_writable pour test-output/ au contrôle unit et rien pour le chemin hors de la copie ; sans écriture refusée, elle ne l'offre pas »
- Rouge : la question IH-04 n'offre que préparer, assigner à une revue humaine, réviser et, le cas échéant, adopter le complément ; aucune issue ne donne un dossier.

### Tâche 4 — L'accord écrit le dossier dans `config.json`, et le protocole figé le porte ; une autre issue n'accorde rien

Un port de configuration du contrôleur (`src/ports/`), réalisé dans `src/extension/config.ts`, ajoute un dossier à
`policy.writable_paths.<contrôle>` dans `config.json` sans doublon ni perte des autres réglages, et rend la politique
relue. Sur la réponse `grant_writable`, le noyau l'appelle, adopte la politique relue et accorde une préparation de plus.
La préparation suivante et le gel du protocole portent alors le dossier par `withOwnerPaths`. Aucune autre issue
n'appelle ce port.

Le test donne au harnais un répertoire de données dont `config.json` porte `suite_paths` et une politique nommée. Dans un
premier parcours, il répond `grant_writable` à la question de la tâche 3, puis mène la préparation suivante jusqu'au gel.
Dans un second, il répond `prepare` à la même question et mène le changement jusqu'au gel. Chaque fois, il relit
`config.json` et le protocole figé.

- Vérifie : `node --test test/v2-kernel/writable-proposal.test.ts`
- Tient : `test/v2-kernel/writable-proposal.test.ts`, « la réponse grant_writable écrit test-output/ sous policy.writable_paths.unit dans config.json en gardant suite_paths et le nom de la politique, accorde une préparation de plus, et le contrôle unit figé porte test-output/ ; la réponse préparer laisse config.json inchangé et aucun contrôle figé ne porte test-output/ »
- Rouge : la question n'offre pas `grant_writable` et la réponse est refusée ; rien n'écrit `config.json`, qui garde son contenu, et le `unit` figé ne porte pas `test-output/`.

## 5. Hors périmètre

- **Linux** : aucune source sûre n'y publie les refus ; la proposition d'après la sortie du contrôle relève de e40s04.
- **Un contrôle qui tourne après le gel**, contrôle déclaré ou passe sur le candidat : son évidence nomme ses écritures
  refusées, mais rien n'est proposé, car un droit nouveau changerait le protocole figé. Le propriétaire peut le donner
  dans la configuration pour le changement suivant.
- **Une lecture refusée** n'est pas proposée : seule la liste des secrets est fermée en lecture (`D-90`).
- **Un refus que le journal ne rend pas** n'est pas proposé, et le contrôle échoue comme aujourd'hui. L'essai du 11
  octobre montre des pertes au début d'une rafale ; une rafale sous un même dossier en rend d'autres, qui proposent
  ce dossier.
- **Retirer un accord** se fait en modifiant `config.json`. Une autre session Pi ouverte relit la configuration à
  `/reload`, comme pour toute modification de ce fichier.
- **Un fichier refusé à la racine de la copie** est proposé comme dossier, puisque `policy.writable_paths` ne donne que
  des dossiers. Le propriétaire voit le chemin exact et peut refuser.
