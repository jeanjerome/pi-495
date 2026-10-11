# Gondolin — runtime et extension Pi

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [README.md:1-115](https://github.com/earendil-works/gondolin/blob/0705083ebf7108aa00f5acc0b8ab37c1c145d365/README.md#L1-L115) — `earendil-works/gondolin @ 0705083ebf7108aa00f5acc0b8ab37c1c145d365` (2026-10-05T00:55:25+02:00) — micro-VM, runtimes et préparation
- [S2] [docs/security.md:104-230](https://github.com/earendil-works/gondolin/blob/0705083ebf7108aa00f5acc0b8ab37c1c145d365/docs/security.md#L104-L230) — `earendil-works/gondolin @ 0705083ebf7108aa00f5acc0b8ab37c1c145d365` (2026-10-05T00:55:25+02:00) — menaces, réseau et secrets
- [S3] [docs/limitations.md:6-68](https://github.com/earendil-works/gondolin/blob/0705083ebf7108aa00f5acc0b8ab37c1c145d365/docs/limitations.md#L6-L68) — `earendil-works/gondolin @ 0705083ebf7108aa00f5acc0b8ab37c1c145d365` (2026-10-05T00:55:25+02:00) — limites d’image, réseau et checkpoints
- [S4] [host/src/vfs/node/vendored-node-vfs/lib/internal/vfs/providers/real.js:180-301](https://github.com/earendil-works/gondolin/blob/0705083ebf7108aa00f5acc0b8ab37c1c145d365/host/src/vfs/node/vendored-node-vfs/lib/internal/vfs/providers/real.js#L180-L301) — `earendil-works/gondolin @ 0705083ebf7108aa00f5acc0b8ab37c1c145d365` (2026-10-05T00:55:25+02:00) — résolution et confinement du fournisseur de fichiers
- [S5] [host/test/vfs-realfs-provider.test.ts:127-180](https://github.com/earendil-works/gondolin/blob/0705083ebf7108aa00f5acc0b8ab37c1c145d365/host/test/vfs-realfs-provider.test.ts#L127-L180) — `earendil-works/gondolin @ 0705083ebf7108aa00f5acc0b8ab37c1c145d365` (2026-10-05T00:55:25+02:00) — tests de liens sortants
- [S6] [packages/coding-agent/examples/extensions/gondolin/index.ts:315-398](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/examples/extensions/gondolin/index.ts#L315-L398) — `earendil-works/pi @ 7c10bd4337495ee613f2224843ecdf349b80d1df` (2026-10-05T21:22:49+02:00) — variables, VM et montage du workspace
- [S7] [packages/coding-agent/docs/containerization.md:153-181](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/docs/containerization.md#L153-L181) — `earendil-works/pi @ 7c10bd4337495ee613f2224843ecdf349b80d1df` (2026-10-05T21:22:49+02:00) — portée de l’extension et avertissement d’environnement

Non lu : audit complet du VFS, de l'hyperviseur et des courses entre vérification et ouverture, non réalisé. Les passages de limitations et le README n'ont pas exactement la même portée sur les possibilités d'images ; ils ne sont pas utilisés pour affirmer une prise en charge de Docker.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** Gondolin fournit une micro-VM Linux locale, QEMU par défaut, avec politique pilotée côté hôte. L'extension Pi y route `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls` et les commandes `!`. Pi et les autres extensions restent sur l'hôte. Le montage `/workspace` transmet les écritures à la copie locale. [S1, S6, S7]

2. **Droits.** Le programme hôte configure les mounts VFS et les règles réseau. L'exemple Pi monte tout le répertoire courant par `RealFSProvider`, sans dialogue de droits par contrôle. [S6] Le fournisseur résout sa racine et contrôle chemins lexicaux, cibles réelles et ancêtres. Une cible de lien extérieure ou un parent sortant est rejeté ; des tests vérifient lecture et création refusées. Ce n'est pas une preuve d'absence de course dans toutes les opérations. [S4, S5]

3. **Refusé quoi qu'on déclare.** La sécurité documentée part d'un invité hostile et d'un hôte de confiance. Les protocoles non pris en charge et des destinations internes sont bloqués par défaut ; le réseau n'est pas une simple interface directe vers le LAN. [S2] Pour les fichiers, la frontière est la racine exposée par le fournisseur, pas une liste de noms de secrets partout dans l'invité. [S4] Liste absolue couvrant toute configuration hôte possible : la source ne le dit pas.

4. **Environnement de l'hôte.** Le runtime décrit des placeholders de secrets et leur substitution bornée côté hôte. [S2] Mais l'extension Pi transmet l'environnement des commandes ; sa fonction `sanitizeEnv` ne supprime que les valeurs non textuelles. La documentation avertit explicitement de l'exposition des clés fournies par variables. [S6, S7] Configuration Git globale et caches npm/Maven : pas de politique spécifique dans l'exemple ; l'image, les variables et les montages déterminent leur présence. [S6 ; dernière proposition : déduction]

5. **Tester sous confinement.** Les tests VFS lus créent des liens sortants et attendent un refus ; ils peuvent éprouver la logique de chemins sans démontrer le confinement d'une VM entière. [S5] Un checkpoint disque ne sauvegarde pas l'ensemble de la mémoire et de l'état temporaire décrit. [S3] Emboîtement sous Seatbelt ou bubblewrap et tests de cette situation : la source ne le dit pas.

6. **Frontière pour un bac à sable ou Docker.** La micro-VM sépare l'invité Linux de l'hôte. Le code lu ne garantit pas qu'un daemon Docker fonctionne dans l'image choisie ; il faut qualifier kernel, image et services. [S1, S3] Elle ne fournit pas de noyau macOS : **déduction**, elle ne peut pas remplacer un runner macOS pour éprouver Seatbelt. [S1]

7. **Coût.** QEMU, Node et images invitées ; premier téléchargement/caching d'assets de l'ordre de 200 Mo ou plus selon la documentation. Linux et macOS sont visés ; l'usage ARM est particulièrement documenté. Il faut entretenir images, VFS et règles réseau. Pas de latence mesurée dans ce relevé. [S1-S3]

**Pour 495.** Déductions :

- Reprendre la délégation d'outils à une VM et les tests de liens sortants, avec mounts limités par contrôle. [S4-S7]
- Corriger la transmission d'environnement avant d'en faire une frontière de secrets. [S6, S7]
- Qualifier Docker séparément ; réserver un autre exécuteur macOS aux tests Seatbelt. [S1, S3]
