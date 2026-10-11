# e40 — Un contrôle reçoit les droits dont il a besoin, et les tests de bac à sable de pi-495 tournent dans un bac à sable qui fonctionne

Statut : à faire
Point de départ : `b3e88aa9`, branche main, le 11 octobre 2026.
Décision : `specs/adr/D-90-un-controle-recoit-ses-droits-du-proprietaire-et-ce-qui-ne-tourne-pas-confine-est-juge-dans-une-vm.md`.
Étude : `specs/spikes/confinement-de-l-execution-dans-d-autres-projets.md`, close le 11 octobre.

## Résultat pour le propriétaire

**Les droits d'un contrôle.**
- Un contrôle écrit là où le propriétaire l'a permis, et nulle part ailleurs.
- Quand il échoue faute d'un droit à sa première exécution, 495 montre le chemin en cause et le propose au
  propriétaire, qui l'adopte ou non. 495 ne l'accorde jamais seul.
- Un lien ou un fichier posé par le candidat n'élargit jamais un droit.
- La configuration git du propriétaire, qui signe ses commits avec une clé de `~/.ssh`, ne fait plus échouer les
  tests d'une cible.

**Les tests de bac à sable de pi-495.** Un test qui démarre lui-même un bac à sable tourne dans un bac à sable qui
fonctionne, et 495 le juge :
- sous Linux, bubblewrap démarré sous le confinement bubblewrap de 495 ;
- sous macOS, où Seatbelt refuse un second profil, dans une VM macOS qui confine le contrôle à la place de Seatbelt ;
- là où il ne peut pas tourner, il se saute avec son motif et reste une obligation, jamais comptée comme passée.

Le dogfooding de pi-495 atteint l'intégration avec toute sa suite jugée par 495.

## Ce que la campagne du 11 octobre a montré

La recette de `e38s13` a conduit pour de bon un changement de pi-495 par le contrôleur stable de pi-495, sous un vrai
modèle, dans trois séries de campagnes (`~/.495/campagnes/dogfood-20261011T*`) :

| Constat | Cause | Suite |
| --- | --- | --- |
| 551 des 1734 tests de pi-495 échouent confinés | Les générations `v1` à `v4` démarrent Seatbelt ou bubblewrap ; leur garde `NO_QUALIFIED_SANDBOX` croit Seatbelt qualifié sous Seatbelt | e40s06 à e40s09 |
| Une partie de ces échecs vient de `git commit` | La configuration git globale de l'hôte signe les commits avec une clé de `~/.ssh`, que le profil interdit à juste titre | e40s01 |
| Les tests préparés échouent sans assertion (`EPERM … mkdir '<copie>/test-output'`) | Le contrôle de tests détecté n'écrit nulle part | e40s02 |
| Un droit sur `test-output/`, essayé puis retiré, ouvre toute la copie si le candidat commite `test-output` comme lien vers `.` | `profileFor` accorde un chemin par son chemin réel dès qu'il reste dans la copie | e40s02 |
| L'agent range ses tests dans `test/v2-kernel/` dans quatre préparations sur six | Le changement touche le noyau ; ce dossier n'est pas dans `suite_paths` | e40s09 |

## Ce qui existe au point de départ

| Mécanisme constaté | Conséquence |
| --- | --- |
| Les contrôles se règlent dans la configuration du contrôleur (`~/.495/config.json`, `src/extension/config.ts`), hors de la copie. Un contrôle déclaré y porte `writable_paths`, et le contrôle de tests détecté y est borné par `suite_paths` | Un contrôle détecté ne peut pas recevoir de chemin inscriptible |
| `profileFor` (`src/adapters/execution/runner.ts`) garde un chemin en écriture dès que son chemin réel reste dans la copie | Un lien committé par le candidat redirige le droit |
| L'environnement passe par une liste blanche (`BASE_ENV`, `src/application/stacks/stack.ts:56`) qui comprend `HOME` | git lit `~/.gitconfig` : un réglage personnel décide du verdict d'un contrôle |
| La qualification de Seatbelt vérifie la plateforme et la présence de `sandbox-exec`, sans appliquer de profil (`src/adapters/sandbox/backends.ts:115-127`) | Sous un autre Seatbelt, 495 se croit qualifié, et chaque contrôle échoue au lieu de refuser par `capability_missing` |
| Le noyau distingue un test qui échoue sans assertion (« proves nothing ») d'un échec d'assertion | Une erreur d'environnement n'est pas prise pour un défaut du candidat |
| Le contrôle `test` du dogfooding se limite à `test/v0-pure` et `test/cycle`. `v1` à `v4` ne sont jugées que par la Preflight non confinée et la VM Linux, et « un dogfooding ne les compte pas comme passées » (`specs/experiments/e38/dogfood/README.md`) | Aucun jugement ne lit ces exécutions |
| Le confinement bubblewrap de 495 ne pose ni filtre seccomp ni interdiction de nouveaux espaces de noms utilisateur (`src/adapters/sandbox/backends.ts:218-235`) | Un bubblewrap démarré à l'intérieur peut fonctionner ; Nix le fait sur plusieurs niveaux. Pas essayé |
| `scripts/linux/test.sh` copie l'arbre git dans une VM d'Apple `container` et y fait tourner toute la suite sous bubblewrap, sans privilège (`D-84`) | La VM Linux où l'essai de bubblewrap emboîté se fait |

Essais du 11 octobre sur cette machine (macOS 27, Apple Silicon), décrits dans l'étude :
- Sous un profil Seatbelt qui restreint quoi que ce soit, `sandbox-exec` refuse un second profil, sauf profil
  identique.
- Les refus de Seatbelt se lisent en direct par `/usr/bin/log stream`, avec le processus, l'opération et le chemin
  réel ; `log show` ne les rend pas après coup.

## Partie 1 — Les droits d'un contrôle viennent du propriétaire, jamais du candidat

| Story | Livraison observable | Prérequis |
| --- | --- | --- |
| e40s01 | git, dans un contrôle, ne lit ni la configuration globale ni la configuration système de l'hôte | Aucun |
| e40s02 | Le propriétaire donne à un contrôle, détecté ou déclaré, un dossier inscriptible de la copie dans la configuration du contrôleur. Le contrôleur crée ce dossier avant l'exécution. Un lien ou un fichier que le candidat y a mis fait refuser, et aucun droit ne s'accorde par la cible d'un lien | Aucun |
| e40s03 | Sous macOS, une écriture refusée à la première exécution est lue dans les refus que le noyau publie en direct pour les processus du contrôle, et proposée au propriétaire : chemin, contrôle, cible. Adoptée, elle s'inscrit dans la configuration du contrôleur. Sans le propriétaire, rien n'est accordé | e40s02 |
| e40s04 | Sous Linux, la proposition vient des chemins lus dans la sortie du contrôle, et le propriétaire la voit comme une indication du candidat, non vérifiée | e40s03 |
| e40s05 | Le dogfooding de pi-495 atteint G2, construit le candidat et l'intègre sous le contrôleur identifié au départ, avec `suite_paths` tel que `e38s13` l'a laissé | e40s01, e40s02 |

## Partie 2 — Les tests de bac à sable de pi-495 tournent dans un bac à sable qui fonctionne

| Story | Livraison observable | Prérequis |
| --- | --- | --- |
| e40s06 | La qualification de Seatbelt applique un vrai profil restrictif. Sous un autre Seatbelt, elle échoue, et 495 refuse par `capability_missing`. Les tests de pi-495 qui démarrent un bac à sable se sautent alors, avec leur motif | Aucun |
| e40s07 | Un test sauté faute de pouvoir tourner confiné reste une obligation. Le jugement la dit non réglée tant qu'une exécution sur la même révision ne l'a pas réglée, et un saut n'est jamais compté comme un passage | e40s06 |
| e40s08 | Sous Linux, les tests de pi-495 qui démarrent bubblewrap tournent sous le confinement bubblewrap de 495 et passent. Commence par l'essai dans la VM Linux de `scripts/linux`, précédé de celui du démarrage bloqué de `container` signalé sous macOS 27. Si le noyau refuse, ces tests restent des obligations et le bilan revient au propriétaire | e40s07 |
| e40s09 | Sous macOS, la configuration du contrôleur peut confiner un contrôle par une VM macOS au lieu de Seatbelt : la VM reçoit une copie de la révision figée, et c'est elle qui protège l'hôte. Les tests de pi-495 qui démarrent Seatbelt y tournent et passent. Le contrôle `test` de pi-495 retrouve `v1` à `v4`, et le dogfooding atteint l'intégration avec toute sa suite jugée par 495. Commence par la lecture et l'essai de l'outil de virtualisation, dont le bilan revient au propriétaire s'il ne tient pas | e40s05, e40s07 |

## Limites

- Aucun droit n'est accordé sans l'adoption du propriétaire, et aucun ne se lit dans la copie du candidat.
- Aucun code du candidat ne tourne sur l'hôte sans confinement. Un test qui ne trouve pas de bac à sable qui
  fonctionne reste une obligation non réglée.
- Aucun emboîtement de Seatbelt n'est recherché ; Seatbelt dans une VM macOS n'est pas un emboîtement.
- La VM macOS ne confine un contrôle que si la configuration du contrôleur le demande ; rien ne la propose à une cible.
- Apple `container` crée sous macOS la VM Linux qui sert à produire pi-495 ; il ne fait pas de VM macOS, et ce n'est
  pas un choix pour les projets cibles. La conteneurisation n'y est pas abordée : 495 y génère du code applicatif,
  Dockerfile compris, et n'y lance ni Docker ni VM Linux (`D-90`).
- La lecture reste permise hors de la liste des secrets, et un contrôle n'écrit toujours pas les caches des outils
  (`D-76`).
- `BUG-2026-10-11T013000` est corrigé par e40s01 et e40s06 ; `BUG-2026-10-11T105300` par e40s09.
