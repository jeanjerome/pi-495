# Claude Code

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [https://code.claude.com/docs/en/sandbox-environments](https://code.claude.com/docs/en/sandbox-environments) — lu le 11 octobre 2026 — comparaison, section « Choose a sandbox environment » comprise
- [S2] [https://code.claude.com/docs/en/sandboxing](https://code.claude.com/docs/en/sandboxing) — lu le 11 octobre 2026 — sandbox de commandes

Non lu : code interne de Claude Code, non disponible dans les sources ouvertes examinées ; runtime étudié séparément. La documentation produit n'est pas assimilée au HEAD du runtime.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** Commandes shell et descendants, dont Bash et Monitor. Read/Edit/Write, outils web, hooks et MCP restent hors de cette frontière. Enfermer le processus complet dans le runtime, un conteneur ou une VM change cette portée. [S1, S2]

2. **Droits.** `/sandbox` expose la configuration ; paramètres de chemins et domaines, décision selon le mode de permissions. Une relance non confinée est possible ; `allowUnsandboxedCommands=false` la ferme. [S2]

3. **Refusé quoi qu'on déclare.** La comparaison distingue restrictions internes et administrées. Elle ne promet pas une liste universelle couvrant aussi les outils hors sandbox. [S1]

4. **Environnement de l'hôte.** Lectures très larges et environnement hérité par défaut ; masquage des credentials et filtrage configurables. Git hermétique par défaut : la source ne le dit pas. [S2]

5. **Tester sous confinement.** Commandes témoins et dépannage de bubblewrap en conteneur sont documentés. Aucune preuve d'emboîtement de profils Seatbelt différents n'est donnée. [S2]

6. **Frontière pour un bac à sable ou Docker.** « Choose a sandbox environment » distingue le dépôt non fiable, justifiant VM/cloud, du sandbox shell local. Conteneur de développement et conteneur personnalisé ont leurs propres frontières. [S1]

7. **Coût.** Seatbelt sur macOS ; bubblewrap et socat sur Linux. `failIfUnavailable=true` évite l'exécution sans sandbox lorsque le backend manque. Latence : la source ne le dit pas. [S2]

**Pour 495.** Déductions :

- Reprendre le choix explicite de frontière selon le travail. [S1]
- Écarter la relance sur l'hôte ; imposer indisponibilité bloquante et worker extérieur qualifié. [S2]
