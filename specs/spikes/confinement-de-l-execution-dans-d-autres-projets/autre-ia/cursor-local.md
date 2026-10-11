# Cursor — agent local

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [https://cursor.com/docs/reference/sandbox](https://cursor.com/docs/reference/sandbox) — lu le 11 octobre 2026 — référence des politiques et chemins protégés
- [S2] [https://cursor.com/docs/agent/security/run-modes](https://cursor.com/docs/agent/security/run-modes) — lu le 11 octobre 2026 — modes d’exécution et revue des commandes

Non lu : implémentation du produit propriétaire, non publiée dans les sources examinées ; tests internes et résolution des courses de chemins, non accessibles. Les descriptions ci-dessous sont documentaires.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** Le mode local enveloppe les commandes shell. Le contrôle des appels MCP ou Fetch relève d'autres mécanismes, notamment du classificateur ; il ne faut pas lui attribuer la même frontière OS. Une commande peut être réessayée hors sandbox selon le mode et sa revue. [S2]

2. **Droits.** `sandbox.json` peut être défini par l'utilisateur et le projet ; contraintes d'équipe et protections internes limitent les ouvertures. Les modes de revue déterminent qui accepte une exécution. Ce n'est pas une approbation humaine obligatoire de chaque droit. [S1, S2]

3. **Refusé quoi qu'on déclare.** La référence protège notamment les JSON de `.cursor` et `.claude`, `.cursor/.workspace-trusted`, `.vscode/**`, les fichiers `.code-workspace`, `.git/hooks/**`, `.git/config`, `.git/info/attributes` et `.cursorignore`. Certaines autres ressources Cursor restent modifiables. Cette protection est celle du sandbox actif, pas de la relance extérieure. [S1, S2]

4. **Environnement de l'hôte.** La frontière de lecture peut être système ou workspace. Des caches de compilation partagés sont optionnels. Une isolation générale de Git, des variables et de `~/.m2` : la source ne le dit pas. [S1]

5. **Tester sous confinement.** Des variables et états permettent de diagnostiquer le backend. Une qualification de l'emboîtement Seatbelt/bubblewrap et des tests sautés : la source ne le dit pas. [S1]

6. **Frontière pour un bac à sable ou Docker.** La relance extérieure est un chemin documenté ; elle ne fournit pas une autre isolation. [S2 ; seconde proposition : déduction]

7. **Coût.** Seatbelt sur macOS ; chemins Linux décrits selon disponibilité des protections natives et du backend. Temps de lancement : la source ne le dit pas. [S1]

**Pour 495.** Déductions :

- Protéger les fichiers qui gouvernent les autorisations ; ne pas assimiler la configuration du dépôt à une décision du propriétaire. [S1]
- Écarter l'escalade vers le shell de l'hôte pour un contrôle incompatible. [S2]
