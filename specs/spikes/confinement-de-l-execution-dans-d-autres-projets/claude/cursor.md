### Cursor

Signée : Claude (Opus 5.5), le 11 octobre 2026.

Cursor confine par deux chemins : (a) en local, dans l'éditeur et le CLI, un bac à sable pour les **commandes de terminal** de l'agent, réglé par `sandbox.json` et combiné aux « Run Modes » ; (b) les « Cloud Agents » (anciennement Background Agents), qui tournent chacun dans une microVM dédiée. Le code est fermé : aucun dépôt public de Cursor/Anysphere ne contient le bac à sable.

Sources lues :
- [S1] https://cursor.com/docs/reference/sandbox.md (lu le 2026-10-11) — référence de `sandbox.json`, fusion des politiques, chemins protégés.
- [S2] https://cursor.com/docs/agent/security/run-modes.md (lu le 2026-10-11) — Run Modes, Auto-review, bac à sable par plateforme, variables injectées, liste réseau par défaut.
- [S3] https://cursor.com/docs/agent/tools/terminal.md (lu le 2026-10-11) — renvoi au bac à sable, variable `CURSOR_AGENT`.
- [S4] https://cursor.com/blog/agent-sandboxing (lu le 2026-10-11) — « Implementing a secure sandbox for local agents », billet d'ingénierie de Cursor, 18 février 2026, Ani Betts, Yash Gaitonde & Alex Haugland.
- [S5] Changelog officiel : https://cursor.com/changelog/2-0 (29 oct. 2025), /2-3 (22 déc. 2025), /2-4 (22 janv. 2026), /2-5 (17 févr. 2026) (lus le 2026-10-11).
- [S6] https://cursor.com/docs/cli/reference/configuration.md (lu le 2026-10-11) — clés `sandbox.*` du CLI.
- [S7] https://cursor.com/docs/cloud-agent.md, https://cursor.com/docs/cloud-agent/setup.md, https://cursor.com/docs/cloud-agent/security.md, https://cursor.com/docs/cloud-agent/security-network.md, https://cursor.com/docs/cloud-agent/self-hosted.md (lus le 2026-10-11) — Cloud Agents : VM, environnement, Docker, secrets, réseau.
- [S8] `gh api orgs/{cursor,anysphere}/repos` (lu le 2026-10-11) — liste des dépôts publics : aucun ne porte sur le bac à sable.

Les références « l. » de [S1]-[S3], [S6] et [S7] renvoient aux lignes du Markdown servi le 2026-10-11 par `cursor.com/<page>.md`. Celles de [S4] et [S5] renvoient aux sections de la page.

Non lu :
- Le code du bac à sable : il fait partie de l'application et du CLI fermés, et aucun dépôt public ne le contient [S8]. Ce qui ne se lit que dans ces binaires est non lu : profil Seatbelt complet, montage overlay et Landlock, repli bubblewrap, traitement des liens, environnement transmis, détection d'un refus.
- Les réponses du forum `forum.cursor.com`, y compris celles du personnel : ce ne sont ni de la documentation ni des billets d'ingénierie, donc écartées par la consigne.
- Les pages https://cursor.com/docs/cli/reference/permissions.md et https://cursor.com/docs/cloud-agent/builds.md ont été téléchargées mais seulement parcourues ; rien n'en est cité.
- Rien n'a été essayé : aucune exécution de Cursor.

1. **Ce qui est confiné.**
   - Local : seules les commandes shell entrent dans le bac à sable. MCP et Fetch passent par la liste d'autorisation ou par le classifieur d'Auto-review, hors bac à sable. Les appels de la liste d'autorisation tournent eux aussi **hors** du bac à sable [S2 l.11-27]. Les éditions de fichiers relèvent d'approbations (« External-File Protection », « File-Deletion Protection ») et non du bac à sable [S2 l.357-365] [S5 2.4]. Le profil Seatbelt couvre « l'arbre complet des sous-processus » [S2 l.170-172] [S4 §macOS].
   - Mécanismes : macOS, Seatbelt via `sandbox-exec`, avec un profil généré à chaque exécution à partir des réglages de l'espace, de l'administration et du `.cursorignore` [S4 §macOS]. Linux, Landlock (fichiers) et seccomp (appels système) employés directement, avec un repli bubblewrap signalé par `CURSOR_SANDBOX_LANDLOCK_STATUS=bubblewrap` [S2 l.179-188, 221] [S4 §Linux]. Windows, le bac à sable Linux dans WSL2 [S4 §Windows].
   - Le classifieur d'Auto-review « n'est pas une frontière de sécurité » [S2 l.33-35]. En mode « Run Everything », rien n'est confiné [S2 l.15].
   - Cloud : une microVM Firecracker par agent, dans un compte AWS séparé, et toutes les commandes y tournent sans approbation [S7 security l.34-40] [S7 security-network l.62] [S2 l.381-383].

2. **Droits.**
   - Déclaration : `sandbox.json` dans `~/.cursor/` (utilisateur) et `<espace>/.cursor/` (dépôt). Les deux fichiers fusionnent, **le fichier du dépôt prioritaire**, et les listes `additionalReadwritePaths` / `additionalReadonlyPaths` sont **unies** entre toutes les sources. La documentation invite à committer le fichier du dépôt « quand le projet doit partager les mêmes règles » [S1 l.5-14, 55-72] [S2 l.104-109]. Les autres champs sont `type` (`workspace_readwrite` | `workspace_readonly` | `insecure_none`), `readBoundary` (`system` | `workspace`), `additionalReadPaths`, `disableTmpWrite`, `enableSharedBuildCache` et `networkPolicy` (`default`, `allow`, `deny`, avec domaines, jokers et CIDR) [S1 l.16-53]. Le CLI a ses propres clés (`sandbox.mode`, `sandbox.networkAccess`, `sandbox.readBoundary`), que `sandbox.json` remplace [S6 l.49-51] [S2 l.157].
   - Ordre de priorité : `per-user < per-repo < team-admin < hardcoded`. Un `deny` réseau l'emporte toujours, `default: "deny"` l'emporte sur `"allow"`, les booléens restrictifs l'emportent [S1 l.55-72].
   - Découverte d'un droit manquant : le résultat de l'outil Shell nomme « explicitly » la contrainte du bac à sable responsable de l'échec et, dans certains cas, recommande d'élever les droits. Avant ce changement, l'agent relançait sans fin la même commande [S4 §Teaching agents]. En Auto-review, une commande confinée qui échoue sur une restriction peut être relancée hors bac à sable, après revue par le classifieur [S2 l.25]. Avec `readBoundary: "workspace"`, une lecture hors de l'espace affiche une carte d'approbation qui donne le chemin complet [S2 l.126-132].
   - Octroi : l'utilisateur (fichier, réglages, approbation au cas par cas) ou l'administrateur d'équipe (tableau de bord) [S2 l.367-371]. Le classifieur peut aussi accorder une exécution hors bac à sable [S2 l.19-31].

3. **Refusé quoi qu'on déclare.**
   - Chemins toujours protégés en écriture : `.cursor/*.json`, `.cursor/**/*.json`, `.cursor/.workspace-trusted`, `.claude/*.json`, `.vscode/**`, `.code-workspace`, `.git/hooks/**`, `.git/config`, `.git/info/attributes`, `.cursorignore` [S1 l.74-85]. Le billet montre les règles Seatbelt correspondantes, écrites en `(deny file-write* (regex …))` [S4 §macOS].
   - Réseau : les adresses privées RFC 1918, `127.x`, `169.254.169.254` et les adresses IPv6 privées sont bloquées par défaut [S1 l.48-53]. La source ne dit pas si `allow` peut les rouvrir.
   - Aucune liste de lecture jamais ouverte : avec `readBoundary: "system"`, qui est le défaut, **`~/.ssh` est toujours lisible**. Avec `"workspace"`, seul `~/.ssh/known_hosts` reste lisible [S1 l.87].
   - Un noyau Linux sans Landlock v3 ni espaces de noms utilisateur ne fait pas refuser l'exécution : Cursor « falls back to asking for approval », et la commande tourne alors sans bac à sable [S2 l.183-188].

4. **Environnement de l'hôte.**
   - Les variables `CURSOR_SANDBOX` (`seatbelt` ou `native`), `CURSOR_ORIG_UID`, `CURSOR_ORIG_GID` et `CURSOR_SANDBOX_LANDLOCK_STATUS` sont injectées dans chaque processus confiné [S2 l.212-221]. Sous Linux, le processus voit l'UID 0 dans son espace de noms utilisateur [S2 l.223-229]. Que le reste de l'environnement de l'hôte soit hérité ou filtré, la source ne le dit pas.
   - git : depuis la 2.4, « Git writes are now allowed in sandboxes » [S5 2.4]. `.git/config` et `.git/hooks` restent protégés en écriture [S1 l.82]. Sur `~/.gitconfig`, la source ne le dit pas explicitement. Avec `readBoundary: "system"`, la lecture hors de l'espace n'est pas restreinte [S2 l.121-124] : j'en déduis, sans l'avoir essayé, que `~/.gitconfig` y est lisible.
   - Caches : `enableSharedBuildCache` redirige les caches npm, cargo, pip… vers un répertoire temporaire partagé entre commandes confinées et non confinées [S1 l.28]. Depuis la 2.5, `git clone`, `npm install` et `pip install` « work out of the box », avec des défauts propres à chaque projet [S5 2.5]. `/tmp` et le temporaire du système sont inscriptibles, sauf `disableTmpWrite` [S2 l.96]. Avec `readBoundary: "workspace"`, le projet reçoit un temporaire privé [S2 l.130].
   - Cloud : les secrets sont injectés comme variables d'environnement. Le type « Runtime Secret » est masqué dans les sorties d'outil, le transcript et les commits. Le type « Build Secret » n'existe que pendant la construction Docker [S7 security-network l.12-39]. Les hooks utilisateur de `~/.cursor` n'existent pas dans la VM [S7 cloud-agent l.81].

5. **Tester sous confinement.**
   - Détection : `CURSOR_SANDBOX` signale au code qu'il tourne confiné [S2 l.218]. `CURSOR_AGENT` signale qu'il tourne sous Cursor [S3 l.17-18]. La documentation recommande ces variables pour adapter les scripts, par exemple l'UID passé à Docker [S2 l.231-242].
   - Emboîtement : aucune source lue n'en parle, ni sous Seatbelt ni sous Landlock. Le billet écarte les conteneurs et les VM sous macOS : les conteneurs se limitent aux binaires Linux, et les VM ont une latence et une mémoire « inacceptables » [S4 §macOS].
   - Mesure de Cursor sur ses agents : son banc interne Cursor Bench, et un déploiement progressif en production [S4 §Teaching agents]. La source ne décrit aucun test du bac à sable lui-même.

6. **Frontière pour un bac à sable ou Docker.**
   - Local : la documentation fait passer Docker par le démon de l'hôte. Son exemple « Full-stack » accorde `additionalReadwritePaths: ["/home/me/.docker"]` « for container operations » et ouvre `*.docker.io` [S1 l.124-161]. La liste réseau par défaut contient `docker.io` et `*.docker.com` [S2 l.254-283]. Sous Linux, la documentation montre `docker run --user "${CURSOR_ORIG_UID}…" -v "$PWD:/work"` [S2 l.231-242]. J'en déduis, sans l'avoir essayé, qu'une commande confinée qui atteint le socket Docker pilote un démon non confiné : le bac à sable ne protège plus l'hôte pour ce qui passe par Docker.
   - Cloud : la frontière est la microVM [S7 security l.36-40]. Docker y tourne « inside another container layer », ce qui demande `fuse-overlayfs`, `iptables-legacy` et un `sudo service docker start` au démarrage [S7 setup l.303-311, 172]. L'environnement se décrit par `.cursor/environment.json` dans le dépôt, prioritaire sur les environnements enregistrés [S7 setup l.42-50]. Le réseau se règle par l'utilisateur, l'environnement ou l'équipe, et l'équipe peut le verrouiller [S7 security-network l.107-165].
   - « Self-Hosted Machines » : les appels d'outils tournent sur une machine du client, avec son propre réseau, et `.cursor/environment.json` n'y est jamais lu [S7 self-hosted l.3, 73] [S7 setup l.52].

7. **Coût.**
   - Plateformes locales : macOS avec Cursor ≥ 2.0, sans préparation. Linux ≥ 6.2 avec Landlock v3 et espaces de noms utilisateur non privilégiés, plus un profil AppArmor à installer pour le CLI et les environnements distants. Windows passe par WSL2 [S2 l.168-210] [S4 §Windows].
   - Démarrage : sous Linux, « Finding and remounting these files is the slowest part », c'est-à-dire la recopie des fichiers ignorés sous Landlock dans un overlay. Aucun chiffre n'est donné [S4 §Linux].
   - Effet mesuré par Cursor : « Sandboxed agents stop 40% less often than unsandboxed ones », et un tiers des requêtes tournent sous bac à sable sur les plateformes prises en charge [S4, introduction et §Teaching agents].
   - Entretien : une liste réseau par défaut d'environ 100 domaines [S2 l.254-355]. Plusieurs corrections successives au changelog [S5 2.3, 2.4, 2.5].
   - Cloud : facturé au prix de l'API du modèle. VM aux ressources limitées par défaut. Instantanés conservés 90 jours d'inactivité [S7 cloud-agent l.112-114] [S7 setup l.105-109] [S7 security-network l.73].

**Pour 495.**
- *Écarter (besoin 1).* La source dit que le `sandbox.json` du dépôt prime sur celui de l'utilisateur et que les chemins accordés s'unissent [S1 l.9-14, 66]. C'est exactement le droit élargi par ce que le candidat écrit, que 495 doit refuser. Seules les politiques d'équipe et les règles codées en dur ne peuvent pas être affaiblies. Le contraste avec Copilot CLI, qui ignore toute configuration de bac à sable venue du dépôt, est net.
- *Reprendre.* La source dit qu'une liste de chemins reste protégée en écriture quoi qu'on déclare : `.git/config`, `.git/hooks/**`, `.vscode/**`, les fichiers de configuration de l'agent [S1 l.74-85]. J'en déduis que 495 pourrait refuser l'écriture du candidat sur `.git/config`, `.git/hooks` et ses propres fichiers de réglage dans la copie. Cette défense est indépendante des `writable_paths`.
- *Reprendre (découverte).* La source dit que faire nommer à l'outil la contrainte qui a causé l'échec a supprimé les relances aveugles et réduit les arrêts [S4]. J'en déduis que 495, quand un contrôle échoue sous confinement, gagnerait à rapporter le droit refusé (chemin, réseau) plutôt que la seule sortie. Ce rapport est la matière de la proposition faite au propriétaire. Le mécanisme exact de Cursor est non lu.
- *Reprendre (besoin 2).* La source dit que Cursor injecte `CURSOR_SANDBOX` dans tout processus confiné [S2 l.218]. J'en déduis qu'une variable posée par 495 dans l'environnement d'un contrôle permettrait aux tests qui démarrent un bac à sable de se reconnaître. Ils seraient alors marqués « à juger ailleurs » plutôt qu'échouer sur `sandbox_apply`. Comme dans le cloud de Cursor, Docker relève d'une VM, pas du bac à sable local [S7].
- *Écarter.* Sous un noyau Linux insuffisant, Cursor repasse à l'approbation puis exécute sans confinement [S2 l.188]. 495 refuse dans ce cas (`capability_missing`), et doit continuer.
