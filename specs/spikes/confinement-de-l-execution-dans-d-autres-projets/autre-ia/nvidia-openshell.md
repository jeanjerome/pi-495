# NVIDIA OpenShell

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [README.md:23-39](https://github.com/NVIDIA/OpenShell/blob/eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3/README.md#L23-L39) — `NVIDIA/OpenShell @ eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3` (2026-10-10T01:12:03Z) — objectifs et prérequis
- [S2] [docs/about/architecture.mdx:13-110](https://github.com/NVIDIA/OpenShell/blob/eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3/docs/about/architecture.mdx#L13-L110) — `NVIDIA/OpenShell @ eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3` (2026-10-10T01:12:03Z) — contrôleur, superviseur et frontières des runtimes
- [S3] [docs/how-it-works/policies/default-policy.mdx:17-109](https://github.com/NVIDIA/OpenShell/blob/eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3/docs/how-it-works/policies/default-policy.mdx#L17-L109) — `NVIDIA/OpenShell @ eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3` (2026-10-10T01:12:03Z) — défauts, chemins implicites et protection interne
- [S4] [docs/how-it-works/policies/schema.mdx:20-94](https://github.com/NVIDIA/OpenShell/blob/eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3/docs/how-it-works/policies/schema.mdx#L20-L94) — `NVIDIA/OpenShell @ eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3` (2026-10-10T01:12:03Z) — schéma, Landlock, identité
- [S5] [docs/how-it-works/policies/advisor.mdx:11-74](https://github.com/NVIDIA/OpenShell/blob/eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3/docs/how-it-works/policies/advisor.mdx#L11-L74) — `NVIDIA/OpenShell @ eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3` (2026-10-10T01:12:03Z) — propositions à partir de refus réseau
- [S6] [crates/openshell-sandbox/src/linux/landlock.rs:70-132](https://github.com/NVIDIA/OpenShell/blob/eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3/crates/openshell-sandbox/src/linux/landlock.rs#L70-L132) — `NVIDIA/OpenShell @ eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3` (2026-10-10T01:12:03Z) — ouverture des racines de confiance sans suivre les liens
- [S7] [crates/openshell-sandbox/src/child_env.rs:6-21](https://github.com/NVIDIA/OpenShell/blob/eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3/crates/openshell-sandbox/src/child_env.rs#L6-L21) — `NVIDIA/OpenShell @ eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3` (2026-10-10T01:12:03Z) — variables de confiance TLS

Non lu : audit complet des drivers, du vérificateur formel, du filtrage syscall et des tests de sécurité, non réalisé. La promesse générale de vérification du README n'est pas traitée comme une preuve indépendante de sûreté.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** La charge de travail est distincte du superviseur de confiance et du plan de contrôle. Fichiers et appels système utilisent des protections noyau ; le réseau passe par la décision du superviseur. Les drivers décrits diffèrent : séparation en conteneurs, pods ou micro-VM avec canal vsock et sans carte réseau invitée. Cela confine les descendants du workload, pas les services de contrôle eux-mêmes. [S2]

2. **Droits.** Politique structurée de fichiers, processus et réseau. Les champs fichiers/processus prennent effet au démarrage ; le réseau peut évoluer en cours d'exécution. [S4] L'advisor, désactivé par défaut, produit une proposition après un refus réseau. Il ne modifie pas seul la politique par défaut ; une autorisation humaine est attendue, avec mode automatique optionnel sous conditions. La requête déjà refusée reste refusée ; il faut réessayer après accord. L'advisor ne change pas les droits fichiers ou l'identité. [S5]

3. **Refusé quoi qu'on déclare.** Le schéma rejette `/` en écriture, les chemins relatifs ou avec `..` et une identité root. Le socle requiert Landlock ABI 3 et protège `/.openshell`. [S3, S4] Mais `compatibility=best_effort` peut continuer sans les règles fichiers de l'utilisateur si elles ne peuvent être appliquées, avec alerte grave ; `hard_requirement` refuse. Les deux modes ignorent individuellement certains chemins absents ou impossibles à ouvrir. Cette nuance empêche de lire « politique fournie » comme « toutes les règles appliquées ». [S4]

4. **Environnement de l'hôte.** Le superviseur et les mécanismes de credentials séparent certaines valeurs de l'agent. Le défaut monte des racines nécessaires, le travail et des temporaires ; des permissions implicites dépendent aussi du réseau/providers. [S2, S3] Le code d'environnement lu configure notamment la CA TLS, y compris `GIT_SSL_CAINFO` ; il ne neutralise pas à lui seul Git global. Une politique générale pour `~/.npm`/`~/.m2` : la source ne le dit pas. [S7] L'ouverture des entrées racines de confiance utilise `O_NOFOLLOW`, des descripteurs et une comparaison inode/périphérique/type avant/après ; cette protection précise ne prouve pas toutes les résolutions de chemins utilisateur. [S6]

5. **Tester sous confinement.** Le socle requiert une capacité Landlock effective et distingue refus de démarrage et fonctionnement dégradé. [S3, S4] Une stratégie de tests sous Seatbelt ou de bubblewrap imbriqué : la source ne le dit pas. Les tests du runtime ne sont pas ici exécutés.

6. **Frontière pour un bac à sable ou Docker.** Le choix du driver change la frontière extérieure ; la micro-VM est une séparation différente des seuls filtres du workload. [S2] Les sources retenues ne garantissent pas que le workload non-root puisse démarrer un daemon Docker compatible Testcontainers. L'existence d'un driver Docker ne prouve pas Docker-dans-Docker.

7. **Coût.** Dans le périmètre : Linux, macOS Apple Silicon, avec moteur de conteneurs ou virtualisation hôte selon le driver. CLI, gateway, superviseur, image et politiques sont à maintenir. Les règles imposent aussi les capacités noyau de l'invité. Aucun temps de démarrage comparable n'est donné dans ces passages. [S1, S2, S4]

**Pour 495.** Déductions :

- Reprendre un plan de contrôle inaccessible au candidat et la proposition après refus, suivie d'une nouvelle exécution. [S2, S5]
- Choisir l'équivalent de `hard_requirement` et exiger que chaque règle attendue soit effectivement appliquée. [S4]
- Reprendre la validation par descripteurs et l'autorité d'une liste de racines de confiance, en adaptant son périmètre exact. [S6]
