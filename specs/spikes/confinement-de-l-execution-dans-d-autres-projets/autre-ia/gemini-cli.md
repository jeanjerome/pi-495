# Gemini CLI

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [docs/cli/sandbox.md:1-230](https://github.com/google-gemini/gemini-cli/blob/9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83/docs/cli/sandbox.md#L1-L230) — `google-gemini/gemini-cli @ 9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83` (2026-10-09T21:57:32Z) — backends du lanceur global
- [S2] [packages/core/src/services/sandboxManagerFactory.ts:22-42](https://github.com/google-gemini/gemini-cli/blob/9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83/packages/core/src/services/sandboxManagerFactory.ts#L22-L42) — `google-gemini/gemini-cli @ 9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83` (2026-10-09T21:57:32Z) — gestionnaire par plateforme
- [S3] [packages/core/src/sandbox/linux/LinuxSandboxManager.ts:210-330](https://github.com/google-gemini/gemini-cli/blob/9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83/packages/core/src/sandbox/linux/LinuxSandboxManager.ts#L210-L330) — `google-gemini/gemini-cli @ 9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83` (2026-10-09T21:57:32Z) — préparation par opération
- [S4] [packages/core/src/sandbox/utils/sandboxDenialUtils.ts:64-169](https://github.com/google-gemini/gemini-cli/blob/9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83/packages/core/src/sandbox/utils/sandboxDenialUtils.ts#L64-L169) — `google-gemini/gemini-cli @ 9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83` (2026-10-09T21:57:32Z) — heuristiques de refus
- [S5] [packages/core/src/sandbox/utils/proactivePermissions.ts:83-125](https://github.com/google-gemini/gemini-cli/blob/9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83/packages/core/src/sandbox/utils/proactivePermissions.ts#L83-L125) — `google-gemini/gemini-cli @ 9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83` (2026-10-09T21:57:32Z) — propositions npm et Git
- [S6] [packages/core/src/services/environmentSanitization.ts:13-185](https://github.com/google-gemini/gemini-cli/blob/9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83/packages/core/src/services/environmentSanitization.ts#L13-L185) — `google-gemini/gemini-cli @ 9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83` (2026-10-09T21:57:32Z) — filtrage et exceptions
- [S7] [packages/cli/src/config/sandboxConfig.ts:26-62](https://github.com/google-gemini/gemini-cli/blob/9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83/packages/cli/src/config/sandboxConfig.ts#L26-L62) — `google-gemini/gemini-cli @ 9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83` (2026-10-09T21:57:32Z) — détection d’un lancement isolé
- [S8] [packages/core/src/sandbox/utils/fsUtils.ts:15-80](https://github.com/google-gemini/gemini-cli/blob/9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83/packages/core/src/sandbox/utils/fsUtils.ts#L15-L80) — `google-gemini/gemini-cli @ 9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83` (2026-10-09T21:57:32Z) — validation des chemins Git

Non lu : backends Windows, hors périmètre ; totalité des hooks/MCP et des tests d'intégration, non auditée. Lanceur global documenté et gestionnaire par opération sont distingués.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** Le lanceur global propose Seatbelt, Docker/Podman et, sous Linux, notamment runsc et LXC. Le CLI lancé en conteneur y entraîne ses enfants. [S1] Le gestionnaire par opération prépare aussi des commandes de lecture/écriture. Désactivé, il est remplacé par une implémentation locale. Que toutes les extensions et MCP y passent : la source retenue ne le dit pas. [S2, S3]

2. **Droits.** Le gestionnaire assemble permissions persistantes, demandes de l'opération et certains droits Git détectés. [S3] La découverte de refus analyse les sorties, reconnaît `EPERM`, système en lecture seule, `sandbox_apply`, etc., et extrait des chemins avec des heuristiques de secours. [S4] Des suggestions proactives visent `.npmrc`, `.npm`, `.cache`, ou `~/.ssh` et `~/.gitconfig` pour Git. Une suggestion ne prouve pas l'autorisation du propriétaire. [S5 ; dernière phrase : déduction]

3. **Refusé quoi qu'on déclare.** Pas de liste universelle établie pour tous les profils et le mode sans sandbox. [S1-S3] La découverte d'un répertoire Git extérieur exige un lien retour cohérent du worktree, ou un `core.worktree` vérifié ; sinon elle l'écarte. C'est une validation spécifique, pas une preuve générale de sûreté de chaque droit d'écriture. [S8]

4. **Environnement de l'hôte.** `sanitizeEnvironment` peut recopier l'environnement lorsque la réduction est désactivée, hors contexte GitHub strict. Sinon, listes et motifs filtrent les secrets ; `HOME` est préservé, et `GIT_CONFIG_*` bénéficie d'une exception après contrôle de la valeur. [S6] Les suggestions rendent accessibles configuration Git et caches npm de l'hôte. Elles ne produisent pas un Git hermétique. `~/.m2` : la source retenue ne le dit pas. [S5, S6]

5. **Tester sous confinement.** Une variable `SANDBOX` définie suffit au lanceur global pour ne pas démarrer un autre sandbox. Cette convention ne qualifie pas les restrictions réelles. [S7 ; seconde phrase : déduction] Une preuve d'emboîtement Seatbelt ou bubblewrap pour ses tests : la source ne le dit pas.

6. **Frontière pour un bac à sable ou Docker.** Docker/Podman et runsc sont des choix de lancement. [S1] Daemon Docker privé ou protection de l'hôte malgré un socket partagé : la source ne le dit pas. Testcontainers reste non essayé.

7. **Coût.** Moteur et image pour les conteneurs, configuration de runsc pour gVisor, dépendances LXC pour cette voie expérimentale ; profils Seatbelt sur macOS. [S1] Les règles par opération ajoutent une politique à maintenir. Latence : la source ne le dit pas. [S2, S3]

**Pour 495.** Déductions :

- Reprendre le diagnostic heuristique en marquant comme non fiable toute information fournie par la sortie du candidat. [S4]
- Écarter l'ouverture automatique des clés, configurations et caches personnels. [S5, S6]
- Ne pas qualifier un backend par une variable « déjà confiné ». [S7]
