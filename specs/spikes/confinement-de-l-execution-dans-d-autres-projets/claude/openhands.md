### OpenHands

Signée : Claude (Opus 5.5), le 11 octobre 2026.

Sources lues :
- [S1] github.com/OpenHands/OpenHands @ 2d174175cedeac45a0bd7c776728464d7c1140a7 (2026-10-11) — le dépôt historique, cloné sous son ancienne adresse `All-Hands-AI/OpenHands`, qui redirige. Il ne contient plus que l'interface « Agent Canvas » : `README.md`, `docs/architecture.md`, `docs/SELF_HOSTING.md`.
- [S2] github.com/OpenHands/software-agent-sdk @ 4cc058275c5a08d845bd846576aafc80e5dd7d0d (2026-10-11) — le SDK, le serveur d'agent (`openhands-agent-server`), les outils (`openhands-tools`) et les backends d'exécution (`openhands-workspace` : Docker, Apptainer, API distante, Kubernetes agent-sandbox, cloud).
- [S3] https://docs.openhands.dev/openhands/usage/runtimes/docker, lu le 2026-10-11 — page « Docker Sandbox ».
- [S4] https://docs.openhands.dev/openhands/usage/run-openhands/local-setup, lu le 2026-10-11 — page « Setup », commande `docker run` de l'application.
- [S5] https://github.com/nestybox/sysbox (README), lu le 2026-10-11 — le runtime `sysbox-runc` que [S2] choisit par défaut pour le backend distant.

Non lu :
- L'ancien code « V0 » (`openhands/runtime/impl/{docker,local,remote,kubernetes}` et son serveur d'action). Il a quitté la branche principale de [S1]. Le serveur d'agent de [S2] remplit désormais ce rôle.
- Le service qui sert `runtime_api_url` (OpenHands Cloud). Il est propriétaire ; [S2] n'en contient que le client.
- `cloud/workspace.py` (1012 lignes), sauf par recherche de mots-clés.
- La documentation d'Apptainer sur `--compat`.

1. **Ce qui est confiné.** L'unité de confinement est un conteneur entier. Il fait tourner le serveur d'agent, un serveur REST que le client pilote à distance [S2 `openhands-workspace/openhands/workspace/docker/workspace.py:53-68`]. Dans ce conteneur, le terminal, l'éditeur de fichiers, grep, glob, les hooks et VS Code tournent sans sous-confinement propre. Ils héritent seulement d'un environnement assaini [S2 `openhands-tools/openhands/tools/terminal/env.py:32-39`, `openhands-sdk/openhands/sdk/hooks/executor.py:480`]. Le confinement dépend du mode de lancement :
   - En mode local, rien n'est confiné : « the agent will have full access to your filesystem » [S1 `README.md:66`, `README.md:127`] ; « runs directly on the host with full access to the machine's filesystem, environment, and network » [S1 `docs/SELF_HOSTING.md:172-175`].
   - Avec `OH_CONVERSATION_RUNTIME=docker`, chaque conversation a son conteneur [S1 `README.md:117-122`]. Canvas et le service d'automatisation restent sur l'hôte : « it does not move the entire Canvas or automation service into a sandbox » [S1 `README.md:122`].
   - Canvas déclare ne pas fournir l'isolation : « Agent Canvas is not responsible for: … Providing the sandbox or workspace isolation layer » [S1 `docs/architecture.md:14-17`].

2. **Droits.**
   - Aucun droit ne se déclare par chemin. On déclare des montages de volumes, librement : `volumes: list[str]` est passé tel quel en `-v` [S2 `docker/workspace.py:97-100`, `:214-216`]. Le backend Apptainer fait de même avec `extra_bind_mounts` [S2 `apptainer/workspace.py:86-91`, `:271-278`]. Côté documentation : `SANDBOX_VOLUMES=$PWD:/workspace:rw`, et « Anything mounted read-write into /workspace can be modified by the agent » [S3].
   - Le runtime par conversation fixe ses montages lui-même. Il y en a trois : l'espace de travail, l'état de la conversation et un répertoire de persistance, montés sous `/workspace` et `/var/openhands/...` [S2 `openhands-agent-server/openhands/agent_server/docker_runtime/registry.py:447-452`].
   - En Kubernetes, le réseau sortant se règle par une `NetworkPolicy` dans le `SandboxTemplate`, pas en Python [S2 `agent_sandbox/README.md:76-82`]. La politique gérée par défaut « allows public egress but blocks private ranges » [S2 `agent_sandbox/deploy/sandboxtemplate.yaml:14-15`].
   - Un droit manquant ne se découvre pas à partir d'un refus. La source ne décrit ni journal de refus ni mode apprentissage.
   - Ce qui s'accorde au fil de l'eau, c'est l'action, pas le droit. Un analyseur de risque classe chaque action. Une `ConfirmationPolicy` (`AlwaysConfirm`, `NeverConfirm`, `ConfirmRisky` avec un seuil `HIGH` par défaut et `confirm_unknown=True`) décide s'il faut demander à l'utilisateur [S2 `openhands-sdk/openhands/sdk/security/confirmation_policy.py:27-61`].

3. **Refusé quoi qu'on déclare.**
   - Le runtime par conversation lance toujours le conteneur avec `--user <uid>:<gid>`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--ulimit core=0` et un port publié sur `127.0.0.1` seulement. S'il constate une autre adresse de publication, il refuse de continuer [S2 `docker_runtime/registry.py:462-502`].
   - Il refuse de monter une racine ou un espace de travail qui est un lien symbolique : « Runtime mount must not follow a symlink », « Conversation workspace must be a real directory » [S2 `docker_runtime/provisioning.py:59-60`, `:71-78`, `:146-156` ; `registry.py:194-196`].
   - Trois règles déterministes classent en risque `HIGH` : fetch-to-exec (`curl … | bash`), raw-disk-op et catastrophic-delete [S2 `openhands-sdk/openhands/sdk/security/defense_in_depth/policy_rails.py:1-13`, `:36-38`]. C'est un classement de risque soumis à la politique de confirmation. Ce n'est pas un refus. Sous `NeverConfirm`, l'action passe [S2 `confirmation_policy.py:35-40`].
   - Le backend `DockerWorkspace` du SDK n'impose ni `--cap-drop` ni utilisateur. Il ajoute seulement `--rm`, `--ulimit nofile`, le port en loopback et `--platform` [S2 `docker/workspace.py:218-252`].

4. **Environnement de l'hôte.**
   - `sanitized_env()` copie tout `os.environ` puis retire une courte liste noire : `SESSION_API_KEY`, `OH_SECRET_KEY` et les variables préfixées `OH_SESSION_API_KEYS_` [S2 `openhands-sdk/openhands/sdk/utils/command.py:16-30`, `:51-67`]. C'est une liste noire, pas une liste blanche.
   - Vers le conteneur, `DockerWorkspace` ne transmet que `forward_env`, par défaut `DEBUG`, `SESSION_API_KEY` et `OH_SESSION_API_KEYS_0` [S2 `docker/workspace.py:89-96`, `:210-212`].
   - Le runtime par conversation transmet une liste fixe de neuf variables, dont `HOME=/var/openhands/.openhands`, un répertoire de persistance propre à la conversation [S2 `docker_runtime/registry.py:411-446`].
   - J'en déduis, sans l'avoir essayé, que `~/.gitconfig`, `~/.ssh`, `~/.npm` et `~/.m2` de l'hôte n'entrent pas dans le conteneur, puisqu'ils ne sont ni montés ni dans `HOME`. La source ne le dit pas en ces termes.
   - Pour les agents tiers (Claude Code, Gemini), la source relève un effet de bord. Déplacer `HOME` pour isoler Gemini « also relocates the home dir seen by anything the CLI subprocess itself spawns (`git`, `npm`, … `~/.gitconfig`, `~/.npmrc`, the npm cache) » [S2 `openhands-sdk/openhands/sdk/agent/acp_agent.py:2609-2617`].
   - Le cache de paquets d'une conversation est un état jetable. À l'arrêt d'une conversation, ses `~/.cache` et `~/.npm` sont supprimés [S2 `tests/agent_server/docker_runtime/STORAGE_SCENARIO.md:20-29`].

5. **Tester sous confinement.**
   - Consigne du dépôt : « Prefer patching command executors instead of requiring real Docker in unit tests » [S2 `openhands-workspace/openhands/workspace/AGENTS.md:23-26`].
   - Les scénarios contre un vrai démon portent le marqueur `docker_live`. Ce marqueur est désélectionné par défaut (`addopts … not docker_live`) [S2 `pyproject.toml:103`, `:108`]. Les tests se sautent quand `docker info` échoue ou que l'image manque [S2 `tests/agent_server/docker_runtime/test_storage_scenario.py:27`, `:80-93`].
   - La source ne décrit aucune détection d'emboîtement ni aucun test de confinement exécuté depuis un conteneur déjà confiné.

6. **Frontière pour un bac à sable ou Docker.** OpenHands traite le cas de trois façons, selon le niveau :
   - **Application → bac à sable : le socket de l'hôte est monté.** La commande d'installation officielle de l'application monte `-v /var/run/docker.sock:/var/run/docker.sock` [S4]. Sous macOS, elle demande d'activer « Allow the default Docker socket to be used » [S4]. Le processus qui crée les bacs à sable détient donc l'équivalent du démon Docker de l'hôte. La frontière protège l'hôte contre l'agent, mais pas contre l'application.
   - **Le code de l'agent veut Docker : DinD dans l'image, rendu possible par sysbox côté distant.** L'image du serveur d'agent installe par défaut Docker Engine, containerd et Compose (`INSTALL_CAPABILITIES=vscode,browser,docker`). Elle donne aussi à l'utilisateur `sudo` sans mot de passe [S2 `openhands-agent-server/openhands/agent_server/docker/Dockerfile:28`, `:400-401`, `:483-512`]. Le backend distant demande par défaut `runtime_class="sysbox-runc"` [S2 `remote_api/workspace.py:61-63`]. Un commentaire du Dockerfile cite « DinD/sysbox/seccomp » parmi les contextes visés [S2 `Dockerfile:109`]. Sysbox se présente comme « enabling Docker-in-Docker … without insecure privileged containers », avec un espace de noms utilisateur où « root user in the container has zero privileges on the host » [S5].
   - **Le code de l'agent veut Docker en local.** Le runtime par conversation lance le conteneur avec `--cap-drop ALL` et `no-new-privileges` [S2 `registry.py:469-472`]. J'en déduis, sans l'avoir essayé, que `sudo` et `dockerd` ne peuvent pas y démarrer : `no-new-privileges` neutralise le setuid de `sudo`, et `dockerd` a besoin de capacités retirées. Un code qui doit démarrer Docker n'y tourne donc pas. La source n'aborde pas ce cas. `DockerWorkspace` ne passe ni `--privileged` ni le socket, mais `volumes` accepte n'importe quel montage. Rien n'empêche l'utilisateur d'y monter `/var/run/docker.sock` [S2 `docker/workspace.py:97-100`]. Pour les serveurs MCP du catalogue, Canvas a contourné le besoin plutôt que de l'accorder : le binaire GitHub est préinstallé, ce qui « avoids a Docker-in-Docker requirement » [S1 `.agents/skills/frontend-development/references/guide.md:158`].
   - **Kubernetes : la VM légère, au choix de l'infrastructure.** `runtimeClassName: gvisor` est fourni commenté, « uncomment for strong isolation of untrusted code ». gVisor ou Kata se choisissent sur le `SandboxTemplate`, « an infrastructure choice rather than a Python one » [S2 `agent_sandbox/deploy/sandboxtemplate.yaml:46` ; `agent_sandbox/workspace.py:15-17`].

7. **Coût.**
   - Préparation : Docker Desktop sous macOS et Windows (WSL 2), Docker Engine sous Linux [S1 `README.md:84-87`, `:111`, `:122`]. Apptainer pour les grappes HPC sans root [S2 `apptainer/README.md:3-12`]. Une grappe Kubernetes avec le contrôleur agent-sandbox [S2 `agent_sandbox/README.md:24-35`].
   - Démarrage : un délai de santé de 120 s par défaut [S2 `docker/workspace.py:123-127` ; `agent_server/config.py:390`]. Le pool chaud Kubernetes est annoncé « sub-second », contre « a container cold-start per conversation » [S2 `agent_sandbox/README.md:6-7`].
   - Ressources par conversation : 4 Go, 2 CPU et 512 PID par défaut [S2 `agent_server/config.py:387-389`].
   - Plateforme d'image par défaut : `linux/amd64` [S2 `docker/workspace.py:104-106`]. J'en déduis une émulation sur un Mac ARM. Non essayé.
   - Entretien : une image lourde (VS Code, Chromium, Docker Engine). Elle se construit sur un instantané Debian daté, avec trois jours d'observation [S2 `Dockerfile:31-38`].

**Pour 495.**
- *Reprendre (source)* : refuser un point de montage ou une racine d'écriture qui est un lien symbolique, et vérifier que le chemin résolu reste l'enfant direct de la racine [S2 `provisioning.py:71-78`]. C'est la réponse directe au lien committé `test-output -> .`. Côté 495, il faudrait l'appliquer à chaque `writable_path` avant de générer le profil, pas seulement à la racine.
- *Reprendre (source)* : un `HOME` propre à l'exécution, monté depuis un répertoire de persistance, plutôt que celui de l'hôte [S2 `registry.py:414`]. *Déduction* : cela isolerait la configuration git de l'hôte, cause de l'échec de signature, sans liste de fichiers à masquer. Il faudrait alors fournir à git une identité minimale.
- *Adapter (besoin 2)* : OpenHands ne juge pas ailleurs ce qui ne peut pas tourner confiné. Il déplace tout le travail dans une frontière plus forte, sysbox, gVisor ou Kata, choisie par l'infrastructure. Pour 495, la leçon *déduite* est qu'un test qui démarre Docker demande une VM ou un runtime de type sysbox. Monter le socket de l'hôte serait rendre l'hôte, et OpenHands ne le fait que pour son propre processus d'orchestration [S4], jamais pour le code de l'agent.
- *Écarter* : la classification de risque avec confirmation [S2 `confirmation_policy.py`, `policy_rails.py`]. Elle porte sur l'action proposée par un LLM, pas sur les droits d'un contrôle, et une politique `NeverConfirm` l'annule.
- *Écarter* : `sanitized_env()` par liste noire [S2 `command.py:16-30`]. La liste blanche de 495 est plus stricte. OpenHands n'est plus strict que là où il remplace tout l'environnement (runtime par conversation, liste fixe de neuf variables).
