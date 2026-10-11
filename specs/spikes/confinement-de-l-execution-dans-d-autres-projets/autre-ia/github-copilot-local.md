# GitHub Copilot — CLI local et intégration VS Code

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [https://docs.github.com/en/copilot/how-tos/cloud-and-local-sandboxes/using-local-sandboxing](https://docs.github.com/en/copilot/how-tos/cloud-and-local-sandboxes/using-local-sandboxing) — lu le 11 octobre 2026 — activation et diagnostic du CLI
- [S2] [https://docs.github.com/en/copilot/how-tos/cloud-and-local-sandboxes/configuring-local-sandbox-settings](https://docs.github.com/en/copilot/how-tos/cloud-and-local-sandboxes/configuring-local-sandbox-settings) — lu le 11 octobre 2026 — configuration et autorité administrateur
- [S3] [https://docs.github.com/en/copilot/concepts/agents/copilot-cli/understanding-local-sandboxing](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/understanding-local-sandboxing) — lu le 11 octobre 2026 — politique fichiers, caches, liens
- [S4] [https://code.visualstudio.com/docs/agents/run/agent-sandboxing](https://code.visualstudio.com/docs/agents/run/agent-sandboxing) — lu le 11 octobre 2026 — Agent Host, explicitement distinct du Local chat harness
- [S5] [src/vs/platform/sandbox/node/sandboxHelper.ts:29-100](https://github.com/microsoft/vscode/blob/eef761e9628e777317a554114f0202a070e98f0b/src/vs/platform/sandbox/node/sandboxHelper.ts#L29-L100) — `microsoft/vscode @ eef761e9628e777317a554114f0202a070e98f0b` (2026-10-11T04:00:10Z) — détection et sonde bubblewrap
- [S6] [src/vs/platform/sandbox/common/terminalSandboxRuntimeConfigurationPerOperation.ts:15-94](https://github.com/microsoft/vscode/blob/eef761e9628e777317a554114f0202a070e98f0b/src/vs/platform/sandbox/common/terminalSandboxRuntimeConfigurationPerOperation.ts#L15-L94) — `microsoft/vscode @ eef761e9628e777317a554114f0202a070e98f0b` (2026-10-11T04:00:10Z) — adaptations Git/GnuPG d’un autre chemin terminal

Non lu : implémentation interne du CLI et du SDK Copilot, non disponible dans les sources examinées ; audit complet des différents harnesses VS Code, non réalisé. Les deux fichiers ouverts de VS Code ne prouvent pas les détails internes du CLI.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** Le CLI confine les processus shell, recherches et, par défaut, MCP locaux et LSP. Ses outils fichiers internes appliquent la même politique en logiciel, sans frontière OS autour de chaque opération. Les MCP distants ne deviennent pas des processus locaux confinés. [S3] La page VS Code concerne l'Agent Host utilisant les outils SDK par défaut ; elle exclut explicitement le Local chat harness et le remplacement personnalisé du terminal. [S4]

2. **Droits.** Les paramètres utilisateur et administrés composent la politique ; les règles de sandbox du CLI ne sont pas prises dans la configuration du dépôt. `/sandbox policy`, éventuellement suivi d'une commande, prévisualise les droits effectifs sans exécuter la commande. Les règles administrées se combinent dans le sens restrictif. L'utilisateur peut demander un contournement seulement si cette faculté reste autorisée. [S1-S3]

3. **Refusé quoi qu'on déclare.** Les refus explicites priment les droits accordés ; les contraintes administrées peuvent plafonner ceux-ci. La documentation n'établit pas une liste universelle de secrets jamais ouvrables. Si un chemin interdit manquant ne peut pas être préparé, le processus ne démarre pas. [S2, S3]

4. **Environnement de l'hôte.** La découverte des outils ouvre des configurations et caches, dont certains caches npm en écriture ; certains fichiers contiennent des credentials et certains caches sont partagés avec les commandes hors sandbox. Ajouter un lien dans l'interface peut ajouter sa cible actuelle ; cela diffère des règles écrites à la main. [S3] Git/`gh` disposent de mécanismes d'authentification par proxy ; cela n'établit pas une neutralisation générale de Git global. [S1, S2] Le code du chemin terminal VS Code lu prévoit, pour Git/GnuPG, une ouverture de `~/.gnupg` et de tous les sockets Unix. **Ne pas transposer cette règle à tous les modes Copilot** : c'est précisément un autre chemin de configuration. [S6]

5. **Tester sous confinement.** Le helper VS Code ne se contente pas de trouver bubblewrap : il lance une sonde de namespace réseau avec délai limité. [S5] Les sources ne disent pas comment la suite de tests évite un second Seatbelt. Un simple état « activé » n'est pas une preuve de cette capacité.

6. **Frontière pour un bac à sable ou Docker.** Le sandbox local est distinct d'une VM ou d'un compte utilisateur séparé. La page Agent Host autorise, par défaut, les demandes d'exécution extérieure après confirmation. Elle ne fournit pas de daemon Docker privé. [S4]

7. **Coût.** Dépendances Linux à installer, outils/caches à détecter et politique effective à inspecter. L'Agent Host ne lance pas silencieusement une commande sans confinement lorsqu'une dépendance nécessaire manque. Latence chiffrée : la source ne le dit pas. [S1, S4, S5]

**Pour 495.** Déductions :

- Reprendre une prévisualisation effective distinguant droits déclarés, ajoutés automatiquement et plafonnés par l'administrateur. [S2, S3]
- Reprendre l'absence d'autorité de la configuration candidate ; écarter caches personnels et clés ajoutés implicitement. [S2, S3, S6]
- Reprendre une vraie sonde de backend, puis y ajouter les témoins de refus nécessaires à 495. [S5]
