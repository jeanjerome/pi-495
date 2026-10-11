# Docker Sandboxes

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [https://docs.docker.com/ai/sandboxes/architecture/](https://docs.docker.com/ai/sandboxes/architecture/) — lu le 11 octobre 2026 — architecture actuelle de sbx, micro-VM et montages
- [S2] [https://docs.docker.com/ai/sandboxes/security/isolation/](https://docs.docker.com/ai/sandboxes/security/isolation/) — lu le 11 octobre 2026 — frontières, mode clone, credentials et MCP
- [S3] [https://docs.docker.com/ai/sandboxes/security/defaults/](https://docs.docker.com/ai/sandboxes/security/defaults/) — lu le 11 octobre 2026 — capacités et persistance par défaut
- [S4] [https://docs.docker.com/ai/sandboxes/install/](https://docs.docker.com/ai/sandboxes/install/) — lu le 11 octobre 2026 — installation et plateformes
- [S5] [https://docs.docker.com/ai/sandboxes/agents/claude-code/](https://docs.docker.com/ai/sandboxes/agents/claude-code/) — lu le 11 octobre 2026 — configuration héritée ou non de l’hôte

Non lu : implémentation de sbx et tests internes, non publiés dans les sources examinées. Cette fiche vise la documentation actuelle du produit, pas une déduction à partir du code Docker Engine ni des anciennes commandes Docker Desktop.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** L'agent s'exécute dans une micro-VM avec son propre système de fichiers et son daemon Docker. Les processus internes relèvent de cette frontière. Exception explicite : les serveurs MCP stdio enregistrés par la passerelle MCP peuvent tourner sur l'hôte ; leur Docker éventuel est celui de l'hôte. [S1, S2]

2. **Droits.** L'opérateur choisit absence de montage du projet, montage direct ou `--clone`, ainsi que réseau, secrets et ressources partagées. Le montage direct transmet immédiatement les écritures à l'hôte : ce n'est pas une synchronisation soumise à validation. Des fichiers d'environnement peuvent demander des commandes de cycle de vie sur l'hôte ; `sbx` présente un plan et demande une approbation avant leur exécution. Un apprentissage automatique de droits d'écriture n'est pas décrit. [S1, S2]

3. **Refusé quoi qu'on déclare.** La frontière VM protège les ressources hôte non exposées ; le daemon hôte n'est pas celui accessible aux processus de l'invité. À l'intérieur, l'agent dispose de `sudo`, peut installer des paquets et modifier le système invité. Ce n'est donc pas une liste interne de chemins toujours interdits. Les ressources de l'hôte explicitement partagées et les MCP externes doivent être comptés séparément. [S2, S3]

4. **Environnement de l'hôte.** Les configurations personnelles comme `~/.claude` ne sont pas importées automatiquement. Les clés de fournisseur peuvent rester dans le proxy hôte avec substitution des requêtes. Mais le transfert d'agent SSH est activé par défaut : sans lire la clé, un processus invité peut lui demander authentification ou signature. [S2, S5] Le clone a sa propre configuration Git, toutefois le dépôt source monté en lecture seule reste lisible, y compris fichiers ignorés et non suivis. Des paquets/caches sont persistants dans la VM ; aucune reprise automatique de `~/.npm` ou `~/.m2` de l'hôte n'est établie. Le magasin de skills peut être partagé, en lecture seule par défaut. [S2, S3]

5. **Tester sous confinement.** L'installation dans une VM nécessite que la virtualisation imbriquée soit disponible. La documentation ne fournit pas de protocole de tests Seatbelt imbriqués ni de politique de tests sautés du produit. [S4]

6. **Frontière pour un bac à sable ou Docker.** C'est le cas le plus explicite de la lecture : VM extérieure et daemon Docker **privé**, avec conteneurs créés à l'intérieur. La capacité d'administrer ce daemon ne vaut pas administration du daemon hôte. Cette garantie concerne les processus de la VM, pas les MCP locaux de la passerelle. [S1, S2]

7. **Coût.** L'outil autonome n'exige pas Docker Desktop/Engine préinstallé. Dans le périmètre étudié : macOS 14+ sur Apple Silicon ; Ubuntu 24.04+ amd64/arm64 avec KVM et droits associés. Il faut gérer images et état de VM ; les images Docker internes ne constituent pas un cache de couches commun à tous les sandboxes. L'état persiste à l'arrêt et disparaît à la suppression de la VM. Pas de temps garanti dans les pages lues. [S1, S3, S4]

**Pour 495.** Déductions :

- Reprendre VM extérieure + daemon privé pour Testcontainers ; écarter le socket Docker du poste. [S2]
- Préférer une copie contrôlée de la révision au montage direct ; même `--clone` ne cache pas les fichiers ignorés du dépôt source. [S2]
- Fermer explicitement agent SSH, MCP hôte et commandes de cycle de vie non nécessaires. Ils dépassent la simple protection des fichiers de clés. [S2]
