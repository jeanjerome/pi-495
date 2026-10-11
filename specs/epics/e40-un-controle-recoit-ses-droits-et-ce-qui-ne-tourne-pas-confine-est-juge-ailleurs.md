# e40 — Un contrôle reçoit les droits dont il a besoin, et ce qui ne peut pas tourner confiné est jugé ailleurs

Statut : à faire
Point de départ : `b3e88aa9`, branche main, le 11 octobre 2026.
Décision : `specs/adr/D-90-un-controle-recoit-ses-droits-du-proprietaire-et-ce-qui-ne-tourne-pas-confine-est-juge-dans-une-vm.md`.
Étude : `specs/spikes/confinement-de-l-execution-dans-d-autres-projets.md`, close le 11 octobre.

## Résultat pour le propriétaire

**Les droits d'un contrôle.**
- Les contrôles d'une cible tournent dans le bac à sable de la plateforme, avec les seuls droits que le propriétaire a
  adoptés.
- Quand un contrôle échoue faute d'un droit à sa première exécution, 495 montre le droit en cause et le propose au
  propriétaire, qui l'adopte ou non. 495 ne l'accorde jamais seul.
- Rien de ce que le candidat écrit n'élargit un droit, ni un lien, ni un fichier, ni un réglage committé.
- Un contrôle ne dépend pas de la configuration de l'hôte : une signature git globale, une clé sous `~/.ssh` ou un
  réglage personnel ne font pas échouer les tests d'une cible.

**Ce qui ne peut pas tourner confiné.** Un test ne peut pas tourner dans ce bac à sable s'il démarre lui-même un bac à
sable, ou s'il a besoin d'un service que le bac interdit, comme Docker pour Testcontainers. Il ne disparaît pas du
jugement :
- il se saute avec son motif, et son saut est compté ;
- l'acceptation exige qu'une exécution sur la même révision, dans une VM que le noyau lance, l'ait réglé.

Le dogfooding de pi-495 atteint l'intégration avec toute sa suite jugée, chaque test là où il peut tourner.

## Ce que la campagne du 11 octobre a montré

La recette de `e38s13` a conduit pour de bon un changement de pi-495 par le contrôleur stable de pi-495, sous un vrai
modèle, dans trois séries de campagnes (`~/.495/campagnes/dogfood-20261011T*`) :

| Constat | Cause | Suite |
| --- | --- | --- |
| 551 des 1734 tests de pi-495 échouent confinés | Les générations `v1` à `v4` démarrent Seatbelt ou bubblewrap ; leur garde `NO_QUALIFIED_SANDBOX` lit la plateforme, pas l'emboîtement | e40s06 à e40s10 |
| Une partie de ces échecs vient de `git commit` | La configuration git globale de l'hôte signe les commits avec une clé de `~/.ssh`, que le profil interdit à juste titre | e40s01 |
| Les tests préparés échouent sans assertion (`EPERM … mkdir '<copie>/test-output'`) | Le contrôle `unit` n'écrit nulle part | e40s02 |
| Un droit sur `test-output/`, essayé puis retiré, ouvre toute la copie si le candidat commite `test-output` comme lien vers `.` | `profileFor` accorde un chemin par son chemin réel dès qu'il reste dans la copie | e40s02 |
| L'agent range ses tests dans `test/v2-kernel/` dans quatre préparations sur six | Le changement touche le noyau ; ce dossier n'est pas dans `suite_paths` | e40s10 |

## Ce qui existe au point de départ

| Mécanisme constaté | Conséquence |
| --- | --- |
| Un contrôle déclaré porte `writable_paths` (`src/contracts/v1/config.ts`) ; une technologie calcule les siens (Maven : les `target/` du réacteur) ; le contrôle de tests détecté est borné par `suite_paths` | Trois façons de dire un droit ; aucune pour un chemin hors de la copie |
| Le profil autorise toute lecture sauf `~/.ssh`, `~/.aws`, `~/.gnupg` et l'authentification de Pi (`src/adapters/sandbox/backends.ts`) | La liste des secrets existe ; elle n'est pas opposée à une déclaration |
| `profileFor` garde un chemin en écriture dès que son chemin réel reste dans la copie | Un lien committé par le candidat redirige le droit |
| L'environnement passe par une liste blanche (`BASE_ENV` : `PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_ALL`, `src/application/stacks/stack.ts:56`) ; `HOME` est celui de l'hôte | git lit `~/.gitconfig` : un réglage personnel décide du verdict d'un contrôle |
| Sous `network: allowed`, le profil Seatbelt écrit `(allow network*)` (`backends.ts:147-148`) | Les sockets Unix locaux, agent SSH et Docker compris, sont joignables |
| Un contrôle lit le cache de l'outil sans l'écrire ; seule l'installation l'écrit, au chemin que l'outil annonce (`D-76`) | Le cache n'est pas un droit à ajouter aux contrôles |
| Le noyau distingue un test qui échoue sans assertion (« proves nothing ») d'un échec d'assertion | Une erreur d'environnement n'est pas prise pour un défaut du candidat |
| Le contrôle `test` du dogfooding se limite à `test/v0-pure` et `test/cycle` ; `v1` à `v4` ne sont jugées que par la Preflight non confinée et la VM Linux, et « un dogfooding ne les compte pas comme passées » (`specs/experiments/e38/dogfood/README.md`) ; aucun jugement ne lit ces exécutions | Un saut n'est réglé par personne |
| `scripts/linux/test.sh` copie l'arbre git dans une VM d'Apple `container` et y fait tourner toute la suite sous bubblewrap, sans privilège (`D-84`) | Un environnement séparé existe, hors du jugement du contrôleur |

Essais du 11 octobre sur cette machine (macOS 27, Apple Silicon), décrits dans l'étude :
- Sous un profil Seatbelt qui restreint quoi que ce soit, `sandbox-exec` refuse un second profil, sauf profil
  identique.
- Les refus de Seatbelt se lisent en direct par `/usr/bin/log stream`, avec le processus, l'opération et le chemin
  réel ; `log show` ne les rend pas après coup.
- Sous `HOME` vidé, Java garde son `user.home` : Maven n'est pas touché. Node suit `HOME`, et
  `npm config get cache` sort en erreur.

## Partie 1 — Les droits d'un contrôle se déclarent, se proposent, et ne s'élargissent jamais depuis le candidat

| Story | Livraison observable | Prérequis |
| --- | --- | --- |
| e40s01 | Un contrôle ne dépend pas de l'hôte. Il a son propre dossier personnel et son propre temporaire. git n'y lit ni configuration globale, ni configuration système, ni paire `GIT_CONFIG_KEY_<n>` héritée : il lit un fichier global écrit par 495, signature coupée. Sous réseau ouvert, l'agent SSH et le démon Docker de l'hôte restent hors d'atteinte. L'installation garde le vrai dossier personnel | Aucun |
| e40s02 | Les chemins d'un contrôle se déclarent d'une seule façon, en lecture ou en écriture, dans la copie ou hors d'elle, lus dans la configuration du contrôleur. Un chemin de la liste des secrets est refusé à l'adoption. Le contrôleur crée les dossiers inscriptibles de la copie, et ce que le candidat y a mis, lien ou fichier, fait refuser. Aucun droit ne s'accorde par la cible d'un lien. `.git/config`, `.git/hooks` et les réglages de 495 dans la copie restent fermés en écriture | Aucun |
| e40s03 | Sous macOS, à la première exécution sur une cible, un contrôle refusé faute de droit fait proposer au propriétaire le droit exact : chemin, opération, contrôle, lecture seule quand la lecture suffit. Ce droit est lu dans les refus que le noyau publie en direct pour les processus du contrôle. La proposition sépare ce qui est déclaré, ce que le backend ajoute et ce qui est proposé. L'accord vaut pour ce contrôle et cette cible, et se redemande quand le candidat change le descripteur de construction. Sans le propriétaire, rien n'est accordé | e40s02 |
| e40s04 | Sous Linux, la proposition vient des chemins lus dans la sortie du contrôle, et le propriétaire la voit comme une indication du candidat, non vérifiée. Le reste suit e40s03 | e40s03 |
| e40s05 | Le dogfooding de pi-495 atteint G2, construit le candidat et l'intègre sous le contrôleur identifié au départ, avec `suite_paths` tel que `e38s13` l'a laissé | e40s01, e40s02 |

## Partie 2 — Ce qui ne peut pas tourner confiné est jugé dans une VM, sur la même révision

| Story | Livraison observable | Prérequis |
| --- | --- | --- |
| e40s06 | Avant de lancer un contrôle, le contrôleur sait si un bac à sable intérieur s'appliquera, par une sonde : un profil sans restriction appliqué sous le profil du contrôle. 495 pose une variable qui dit au contrôle qu'il tourne confiné. Un test de pi-495 qui démarre un bac à sable s'en sert pour se sauter avec son motif. La variable ne coupe jamais un confinement | e40s01 |
| e40s07 | Un test sauté faute de pouvoir tourner confiné reste une obligation. Le jugement la dit non réglée tant qu'une exécution sur la même révision (commit et empreinte de l'arbre jugé), dans un environnement qualifié, ne l'a pas réglée. Un saut n'est jamais compté comme un passage | e40s06 |
| e40s08 | Un contrôle déclare la capacité qu'il exige (« démarre bubblewrap », « a besoin de Docker », « démarre Seatbelt »), et seul un exécuteur qui l'annonce dans la configuration du propriétaire le prend. Le noyau lance la VM Linux d'Apple `container` sur une copie de la révision figée, avec des montages qu'il fixe. Il en reçoit les observations, rattachées à la révision, au contrôle, à l'empreinte de la politique et à l'image. Le code du candidat y démarre bubblewrap | e40s07 |
| e40s09 | Un contrôle qui a besoin de Docker tourne dans une VM `container` qui a son propre démon. Aucun socket de l'hôte n'y est monté, et Testcontainers y démarre ses conteneurs. Commence par deux essais : le réglage de l'image pour `dockerd`, et le démarrage bloqué signalé sous macOS 27 | e40s08 |
| e40s10 | Les tests de pi-495 qui démarrent Seatbelt sont jugés dans une VM macOS, sans Seatbelt autour, sur la même révision. Commence par la lecture et l'essai de l'outil de virtualisation ; si l'outil ne tient pas, le bilan revient au propriétaire. Le contrôle `test` de pi-495 retrouve `v1` à `v4`, et le dogfooding atteint l'intégration avec chaque test jugé, confiné ou dans sa VM | e40s05, e40s08 |

## Limites

- Aucun droit n'est accordé sans l'adoption du propriétaire, et aucun ne se lit dans un fichier que le candidat
  modifie. La liste des secrets (`~/.ssh`, `~/.aws`, `~/.gnupg`, l'authentification de Pi) ne s'ouvre par aucune
  déclaration.
- Aucun code du candidat ne tourne sur l'hôte sans confinement. Ce qui ne peut pas tourner confiné tourne dans une VM
  que le noyau lance, ou reste une obligation non réglée. Un backend non qualifié refuse par `capability_missing`.
- Aucun emboîtement de Seatbelt n'est recherché ; un bac à sable dans une VM n'est pas un emboîtement.
- La lecture reste permise par défaut, hors liste des secrets : refuser toute lecture non déclarée demanderait à
  chaque technologie sa liste, et aucun des deux besoins n'en dépend.
- Sous Linux, aucune source de refus que le candidat ne peut pas écrire n'est connue ; `strace` lancé hors du bac
  n'est pas essayé par cet epic.
- `BUG-2026-10-11T013000` est corrigé par e40s01 et e40s06 ; `BUG-2026-10-11T105300` par e40s10.
