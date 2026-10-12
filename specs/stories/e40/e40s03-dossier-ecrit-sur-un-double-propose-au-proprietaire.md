# Après une préparation refusée, les dossiers que la suite écrit sur un double de la copie sont proposés au propriétaire, qui seul les accorde

Story : e40s03
Epic : e40
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire dont la cible écrit dans un dossier que personne n'a déclaré apprend lequel, et peut le donner au
contrôle d'un mot. Aujourd'hui, il ne voit qu'une suite préparée refusée, avec une erreur `EPERM` noyée dans la sortie
des tests. Le 11 octobre, il a fallu lire cette sortie à la main pour comprendre que les tests de pi-495 créaient
`test-output/`. Depuis e40s02, le propriétaire peut donner ce dossier dans la configuration du contrôleur, encore faut-il
qu'il sache lequel donner.

Après une préparation refusée, 495 relance la suite une fois sur un double jetable de la copie, où elle peut écrire.
Les dossiers qu'elle y crée sont ceux dont elle a besoin. 495 les propose au propriétaire, sous macOS comme sous Linux,
et rien n'est accordé sans sa réponse (`D-90`). La proposition ne dépend plus du journal du système, qui perd des refus
sans le dire (`D-92`) : elle vient de fichiers que la suite a réellement écrits.

## 2. Promesses

Scenario: Un lancement sous Seatbelt ne lit pas le journal du système
  Given un contrôle lancé sous Seatbelt
  When il tourne
  Then aucun processus `log stream` n'a été démarré pour lui

Scenario: Le relevé d'un contrôle rend les chemins qu'il écrit dans la copie
  Given un contrôle qui crée `test-output/run/a` et modifie un fichier existant de sa copie
  When il est relevé sous le confinement de la plateforme
  Then le relevé rend ces deux chemins, relatifs à la copie

Scenario: Le relevé reste confiné
  Given un contrôle qui, pendant son relevé, écrit un fichier hors de la copie et un autre par un lien de la copie qui mène hors d'elle
  When le relevé se termine
  Then aucun des deux fichiers n'existe, et le relevé ne rend aucun chemin hors de la copie

Scenario: Sous macOS, un dossier créé puis effacé est relevé
  Given un contrôle qui crée `tmp-run/x` puis efface `tmp-run`
  When il est relevé sous Seatbelt
  Then le relevé rend `tmp-run/x`

Scenario: Seule une préparation refusée relance sa suite sur un double de la copie
  Given une préparation refusée, puis une préparation retenue, dont la suite crée `test-output/run/a`
  When chacune se termine
  Then le relevé de la préparation refusée porte les chemins de `test-output/run/a` pour le contrôle de la suite, et celui de la préparation retenue n'en porte aucun, sa suite n'ayant pas été relancée

Scenario: Une suite préparée refusée qui écrit dans la copie fait proposer le dossier au propriétaire
  Given des préparations refusées dont la suite crée `test-output/run/a` et tente d'écrire hors de la copie
  When la question d'une exigence qu'aucun test ne peut juger est posée au propriétaire
  Then elle offre de donner `test-output/` au contrôle de la suite, avec les chemins relevés, et ne propose rien pour le chemin hors de la copie

Scenario: Sans chemin relevé, rien n'est proposé
  Given des préparations refusées dont la suite n'écrit rien
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

Scenario: Le parent de la copie n'est jamais proposé
  Given des chemins relevés comme `..`, `../x` ou `../../y`
  When les dossiers à proposer en sont tirés
  Then aucun n'est proposé

## 3. Sécurité

Aucun droit ne s'accorde sans le propriétaire. La proposition est une issue de plus de la question IH-04, qui ne compte
que par un dialogue Pi, comme toute réponse humaine. Une exécution sans propriétaire ne l'adopte jamais : rien ne choisit
cette issue à sa place.

Le relevé fait tourner du code que l'agent a écrit avec un droit de plus : écrire dans tout le double de la copie. Ce
droit est borné :
- le double est une copie jetable de la référence et des fichiers préparés, supprimée après le relevé ; rien de ce que
  la suite y écrit ne rejoint la préparation, la référence ou le candidat ;
- hors du double, rien ne change : le réseau, les lectures et les écritures sont ceux du contrôle ;
- le droit vaut pour le double par son chemin réel : un lien que la suite pose dans le double ne mène pas ses écritures
  hors de lui ;
- 495 parcourt le double sans suivre les liens, si bien qu'un lien vers l'hôte ne lui fait rien lister au-delà de son
  nom.

Le chemin proposé est celui que la suite a écrit : le code confiné en choisit le nom. Ce qui peut s'accorder reste donc
borné là où la proposition se décide, quel que soit le relevé qui l'a précédée :
- seul un dossier de la copie, son premier niveau sous la copie, est proposé ; un chemin hors de la copie n'est jamais
  proposé (`D-76`) ;
- un chemin qui remonte au parent de la copie n'est jamais proposé ;
- le dossier accordé est soumis à e40s02 : créé par le contrôleur, et un lien ou un fichier posé à sa place fait
  refuser le contrôle.

Le propriétaire voit les chemins relevés et le dossier proposé avant de répondre. 495 écrit `config.json` sur cette
réponse seulement : il y ajoute le dossier sans toucher au reste. Le fichier reste illisible pour les contrôles et pour
l'agent. L'accord vaut pour ce contrôle dans toutes les cibles que ce contrôleur juge, comme tout réglage de
`policy.writable_paths`.

## 4. Tâches

### Tâche 1 — Un lancement sous Seatbelt ne lit plus le journal du système

`SeatbeltSandbox.run` (`src/adapters/sandbox/backends.ts`) ne pose plus de repère dans le profil, ne lance plus
`log stream` et ne fait plus refuser de témoin. `src/adapters/sandbox/seatbelt-refusals.ts` disparaît, avec les tests
qui tenaient sa lecture : `test/v1-adapters/seatbelt-refused-writes.test.ts` et
`test/v1-adapters/control-refused-writes.test.ts`. Le 12 octobre, ce journal a perdu des lancements entiers, sans le
signaler, et un lecteur indépendant les a manqués de même (`D-92`).

Le test, sous `darwinOnly`, lance sous Seatbelt une commande qui dure, et cherche pendant qu'elle tourne un processus
`/usr/bin/log stream` dont le filtre porte l'expéditeur `Sandbox`.

- Vérifie : `node --test test/v1-adapters/sandbox.test.ts`
- Tient : `test/v1-adapters/sandbox.test.ts`, « un lancement sous Seatbelt ne démarre aucune lecture du journal du système »
- Rouge : `run` démarre `/usr/bin/log stream` filtré sur l'expéditeur `Sandbox` avant la commande, et il tourne tant qu'elle tourne.

### Tâche 2 — Le relevé d'un contrôle rend les chemins qu'il écrit dans la copie, et rien hors d'elle

`GenericControlRunner.runControl` (`src/adapters/execution/runner.ts`) relève un contrôle quand l'invocation le
demande : il liste la copie sans suivre les liens, lance le contrôle avec toute la copie inscriptible par son chemin
réel, liste à nouveau, et range dans les faits de l'évidence, sous `written`, les chemins créés ou modifiés, relatifs à
la copie. Le reste du profil est celui du contrôle.

Le test lance par le bac à sable de la plateforme, Seatbelt sous macOS et bubblewrap sous Linux, sans temporaire
inscriptible, un contrôle `node -e` qui crée `test-output/run/a`, modifie `src/a.txt`, écrit un fichier dans un dossier
voisin de la copie, et écrit par `out`, un lien de la copie vers ce dossier voisin.

- Vérifie : `node --test test/v1-adapters/control-write-survey.test.ts`
- Tient : `test/v1-adapters/control-write-survey.test.ts`, « le relevé d'un contrôle sous le confinement de la plateforme rend test-output/run/a et src/a.txt relatifs à la copie, aucun chemin hors d'elle, et rien n'est écrit dans le dossier voisin, ni directement ni par le lien »
- Rouge : `runControl` ignore la demande de relevé : la copie reste non inscriptible, `test-output` est refusé, et les faits de l'évidence ne portent aucun `written`.

### Tâche 3 — Sous macOS, un dossier créé puis effacé est relevé

Pendant un relevé, le profil Seatbelt interdit l'effacement dans la copie (`file-write-unlink`). Une suite qui efface
ce qu'elle a créé laisse donc ses chemins en place, et le relevé les voit.

Le test, sous `darwinOnly`, relève un contrôle `node -e` qui crée `tmp-run/x` puis efface `tmp-run`.

- Vérifie : `node --test test/v1-adapters/control-write-survey.test.ts`
- Tient : `test/v1-adapters/control-write-survey.test.ts`, « sous Seatbelt, le relevé d'un contrôle qui crée tmp-run/x puis efface tmp-run rend tmp-run/x »
- Rouge : le profil du relevé permet l'effacement ; `tmp-run` a disparu à la seconde liste, et le relevé ne rend rien.

### Tâche 4 — Seule une préparation refusée relance sa suite sur un double de la copie

Quand la préparation n'est pas retenue, `prepare` (`src/application/phases/prepare.ts`) crée un second espace de la
référence, y pose les fichiers préparés, y relève la suite, puis le supprime. Le relevé de préparation garde, sous
`suite_written`, le contrôle de la suite et les chemins rendus. Une préparation retenue ne relance pas sa suite.

Le test, dans le harnais du noyau, prépare une suite dont le cas crée `test-output/run/a` dans un `try`. Une première
préparation la fait passer sur la référence et est refusée. Une seconde la fait échouer par assertion et est retenue.
Le test relit les deux relevés de préparation.

- Vérifie : `node --test test/v2-kernel/write-survey.test.ts`
- Tient : `test/v2-kernel/write-survey.test.ts`, « le relevé de la préparation refusée porte test-output/run/a pour le contrôle unit, et celui de la préparation retenue ne porte aucun chemin écrit »
- Rouge : `prepare` ne lance la suite qu'une fois, sur la référence, où `test-output` est refusé ; aucun relevé de préparation ne porte `suite_written`.

### Tâche 5 — La question IH-04 propose les dossiers de la copie que la suite a écrits pendant le relevé

Quand la question IH-04 est posée après des préparations refusées (`src/application/phases/verification-design.ts`),
elle reçoit les dossiers proposés : le premier niveau sous la copie de chaque chemin de `suite_written`, pour le
contrôle de la suite. Si la liste n'est pas vide, `src/application/decisions.ts` ajoute l'issue `grant_writable`, en
français et en anglais. Son libellé nomme le contrôle et les dossiers, et son effet cite les chemins relevés. Les
écritures refusées quittent l'observation, l'évidence et le relevé de préparation, avec `RefusedWritesSandbox`, qui les
simulait.

Le test, dans le harnais du noyau, prépare une suite qui crée `test-output/run/a` et tente d'écrire hors de la copie,
mène le changement jusqu'à la question IH-04, puis refait le même parcours avec une suite qui n'écrit rien.

- Vérifie : `node --test test/v2-kernel/writable-proposal.test.ts`
- Tient : `test/v2-kernel/writable-proposal.test.ts`, « après des préparations refusées dont la suite crée test-output/run/a et tente d'écrire hors de la copie, la question IH-04 offre grant_writable pour test-output/ au contrôle unit avec les chemins relevés et rien pour le chemin hors de la copie ; quand la suite n'écrit rien, elle ne l'offre pas »
- Rouge : la question tire ses dossiers des écritures refusées, qu'aucun lancement ne lit plus ; elle n'offre pas `grant_writable`.

### Tâche 6 — L'accord écrit le dossier dans `config.json`, et le protocole figé le porte ; une autre issue n'accorde rien

Un port de configuration du contrôleur (`src/ports/`), réalisé dans `src/extension/config.ts`, ajoute un dossier à
`policy.writable_paths.<contrôle>` dans `config.json` sans doublon ni perte des autres réglages, et rend la politique
relue. Sur la réponse `grant_writable`, le noyau l'appelle, adopte la politique relue et accorde une préparation de plus.
La préparation suivante et le gel du protocole portent alors le dossier par `withOwnerPaths`. Aucune autre issue
n'appelle ce port.

Le test donne au harnais un répertoire de données dont `config.json` porte `suite_paths` et une politique nommée. Dans un
premier parcours, il répond `grant_writable` à la question de la tâche 5, puis mène la préparation suivante jusqu'au gel.
Dans un second, il répond `prepare` à la même question et mène le changement jusqu'au gel. Chaque fois, il relit
`config.json` et le protocole figé.

- Vérifie : `node --test test/v2-kernel/writable-proposal.test.ts`
- Tient : `test/v2-kernel/writable-proposal.test.ts`, « la réponse grant_writable écrit test-output/ sous policy.writable_paths.unit dans config.json en gardant suite_paths et le nom de la politique, accorde une préparation de plus, et le contrôle unit figé porte test-output/ ; la réponse préparer laisse config.json inchangé et aucun contrôle figé ne porte test-output/ »
- Rouge : la question n'offre pas `grant_writable` et la réponse est refusée ; rien n'écrit `config.json`, qui garde son contenu, et le `unit` figé ne porte pas `test-output/`.

### Tâche 7 — Le parent de la copie n'est jamais proposé

`offeredWritableDirectories` (`src/domain/writable-proposal.ts`) écarte `..` comme il écarte `.`. Le nom d'un chemin
écrit est choisi par le code confiné ; la borne se tient ici pour toute source de chemins.

- Vérifie : `node --test test/v0-pure/writable-proposal.test.ts`
- Tient : `test/v0-pure/writable-proposal.test.ts`, « never offers the parent of the copy, whatever path below it the write names »
- Rouge : une écriture lue `..` ou `../x` a pour premier niveau `..`, proposé `../`.

## 5. Hors périmètre

- **Sous Linux, un dossier créé puis effacé** n'est pas relevé : bubblewrap ne sait pas interdire le seul effacement
  (`D-92`). La tentative suivante, où la suite échoue de nouveau, ne le propose pas davantage ; le propriétaire le lit
  dans la sortie des tests.
- **Une écriture hors de la copie** ne figure plus dans l'évidence d'un contrôle. Elle n'était jamais proposée (`D-76`),
  et l'erreur qu'elle cause reste dans la sortie du contrôle.
- **Un contrôle qui tourne après le gel**, contrôle déclaré ou passe sur le candidat, n'est pas relevé : un droit
  nouveau changerait le protocole figé. Le propriétaire peut le donner dans la configuration pour le changement suivant.
- **Une lecture refusée** n'est pas proposée : seule la liste des secrets est fermée en lecture (`D-90`).
- **Retirer un accord** se fait en modifiant `config.json`. Une autre session Pi ouverte relit la configuration à
  `/reload`, comme pour toute modification de ce fichier.
- **Un fichier écrit à la racine de la copie** est proposé comme dossier, puisque `policy.writable_paths` ne donne que
  des dossiers. Le propriétaire voit le chemin exact et peut refuser.
