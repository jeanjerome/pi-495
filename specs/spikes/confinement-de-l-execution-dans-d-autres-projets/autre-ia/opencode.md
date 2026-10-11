# OpenCode

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [SECURITY.md:9-33](https://github.com/anomalyco/opencode/blob/d21b0790a6c146815f28fea604e41e922f009590/SECURITY.md#L9-L33) — `anomalyco/opencode @ d21b0790a6c146815f28fea604e41e922f009590` (2026-10-11T19:27:08+10:00) — modèle de sécurité déclaré
- [S2] [packages/web/src/content/docs/permissions.mdx:6-18](https://github.com/anomalyco/opencode/blob/d21b0790a6c146815f28fea604e41e922f009590/packages/web/src/content/docs/permissions.mdx#L6-L18) — `anomalyco/opencode @ d21b0790a6c146815f28fea604e41e922f009590` (2026-10-11T19:27:08+10:00) — permissions allow/ask/deny
- [S3] [packages/core/src/shell.ts:254-307](https://github.com/anomalyco/opencode/blob/d21b0790a6c146815f28fea604e41e922f009590/packages/core/src/shell.ts#L254-L307) — `anomalyco/opencode @ d21b0790a6c146815f28fea604e41e922f009590` (2026-10-11T19:27:08+10:00) — environnement et lancement shell

Non lu : tous les providers d'environnement, plugins, MCP et déploiements distants, non audités. La fiche porte sur le modèle de sécurité déclaré et le chemin shell local.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** Le projet dit explicitement ne pas fournir de sandbox et présente les permissions comme une aide à la décision. Il recommande une frontière extérieure Docker/VM pour l'isolation. Le chemin shell délègue à l'environnement d'exécution ; sa branche locale hérite de l'environnement de session ou de `process.env`. [S1, S3]

2. **Droits.** Les règles `allow`, `ask`, `deny` pilotent les outils et les demandes à l'utilisateur. Elles ne sont pas présentées comme une barrière OS contre un code hostile. Découverte de droits noyau à partir d'un refus : la source ne le dit pas. [S1, S2]

3. **Refusé quoi qu'on déclare.** Le document de sécurité ne promet pas une liste de chemins jamais accessibles. Les règles de permissions restent un mécanisme applicatif. Les configurations et serveurs MCP doivent être considérés comme des entrées de confiance appropriées. [S1]

4. **Environnement de l'hôte.** Le shell local construit son environnement sur celui de la session ou du processus, puis y ajoute les marqueurs de terminal. Des hooks peuvent modifier l'invocation. Il n'y a pas de `HOME` privé imposé dans ce passage. Isolation de Git global, npm ou Maven : la source ne le dit pas. [S3]

5. **Tester sous confinement.** Un protocole d'emboîtement ou de détection du confinement extérieur pour tester OpenCode : la source ne le dit pas dans les passages retenus.

6. **Frontière pour un bac à sable ou Docker.** La frontière recommandée est apportée par l'opérateur qui lance OpenCode dans Docker ou une VM ; elle ne découle pas de la permission d'un outil. Le document lu ne fournit pas de garantie sur un socket Docker partagé. [S1]

7. **Coût.** Pas de préparation de sandbox par ce chemin local. L'isolation ajoute le coût du conteneur ou de la VM choisi par l'opérateur. Aucun benchmark de cette préparation n'est donné. [S1, S3]

**Pour 495.** Déductions :

- Reprendre la clarté du contrat : autorisation d'outil et isolation du code sont deux choses. [S1, S2]
- Écarter toute qualification fondée uniquement sur les permissions de l'agent ou sur le nom « environnement ». [S1, S3]
