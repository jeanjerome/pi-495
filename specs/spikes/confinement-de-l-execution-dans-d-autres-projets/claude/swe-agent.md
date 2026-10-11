### SWE-agent et SWE-ReX

Signée : Claude (Opus 5.5), le 11 octobre 2026.

Sources lues :
- [S1] github.com/SWE-agent/SWE-agent @ 3ea751c087f32b16e039a2233dd6eefecef325d5 (2026-07-16) — l'agent. Lus : `sweagent/environment/` (`swe_env.py`, `repo.py`), `sweagent/tools/tools.py`, `sweagent/run/run_shell.py`, `docs/config/environments.md`, `docs/installation/tips.md` et `.devcontainer/`.
- [S2] github.com/SWE-agent/SWE-ReX @ 5c995c365dfb1fd5bc56fda688be5d8538f9931f (2026-03-02) — la couche d'exécution que SWE-agent délègue. Lus : `src/swerex/deployment/` (`config.py`, `docker.py`, `local.py`, `modal.py`), `src/swerex/runtime/` (`local.py`, `remote.py`, `abstract.py`), `src/swerex/server.py`, `docs/usage.md`, `docs/architecture.md`, `tests/test_docker_deployment.py` et `.github/workflows/pytest.yaml`.
- [S3] https://github.com/SWE-agent/SWE-ReX/issues/253, lu le 2026-10-11 avec `gh issue view` — « Docker-in-Docker: DockerDeployment Fails in Containerized Environments ».
- [S4] https://modal.com/docs/guide/sandboxes, lu le 2026-10-11 — l'isolation des bacs à sable Modal, l'un des backends de SWE-ReX.
- [S5] CPython 3.14, `shutil.py`, dans l'installation Homebrew de cette machine (`/opt/homebrew/opt/python@3.14/.../lib/python3.14/shutil.py`), lu le 2026-10-11 — `_make_zipfile`, que SWE-ReX appelle pour téléverser un dépôt.

Non lu :
- Les déploiements Fargate et Daytona de [S2], au-delà de leur liste de fichiers.
- La documentation de `modal.Sandbox.create` sur les restrictions réseau (`block_network`, liste CIDR) : la page [S4] n'en parle pas.

1. **Ce qui est confiné.**
   - Tout ou rien, selon le « déploiement » choisi. Par défaut, SWE-agent démarre un conteneur Docker `python:3.11` [S1 `sweagent/environment/swe_env.py:27-30`]. Un serveur FastAPI (`swerex-remote`) y relaie les commandes, les sessions bash et les lectures/écritures de fichiers à un `LocalRuntime` [S2 `docs/architecture.md:15-21`].
   - Dans le conteneur, rien n'est sous-confiné. L'agent y est `root` : le dépôt copié reçoit `chown -R root:root` [S1 `sweagent/environment/repo.py:109-119`], et la session source `/root/.bashrc` [S1 `swe_env.py:184-189`].
   - Le déploiement `local` n'isole rien. La documentation l'écrit : « will run commands on your local machine _without_ any sandboxing, so don't `rm -rf /`! » [S2 `docs/usage.md:8-9`]. `LocalDeployment` se contente d'envelopper `LocalRuntime` [S2 `src/swerex/deployment/local.py:24-30`].
   - Le déploiement Modal confie l'isolation à Modal [S2 `src/swerex/deployment/modal.py:220-230`]. Selon [S4], gVisor convient « for most workloads », et un runtime VM donne à chaque bac à sable « its own kernel ».

2. **Droits.**
   - Il n'y a pas de modèle de droits. Le seul levier est `docker_args`, une liste d'arguments ajoutée telle quelle à `docker run` [S2 `src/swerex/deployment/config.py:30-31` ; `docker.py:251-263`]. Elle sert aux limites (`--memory=10g`) [S1 `docs/usage/competitive_runs.md:48`] comme aux montages : le mode shell monte le dépôt en écriture avec `-v <repo>:/repo` [S1 `sweagent/run/run_shell.py:126-133`].
   - Modal fonctionne de la même façon, avec `modal_sandbox_kwargs` transmis à `modal.Sandbox.create` [S2 `config.py:114-115`].
   - Un droit manquant ne se découvre pas : la source ne décrit ni refus journalisé ni mode apprentissage.
   - La « blocklist » de `ToolFilterConfig` (`vim`, `python` seul, `bash` seul, `su`, `make`…) vise l'interactivité, pas la sécurité : « Filter out commands that are blocked by the environment (for example interactive commands like `vim`) » [S1 `sweagent/tools/tools.py:29-72`].

3. **Refusé quoi qu'on déclare.**
   - SWE-agent refuse de copier un dépôt local dont l'arbre de travail est modifié : « Local git repository … is dirty. Please commit or stash changes » [S1 `repo.py:98-107`].
   - Le serveur du conteneur refuse toute requête sans le jeton tiré au démarrage [S2 `src/swerex/server.py:67-74`]. Ce jeton protège un port publié sans adresse de liaison, `-p <port>:8000`, donc sur toutes les interfaces de l'hôte [S2 `docker.py:255-256`].
   - Je n'ai trouvé dans les sources lues aucun autre refus portant sur les capacités, le réseau ou les chemins.

4. **Environnement de l'hôte.**
   - Pour un dépôt local, la séparation tient à la *copie* : le dépôt est zippé, téléversé et décompressé dans le conteneur [S1 `repo.py:109-112` ; S2 `src/swerex/runtime/remote.py:229-246`, `server.py:178-180`]. Le dépôt de l'hôte n'est pas monté. `~/.gitconfig`, `~/.ssh`, `~/.npm` et `~/.m2` ne sont pas transmis, et aucun code lu ne les monte. La source ne l'énonce pas comme garantie.
   - Les variables de l'hôte ne passent que si on les nomme dans `propagate_env_variables`. La source avertit : « The value of the environment variables can be read in debug log files, so be careful with your API keys! » [S1 `tools.py:86-92`, `:258-261`]. Les variables fixes (`PAGER=cat`, `GIT_PAGER=cat`…) sont exportées dans la session [S1 `tools.py:94-104`].
   - Contre-exemple pour les identifiants : pour un dépôt GitHub, `GITHUB_TOKEN` de l'hôte est écrit dans l'URL du remote, `git remote add origin https://<token>@…` [S1 `repo.py:153-161`, `:163-187`]. J'en déduis, sans l'avoir essayé, que le jeton reste lisible par l'agent dans `.git/config` du conteneur.
   - Liens symboliques : le zip est construit par `shutil.make_archive` [S2 `remote.py:233`]. Dans CPython 3.14, `_make_zipfile` parcourt l'arbre avec `os.walk` sans suivre les répertoires liés, mais teste chaque fichier avec `os.path.isfile` et l'écrit avec `zf.write`, qui suivent tous deux le lien [S5 `shutil.py:1101-1117`]. J'en déduis, sans l'avoir essayé, qu'un lien committé vers un fichier de l'hôte (`~/.ssh/id_ed25519`) serait copié *par son contenu* dans le conteneur. Sur une révision candidate, c'est une fuite.
   - En déploiement `local`, la session bash hérite de tout `os.environ` [S2 `src/swerex/runtime/local.py:159-164`], et `execute` passe `env=None` par défaut, donc l'environnement entier [S2 `src/swerex/runtime/abstract.py:168-169`, `local.py:425-431`].

5. **Tester sous confinement.**
   - Les tests de SWE-ReX démarrent de vrais conteneurs sur un runner GitHub `ubuntu-latest`, sans emboîtement [S2 `.github/workflows/pytest.yaml:25`, `:38-44`]. Les backends payants sont exclus par `-k "not cloud"` [S2 `pytest.yaml:55` ; `pyproject.toml:95-98`]. Les tests Podman « may be skipped » si Podman manque [S2 `tests/test_docker_deployment.py:65`, `:94`].
   - Le cas « SWE-ReX tourne lui-même dans un conteneur » est un défaut signalé, pas un cas testé. Depuis un conteneur, `127.0.0.1:<port publié>` n'atteint pas le conteneur frère [S3]. La correction est un réglage, `docker_internal_host` (par exemple `http://host.docker.internal`), « for docker-in-docker setups » [S2 `config.py:48-53`].
   - La source ne décrit aucune détection d'emboîtement.

6. **Frontière pour un bac à sable ou Docker.**
   - **Socket de l'hôte, pour SWE-agent lui-même.** Le devcontainer du projet monte `source=/var/run/docker.sock,target=/var/run/docker.sock` et active aussi la fonctionnalité `docker-in-docker:2` [S1 `.devcontainer/devcontainer.json:15-20`]. Quand SWE-agent tourne dans un conteneur, il pilote donc le démon de l'hôte, et ses conteneurs sont des frères, pas des enfants [S3]. La documentation de dépannage propose même `sudo chmod 666 /var/run/docker.sock` [S1 `docs/installation/tips.md:14-20`].
   - **Code de l'agent qui veut Docker.** La source ne prévoit rien : pas de `--privileged`, pas de socket, aucune installation de démon dans le code qui prépare l'image (`python:3.11` par défaut, plus un Python autonome) [S1 `swe_env.py:27-30` ; S2 `docker.py:251-263`]. Il reste à l'utilisateur d'ajouter `--privileged` ou `-v /var/run/docker.sock:…` dans `docker_args`, que rien ne filtre [S2 `config.py:30-31`, `:60-87`]. Le validateur ne touche qu'à `--platform`. C'est une déduction de la lecture, non essayée.
   - **VM.** Chez Modal, « Use the VM runtime to run Docker in a Sandbox » [S4]. C'est la seule voie documentée où le code de l'agent démarre Docker sans toucher au démon de l'hôte, et elle passe par `modal_sandbox_kwargs` [S2 `config.py:114-115`]. SWE-ReX ne l'expose pas autrement. Non essayé.

7. **Coût.**
   - Préparation : Docker ou Podman sur l'hôte [S2 `config.py:44-45`], ou un compte Modal ou AWS.
   - Démarrage : délai de 180 s par défaut [S2 `config.py:32-33`]. Le premier lancement construit une image qui compile un Python autonome, « This might take a while (but you only have to do it once) » [S2 `docker.py:196-201`]. La documentation montre un bac à sable Modal « created in 0.91s » [S2 `docs/usage.md:108`].
   - Entretien : une image par tâche, que l'on construit soi-même [S1 `docs/config/environments.md:1-33`].
   - Plateformes : Docker est pris en charge sous Linux et macOS. SWE-ReX annonce « non-Linux machines without Docker » via les backends distants [S2 `docs/index.md:24`].

**Pour 495.**
- *Reprendre (source)* : copier la révision dans l'environnement d'exécution au lieu de la monter [S1 `repo.py:109-119`]. L'hôte n'est alors jamais écrit par le candidat, et la question « quel chemin réel est inscriptible » ne se pose plus que dans la copie. *Déduction* : la copie doit refuser ou recréer tel quel un lien symbolique, pas le suivre. SWE-ReX le suit, et ce défaut [S5] reproduit à l'échelle du transfert celui de `test-output -> .`.
- *Reprendre (source)* : refuser un arbre de travail modifié avant de juger [S1 `repo.py:98-107`]. C'est une garantie bon marché que le jugement porte sur la révision nommée, utile au besoin 2.
- *Adapter (besoin 2)* : SWE-agent n'a pas de « juger ailleurs ». Son « ailleurs » est le déploiement entier, et le code de l'agent qui veut Docker n'y a aucune réponse. La seule voie documentée qui ne rend pas l'hôte est une VM chez un tiers [S4]. *Déduction* : pour Testcontainers, 495 doit viser une VM locale, à l'image de la piste Apple `container` déjà notée au projet, et non le socket.
- *Écarter* : `docker_args` comme surface de droits [S2 `config.py:30-31`]. Une liste libre, non validée et sans accord du propriétaire est l'inverse du besoin 1. Écarter aussi l'injection d'un jeton dans l'URL git [S1 `repo.py:153-161`] : c'est précisément le chemin par lequel la configuration ou les secrets de l'hôte atteignent le code candidat.
