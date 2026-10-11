# Le confinement de l'exécution dans d'autres projets

Statut : ouverte — les fiches et la conclusion de Claude sont écrites ; celles de l'autre IA sont attendues.
Ouverte le 11 octobre 2026, à `main` après le versement de `e38s13`.
Menée par deux IA, Claude et une autre, chacune signant ce qu'elle a lu ; le propriétaire arbitre.
Débouché : l'epic `e40`, qui ne s'écrit qu'après cette étude.

## Pourquoi cette étude

Les contrôles d'une cible tournent dans le bac à sable de la plateforme (Seatbelt sous macOS, bubblewrap sous Linux),
avec un profil que 495 génère. Le premier dogfooding réel de pi-495, le 11 octobre, a montré deux besoins que 495 ne
sait pas encore servir :

1. **Les droits d'un contrôle.** Un contrôle a besoin d'écrire ou de lire des chemins que 495 ne connaît pas d'avance
   (`test-output/` pour pi-495, un cache comme `~/.m2` ou `~/.npm` pour d'autres) ; il ne doit pas dépendre de la
   configuration de l'hôte ; et un droit ne doit jamais s'élargir par ce que le candidat écrit.
2. **Ce qui ne peut pas tourner confiné.** Un test qui démarre lui-même un bac à sable, ou qui a besoin d'un service que
   le bac interdit (Docker pour Testcontainers), échoue dans le bac à sable du contrôle.

D'autres projets ont déjà affronté ces questions. Cette étude relève ce qu'ils ont fait, pour reprendre ce qui a fait
ses preuves plutôt que de le réinventer.

## Ce que la campagne du 11 octobre a montré

Trois séries de campagnes de dogfooding (`~/.495/campagnes/dogfood-20261011T*`), un vrai modèle, un changement réel de
pi-495 conduit par le contrôleur stable de pi-495 :

| Constat | Cause |
| --- | --- |
| La suite préparée sort « timeout after 600 s », deux fois, et G2 n'est pas atteint | Le contrôle `unit` lance tout `test/**` confiné ; la suite dépasse son délai. `e38s13` le borne par `suite_paths` |
| 551 des 1734 tests de pi-495 échouent confinés | Les générations `v1` à `v4` démarrent Seatbelt ou bubblewrap ; leur garde lit la plateforme, pas l'emboîtement |
| Une partie de ces échecs vient de `git commit` | La configuration git globale de l'hôte signe avec une clé de `~/.ssh`, que le profil interdit à juste titre |
| Les tests préparés échouent sans assertion (`EPERM … mkdir '<copie>/test-output'`) | Le contrôle `unit` n'écrit nulle part |
| Un droit sur `test-output/`, essayé puis retiré, ouvrait toute la copie si le candidat commitait `test-output` comme lien vers `.` | Le droit s'accorde par le chemin réel dès qu'il reste dans la copie |
| L'agent range ses tests dans `test/v2-kernel/` dans quatre préparations sur six | Le changement touche le noyau ; ce dossier n'est pas dans ce que le contrôle lance |

## Essais sur cette machine, le 11 octobre (macOS 27, Apple Silicon)

- Sous un profil Seatbelt qui restreint quoi que ce soit (réseau coupé, écriture limitée, ou `deny default`),
  `sandbox-exec` refuse d'appliquer un second profil — `sandbox_apply: Operation not permitted`, code 71 — même plus
  strict que le premier. Seul un profil identique passe. Sous un profil `(allow default)` sans restriction,
  l'emboîtement passe.
- Les refus d'un profil lancé par `sandbox-exec` n'apparaissent pas dans `log show`, et SBPL refuse `(with report)` sur
  une action `deny`.
- Le même jour, plus tard : ces refus apparaissent **en direct** dans `log stream`, qui les montre au moment où ils se
  produisent, sans qu'ils restent consultables ensuite par `log show`. Essai rejouable : lancer
  `/usr/bin/log stream --style compact --predicate 'sender == "Sandbox" AND composedMessage CONTAINS "<dossier>"'`, puis
  `/usr/bin/sandbox-exec -f <profil> /usr/bin/touch <dossier>/w/y` sous un profil qui interdit l'écriture de
  `<dossier>/w` — en `(allow default)` comme en `(deny default)`. Le flux porte une ligne du noyau
  `Sandbox: touch(28419) deny(1) file-write-create <dossier>/w/y` : processus, PID, opération et chemin réel. Une
  requête `log show --last 3m` sur le même motif, juste après, ne rend rien. Sous zsh, `log` est une commande interne :
  il faut appeler `/usr/bin/log`.

## Ce que 495 a au départ

| Mécanisme | Où |
| --- | --- |
| Un contrôle déclaré par le projet porte `writable_paths` ; une technologie calcule les siens (Maven : les `target/` du réacteur) ; le contrôle de tests détecté est borné par `suite_paths` | `src/contracts/v1/config.ts`, `src/adapters/stacks/` |
| Toute lecture est permise sauf `~/.ssh`, `~/.aws`, `~/.gnupg` et l'authentification de Pi | `src/adapters/sandbox/backends.ts` |
| Écriture permise dans le répertoire temporaire ; réseau `denied`, `loopback` ou `allowed` | idem |
| L'environnement d'un contrôle passe par une liste blanche ; git y lit la configuration globale de l'hôte | `src/adapters/execution/runner.ts` |
| Un test qui échoue sans assertion est distingué d'un échec d'assertion (« proves nothing ») | le noyau, préparation |
| Un backend non qualifié n'exécute rien hors bac à sable : il refuse avec `capability_missing` | `CLAUDE.md`, règles du projet |
| Une VM Linux ARM64 (Apple container) où bubblewrap tourne sans privilège sert à la qualification Linux ; la suite entière de 495 y tourne, copiée depuis l'arbre git, en quatre minutes environ | `scripts/linux/test.sh`, `scripts/linux/campagne.sh`, `specs/adr/D-84` ; banc `~/.495-campagnes/scripts/e28s16-vm.sh` |

## Les projets à lire

La liste n’est pas fermée ; chacune des deux IA peut en ajouter, en disant pourquoi. La colonne « Pourquoi » reprend une première lecture faite le 11 octobre par une autre IA : rien n’y est encore vérifié.

| Projet | Pourquoi |
| --- | --- |
| Unsloth Studio — `unsloth.ai/docs/new/studio/sandboxing-in-unsloth` | Proposé par le propriétaire |
| Codex (OpenAI) | Seatbelt, bubblewrap, Landlock ; saute ses tests de bac à sable sous son propre bac à sable |
| Claude Code et `sandbox-runtime` (Anthropic) | Seatbelt et bubblewrap pour les commandes ; le refus de réappliquer un profil y est signalé. La page `code.claude.com/docs/en/sandbox-environments` (« Choose a sandbox environment ») est lue en entier, à la demande du propriétaire |
| Gemini CLI | Plusieurs fournisseurs : Seatbelt, Docker/Podman, gVisor, LXC |
| Cursor (local et agents en VM) | Seatbelt, Landlock et seccomp derrière une API commune ; VM pour le cloud |
| GitHub Copilot | Confinement local, environnements Linux éphémères en cloud |
| OpenHands | Le serveur d'agent dans un conteneur, piloté à distance |
| SWE-agent | Environnements d'exécution fondés sur des images Docker |
| Aider | Distribution Docker ; les commandes tournent dans le conteneur |
| OpenCode | Permissions applicatives `allow`, `ask`, `deny` |
| Docker Sandboxes | Une micro-VM et un démon Docker propres à chaque environnement |
| NVIDIA OpenShell | Un superviseur de confiance qui décide, une charge qui ne choisit pas sa politique |
| Pi | Aucun confinement intégré ; `docs/containerization.md`, l'extension Gondolin et les exemples `sandbox` du paquet installé |
| Bazel | Ajouté par Claude : il exécute des tests, pas un agent, sous Seatbelt et sous un bac Linux, et envoie ce qui ne peut pas tourner confiné vers une autre plateforme d'exécution ; le ticket sur l'emboîtement de `sandbox-runtime` le cite |
| Nix | Ajouté par Claude : son bac à sable de construction bute sur le même refus d'emboîter Seatbelt, et sépare ce que la dérivation demande de ce que la configuration du démon accorde |
| MXC (Microsoft) | Ajouté par Claude : le moteur open source sous le bac à sable local du Copilot CLI ; Seatbelt appliqué sans `sandbox-exec`, des tests sans chemin de saut |
| `container` d'Apple | Ajouté par Claude : une VM Linux par conteneur sous macOS, déjà employée par 495 pour ses tests sous Linux (`scripts/linux/`) |

## Ce que chaque projet doit dire

1. Ce qui est confiné, et ce qui ne l'est pas (commandes, outils fichiers, extensions, processus enfants).
2. Comment un droit se déclare, se découvre quand il manque, et s'accorde ; qui l'accorde.
3. Ce qui est refusé quoi qu'on déclare.
4. Comment l'environnement et la configuration de l'hôte sont tenus à l'écart.
5. Comment le confinement se teste quand on tourne déjà sous lui.
6. Quelle frontière protège l'hôte quand le code doit démarrer un bac à sable ou un service comme Docker.
7. Ce que cela coûte : préparation, temps de démarrage, entretien, plateformes couvertes.

## Méthode

- Lire les sources et la documentation officielles, pas un résumé ; chaque affirmation cite sa source à une version
  ou une date.
- Ce qui n'a pas pu être lu est dit non lu ; ce qui n'a pas été essayé est dit non essayé.
- Un essai sur cette machine est décrit assez pour être rejoué.
- Chaque fiche est signée par l'IA qui l'a écrite ; quand les deux IA ne concluent pas pareil, les deux conclusions
  restent, et le propriétaire arbitre.
- Windows est hors du périmètre : Pi ne le prend pas en charge. Le confinement Windows d'un projet n'est pas lu.

## Fiches

Une fiche par projet, selon les sept questions, sous le dossier de l'IA qui l'a signée.

| Projet | Claude | Autre IA |
| --- | --- | --- |
| Unsloth Studio | [`claude/unsloth-studio.md`](confinement-de-l-execution-dans-d-autres-projets/claude/unsloth-studio.md) | attendue |
| Codex | [`claude/codex.md`](confinement-de-l-execution-dans-d-autres-projets/claude/codex.md) | attendue |
| Claude Code et `sandbox-runtime` | [`claude/claude-code.md`](confinement-de-l-execution-dans-d-autres-projets/claude/claude-code.md) | attendue |
| Gemini CLI | [`claude/gemini-cli.md`](confinement-de-l-execution-dans-d-autres-projets/claude/gemini-cli.md) | attendue |
| Cursor | [`claude/cursor.md`](confinement-de-l-execution-dans-d-autres-projets/claude/cursor.md) | attendue |
| GitHub Copilot | [`claude/github-copilot.md`](confinement-de-l-execution-dans-d-autres-projets/claude/github-copilot.md) | attendue |
| OpenHands | [`claude/openhands.md`](confinement-de-l-execution-dans-d-autres-projets/claude/openhands.md) | attendue |
| SWE-agent et SWE-ReX | [`claude/swe-agent.md`](confinement-de-l-execution-dans-d-autres-projets/claude/swe-agent.md) | attendue |
| Aider | [`claude/aider.md`](confinement-de-l-execution-dans-d-autres-projets/claude/aider.md) | attendue |
| OpenCode | [`claude/opencode.md`](confinement-de-l-execution-dans-d-autres-projets/claude/opencode.md) | attendue |
| Docker Sandboxes | [`claude/docker-sandboxes.md`](confinement-de-l-execution-dans-d-autres-projets/claude/docker-sandboxes.md) | attendue |
| NVIDIA OpenShell | [`claude/nvidia-openshell.md`](confinement-de-l-execution-dans-d-autres-projets/claude/nvidia-openshell.md) | attendue |
| Pi et Gondolin | [`claude/pi.md`](confinement-de-l-execution-dans-d-autres-projets/claude/pi.md) | attendue |
| Bazel | [`claude/bazel.md`](confinement-de-l-execution-dans-d-autres-projets/claude/bazel.md) | — |
| Nix | [`claude/nix.md`](confinement-de-l-execution-dans-d-autres-projets/claude/nix.md) | — |
| MXC | [`claude/mxc.md`](confinement-de-l-execution-dans-d-autres-projets/claude/mxc.md) | — |
| `container` d'Apple | [`claude/apple-container.md`](confinement-de-l-execution-dans-d-autres-projets/claude/apple-container.md) | — |

Les fiches de Claude ont été écrites à partir de clones peu profonds et de la documentation officielle, sans rien
exécuter de ce qui a été cloné. Les citations qui portent la conclusion ci-dessous ont été relues dans les clones : la
sonde de Bazel (`DarwinSandboxedSpawnRunner.java`), l'arrêt du bac intérieur chez Nix (`test-main.cc:37-42`) et son
isolement de git (`tests/functional/common/vars.sh:67-69`), celui de Gemini CLI (`shellExecutionService.ts:596-639`),
le refus d'un lien dans une racine inscriptible chez Codex (`sandboxing/src/seatbelt.rs:414-456`), la règle des liens
de `sandbox-runtime` (`src/sandbox/sandbox-utils.ts:290-305`), et la sentinelle lue à travers un lien chez Unsloth
(`sandbox_probe.py:380-390`).

## Ce que 495 reprend, adapte ou écarte

Signée : Claude (Opus 5.5), le 11 octobre 2026. Conclusion d'une des deux IA : elle reste provisoire jusqu'à la lecture
du relevé de l'autre, et le propriétaire arbitre leurs désaccords.

### Ce que les projets lus ont en commun

- **Aucun n'emboîte Seatbelt.** Nix, Codex, Unsloth et `sandbox-runtime` rencontrent le refus exact que 495 a vu le 11
  octobre (`sandbox_apply: Operation not permitted`). Nix éteint le bac intérieur et laisse le bac extérieur faire
  frontière ; Codex et Unsloth sautent leurs tests ; `sandbox-runtime` a un ticket ouvert depuis décembre 2025, sans
  réponse. Sous Linux, l'emboîtement marche quand les espaces de noms utilisateur sont permis (Nix l'éprouve sur cinq
  niveaux), et il est refusé dès qu'un filtre seccomp les interdit (Unsloth, OpenShell).
- **Ce qui ne tourne pas confiné part sur une autre machine.** Bazel l'envoie vers une plateforme d'exécution déportée
  par une contrainte (`mount_capable`), Nix vers un constructeur qui annonce la capacité (`requiredSystemFeatures`),
  Copilot vers un runner éphémère dont la CI tourne sur la révision poussée, Cursor vers une microVM Firecracker. Ceux
  qui font tourner Docker pour le code confiné le font dans une VM qui a son propre démon (Docker Sandboxes, l'agent
  cloud de Cursor) ou derrière sysbox (OpenHands). Aucun ne donne au code confiné le démon Docker de l'hôte.
- **Ceux qui protègent l'hôte ne lisent jamais un droit dans l'arbre du code confiné.** Copilot CLI ignore tout réglage
  de bac à sable venu du dépôt, Claude Code ignore les clés qui élargissent quand l'administrateur l'exige, Bazel
  laisse l'opérateur retirer une étiquette, Nix borne la dérivation par la configuration du démon. Les contre-exemples
  sont nets : Cursor fusionne un `sandbox.json` du dépôt prioritaire, Aider laisse un `.aider.conf.yml` committé fixer
  la commande de test, l'exemple `sandbox` de Pi laisse `.pi/sandbox.json` désactiver le bac.
- **Personne ne découvre un droit de fichier manquant de façon sûre.** Gemini CLI et le harnais local de VS Code lisent
  la sortie de la commande, que le code confiné écrit. Docker Sandboxes et OpenShell ne découvrent que le réseau. Codex a
  un mode manuel qui lit le journal du système (`codex sandbox macos --log-denials`), et `sandbox-runtime` joint au
  résultat les refus lus dans ce journal. L'essai du 11 octobre ci-dessus montre que cette source existe sous macOS.
- **Le repli silencieux est la faute la plus répandue.** Bazel, Nix (`sandbox-fallback`), Claude Code, Cursor, le
  harnais de VS Code, Unsloth en mode `auto` et l'exemple `sandbox` de Pi exécutent sans confinement, ou sous un
  confinement affaibli, quand le bac ne démarre pas. Le `capability_missing` de 495 est la bonne règle ; aucun projet
  lu ne donne de raison de la changer.

### Besoin 1 — les droits d'un contrôle

| Choix | Décision | Fondement |
| --- | --- | --- |
| Les droits d'un contrôle se lisent dans la configuration du contrôleur, hors de la copie ; une source ajoutée ne peut que restreindre | Reprendre | Copilot CLI, Claude Code, Bazel, Nix, `sbx env` ; contre-exemples Cursor, Aider, Pi |
| Un chemin inscriptible de la copie est créé par le contrôleur avant l'exécution ; ce que le candidat a mis à sa place, lien ou fichier, fait refuser | Reprendre | Bazel crée la racine inscriptible ; Codex refuse une racine qui contient un lien et nomme le lien ; OpenHands refuse un point de montage qui est un lien ; Unsloth refuse lien dur, montage imbriqué et périphérique |
| Un droit ne s'accorde jamais par le chemin réel d'un lien | Reprendre | MXC : « résoudre élargit, garder la graphie restreint » ; c'est la cause de l'élargissement par `test-output -> .`. `sandbox-runtime` écarte un droit qui pointe vers un ancêtre ; Codex suit le lien sous Linux, ce qui est à ne pas imiter |
| `.git/config`, `.git/hooks` et les fichiers de réglage de 495 dans la copie restent fermés en écriture, quoi qu'on déclare | Reprendre | Codex (création comprise, par expression régulière), Cursor, `sandbox-runtime` |
| Un `HOME` vide, propre au contrôle, et git coupé de toute configuration globale et système (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_SYSTEM=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`) | Reprendre | Gemini CLI, Nix (« Isolate tests from host git config (signing… ) »), Unsloth, OpenHands, Bazel ; MXC avertit qu'un `HOME` posé sur la copie fait lire le `.gitconfig` du candidat comme configuration utilisateur |
| Un cache hors de la copie (`~/.m2`, `~/.npm`) est un droit déclaré comme un autre, puisque le `HOME` vide ne le montre plus | Adapter | Bazel et Nix n'en montrent aucun ; Gemini CLI les propose par outil ; Copilot les ouvre avec « dev tool access » |
| Un refus se découvre dans le flux du journal du noyau (`log stream`, filtré sur l'arbre de processus du contrôle), jamais dans la sortie du contrôle | Adapter | Codex `--log-denials`, `sandbox-runtime` ; essai du 11 octobre ; contre-exemple Gemini CLI. Sous Linux, aucun projet lu ne voit les lectures refusées (`sandbox-runtime` ne voit que les écritures) : la découverte y reste à concevoir |
| La proposition montre au propriétaire le droit exact (chemin, opération, contrôle, cible) avant de l'accorder ; l'accord vaut pour ce contrôle et cette cible, en lecture seule si la lecture suffit | Adapter | `/sandbox policy <commande>` de Copilot, file d'approbation de `sbx` ; contre-exemple Gemini CLI, qui accorde lecture et écriture sur le parent, pour tous les projets |
| L'accord est redemandé quand le candidat change le descripteur de construction qu'il couvre | Adapter | Gemini CLI retire l'accord automatique dès que l'agent écrit `package.json` ou `pom.xml` ; `sbx env` redemande à chaque changement |
| Sans propriétaire, un droit nouveau reste refusé | Reprendre | Aider distingue « oui à tout » de « oui explicite » ; OpenShell gèle les propositions sous une politique globale |
| Relancer hors bac à sable un contrôle refusé, sur approbation | Écarter | Codex, Claude Code, Cursor et Unsloth le font : l'accord sort l'exécution du confinement au lieu d'élargir un droit |
| Refuser la lecture par défaut, comme MXC et Unsloth sous macOS | Écarter pour e40 | Plus sûr, mais chaque pile demande alors sa liste de lectures ; les deux besoins n'en dépendent pas, et la liste des secrets de 495 reste fermée |

### Besoin 2 — ce qui ne peut pas tourner confiné

| Choix | Décision | Fondement |
| --- | --- | --- |
| Savoir d'avance qu'un second bac ne s'appliquera pas, par une sonde : `sandbox-exec -p "(version 1) (allow default)" /usr/bin/true` sous le profil du contrôle | Reprendre | Bazel ; OpenShell et Unsloth sondent avant d'admettre ; contre-exemple MXC, qui ne vérifie que la présence du binaire |
| Une variable posée par 495 dans l'environnement du contrôle permet à un test de se reconnaître confiné ; elle sert à sauter avec motif, jamais à couper un confinement | Adapter | `CODEX_SANDBOX`, `CURSOR_SANDBOX`, `SANDBOX_RUNTIME=1`, `NIX_STORE` ; contre-exemple Gemini CLI, où `SANDBOX` posé par la CI coupe le bac |
| Un test sauté faute de pouvoir tourner confiné est une obligation non réglée, jamais un test passé | Reprendre | MXC change le code 77 en échec et refuse de tourner en root ; la CI de `sandbox-runtime` fait échouer une sonde ratée au lieu de sauter ; contre-exemple Codex, dont une assertion compte l'échec d'emboîtement comme un refus prouvé |
| Le contrôle déclare la capacité qu'il exige (« démarre un bac à sable », « a besoin de Docker ») ; seul un exécuteur qui l'annonce dans la configuration du propriétaire le prend | Reprendre | `mount_capable` et `no-sandbox` de Bazel, `requiredSystemFeatures` et `system-features` de Nix |
| L'environnement séparé est une VM, qui reçoit une copie de la révision figée, pas un montage de l'arbre de l'hôte, et que le noyau de 495 lance avec des montages qu'il fixe | Reprendre | Docker Sandboxes en mode clone, OpenShell (`upload`), SWE-agent ; `container` d'Apple avertit qu'ouvrir son service à un contrôle confiné lui permet de monter tout `$HOME` |
| Donner au code du candidat le démon Docker de l'hôte, ou le sortir du bac par une exclusion | Écarter | Claude Code (`excludedCommands`) et Cursor le font ; Gemini CLI, Unsloth et OpenHands l'interdisent au code de l'agent |
| Éteindre le bac intérieur sous le bac extérieur, comme Nix | Adapter | Admis pour qu'un test tourne, puisque le profil extérieur reste en vigueur ; mais ce test ne prouve plus rien du profil intérieur, et la preuve reste due ailleurs |

**Où juger ailleurs.** 495 a déjà un environnement séparé : `scripts/linux/test.sh` copie l'arbre git dans une VM
d'Apple `container` et y fait tourner toute la suite sous bubblewrap, sans privilège (`specs/adr/D-84`). Les tests de
pi-495 qui démarrent un bac à sable y trouvent un noyau Linux à eux ; ce qui ne s'y lit pas encore est le jugement du
contrôleur sur cette exécution, à la même révision. Pour Docker, trois voies ressortent des fiches, aucune essayée :

| Voie | Ce qu'elle apporte | Ce qu'elle coûte |
| --- | --- | --- |
| `container` d'Apple | Déjà en place, gratuite, VM par contrôle, lancée hors du Seatbelt de l'appelant | Apple Silicon et macOS 26 ; Docker dans la VM demande `iptables-legacy` ou un noyau construit ; un démarrage bloqué est ouvert sous macOS 27 (ticket #2275) |
| Docker Sandboxes (`sbx`) | Un démon Docker propre à chaque VM, conçu pour ce cas ; mode clone d'une révision | Compte Docker obligatoire, binaire fermé, transfert de l'agent SSH actif par défaut |
| Gondolin | Proche de Pi, ouvert, démarrage annoncé sous la seconde | QEMU ; image Alpine à construire (ni git, ni JDK, ni Docker) ; réseau limité à HTTP/1 et TLS |

### Ce que cela change au brouillon d'e40

- La story sur la configuration de l'hôte (`git` sans configuration globale) s'écrit avec un `HOME` vide propre au
  contrôle et les trois variables de git, et fait des caches des droits déclarés.
- La story sur les chemins garde sa forme — déclarés dans la configuration du contrôleur, créés par lui, refusés s'ils
  sont ou traversent un lien — et ajoute la protection de `.git/config` et `.git/hooks`.
- La story sur la découverte s'appuie sur `log stream` sous macOS. Sous Linux, aucun projet lu n'offre de source de
  refus que le candidat ne peut pas écrire ; la story doit le dire, et proposer au moins l'échec à la première
  exécution avec le chemin que le contrôleur a refusé de monter.
- La story sur les tests qui démarrent un bac à sable commence par la sonde de Bazel, et marque le saut comme une
  obligation.
- La story sur l'environnement séparé part de `scripts/linux/test.sh`, déjà en place, plutôt que d'une VM nouvelle.
  Le choix de la voie pour Docker revient au propriétaire.
- L'expérience d'une VM macOS qui qualifierait Seatbelt sans Seatbelt autour ne s'appuie sur aucun projet lu : aucun ne
  le fait. Elle reste une expérience, et peut attendre.
