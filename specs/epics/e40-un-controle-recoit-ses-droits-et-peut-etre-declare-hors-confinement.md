# e40 — Un contrôle reçoit les droits dont il a besoin, et le propriétaire peut en déclarer un hors confinement

Statut : versé
Point de départ : `b3e88aa9`, branche main, le 11 octobre 2026.
Décision : `specs/adr/D-90-un-controle-recoit-ses-droits-du-proprietaire-et-peut-etre-declare-hors-confinement.md`, dont la
règle 3 est remplacée par `specs/adr/D-92-un-dossier-a-proposer-se-releve-dans-ce-qu-une-suite-ecrit-sur-un-double-de-la-copie.md`.
Étude : `specs/spikes/confinement-de-l-execution-dans-d-autres-projets.md`, close le 11 octobre.

## Résultat pour le propriétaire

**Les droits d'un contrôle.**
- Un contrôle écrit là où le propriétaire l'a permis, et nulle part ailleurs.
- Quand il échoue faute d'un droit à sa première exécution, 495 montre le chemin en cause et le propose au
  propriétaire, qui l'adopte ou non. 495 ne l'accorde jamais seul.
- Un lien ou un fichier posé par le candidat n'élargit jamais un droit.
- La configuration git du propriétaire, qui signe ses commits avec une clé de `~/.ssh`, ne fait plus échouer les
  tests d'une cible.

**Un contrôle hors confinement, déclaré par le propriétaire.** Les tests de pi-495 qui démarrent eux-mêmes Seatbelt
ou bubblewrap ne peuvent pas tourner sous le confinement d'un contrôle. Le propriétaire les place dans un contrôle
qu'il déclare hors confinement :
- l'exception est écrite dans la configuration du contrôleur, pour ce seul contrôle, et le candidat ne peut ni la
  créer ni l'étendre ;
- le propriétaire l'adopte explicitement, et elle est figée avec les autres contrôles ;
- le dossier et le verdict disent « exécuté hors confinement, sur décision du propriétaire » ;
- rien ne la propose automatiquement, à pi-495 comme à une autre cible.

Ce contrôle n'expose rien de plus que le développement de pi-495 aujourd'hui : la Preflight du cycle lance déjà toute la
suite sans confinement sur la machine du propriétaire. Il lit pourtant `~/.ssh` et les identifiants de l'hôte, et a le
réseau, et le code que le candidat écrit et que ces tests importent tourne sans protection.

Le dogfooding de pi-495 atteint l'intégration avec toute sa suite jugée par 495.

## Ce que la campagne du 11 octobre a montré

La recette de `e38s13` a conduit pour de bon un changement de pi-495 par le contrôleur stable de pi-495, sous un vrai
modèle, dans trois séries de campagnes (`~/.495/campagnes/dogfood-20261011T*`) :

| Constat | Cause | Suite |
| --- | --- | --- |
| 551 des 1734 tests de pi-495 échouent confinés | Les générations `v1` à `v4` démarrent Seatbelt ou bubblewrap, et Seatbelt refuse un second profil | e40s06, e40s07 |
| Une partie de ces échecs vient de `git commit` | La configuration git globale de l'hôte signe les commits avec une clé de `~/.ssh`, que le profil interdit à juste titre | e40s01 |
| Les tests préparés échouent sans assertion (`EPERM … mkdir '<copie>/test-output'`) | Le contrôle de tests détecté n'écrit nulle part | e40s02 |
| Un droit sur `test-output/`, essayé puis retiré, ouvre toute la copie si le candidat commite `test-output` comme lien vers `.` | `profileFor` accorde un chemin par son chemin réel dès qu'il reste dans la copie | e40s02 |
| L'agent range ses tests dans `test/v2-kernel/` dans quatre préparations sur six | Le changement touche le noyau ; ce dossier n'est pas dans `suite_paths` | e40s07 |

## Ce qui existe au point de départ

| Mécanisme constaté | Conséquence |
| --- | --- |
| Les contrôles se règlent dans la configuration du contrôleur (`~/.495/config.json`, `src/extension/config.ts`), hors de la copie. Un contrôle déclaré y porte `writable_paths`, et le contrôle de tests détecté y est borné par `suite_paths` | Un contrôle détecté ne peut pas recevoir de chemin inscriptible |
| `profileFor` (`src/adapters/execution/runner.ts`) garde un chemin en écriture dès que son chemin réel reste dans la copie | Un lien committé par le candidat redirige le droit |
| L'environnement passe par une liste blanche (`BASE_ENV`, `src/application/stacks/stack.ts:56`) qui comprend `HOME` | git lit `~/.gitconfig` : un réglage personnel décide du verdict d'un contrôle |
| Le noyau distingue un test qui échoue sans assertion (« proves nothing ») d'un échec d'assertion | Une erreur d'environnement n'est pas prise pour un défaut du candidat |
| Le contrôle `test` du dogfooding se limite à `test/v0-pure` et `test/cycle`. `v1` à `v4` ne sont jugées que par la Preflight non confinée et la VM Linux, et « un dogfooding ne les compte pas comme passées » (`specs/experiments/e38/dogfood/README.md`) | Aucun jugement ne lit ces exécutions |
| La configuration porte un interrupteur global, `isolation.allow_unconfined` ou `HARNESS495_ALLOW_UNCONFINED=1`, qui fait tourner tous les contrôles par `UnconfinedSandbox` et retire les garanties SEC-02 et SEC-03 (`src/extension/config.ts`, `src/adapters/sandbox/backends.ts:276-318`) | Le hors-confinement existe pour toute l'instance, pas pour un seul contrôle, et le verdict ne le dit pas par contrôle |

Essais du 11 octobre sur cette machine (macOS 27, Apple Silicon), décrits dans l'étude :
- Sous un profil Seatbelt qui restreint quoi que ce soit, `sandbox-exec` refuse un second profil, sauf profil
  identique. Aucun des dix-sept projets lus ne contourne ce refus.
- Les refus de Seatbelt se lisent en direct par `/usr/bin/log stream`, avec le processus, l'opération et le chemin
  réel ; `log show` ne les rend pas après coup. Le 12 octobre, ce journal s'est révélé perdre des lancements entiers,
  sans le signaler (`D-92`) : la proposition se relève dans la copie.

## Partie 1 — Les droits d'un contrôle viennent du propriétaire, jamais du candidat

| Story | Livraison observable | Prérequis |
| --- | --- | --- |
| e40s01 | git, dans un contrôle, ne lit ni la configuration globale ni la configuration système de l'hôte | Aucun |
| e40s02 | Le propriétaire donne à un contrôle, détecté ou déclaré, un dossier inscriptible de la copie dans la configuration du contrôleur. Le contrôleur crée ce dossier avant l'exécution. Un lien ou un fichier que le candidat y a mis fait refuser, et aucun droit ne s'accorde par la cible d'un lien | Aucun |
| e40s03 | Après une préparation refusée, la suite est relancée une fois sur un double jetable de la copie où elle peut écrire, sous macOS comme sous Linux, et les dossiers qu'elle y crée sont proposés au propriétaire : chemins, contrôle. Adoptée, la proposition s'inscrit dans la configuration du contrôleur. Sans le propriétaire, rien n'est accordé | e40s02 |
| e40s05 | Le dogfooding de pi-495 atteint G2, construit le candidat et l'intègre sous le contrôleur identifié au départ, avec `suite_paths` tel que `e38s13` l'a laissé, augmenté des témoins `.mjs` de la technologie. La mutation d'une cible Node tourne en TypeScript 7, suit la borne de suite du propriétaire et ne laisse pas sa copie de travail : les campagnes du 12 octobre ont montré qu'elle bloquait G2 puis G5 | e40s01, e40s02 |

## Partie 2 — Le propriétaire peut déclarer un contrôle hors confinement

| Story | Livraison observable | Prérequis |
| --- | --- | --- |
| e40s06 | La configuration du contrôleur peut déclarer un contrôle hors confinement, et le propriétaire l'adopte explicitement. L'exception est figée avec les autres contrôles et le candidat ne peut ni la créer ni l'étendre. Le dossier et le verdict disent que ce contrôle a tourné hors confinement sur décision du propriétaire. Rien ne la propose automatiquement | Aucun |
| e40s07 | Les tests de pi-495 qui démarrent un bac à sable passent par un contrôle hors confinement, les autres restent confinés, et le dogfooding de pi-495 atteint l'intégration avec toute sa suite jugée par 495 | e40s05, e40s06 |

## Limites

- Aucun droit n'est accordé sans l'adoption du propriétaire, et aucun ne se lit dans la copie du candidat.
- Aucun code du candidat ne tourne sur l'hôte sans confinement, hormis dans un contrôle que le propriétaire a déclaré
  hors confinement et adopté. Un backend non qualifié refuse toujours par `capability_missing` : l'exception n'est pas
  un repli.
- Aucun emboîtement de Seatbelt n'est recherché, et aucune VM n'est lancée par 495.
- Apple `container` crée sous macOS la VM Linux qui sert à produire pi-495 (`scripts/linux/`) ; ce n'est pas un choix
  pour les projets cibles. La conteneurisation n'y est pas abordée : 495 y génère du code applicatif, Dockerfile
  compris, et n'y lance ni Docker ni VM (`D-90`).
- La lecture reste permise hors de la liste des secrets, et un contrôle n'écrit toujours pas les caches des outils
  (`D-76`).
- Aucune proposition ne se lit dans la sortie d'un contrôle : le relevé d'e40s03 vaut sous Linux comme sous macOS, et
  la story Linux qui devait la lire est retirée du plan (`D-92`).
- `BUG-2026-10-11T013000` : e40s01 corrige sa partie git. Sa partie Seatbelt — la qualification lit la plateforme et
  non un vrai profil, si bien que 495 se croit qualifié sous un autre Seatbelt — reste au registre.
  `BUG-2026-10-11T105300` est corrigé par e40s07.
