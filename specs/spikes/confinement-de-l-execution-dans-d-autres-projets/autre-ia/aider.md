# Aider

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [aider/run_cmd.py:11-73](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/run_cmd.py#L11-L73) — `Aider-AI/aider @ 5dc9490bb35f9729ef2c95d00a19ccd30c26339c` (2026-05-22T07:02:20-07:00) — exécution pexpect/subprocess
- [S2] [aider/coders/base_coder.py:2434-2485](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L2434-L2485) — `Aider-AI/aider @ 5dc9490bb35f9729ef2c95d00a19ccd30c26339c` (2026-05-22T07:02:20-07:00) — confirmation des commandes proposées
- [S3] [aider/website/docs/install/docker.md:6-56](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/website/docs/install/docker.md#L6-L56) — `Aider-AI/aider @ 5dc9490bb35f9729ef2c95d00a19ccd30c26339c` (2026-05-22T07:02:20-07:00) — images Docker, montages et Git

Non lu : ensemble des outils, intégrations éditeur et tests, non audité. L'absence de sandbox constatée ici porte sur le chemin d'exécution local lu, pas sur tout enveloppement externe possible.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** Le chemin local lance les commandes par pexpect ou `subprocess.Popen`, sans wrapper OS de confinement dans ces fonctions. La confirmation des commandes proposées est un contrôle d'usage. Aider peut aussi être exécuté entièrement dans l'image Docker documentée. [S1-S3]

2. **Droits.** L'utilisateur confirme les commandes proposées. Pour Docker, il choisit les montages et variables de lancement. Aucun langage de droits fichiers/réseau ni apprentissage de refus OS n'est établi par ces passages. [S2, S3]

3. **Refusé quoi qu'on déclare.** Aucune liste de chemins non dérogeable dans le lanceur local lu. Les capacités du conteneur dépendent de son lancement. [S1, S3]

4. **Environnement de l'hôte.** `Popen` ne reçoit pas un environnement nettoyé dans le chemin lu : il hérite de celui du processus. [S1] La documentation Docker indique explicitement que la configuration Git globale de l'hôte n'est pas disponible dans le conteneur et propose une identité Git locale. Son exemple monte le projet dans `/app`, transmet la clé API et utilise l'UID/GID du développeur. Pas de politique dédiée npm/Maven dans ces passages. [S3]

5. **Tester sous confinement.** La source ne le dit pas : pas de mécanisme d'emboîtement ni de détection de tests sautés établi par ces lectures.

6. **Frontière pour un bac à sable ou Docker.** Aider local n'apporte pas de frontière OS supplémentaire. Le lancement Docker apporte celle du conteneur configuré ; aucune VM ou daemon Docker intérieur privé n'est garanti. [S1, S3]

7. **Coût.** Le lancement local évite la préparation d'un sandbox mais n'en fournit pas les garanties. Docker demande image, moteur, montages et configuration Git. Plusieurs images couvrent différents ensembles de dépendances. Aucun temps de démarrage n'est donné dans la page lue. [S1, S3]

**Pour 495.** Déductions :

- Reprendre l'explicitation du Git intérieur : identité et configuration de test dédiées. [S3]
- Écarter une confirmation de commande comme substitut au confinement, même si l'utilisateur a accepté son exécution. [S1, S2]
