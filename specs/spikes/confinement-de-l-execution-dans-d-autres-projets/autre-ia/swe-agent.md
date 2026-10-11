# SWE-agent et SWE-ReX

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [sweagent/environment/swe_env.py:24-43](https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/sweagent/environment/swe_env.py#L24-L43) — `SWE-agent/SWE-agent @ 3ea751c087f32b16e039a2233dd6eefecef325d5` (2026-07-16T11:21:18-04:00) — déploiement par défaut et environnement
- [S2] [src/swerex/deployment/config.py:23-58](https://github.com/SWE-agent/SWE-ReX/blob/5c995c365dfb1fd5bc56fda688be5d8538f9931f/src/swerex/deployment/config.py#L23-L58) — `SWE-agent/SWE-ReX @ 5c995c365dfb1fd5bc56fda688be5d8538f9931f` (2026-03-02T17:43:36-05:00) — contrat Docker/Podman
- [S3] [src/swerex/deployment/docker.py:233-283](https://github.com/SWE-agent/SWE-ReX/blob/5c995c365dfb1fd5bc56fda688be5d8538f9931f/src/swerex/deployment/docker.py#L233-L283) — `SWE-agent/SWE-ReX @ 5c995c365dfb1fd5bc56fda688be5d8538f9931f` (2026-03-02T17:43:36-05:00) — lancement et connexion au runtime
- [S4] [src/swerex/deployment/local.py:17-60](https://github.com/SWE-agent/SWE-ReX/blob/5c995c365dfb1fd5bc56fda688be5d8538f9931f/src/swerex/deployment/local.py#L17-L60) — `SWE-agent/SWE-ReX @ 5c995c365dfb1fd5bc56fda688be5d8538f9931f` (2026-03-02T17:43:36-05:00) — déploiement local sans conteneur
- [S5] [tests/test_docker_deployment.py:8-28](https://github.com/SWE-agent/SWE-ReX/blob/5c995c365dfb1fd5bc56fda688be5d8538f9931f/tests/test_docker_deployment.py#L8-L28) — `SWE-agent/SWE-ReX @ 5c995c365dfb1fd5bc56fda688be5d8538f9931f` (2026-03-02T17:43:36-05:00) — tests de démarrage/arrêt

Non lu : audit complet du serveur distant, de ses commandes et de tous les déploiements cloud, non réalisé. Les mécanismes de déploiement sont lus ; ils ne constituent pas une preuve exhaustive de sécurité de l'agent.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** SWE-agent utilise un déploiement SWE-ReX, Docker par défaut dans la configuration lue. Le runtime distant exécute les commandes ; le contrôleur demeure dehors. `LocalDeployment` utilise directement un runtime local et n'offre pas cette frontière de conteneur. [S1, S3, S4]

2. **Droits.** Image, moteur Docker/Podman et `docker_args` sont des paramètres du déploiement. Leur propriétaire est l'intégrateur qui configure le lancement. La source ne décrit pas une approbation interactive de chaque permission OS ni un mode d'apprentissage à partir des refus. [S2, S3]

3. **Refusé quoi qu'on déclare.** Pas de liste de chemins toujours fermés établie par ces sources. Les arguments Docker personnalisables peuvent modifier fortement la frontière. Il ne faut donc pas assimiler « s'exécute avec Docker » à une politique restrictive non dérogeable. [S2, S3 ; dernière phrase : déduction]

4. **Environnement de l'hôte.** Le lancement désigne une image et un serveur, un port et un jeton d'authentification généré. Il ne monte pas le domicile par défaut dans la commande lue ; des arguments additionnels peuvent introduire des montages. [S3] **Déduction :** Git et les caches sont ceux de l'image ou des volumes explicitement exposés, pas nécessairement ceux de l'hôte. Une neutralisation explicite de `~/.gitconfig`, de npm ou de Maven : la source ne le dit pas. [S2, S3]

5. **Tester sous confinement.** Le test Docker construit un déploiement, vérifie qu'il n'est pas disponible avant `start`, puis sa disponibilité et son arrêt ; un second teste l'installation d'un Python autonome. Ce sont des tests réels de déploiement dans le code, non exécutés ici. Ils ne démontrent pas l'emboîtement Seatbelt/bubblewrap. [S5]

6. **Frontière pour un bac à sable ou Docker.** Le contrôleur utilise le moteur Docker pour créer le runtime. Rien dans les passages lus ne garantit un daemon privé supplémentaire à l'intérieur du runtime ni une VM extérieure protégeant le moteur. `LocalDeployment` supprime la frontière de conteneur. [S2-S4]

7. **Coût.** Image à récupérer/préparer, moteur disponible, serveur distant à lancer et attendre. Le timeout de démarrage de 180 secondes est une limite, pas une latence mesurée. Docker et Podman sont configurables ; le runtime cible des images Linux. [S2, S3]

**Pour 495.** Déductions :

- Reprendre la séparation contrôleur/runtime et un contrat de déploiement explicite. [S1-S3]
- Écarter les arguments Docker libres venant du candidat et le repli local. [S2-S4]
- Ajouter aux tests de disponibilité les tests de refus et l'identification de la révision jugée. [S5]
