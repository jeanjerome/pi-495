# Le confinement de l'exécution dans d'autres projets

Statut : ouverte
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

## Ce que 495 a au départ

| Mécanisme | Où |
| --- | --- |
| Un contrôle déclaré par le projet porte `writable_paths` ; une technologie calcule les siens (Maven : les `target/` du réacteur) ; le contrôle de tests détecté est borné par `suite_paths` | `src/contracts/v1/config.ts`, `src/adapters/stacks/` |
| Toute lecture est permise sauf `~/.ssh`, `~/.aws`, `~/.gnupg` et l'authentification de Pi | `src/adapters/sandbox/backends.ts` |
| Écriture permise dans le répertoire temporaire ; réseau `denied`, `loopback` ou `allowed` | idem |
| L'environnement d'un contrôle passe par une liste blanche ; git y lit la configuration globale de l'hôte | `src/adapters/execution/runner.ts` |
| Un test qui échoue sans assertion est distingué d'un échec d'assertion (« proves nothing ») | le noyau, préparation |
| Un backend non qualifié n'exécute rien hors bac à sable : il refuse avec `capability_missing` | `CLAUDE.md`, règles du projet |
| Une VM Linux ARM64 (Apple container) où bubblewrap tourne sans privilège sert à la qualification Linux | banc `~/.495-campagnes/scripts/e28s16-vm.sh` |

## Les projets à lire

La liste n’est pas fermée ; chacune des deux IA peut en ajouter, en disant pourquoi. La colonne « Pourquoi » reprend une première lecture faite le 11 octobre par une autre IA : rien n’y est encore vérifié.

| Projet | Pourquoi |
| --- | --- |
| Unsloth Studio — `unsloth.ai/docs/new/studio/sandboxing-in-unsloth` | Proposé par le propriétaire |
| Codex (OpenAI) | Seatbelt, bubblewrap, Landlock ; saute ses tests de bac à sable sous son propre bac à sable |
| Claude Code et `sandbox-runtime` (Anthropic) | Seatbelt et bubblewrap pour les commandes ; le refus de réappliquer un profil y est signalé |
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

## Fiches

_À remplir, une section par projet, selon les sept questions._

## Ce que 495 reprend, adapte ou écarte

_À écrire en dernier, avec la raison de chaque choix. C'est de là que part `e40`._
