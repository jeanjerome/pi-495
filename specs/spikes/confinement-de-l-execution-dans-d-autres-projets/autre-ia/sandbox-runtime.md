# @anthropic-ai/sandbox-runtime

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [README.md:1-120](https://github.com/anthropic-experimental/sandbox-runtime/blob/5507fb0e639c00f845554336ece62e27af5b1bb7/README.md#L1-L120) — `anthropic-experimental/sandbox-runtime @ 5507fb0e639c00f845554336ece62e27af5b1bb7` (2026-10-10T22:15:23+01:00) — périmètre et lancement
- [S2] [README.md:506-595](https://github.com/anthropic-experimental/sandbox-runtime/blob/5507fb0e639c00f845554336ece62e27af5b1bb7/README.md#L506-L595) — `anthropic-experimental/sandbox-runtime @ 5507fb0e639c00f845554336ece62e27af5b1bb7` (2026-10-10T22:15:23+01:00) — fichiers, sockets, credentials
- [S3] [src/sandbox/sandbox-utils.ts:12-40](https://github.com/anthropic-experimental/sandbox-runtime/blob/5507fb0e639c00f845554336ece62e27af5b1bb7/src/sandbox/sandbox-utils.ts#L12-L40) — `anthropic-experimental/sandbox-runtime @ 5507fb0e639c00f845554336ece62e27af5b1bb7` (2026-10-10T22:15:23+01:00) — noms protégés
- [S4] [src/sandbox/sandbox-utils.ts:250-340](https://github.com/anthropic-experimental/sandbox-runtime/blob/5507fb0e639c00f845554336ece62e27af5b1bb7/src/sandbox/sandbox-utils.ts#L250-L340) — `anthropic-experimental/sandbox-runtime @ 5507fb0e639c00f845554336ece62e27af5b1bb7` (2026-10-10T22:15:23+01:00) — validation des cibles de liens
- [S5] [src/sandbox/sandbox-utils.ts:548-569](https://github.com/anthropic-experimental/sandbox-runtime/blob/5507fb0e639c00f845554336ece62e27af5b1bb7/src/sandbox/sandbox-utils.ts#L548-L569) — `anthropic-experimental/sandbox-runtime @ 5507fb0e639c00f845554336ece62e27af5b1bb7` (2026-10-10T22:15:23+01:00) — résolution des chemins
- [S6] [test/sandbox/symlink-write-path.test.ts:1-160](https://github.com/anthropic-experimental/sandbox-runtime/blob/5507fb0e639c00f845554336ece62e27af5b1bb7/test/sandbox/symlink-write-path.test.ts#L1-L160) — `anthropic-experimental/sandbox-runtime @ 5507fb0e639c00f845554336ece62e27af5b1bb7` (2026-10-10T22:15:23+01:00) — tests des liens d’écriture
- [S7] [README.md:913-984](https://github.com/anthropic-experimental/sandbox-runtime/blob/5507fb0e639c00f845554336ece62e27af5b1bb7/README.md#L913-L984) — `anthropic-experimental/sandbox-runtime @ 5507fb0e639c00f845554336ece62e27af5b1bb7` (2026-10-10T22:15:23+01:00) — refus, profondeur, namespaces
- [S8] [README.md:993-1020](https://github.com/anthropic-experimental/sandbox-runtime/blob/5507fb0e639c00f845554336ece62e27af5b1bb7/README.md#L993-L1020) — `anthropic-experimental/sandbox-runtime @ 5507fb0e639c00f845554336ece62e27af5b1bb7` (2026-10-10T22:15:23+01:00) — diagnostic des refus
- [S9] [README.md:1045-1056](https://github.com/anthropic-experimental/sandbox-runtime/blob/5507fb0e639c00f845554336ece62e27af5b1bb7/README.md#L1045-L1056) — `anthropic-experimental/sandbox-runtime @ 5507fb0e639c00f845554336ece62e27af5b1bb7` (2026-10-10T22:15:23+01:00) — limites du mode imbriqué
- [S10] [src/sandbox/linux-sandbox-utils.ts:3540-3566](https://github.com/anthropic-experimental/sandbox-runtime/blob/5507fb0e639c00f845554336ece62e27af5b1bb7/src/sandbox/linux-sandbox-utils.ts#L3540-L3566) — `anthropic-experimental/sandbox-runtime @ 5507fb0e639c00f845554336ece62e27af5b1bb7` (2026-10-10T22:15:23+01:00) — montage de /proc
- [S11] [test/sandbox/macos-seatbelt.test.ts:20-34](https://github.com/anthropic-experimental/sandbox-runtime/blob/5507fb0e639c00f845554336ece62e27af5b1bb7/test/sandbox/macos-seatbelt.test.ts#L20-L34) — `anthropic-experimental/sandbox-runtime @ 5507fb0e639c00f845554336ece62e27af5b1bb7` (2026-10-10T22:15:23+01:00) — condition de plateforme des tests

Non lu : backend Windows, hors périmètre ; audit complet du seccomp, du proxy TLS et des courses entre vérification et utilisation, non réalisé. Ce commit n'est pas la version épinglée par Pi 1.0.4.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** `srt` enveloppe un processus arbitraire : agent entier ou simple commande, selon l'appelant. Le parent non enveloppé reste dehors. Seatbelt sur macOS ; bubblewrap, proxy et seccomp sur Linux. [S1, S7]

2. **Droits.** `allowWrite`, `denyWrite`, `denyRead`, `allowRead` et règles réseau composent la politique ; la bibliothèque ne constitue pas une procédure d'autorisation humaine. macOS fournit les journaux système ; Linux ne fournit pas de journal bubblewrap équivalent, et la documentation propose `strace`. [S2, S8] Sous Linux, les droits d'écriture sont essentiellement des chemins littéraux : certains motifs sont ignorés, et les motifs de lecture sont développés à partir des entrées présentes au lancement. Des avertissements sont consultables par l'intégrateur. Une politique textuelle n'a donc pas nécessairement la même portée sur les deux OS. [S2] Pour les droits d'écriture par lien, le code refuse notamment certaines remontées vers un parent ou sorties du périmètre ; il n'adopte la cible réelle que selon ces conditions. Les tests couvrent lien sortant et lien cassé. [S4-S6]

3. **Refusé quoi qu'on déclare.** Sous isolation fichiers active : protections automatiques de `.bashrc`, `.bash_profile`, `.zshrc`, `.zprofile`, `.profile`, `.gitconfig`, `.gitmodules`, `.ripgreprc`, `.mcp.json`, `.vscode/`, `.idea/`, `.claude/commands/`, `.claude/agents/`, hooks et configuration Git. `allowGitConfig` prévoit une exception ; `filesystem.disabled` change le contrat. [S2, S3, S7] Linux scanne à profondeur limitée, trois par défaut ; certaines arborescences nouvelles ne sont pas découvertes. Ce n'est pas une interdiction récursive uniforme de tout futur fichier. Les ancêtres des chemins protégés existants sont épinglés par montages contre le renommage. [S7]

4. **Environnement de l'hôte.** Lectures largement ouvertes par défaut ; protéger `.gitconfig` en écriture n'en interdit pas la lecture. Écritures automatiques notamment dans `~/.npm/_logs`, `~/.claude/debug` et `/tmp/claude`. [S2] Les credentials peuvent être refusés ou masqués ; substitution réseau normalement sous TLS. Fichiers masqués sous Linux, refusés sous macOS. `git.safeDirectories` injecte des réglages Git sans accorder d'écriture. Neutralisation globale de `~/.gitconfig` et cache Maven privé : la source ne le dit pas. [S2]

5. **Tester sous confinement.** Les tests Seatbelt lus sont conditionnés à macOS ; cela ne détecte pas un Seatbelt extérieur. [S11] `enableWeakerNestedSandbox` adapte notamment `/proc` aux conteneurs Linux et réduit fortement la sécurité, selon le projet. Le helper seccomp crée lui-même des namespaces imbriqués et refuse s'il ne peut pas le faire. [S7, S9, S10] Aucun contournement général du second profil Seatbelt n'est établi.

6. **Frontière pour un bac à sable ou Docker.** Le mode imbriqué affaibli suppose une autre isolation autour de lui ; il ne fournit pas de daemon Docker privé. [S9] Les sockets Unix sont traités différemment selon le backend : sous Linux, leur création peut être bloquée globalement par seccomp. Autoriser un socket ne limite pas les opérations du daemon derrière lui. [S2 ; dernière phrase : déduction]

7. **Coût.** Maintenance de la combinaison montages/proxy/seccomp et des différences macOS/Linux. Les architectures non couvertes par le filtre fourni demandent un choix explicite qui peut perdre le blocage des sockets. Latence : la source ne le dit pas. [S7-S9]

**Pour 495.** Déductions :

- Reprendre validation des liens et protection de leurs ancêtres, avec essais de remplacement après lancement. [S4-S7]
- Utiliser les refus pour proposer des droits, jamais pour les accorder automatiquement. [S8]
- Écarter le mode imbriqué affaibli comme solution silencieuse aux tests. [S9, S10]
