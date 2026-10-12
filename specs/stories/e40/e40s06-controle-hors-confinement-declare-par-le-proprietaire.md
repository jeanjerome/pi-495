# Le propriétaire déclare et adopte un contrôle hors confinement, que le candidat ne peut ni créer ni étendre et que le verdict nomme

Story : e40s06
Epic : e40
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire dont la cible a des tests qui démarrent eux-mêmes un bac à sable peut les faire juger par 495.
Aujourd'hui, ces tests échouent sous le confinement de tout contrôle : Seatbelt refuse d'appliquer un second profil sous
un premier, et 551 des 1734 tests de pi-495 sont tombés ainsi le 11 octobre. Le seul moyen de les faire passer est
l'interrupteur global `isolation.allow_unconfined`, qui retire le confinement à tous les contrôles et à l'agent, et que
le verdict ne mentionne pas.

Le propriétaire déclare désormais, dans la configuration du contrôleur, un contrôle à lui qui tourne hors confinement.
Ce réglage est sa décision : il l'écrit lui-même, rien ne le lui propose, et le candidat ne peut ni le créer ni le faire
valoir pour un autre contrôle. Les autres contrôles restent confinés. L'évidence du contrôle et le verdict G5 disent
qu'il a tourné hors confinement sur décision du propriétaire (`D-90`, règles 4 et 5).

## 2. Promesses

Scenario: Un contrôle que le propriétaire déclare hors confinement est figé ainsi avec le protocole
  Given une configuration du contrôleur qui déclare `sandbox-tests` hors confinement et `lint-own` sans le dire
  When le protocole est figé à G2
  Then la définition figée de `sandbox-tests` porte « hors confinement », celles de `lint-own` et des contrôles que la technologie détecte ne le portent pas, et le protocole gelé dans l'état du changement nomme `sandbox-tests` comme seul contrôle hors confinement

Scenario: Le contrôle déclaré hors confinement tourne sans bac à sable, et son évidence le dit
  Given un contrôle déclaré hors confinement, dont la commande écrit un fichier hors de la copie et applique elle-même un profil Seatbelt
  When il est lancé par un exécuteur dont le bac à sable est Seatbelt
  Then le fichier est écrit, l'évidence est PASS, son fait `sandbox` vaut `unconfined` et une note dit « ran outside confinement, by the owner's decision »

Scenario: Un contrôle que le propriétaire n'a pas déclaré hors confinement reste confiné
  Given la même commande, dans un contrôle qui n'est pas déclaré hors confinement
  When il est lancé par le même exécuteur
  Then le fichier hors de la copie n'est pas écrit, l'évidence est FAIL et son fait `sandbox` vaut `seatbelt`

Scenario: Le verdict G5 nomme le contrôle qui a tourné hors confinement
  Given un protocole figé qui nomme `unit` hors confinement, et une évidence PASS de chaque contrôle sur le candidat
  When G5 est évalué
  Then le verdict est PASS, et ses raisons disent « declared control unit ran outside confinement, by the owner's decision »

## 3. Sécurité

Le confinement d'un contrôle ne tombe que sur une déclaration du propriétaire. L'exception est un réglage d'un contrôle
que le propriétaire déclare lui-même dans `policy.project_controls`, avec sa commande, dans la configuration du
contrôleur, hors de la copie et illisible pour l'agent comme pour les contrôles. Elle est figée avec le protocole à G2 :
une configuration changée après le gel ne retire ni n'ajoute l'exception d'un contrôle figé, et l'exécuteur ne la lit
que dans la définition figée.

Le candidat ne crée ni n'étend l'exception :
- un contrôle que la technologie détecte ne la porte jamais, même s'il porte l'identifiant d'un contrôle déclaré hors
  confinement ; ce que l'agent écrit dans sa copie ne peut donc faire apparaître aucun contrôle hors confinement ;
- elle vaut pour le seul contrôle qui la porte : un contrôle qui lit ce qu'il produit, ou qui le suit, reste confiné ;
- rien ne la propose : la question qui suit une préparation refusée n'offre que des dossiers inscriptibles, et le seul
  écrit de 495 dans `config.json` y ajoute un dossier, jamais l'exception.

Ce n'est pas un repli (`D-90`, règle 5). Un backend non qualifié refuse toujours les autres contrôles et l'agent par
`capability_missing`, et l'exception ne retire le confinement qu'au contrôle déclaré.

Ce que le contrôle hors confinement expose est ce que `D-90` accepte. Sa commande lit `~/.ssh` et les identifiants de
l'hôte, a le réseau, et peut écrire partout où le propriétaire écrit, `config.json` et le dossier de 495 compris. Le code
du candidat que cette commande exécute tourne donc sans protection, et ce qu'il y fait échappe aux garanties
ci-dessus. C'est pour cela que le propriétaire seul déclare ce contrôle, que l'évidence et le verdict le nomment, et
qu'aucune détection ne le propose. L'environnement reste la liste blanche du contrôle, et git n'y lit toujours pas la
configuration de l'hôte (e40s01).

## 4. Tâches

### Tâche 1 — La configuration du contrôleur déclare un contrôle hors confinement, figé avec le protocole

`ProjectControlDeclaration` (`src/contracts/v1/config.ts`) accepte `unconfined`, un booléen facultatif.
`ControlDefinition` (`src/contracts/v1/protocol.ts`) porte `unconfined: true` pour un contrôle hors confinement et rien
sinon, si bien que les protocoles déjà figés gardent leur empreinte ; `npm run contracts` régénère les contrats.
`projectControlsOf` (`src/application/project-controls.ts`) reporte la déclaration sur la définition. Le protocole gelé
de l'état du changement (`FrozenProtocol`, `src/domain/change/state.ts`) nomme ses contrôles hors confinement dans
`unconfined_control_ids`, tiré par `decide.ts` des définitions figées, absent quand il n'y en a aucun. Le README le
documente sous `policy.project_controls`. Le test, dans `test/v2-kernel/preparation.test.ts`, mène jusqu'au gel du
protocole un harnais dont la politique déclare `sandbox-tests` hors confinement et `lint-own` sans le dire.

- Vérifie : `node --test test/v2-kernel/preparation.test.ts`
- Tient : `test/v2-kernel/preparation.test.ts`, « le contrôle que la configuration du contrôleur déclare hors confinement est figé ainsi, et lui seul : sandbox-tests porte unconfined, lint-own et les contrôles détectés non, et le protocole gelé nomme sandbox-tests »
- Rouge : `projectControlsOf` ne reporte que l'identifiant, le titre, la commande, le délai, le réseau et les chemins ; le `sandbox-tests` figé ne porte pas `unconfined`, et le protocole gelé ne nomme aucun contrôle hors confinement.

### Tâche 2 — L'exécuteur lance sans bac à sable le seul contrôle figé hors confinement, et l'évidence le dit

`GenericControlRunner.runControl` (`src/adapters/execution/runner.ts`) lance un contrôle dont la définition porte
`unconfined` par `UnconfinedSandbox`, avec le même profil, et tout autre contrôle par le bac à sable de l'exécuteur. Le
fait `sandbox` de l'évidence nomme le bac à sable qui a lancé la commande, et une note dit « ran outside confinement, by
the owner's decision ». Le test, sous `darwinOnly`, construit l'exécuteur sur `SeatbeltSandbox` sans dossier temporaire
accordé, et lance deux fois une commande qui écrit `outside.txt` hors de la copie puis applique elle-même un profil
Seatbelt par `sandbox-exec` : d'abord dans un contrôle qui porte `unconfined`, puis dans le même contrôle sans lui.

- Vérifie : `node --test test/v1-adapters/unconfined-control.test.ts`
- Tient : `test/v1-adapters/unconfined-control.test.ts`, « le contrôle déclaré hors confinement écrit hors de sa copie et applique son propre profil Seatbelt : l'évidence est PASS, sandbox vaut unconfined et une note dit qu'il a tourné hors confinement sur décision du propriétaire ; sans la déclaration, la même commande ne l'écrit pas, l'évidence est FAIL et sandbox vaut seatbelt »
- Rouge : `runControl` lance tout contrôle par le bac à sable de l'exécuteur ; sous Seatbelt l'écriture hors de la copie et le second profil sont refusés, l'évidence du contrôle déclaré est FAIL et son fait `sandbox` vaut `seatbelt`.

### Tâche 3 — Le verdict G5 nomme le contrôle qui a tourné hors confinement

`evaluateG5` (`src/domain/gates/g5.ts`) ajoute à ses raisons, quel que soit le verdict, une raison par contrôle que le
protocole gelé nomme hors confinement : « declared control <id> ran outside confinement, by the owner's decision ». Le
test part d'un changement en décision dont toutes les évidences sur le candidat sont PASS, et évalue G5 sous le protocole
gelé qui nomme `unit` hors confinement.

- Vérifie : `node --test test/v0-pure/change-rules-gates.test.ts`
- Tient : `test/v0-pure/change-rules-gates.test.ts`, « G5 PASS nomme dans ses raisons le contrôle que le protocole gelé dit hors confinement, sur décision du propriétaire »
- Rouge : `evaluateG5` rend `reasons: []` sur PASS ; aucune raison ne nomme `unit`.

## 5. Hors périmètre

- **Les tests de bac à sable de pi-495 dans un tel contrôle**, et le dogfooding jusqu'à l'intégration avec toute sa
  suite : e40s07.
- **Un contrôle détecté hors confinement.** La suite que la technologie détecte, et ses autres contrôles, restent
  confinés : un contrôle détecté peut apparaître par un fichier que l'agent ajoute, et hériterait alors d'une exception
  écrite pour une autre cible (arbitrage du propriétaire du 12 octobre).
- **Une confirmation dans Pi à chaque changement.** Le réglage écrit par le propriétaire est son adoption ; une question
  de plus arrêterait toute exécution sans lui et n'ajouterait qu'une date (arbitrage du propriétaire du 12 octobre).
- **Le G5 d'un relevé de l'existant** garde ses raisons : l'évidence du contrôle y dit qu'il a tourné hors confinement.
- **L'interrupteur global** `isolation.allow_unconfined` ne change pas.
