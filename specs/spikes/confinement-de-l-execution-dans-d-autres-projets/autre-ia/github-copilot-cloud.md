# GitHub Copilot — agent cloud

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [https://docs.github.com/en/copilot/responsible-use/agents](https://docs.github.com/en/copilot/responsible-use/agents) — lu le 11 octobre 2026 — environnement éphémère, permissions et secrets
- [S2] [https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-the-firewall](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-the-firewall) — lu le 11 octobre 2026 — portée et limites du pare-feu
- [S3] [https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment](https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment) — lu le 11 octobre 2026 — setup, runners et services

Non lu : implémentation de l'agent et de l'appliance cloud, propriétaire et non publiée dans les sources examinées ; configuration réelle d'un runner client, non consultée.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** Environnement de développement éphémère fourni par GitHub Actions. Le pare-feu s'applique aux processus lancés par Bash, pas directement aux MCP ni aux étapes de préparation. Cette limite doit être distinguée de la séparation de l'environnement de travail. [S1-S3]

2. **Droits.** Propriétaires d'organisation et administrateurs de dépôt configurent le réseau, sous contraintes d'organisation. Un refus réseau apparaît dans la PR ou un commentaire, avec adresse et commande. Le fichier `copilot-setup-steps.yml` prépare les outils et services. [S2, S3]

3. **Refusé quoi qu'on déclare.** L'agent dispose de permissions limitées au dépôt et à sa branche de travail ; les secrets ordinaires Actions ne lui sont pas automatiquement accessibles. Les workflows de ses PR nécessitent une approbation humaine autorisée. Ce sont des restrictions du service, pas une liste de chemins locaux. [S1]

4. **Environnement de l'hôte.** Les secrets et variables de l'environnement `copilot` sont un canal explicite. Le poste du développeur n'est pas le système de fichiers du runner. L'isolation détaillée de Git global et des caches npm/Maven dépendant de l'image ou du setup : la source ne le dit pas. [S1, S3]

5. **Tester sous confinement.** Le setup est un workflow testable ; la source n'explique pas comment la suite du produit teste un confinement déjà actif. macOS n'est pas un runner pris en charge pour cet agent cloud dans la page lue. [S3]

6. **Frontière pour un bac à sable ou Docker.** Le setup accepte notamment des services et le choix du runner. Les runners auto-hébergés changent le modèle : le pare-feu intégré doit y être désactivé, car incompatible. [S3] Le pare-feu lui-même annonce des possibilités de contournement et n'est pas présenté comme une isolation complète. [S2] Un daemon Docker privé protégé par une VM dédiée n'est pas garanti par ces seules pages.

7. **Coût.** Préparation des dépendances et des runners, entretien du setup ; pas de latence garantie dans les passages lus. Un runner extérieur demande sa propre politique réseau et d'isolation. [S2, S3]

**Pour 495.** Déductions :

- Reprendre la séparation du travail local et de l'évaluation extérieure, avec rattachement à un commit. [S1, S3]
- Reprendre le relevé précis des refus réseau. [S2]
- Écarter l'idée qu'un runner auto-hébergé ou un pare-feu produit suffit, à lui seul, à protéger l'hôte. [S2, S3]
