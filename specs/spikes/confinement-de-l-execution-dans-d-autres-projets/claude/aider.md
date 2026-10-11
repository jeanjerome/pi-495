### Aider

Signée : Claude (Opus 5.5), le 11 octobre 2026.

Sources lues :
- [S1] github.com/Aider-AI/aider @ 5dc9490bb35f9729ef2c95d00a19ccd30c26339c (2026-05-22) — le code. Lus : `aider/run_cmd.py`, `aider/linter.py`, `aider/commands.py` (`cmd_run`, `cmd_test`), `aider/coders/base_coder.py` (commandes shell, lint et test automatiques, `allowed_to_edit`), `aider/io.py` (`confirm_ask`), `aider/args.py`, `aider/main.py` (fichiers de configuration et `.env`), `aider/repo.py` et `docker/Dockerfile`.
- [S2] La documentation du site, versionnée dans le même dépôt au même commit, sous `aider/website/docs/` : `install/docker.md`, `usage/lint-test.md`, `config/aider_conf.md`, `config/dotenv.md`, `config/options.md`.
- [S3] Le banc de mesure du même dépôt, au même commit : `benchmark/README.md`, `benchmark/docker.sh`, `benchmark/benchmark.py`.

Non lu : la page en ligne aider.chat, que j'ai lue dans sa source versionnée [S2] plutôt que publiée. Rien d'autre n'est resté non lu sur les questions posées.

1. **Ce qui est confiné.**
   - Rien, dans l'usage normal. Toutes les commandes passent par `run_cmd` : `/run`, `/test`, `--test-cmd` en `--auto-test`, les commandes shell que le modèle propose et `--lint-cmd`. `run_cmd` lance `subprocess.Popen(command, shell=True, cwd=…)` sans `env`, ou, sur un terminal, `pexpect.spawn($SHELL, ["-i", "-c", command])` [S1 `aider/run_cmd.py:11-16`, `:46-73`, `:107-116` ; `aider/linter.py:47-57` ; `aider/commands.py:1013-1017` ; `aider/coders/base_coder.py:2475`]. Le shell est interactif (`-i`), donc il charge les fichiers de démarrage de l'utilisateur. Ce dernier point est une déduction, non essayée.
   - Les éditions de fichiers ne sont pas confinées non plus. Elles passent par une confirmation (point 2).
   - Le seul confinement est le conteneur que l'utilisateur choisit de lancer : l'image `paulgauthier/aider` avec `--volume $(pwd):/app` [S2 `install/docker.md:20-25`]. La documentation n'en fait pas un argument de sécurité, mais une limite : « When you use the in-chat `/run` command, it will be running shell commands *inside the docker container*… which may make it tricky to `/run` tests » [S2 `install/docker.md:54-56`].
   - Le banc de mesure est le seul endroit où le conteneur est présenté comme protection : « the benchmarking harness will be taking code written by an LLM and executing it without any human review… Running inside a docker container helps limit the damage » [S3 `benchmark/README.md:22-27`].

2. **Droits.**
   - Il n'y a pas de droits, seulement des confirmations par action.
   - Une commande shell proposée par le modèle exige un « yes » explicite (`explicit_yes_required=True`), avec l'option « Don't ask again » [S1 `base_coder.py:2450-2463`].
   - Éditer un fichier absent de la discussion demande une confirmation. En créer un aussi [S1 `base_coder.py:2191-2240`, en particulier `:2207` et `:2226`]. Un fichier ignoré par git est sauté [S1 `base_coder.py:2202-2204`]. Le chemin est résolu avec `Path.resolve()`, qui suit les liens [S1 `aider/utils.py:96-102`]. La fonction `allowed_to_edit` lue ne vérifie pas que le chemin résolu reste sous la racine du dépôt.
   - Les commandes de test et de lint, une fois configurées, tournent sans confirmation après chaque édition : `if edited and self.auto_test: … cmd_test(self.test_cmd)` [S1 `base_coder.py:1599-1601`, `:1616-1617`].
   - Ces commandes se déclarent dans `.aider.conf.yml` ou `.env`. Ces fichiers sont cherchés dans le répertoire personnel, à la racine du dépôt git et dans le répertoire courant ; « Files loaded last will take priority » [S2 `config/aider_conf.md:10-16`, `config/dotenv.md:14-21` ; S1 `aider/main.py:464-476`, `:494`]. Le `.env` est chargé avec `override=True` dans `os.environ` [S1 `main.py:379-381`]. J'en déduis, sans l'avoir essayé, qu'un dépôt peut fixer lui-même sa `test-cmd`, sa `lint-cmd` et des variables d'environnement, et que ce réglage l'emporte sur celui du répertoire personnel.
   - Un droit manquant ne se découvre pas : il n'existe aucun refus à interpréter.

3. **Refusé quoi qu'on déclare.**
   - Une seule règle tient même sous `--yes-always` : les commandes shell proposées par le modèle ne s'exécutent pas. `if self.yes is True: res = "n" if explicit_yes_required else "y"` [S1 `aider/io.py:866-867` ; `aider/args.py:760-764`]. Cette règle ne touche ni `--test-cmd` ni `--lint-cmd`.
   - Le banc de mesure refuse de tourner sans `AIDER_DOCKER` dans l'environnement : « Warning: benchmarking runs unvetted code from GPT, run in a docker container » [S3 `benchmark/benchmark.py:252-254`]. C'est une déclaration, pas une détection : la variable est posée par `benchmark/docker.sh` [S3 `benchmark/docker.sh:16`].

4. **Environnement de l'hôte.**
   - Hors conteneur, l'hôte n'est pas tenu à l'écart. Les commandes héritent de tout l'environnement, y compris le `.env` chargé [S1 `run_cmd.py:62-73` ; `main.py:379-381`]. git lit la configuration globale ; Aider ne modifie que le nom de l'auteur et du committer, via `GIT_AUTHOR_NAME` et `GIT_COMMITTER_NAME` [S1 `aider/repo.py:292-307`].
   - Les hooks git sont contournés par défaut : `--git-commit-verify` vaut `False`, donc les commits portent `--no-verify` [S1 `args.py:492-496` ; `repo.py:278-279`].
   - Dans l'image Docker, l'utilisateur est `appuser` (UID 1000), et `HOME=/app`, c'est-à-dire le répertoire du projet monté. Ainsi, « caches, version checks, etc get stored in the host filesystem » [S1 `docker/Dockerfile:9`, `:29-32`, `:54`]. git y est rendu tolérant par `git config --system --add safe.directory /app` [S1 `docker/Dockerfile:26-27`]. La documentation prévient que « the docker container won't have your global git config » et demande de fixer `user.email` et `user.name` dans le dépôt [S2 `install/docker.md:42-51`]. L'isolement de la configuration git y est donc un effet de bord du conteneur, pas une conception. Les clés d'API passent en clair sur la ligne de commande (`--openai-api-key $OPENAI_API_KEY`) [S2 `install/docker.md:24`].

5. **Tester sous confinement.** Sans objet : Aider n'a pas de confinement à tester. La suite `tests/` [S1] ne contient aucun test qui démarre un conteneur ou un bac à sable. Je l'ai vérifié par recherche de `docker` et de `AIDER_DOCKER` dans `tests/basic/`. Le seul garde-fou est le marqueur déclaratif `AIDER_DOCKER` du banc [S3 `benchmark.py:252`].

6. **Frontière pour un bac à sable ou Docker.**
   - Aider ne traite pas le cas. Un code testé qui doit démarrer Docker tourne sur l'hôte avec le démon de l'utilisateur, puisque rien n'est confiné (point 1).
   - Dans l'image officielle, aucun démon ni client Docker n'est installé : les paquets ajoutés sont `build-essential git libportaudio2 pandoc` [S1 `docker/Dockerfile:4-6`]. Le socket n'est pas monté dans la commande documentée [S2 `install/docker.md:24`, `:31`]. Un `--test-cmd` qui lance Testcontainers dans ce conteneur échouerait donc, faute de client et de démon. C'est une déduction, non essayée.
   - Le banc de mesure ne monte pas non plus le socket et ne passe pas `--privileged`. Il limite la mémoire (`--memory=12g --memory-swap=12g`) et ouvre l'accès à l'hôte par `--add-host=host.docker.internal:host-gateway` [S3 `benchmark/docker.sh:3-19`]. Le dépôt entier y est monté en écriture (`-v $(pwd):/aider`).

7. **Coût.**
   - Pas de préparation : c'est un paquet Python.
   - Avec Docker : deux images, `aider` et `aider-full`. La seconde embarque Playwright et Chromium [S1 `docker/Dockerfile:35-80` ; S2 `install/docker.md:8-18`]. Les extras de l'image légère « will need to be reinstalled the next time you launch the aider core container » [S2 `install/docker.md:13-18`].
   - Plateformes : partout où Python tourne. `run_cmd` traite Windows à part, en détectant PowerShell [S1 `run_cmd.py:26-39`, `:50-54`].

**Pour 495.**
- *Écarter (source)* : laisser le dépôt fixer ses propres commandes et son environnement [S1 `main.py:464-494`, `:379-381`]. Chez Aider, un `.aider.conf.yml` ou un `.env` committé l'emporte sur la configuration de l'utilisateur. C'est exactement le « droit élargi par ce que le candidat écrit » que le besoin 1 interdit. *Déduction* : 495 doit lire les droits d'un contrôle depuis un emplacement que la révision candidate ne peut pas modifier, ou les figer à l'accord du propriétaire.
- *Reprendre, en le durcissant (source)* : la distinction entre « oui à tout » et « oui explicite » [S1 `io.py:866-867`]. Un mode non interactif ne doit jamais valoir accord pour la catégorie la plus risquée. Pour 495, *déduction* : en exécution sans propriétaire, un droit nouveau proposé à la première exécution reste refusé, et ne s'accorde jamais par défaut.
- *Retenir comme mise en garde (source)* : dans l'image, `HOME=/app` pointe vers le projet monté [S1 `Dockerfile:29-32`]. Les caches et la configuration écrits par les outils atterrissent alors dans l'arbre de travail. *Déduction* : un `HOME` séparé de la copie évaluée est nécessaire, sinon les écritures de cache (`~/.npm`, `~/.m2`) deviennent des écritures dans la révision.
- *Écarter* : le marqueur déclaratif `AIDER_DOCKER` [S3 `benchmark.py:252-254`]. Il ne détecte rien et se contourne en posant la variable. Pour savoir si l'on tourne déjà confiné, 495 doit sonder le système, par exemple en tentant d'appliquer un profil, plutôt que croire une variable.
