# Codex d’OpenAI

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [codex-rs/linux-sandbox/README.md:1-124](https://github.com/openai/codex/blob/8c0f7011674145da7e10627769fb221c74fbf7a0/codex-rs/linux-sandbox/README.md#L1-L124) — `openai/codex @ 8c0f7011674145da7e10627769fb221c74fbf7a0` (2026-10-11T06:08:41Z) — architecture Linux
- [S2] [codex-rs/protocol/src/protocol.rs:1092-1208](https://github.com/openai/codex/blob/8c0f7011674145da7e10627769fb221c74fbf7a0/codex-rs/protocol/src/protocol.rs#L1092-L1208) — `openai/codex @ 8c0f7011674145da7e10627769fb221c74fbf7a0` (2026-10-11T06:08:41Z) — approbations et politiques
- [S3] [codex-rs/protocol/src/config_types.rs:175-200](https://github.com/openai/codex/blob/8c0f7011674145da7e10627769fb221c74fbf7a0/codex-rs/protocol/src/config_types.rs#L175-L200) — `openai/codex @ 8c0f7011674145da7e10627769fb221c74fbf7a0` (2026-10-11T06:08:41Z) — identité de l’approbateur
- [S4] [codex-rs/config/src/types.rs:1181-1192](https://github.com/openai/codex/blob/8c0f7011674145da7e10627769fb221c74fbf7a0/codex-rs/config/src/types.rs#L1181-L1192) — `openai/codex @ 8c0f7011674145da7e10627769fb221c74fbf7a0` (2026-10-11T06:08:41Z) — racines, réseau, temporaires
- [S5] [codex-rs/config/src/shell_environment_policy.rs:12-38](https://github.com/openai/codex/blob/8c0f7011674145da7e10627769fb221c74fbf7a0/codex-rs/config/src/shell_environment_policy.rs#L12-L38) — `openai/codex @ 8c0f7011674145da7e10627769fb221c74fbf7a0` (2026-10-11T06:08:41Z) — paramètres d’environnement
- [S6] [codex-rs/config/src/shell_environment_policy.rs:133-160](https://github.com/openai/codex/blob/8c0f7011674145da7e10627769fb221c74fbf7a0/codex-rs/config/src/shell_environment_policy.rs#L133-L160) — `openai/codex @ 8c0f7011674145da7e10627769fb221c74fbf7a0` (2026-10-11T06:08:41Z) — valeurs par défaut
- [S7] [codex-rs/linux-sandbox/src/bwrap.rs:649-744](https://github.com/openai/codex/blob/8c0f7011674145da7e10627769fb221c74fbf7a0/codex-rs/linux-sandbox/src/bwrap.rs#L649-L744) — `openai/codex @ 8c0f7011674145da7e10627769fb221c74fbf7a0` (2026-10-11T06:08:41Z) — liens symboliques et refus de politiques non protégeables
- [S8] [codex-rs/core/tests/common/lib.rs:578-615](https://github.com/openai/codex/blob/8c0f7011674145da7e10627769fb221c74fbf7a0/codex-rs/core/tests/common/lib.rs#L578-L615) — `openai/codex @ 8c0f7011674145da7e10627769fb221c74fbf7a0` (2026-10-11T06:08:41Z) — sauts sous Seatbelt et sans réseau
- [S9] [codex-rs/cli/src/debug_sandbox.rs:530-545](https://github.com/openai/codex/blob/8c0f7011674145da7e10627769fb221c74fbf7a0/codex-rs/cli/src/debug_sandbox.rs#L530-L545) — `openai/codex @ 8c0f7011674145da7e10627769fb221c74fbf7a0` (2026-10-11T06:08:41Z) — restitution des refus Seatbelt
- [S10] [codex-rs/core/src/tools/handlers/apply_patch.rs:226-273](https://github.com/openai/codex/blob/8c0f7011674145da7e10627769fb221c74fbf7a0/codex-rs/core/src/tools/handlers/apply_patch.rs#L226-L273) — `openai/codex @ 8c0f7011674145da7e10627769fb221c74fbf7a0` (2026-10-11T06:08:41Z) — droits supplémentaires d’une modification

Non lu : backend Windows, hors périmètre ; totalité des outils/MCP/extensions et infrastructure cloud, hors audit détaillé. Le lien historique developers.openai.com/codex/security a redirigé vers une page générale ; il n'étaye pas les détails ci-dessous.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** Le backend Linux place la commande et ses descendants dans bubblewrap, avec seccomp et `no_new_privs`, séparation des processus et masquage de sockets de contrôle. [S1] `apply_patch` calcule les chemins et droits supplémentaires requis. Cette portion ne permet pas d'affirmer que tous les outils et MCP sont dans la même frontière OS. [S10]

2. **Droits.** Configuration des racines écrites, du réseau et des temporaires ; distinction entre lecture seule, plein accès et confinement externe. Les approbations sont séparées : `never` retourne les échecs sans escalade ; la politique granulaire peut refuser des catégories. L'approbateur est `user` par défaut, mais peut être `auto_review`. [S2-S4] Le lanceur de diagnostic restitue les refus Seatbelt. [S9]

3. **Refusé quoi qu'on déclare.** Aucune liste absolue ne couvre aussi le plein accès. En mode Linux restreint, les métadonnées protégées comprennent `.git`, le répertoire Git résolu et `.codex` ; les sockets du contrôleur sont masquées. Le remplacement par l'ancien Landlock est refusé pour la politique restreinte décrite. [S1, S2] Un sous-chemin en lecture seule traversant un lien remplaçable par le candidat provoque une erreur fatale : protéger seulement sa cible initiale serait insuffisant. [S7]

4. **Environnement de l'hôte.** La politique offre héritage, filtres et valeurs imposées. À ce commit, la conversion prend `inherit=All` et `ignore_default_excludes=true` si ces options sont absentes. Ce n'est pas une liste blanche de secrets par défaut. [S5, S6] Protéger `.git` en écriture ne neutralise pas `~/.gitconfig`. Un Git hermétique et une règle générale pour `~/.npm` ou `~/.m2` : les sources retenues ne le disent pas. [S1, S5, S6]

5. **Tester sous confinement.** `skip_if_sandbox!` saute le test lorsque la variable de sandbox vaut `seatbelt`. Une autre macro saute des tests sans réseau. Cela documente un manque d'exécution, pas un emboîtement réussi. [S8] Linux préteste les namespaces. L'héritage de namespace PID est réservé au démarrage de confiance de l'exécuteur ; le repli `/proc` conserve l'isolation PID. Cela ne prouve pas qu'un test arbitraire peut relancer bubblewrap. [S1]

6. **Frontière pour un bac à sable ou Docker.** `external-sandbox` déclare une frontière apportée ailleurs ; il ne la crée pas. [S2] Un daemon Docker privé en VM n'est pas établi par ces sources. Il reste à l'intégrateur de fournir l'environnement extérieur.

7. **Coût.** Linux exige bubblewrap admissible ou fourni, et les capacités noyau vérifiées. Montages, chemins absents, métadonnées et liens représentent une maintenance réelle. Temps de démarrage : la source ne le dit pas. [S1, S7]

**Pour 495.** Déductions :

- Refuser la politique si des liens modifiables rendent sa protection illusoire. Canonicaliser n'est pas autoriser. [S7]
- Enregistrer les tests sautés comme incomplets et les exécuter ailleurs sur la même révision. [S8]
- Séparer confinement, approbation et identité de l'approbateur ; imposer le propriétaire pour les élargissements. [S2, S3]
