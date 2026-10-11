# OpenHands

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [openhands-workspace/openhands/workspace/docker/workspace.py:53-127](https://github.com/OpenHands/software-agent-sdk/blob/4cc058275c5a08d845bd846576aafc80e5dd7d0d/openhands-workspace/openhands/workspace/docker/workspace.py#L53-L127) — `OpenHands/software-agent-sdk @ 4cc058275c5a08d845bd846576aafc80e5dd7d0d` (2026-10-11T02:20:14Z) — contrat DockerWorkspace
- [S2] [openhands-workspace/openhands/workspace/docker/workspace.py:171-250](https://github.com/OpenHands/software-agent-sdk/blob/4cc058275c5a08d845bd846576aafc80e5dd7d0d/openhands-workspace/openhands/workspace/docker/workspace.py#L171-L250) — `OpenHands/software-agent-sdk @ 4cc058275c5a08d845bd846576aafc80e5dd7d0d` (2026-10-11T02:20:14Z) — création du conteneur
- [S3] [openhands-sdk/openhands/sdk/workspace/local.py:17-80](https://github.com/OpenHands/software-agent-sdk/blob/4cc058275c5a08d845bd846576aafc80e5dd7d0d/openhands-sdk/openhands/sdk/workspace/local.py#L17-L80) — `OpenHands/software-agent-sdk @ 4cc058275c5a08d845bd846576aafc80e5dd7d0d` (2026-10-11T02:20:14Z) — exécution locale
- [S4] [openhands-sdk/openhands/sdk/security/confirmation_policy.py:9-61](https://github.com/OpenHands/software-agent-sdk/blob/4cc058275c5a08d845bd846576aafc80e5dd7d0d/openhands-sdk/openhands/sdk/security/confirmation_policy.py#L9-L61) — `OpenHands/software-agent-sdk @ 4cc058275c5a08d845bd846576aafc80e5dd7d0d` (2026-10-11T02:20:14Z) — confirmation selon le risque
- [S5] [openhands-agent-server/openhands/agent_server/docker_runtime/provisioning.py:48-78](https://github.com/OpenHands/software-agent-sdk/blob/4cc058275c5a08d845bd846576aafc80e5dd7d0d/openhands-agent-server/openhands/agent_server/docker_runtime/provisioning.py#L48-L78) — `OpenHands/software-agent-sdk @ 4cc058275c5a08d845bd846576aafc80e5dd7d0d` (2026-10-11T02:20:14Z) — répertoires de contrôle et liens
- [S6] [openhands-agent-server/openhands/agent_server/docker_runtime/mediation.py:13-26](https://github.com/OpenHands/software-agent-sdk/blob/4cc058275c5a08d845bd846576aafc80e5dd7d0d/openhands-agent-server/openhands/agent_server/docker_runtime/mediation.py#L13-L26) — `OpenHands/software-agent-sdk @ 4cc058275c5a08d845bd846576aafc80e5dd7d0d` (2026-10-11T02:20:14Z) — matérialisation de secrets

Non lu : orchestration hébergée et totalité des drivers, non auditées. Le dépôt OpenHands/OpenHands a été repéré à `2d174175cedeac45a0bd7c776728464d7c1140a7` (2026-10-11T07:00:05+02:00), mais la frontière étudiée est celle du SDK ci-dessus, où réside ce code d'exécution.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** `DockerWorkspace` place le serveur d'exécution dans un conteneur ; les opérations qui lui sont déléguées s'y déroulent. L'orchestrateur appelant n'est pas inclus par cette seule classe. `LocalWorkspace` exécute directement sur l'hôte. [S1-S3]

2. **Droits.** Le développeur qui instancie le workspace choisit image, volumes, réseau, environnement et éventuellement GPU. Les politiques `AlwaysConfirm`, `NeverConfirm` et `ConfirmRisky` gouvernent la confirmation des actions ; elles ne remplacent pas les paramètres Docker. La découverte d'un droit de montage manquant par apprentissage : la source ne le dit pas. [S1, S2, S4]

3. **Refusé quoi qu'on déclare.** La source ne présente pas de liste de chemins hôte absolument interdits au constructeur du workspace. Les volumes par défaut sont vides. Le provisionnement du runtime vérifie certains répertoires de contrôle et rejette des liens ; ne pas généraliser cette vérification spécifique à tous les volumes utilisateur. [S1, S5]

4. **Environnement de l'hôte.** La classe définit une petite liste de variables à transmettre (`DEBUG`, `SESSION_API_KEY`, `OH_SESSION_API_KEYS_0`) plutôt que tout l'environnement ; des variables et volumes peuvent être ajoutés explicitement. Le port API est publié sur `127.0.0.1`. [S1, S2] Le chemin de médiation lu peut matérialiser des secrets dans le runtime : ce n'est pas une garantie générale de credentials toujours extérieurs. [S6] Git global et caches npm/Maven privés : la source ne le dit pas. **Déduction :** sans montage du domicile, sa configuration personnelle ne se retrouve pas automatiquement dans le conteneur ; l'image et les variables restent à contrôler. [S1, S2]

5. **Tester sous confinement.** Le démarrage vérifie la disponibilité du moteur et attend la santé du serveur. Cela vérifie sa disponibilité, pas les refus d'accès. [S2] Une suite validant l'emboîtement Seatbelt/bubblewrap depuis le workspace : non lue ; la source retenue ne le dit pas.

6. **Frontière pour un bac à sable ou Docker.** La commande de création ne monte pas un socket Docker par défaut ; un volume explicite peut changer ce contrat. Le worker distant peut éviter l'exécution locale, mais la classe ne fournit pas une VM ni un daemon Docker intérieur privé. [S1, S2]

7. **Coût.** Moteur Docker accessible, image de serveur à préparer ou télécharger, démarrage et attente de santé. Le délai par défaut de 120 secondes est une limite d'attente, pas une mesure de latence. Le code vise une image Linux, avec plateforme configurable. [S1, S2]

**Pour 495.** Déductions :

- Reprendre le contrat explicite de workspace distant et l'environnement transmis de manière limitée. [S1, S2]
- Ne pas traiter confirmation du risque ou succès d'un health check comme qualification du confinement. [S2, S4]
- Séparer les paramètres de volumes du candidat ; ne pas lui exposer le socket Docker de l'hôte. [S1, S2]
