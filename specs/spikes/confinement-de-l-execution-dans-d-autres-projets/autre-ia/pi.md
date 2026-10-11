# Pi 1.0.4 — conteneurisation et exemple sandbox

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [packages/coding-agent/docs/containerization.md:1-28](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/docs/containerization.md#L1-L28) — `earendil-works/pi @ 7c10bd4337495ee613f2224843ecdf349b80d1df` (2026-10-05T21:22:49+02:00) — frontières du processus complet et des outils
- [S2] [packages/coding-agent/docs/containerization.md:30-85](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/docs/containerization.md#L30-L85) — `earendil-works/pi @ 7c10bd4337495ee613f2224843ecdf349b80d1df` (2026-10-05T21:22:49+02:00) — exemple Docker et credentials
- [S3] [packages/coding-agent/docs/containerization.md:121-181](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/docs/containerization.md#L121-L181) — `earendil-works/pi @ 7c10bd4337495ee613f2224843ecdf349b80d1df` (2026-10-05T21:22:49+02:00) — OpenShell et Gondolin
- [S4] [packages/coding-agent/examples/extensions/sandbox/index.ts:55-129](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/examples/extensions/sandbox/index.ts#L55-L129) — `earendil-works/pi @ 7c10bd4337495ee613f2224843ecdf349b80d1df` (2026-10-05T21:22:49+02:00) — défauts et fusion de configuration
- [S5] [packages/coding-agent/examples/extensions/sandbox/index.ts:132-146](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/examples/extensions/sandbox/index.ts#L132-L146) — `earendil-works/pi @ 7c10bd4337495ee613f2224843ecdf349b80d1df` (2026-10-05T21:22:49+02:00) — lancement Bash
- [S6] [packages/coding-agent/examples/extensions/sandbox/index.ts:201-290](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/examples/extensions/sandbox/index.ts#L201-L290) — `earendil-works/pi @ 7c10bd4337495ee613f2224843ecdf349b80d1df` (2026-10-05T21:22:49+02:00) — activation, échec et repli local
- [S7] [packages/coding-agent/examples/extensions/sandbox/package.json:1-19](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/examples/extensions/sandbox/package.json#L1-L19) — `earendil-works/pi @ 7c10bd4337495ee613f2224843ecdf349b80d1df` (2026-10-05T21:22:49+02:00) — runtime épinglé à 0.0.26

Non lu : audit complet du cœur Pi et de toutes ses extensions, non réalisé ; source intégrale du runtime 0.0.26 épinglé par cet exemple, non lue. La fiche séparée du runtime courant ne vaut pas audit de cette ancienne dépendance.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** La documentation distingue l'ensemble du processus Pi en conteneur — outils, `!` et extensions inclus — de la délégation de certains outils. L'exemple `sandbox` remplace Bash et intercepte `user_bash` ; il n'enveloppe pas tout Pi ni les outils fichiers natifs. [S1, S5, S6]

2. **Droits.** L'exemple fusionne défauts, configuration globale et `.pi/sandbox.json` du projet, ce dernier pouvant remplacer des champs. Les défauts autorisent des domaines de paquets et GitHub ; écriture dans `.` et `/tmp`. `--no-sandbox` ou `enabled=false` désactivent le confinement. Le code ne met pas d'approbation humaine entre lecture du fichier projet et utilisation des droits. [S4, S6]

3. **Refusé quoi qu'on déclare.** Les défauts interdisent la lecture de `~/.ssh`, `~/.aws`, `~/.gnupg` et l'écriture de `.env`, `.env.*`, `*.pem`, `*.key`. Ils sont configurables, pas une liste non dérogeable de l'extension. **Point déterminant :** si l'initialisation échoue, `sandboxEnabled=false` ; le prochain appel utilise `localBash.execute`. Une plateforme non gérée suit également le chemin désactivé. Ce n'est pas un refus fermé comparable à celui demandé par 495. [S4, S6]

4. **Environnement de l'hôte.** Le `spawn` de l'exemple ne fournit pas une liste blanche de variables ; le domicile/configuration Git ne sont pas redirigés par ce passage. [S5] La documentation prévient que monter `~/.pi/agent` expose credentials, paramètres, extensions et sessions ; transmettre des variables les rend accessibles aux processus du conteneur. [S1, S2] Cache npm/Maven dédié et traitement des liens d'écriture par la version 0.0.26 : non lus. [S7]

5. **Tester sous confinement.** L'exemple transmet `enableWeakerNestedSandbox` au runtime. Il ne fournit pas une qualification du second profil Seatbelt ni de son propre fonctionnement sous confinement. Les erreurs d'initialisation sont notifiées puis désactivent ce mécanisme. [S4, S6]

6. **Frontière pour un bac à sable ou Docker.** Le document propose Docker, Docker Sandboxes, OpenShell ou Gondolin avec des portées différentes. Il avertit qu'un montage hôte en écriture transmet les modifications et que la délégation d'outils laisse les autres extensions sur l'hôte. Aucun daemon Docker privé ne découle du seul exemple `sandbox`. [S1-S3]

7. **Coût.** L'exemple ajoute une dépendance précisément épinglée à `@anthropic-ai/sandbox-runtime` 0.0.26. La voie conteneur demande image et choix des montages. La voie Gondolin demande Node.js 23.6+ et QEMU dans cette documentation. Aucun temps de démarrage n'y est établi. [S2, S3, S7]

**Pour 495.** Déductions :

- Écarter fusion des droits du projet candidat et repli Bash local après échec. Ce sont deux divergences directes avec les besoins de 495. [S4, S6]
- Reprendre la distinction entre confinement de tout Pi et confinement des seuls outils de contrôle. [S1]
- Qualifier et épingler la dépendance réellement utilisée ; ne pas lui prêter les correctifs du runtime courant. [S7]
