### NVIDIA OpenShell

Signée : Claude (Opus 5.5), le 11 octobre 2026.

Le projet existe sous ce nom. C'est le dépôt officiel github.com/NVIDIA/OpenShell, sous licence Apache 2.0, dont la
documentation est publiée sous https://docs.nvidia.com/openshell/latest/ (`README.md:14`).

Sources lues :
- [S1] github.com/NVIDIA/OpenShell @ eeba0e7954c0fb4d8e9e2e29d1bfa68e290eb8b3 (2026-10-10), clone peu profond. Ce
  sont les sources Markdown (`docs/`) du site docs.nvidia.com/openshell, plus le code.
  - Documentation lue : `README.md` ; `docs/about/{architecture,support-matrix}.mdx` ;
    `docs/how-it-works/policies/{overview,default-policy,schema,advisor,prover,manage-policies}.mdx` (extraits pour
    les trois derniers) ; `docs/security/best-practices.mdx` ; `docs/how-it-works/sandboxes/{runtimes,overview}.mdx`
    (extraits) ; `docs/observability/logging.mdx` (extrait) ; `docs/tutorials/run-pi-with-openrouter.mdx` (début) ;
    `TESTING.md` et `CI.md` (recherches ciblées).
  - Code lu : `crates/openshell-sandbox/src/main.rs:140-180` (sondes au démarrage),
    `crates/openshell-sandbox/src/sandbox/linux/landlock.rs:460-520` (ouverture des chemins Landlock),
    `crates/openshell-sandbox/src/boundary_exec.rs:140-185` (environnement d'un exec),
    `crates/openshell-core/src/sandbox_env.rs:205-230`.
- [S2] Recherche web du 2026-10-11 : elle confirme que NVIDIA/OpenShell est le dépôt officiel. Un dépôt homonyme,
  Virtual0ps/OpenShell, n'est pas de NVIDIA et a été écarté.

Non lu :
- Le site docs.nvidia.com tel qu'il est rendu : j'ai lu ses sources `docs/` au commit noté.
- La caisse externe `landlock` (`PathFd::new`) : elle n'est pas dans le dépôt, donc le traitement exact des liens
  symboliques à l'ouverture d'un chemin de règle n'est pas lu.
- La plupart des caisses Rust : superviseur réseau, pilotes, prouveur.
- NemoClaw, que la documentation renvoie à un dépôt distinct.

Rien n'a été essayé.

1. **Ce qui est confiné.** Un *superviseur* de confiance et une *charge* (workload) sont placés de part et d'autre
   d'une frontière (`docs/about/architecture.mdx:18-24`, `:39-51`).
   - *La charge.* Elle contient l'agent et tous ses processus enfants. Le binaire `openshell-sandbox`, lancé dans la
     charge, possède l'arbre de processus de l'agent. Il ne prend aucune décision de politique : il rapporte et laisse
     le superviseur décider (`architecture.mdx:41-46`).
   - *Mécanismes noyau, dans la charge Linux* (`architecture.mdx:47-51`) :
     - une identité non root, sans capacités Linux ;
     - Landlock pour les fichiers ;
     - seccomp en *user notification* : chaque ouverture TCP et chaque requête DNS est interceptée et remise au
       superviseur.
   - *Ordre d'application* (`docs/security/best-practices.mdx:232-241`) : abandon de privilèges, `RLIMIT_CORE=0`,
     Landlock, puis filtres seccomp.
   - *Frontière extérieure.* Elle dépend du pilote (`architecture.mdx:100-105`) :
     - Docker et Podman : conteneur sans réseau, superviseur dans un conteneur à part, socket Unix authentifié ;
     - Kubernetes : `NetworkPolicy` ;
     - MicroVM : un invité sans carte réseau et du vsock.
   - *Ce qui n'est pas dans la charge* : le superviseur, la passerelle (gateway), les secrets des fournisseurs et les
     clés de signature des jetons (`architecture.mdx:174-179`).
   - *Divergence documentaire* au commit noté : `best-practices.mdx:53-57` décrit encore un espace de noms réseau
     avec une paire veth (`10.200.0.1`) et un proxy CONNECT « au niveau de la passerelle » (`:38`), alors que
     `architecture.mdx` décrit une charge sans réseau, médiée par seccomp.

2. **Droits.**
   - *Déclaration.* Une politique YAML (`version: 1`) a cinq sections : `filesystem_policy`, `landlock`, `process`,
     `network_policies` et `network_middlewares`. Tout ce qu'elle n'autorise pas est refusé
     (`docs/how-it-works/policies/overview.mdx:11-34`).
     - Une règle réseau associe des destinations à des **binaires** appelants. Le chemin réel est exigé, pas un lien.
     - L'empreinte de chaque exécutable est épinglée au premier usage ; une connexion est refusée si le fichier change
       (`policies/schema.mdx:519-529`, `best-practices.mdx:80-92`).
   - *Quand chaque section s'applique.* Fichiers, Landlock et processus sont figés au démarrage ; en changer impose de
     recréer le bac. Les sections réseau changent à chaud (`overview.mdx:35-38`, `manage-policies.mdx:189-195`).
   - *Qui choisit la politique, par ordre de priorité* (`overview.mdx:55-67`) :
     1. la politique globale de l'administrateur de la passerelle ;
     2. la politique enregistrée du bac (`--policy`) ;
     3. la politique embarquée dans l'image ;
     4. la politique par défaut, restrictive.

     Une politique d'image invalide bloque le démarrage ; il n'y a pas de repli sur le défaut (`overview.mdx:66-67`).
     Une politique globale remplace celles des bacs et gèle les propositions (`overview.mdx:84-91`).
   - *Découverte d'un droit réseau manquant.* Le refus est journalisé avec sa raison, par exemple
     `NET:OPEN … DENIED … [reason:no matching policy]` (`docs/observability/logging.mdx:120-123`). Une requête HTTP
     refusée reçoit un `403` JSON (`logging.mdx:210-231`). OpenShell **rédige lui-même un brouillon de règle** pour
     chaque connexion bloquée (un binaire, un hôte, un port), même sans l'advisor (`policies/advisor.mdx:53-59`).
   - *L'advisor.* Il est désactivé par défaut. Une fois activé, il donne à l'agent un guide et une API locale
     `http://policy.local` pour proposer une règle (`advisor.mdx:61-74`).
   - *Qui accorde.* Chaque proposition passe un contrôle de risque par le prouveur formel. L'humain l'approuve ou la
     rejette avec un motif, que l'agent reçoit (`advisor.mdx:29-51`, `:114-138`). L'approbation automatique est en
     option ; elle exclut les IP privées, les jokers et les ports de base de données (`advisor.mdx:153-170`).
     Un accord vaut pour l'instance du bac et disparaît quand on le recrée (`best-practices.mdx:140-150`).
   - *Limite de l'advisor.* Il ne traite que le réseau : il ne peut ni retirer une règle ni toucher aux fichiers, à
     Landlock ou aux processus (`advisor.mdx:11-14`).
   - *Côté fichiers*, la source ne décrit pas de journal de chaque refus. Elle mentionne des événements `CONFIG:` au
     démarrage et lorsqu'un chemin demandé est sauté (`logging.mdx:235-255`).

3. **Refusé quoi qu'on déclare.**
   - *Identité.* L'identité root est rejetée (`schema.mdx:91`, `best-practices.mdx:212`).
   - *Chemins* (`schema.mdx:55-56`, `best-practices.mdx:189-199`) :
     - `/` est refusé en écriture ;
     - les chemins non absolus et ceux qui contiennent `..` sont refusés ;
     - une politique compte au plus 256 chemins.
   - *Répertoire privé.* `/.openshell` est protégé par un socle Landlock obligatoire (ABI ≥ 3) qu'aucune politique ne
     peut ouvrir (`default-policy.mdx:103-109`).
   - *Adresses.* Le bouclage, le lien-local (dont `169.254.169.254`) et `0.0.0.0` sont toujours bloqués
     (`best-practices.mdx:135`).
   - *Appels système bloqués sans condition* (`best-practices.mdx:224`) : `mount`, `pivot_root`, `setns`, `ptrace`,
     `bpf`, `io_uring_setup`, `memfd_create`, `process_vm_*`, `pidfd_*`, entre autres.
   - *Appels système bloqués sous condition* (`best-practices.mdx:225`) : `unshare` et `clone` avec
     `CLONE_NEWUSER`, l'installation d'un filtre seccomp, et `execveat` avec `AT_EMPTY_PATH`.
   - *Images de confiance.* Une demande de bac ne peut remplacer ni l'image du superviseur ni celle du runtime
     (`docs/how-it-works/sandboxes/runtimes.mdx:39-45`).
   - *Montages.* Ils ne peuvent pas masquer `/opt/openshell`, `/etc/openshell` ni `/run/openshell` (`runtimes.mdx:173`).

4. **Environnement de l'hôte.**
   - *Pas de montage de l'hôte par défaut.* Le code entre par `sandbox upload` ou `create --upload` : c'est une
     copie, filtrée par `.gitignore` (`docs/how-it-works/sandboxes/overview.mdx:847-899`).
   - *Liens.* Les liens symboliques sont copiés comme liens, sans déréférencement (`overview.mdx:861`, `:909-911`). Un
     téléchargement depuis le bac refuse toute source qui sort du répertoire de travail, que ce soit lexicalement ou
     par un lien (`overview.mdx:873-878`). Côté prouveur, deux chemins imbriqués différents donnent `unsupported`,
     « because a symlink in the sandbox image could make `/tmp/cache` point outside `/tmp` »
     (`policies/prover.mdx:188-193`).
   - *Variables.* Chaque exec repart d'un environnement vidé (`env_clear`). Il reçoit ensuite `HOME` et `USER` de la
     session, `PATH`, `TERM`, les variables déclarées par `--env`, les chemins du CA du bac et les jetons fictifs des
     fournisseurs, et les variables de proxy sont retirées (`crates/openshell-sandbox/src/boundary_exec.rs:153-184`).
     Les noms `OPENSHELL_*` sont réservés (`overview.mdx:402`). Une clé `--env` qui ressemble à un secret provoque un
     avertissement (`overview.mdx:392`).
   - *Secrets.* Le vrai secret reste chez le superviseur ; l'agent ne voit qu'un jeton fictif, valable seulement vers
     les destinations autorisées (`best-practices.mdx:245-255`).
   - *Ce que la source ne dit pas.* Elle ne traite pas de `~/.gitconfig`, `~/.npm` ni `~/.m2`. J'en déduis que, sans
     montage, `HOME` est celui de l'image et que rien de l'hôte n'y figure.

5. **Tester sous confinement.** Le binaire de la charge **sonde le noyau avant d'admettre la charge**
   (`crates/openshell-sandbox/src/main.rs:149-173`) :
   - l'accès mémoire parent-enfant ;
   - un aller-retour autoriser/refuser de Landlock ;
   - l'API de notification seccomp ;
   - le confinement des sockets au bouclage ;
   - l'ABI de Landlock, qui doit être ≥ 3.

   Un échec fait refuser le lancement (fail closed) (`docs/about/support-matrix.mdx:170-189`). OpenShell est conçu
   pour tourner *emboîté* sous le profil seccomp d'un runtime de conteneur : il exige des « Nested user-notification
   filters … usable under the runtime's existing seccomp profile » (`support-matrix.mdx:178`). Avec `best_effort`, un
   chemin illisible est sauté et journalisé ; `hard_requirement` refuse le démarrage (`schema.mdx:65-82`,
   `landlock.rs:468-511`). Les tests de bout en bout tournent sur de vrais pilotes (Docker, Podman, Kubernetes, VM avec
   KVM), chacun dans sa voie de CI (`TESTING.md:95`, `CI.md:131-138`). Je n'ai trouvé aucun test qui lance un bac
   OpenShell *depuis* un bac OpenShell. Seatbelt n'est pas employé.

6. **Frontière pour un bac à sable ou Docker.** Seule la passerelle, du côté de confiance, détient le socket Docker ou
   Podman (`runtimes.mdx:103-115`, `docs/how-it-works/gateways/container-deployment.mdx:21-22`). Monter un répertoire de
   l'hôte dans le bac est désactivé par défaut. Cela exige deux réglages : activer `enable_bind_mounts` et désactiver
   l'admission. La source avertit que ces montages contournent l'isolation (`runtimes.mdx:159-171`). Docker Desktop doit
   avoir le réseau hôte activé et ne peut pas utiliser Enhanced Container Isolation (`runtimes.mdx:117`).

   La source ne dit pas comment faire tourner Docker ou Testcontainers *dans* un bac. J'en déduis, sans l'avoir essayé,
   que c'est impossible dans la charge : `mount`, `setns`, `unshare(CLONE_NEWUSER)` et l'installation d'un filtre
   seccomp y sont refusés (`best-practices.mdx:224-225`), ce qui exclut un démon Docker comme un bubblewrap emboîté.
   Le pilote MicroVM (libkrun, Hypervisor.framework ou KVM) isole le bac par une VM, mais le même runtime y applique les
   mêmes filtres (`runtimes.mdx:200-222`, `support-matrix.mdx:172-173`).

7. **Coût.**
   - *Plateformes.* Linux x86_64 et arm64, et macOS Apple Silicon via Docker Desktop, sont supportés ; Windows
     (WSL 2 et Docker Desktop) est expérimental (`support-matrix.mdx:47-56`). Sous macOS, Landlock et seccomp tournent
     dans la VM Linux de Docker Desktop, pas sur le noyau de l'hôte (`support-matrix.mdx:191`).
   - *Noyau.* Linux 6.2 ou plus avec Landlock actif (`support-matrix.mdx:177`, `:182-185`).
   - *Logiciels.* Docker 28 ou plus, ou Podman 5, ou Kubernetes 1.29, ou la virtualisation de l'hôte
     (`support-matrix.mdx:131-142`).
   - *Éléments à faire tourner.* Une passerelle, un superviseur par bac, et une image OCI qui porte l'agent : par
     exemple, une image Pi bâtie à la main, à qui il faut fournir `fd` et `ripgrep` que le bac l'empêche de télécharger
     (`docs/tutorials/run-pi-with-openrouter.mdx:28-59`).
   - *Rythme.* Une version stable par semaine en général, et un support des versions N et N-1
     (`support-matrix.mdx:28-42`).
   - *Démarrage.* La source ne donne aucun chiffre.

**Pour 495.**
- *Besoin 1, reprendre le partage des rôles.* La source décrit un superviseur de confiance qui décide, une charge qui
  ne fait que rapporter, et des droits fichiers et processus figés avant le premier octet de code de l'agent
  (`architecture.mdx:41-46`, `manage-policies.mdx:189-195`). Pour 495, j'en déduis que les droits d'un contrôle se
  figent avant la copie du candidat et ne se relisent pas depuis elle. C'est la garantie « jamais élargi par ce que le
  candidat écrit ».
- *Besoin 1, adapter la découverte réseau.* La source décrit des brouillons tirés des refus, un contrôle de risque,
  une approbation humaine avec motif, et des accords qui meurent avec l'instance (`advisor.mdx:29-59`). Elle ne
  propose **rien** pour les fichiers : l'advisor ne traite que le réseau. 495 doit donc concevoir lui-même la
  découverte d'un droit d'écriture manquant. C'est mon constat sur la source, pas une affirmation d'OpenShell.
- *Besoin 2, reprendre les sondes au démarrage.* La source décrit des sondes de qualification qui refusent le
  lancement en cas d'échec (`main.rs:149-173`) ; c'est le pendant de `capability_missing`. Pour 495, j'en déduis
  qu'il peut sonder « un second profil Seatbelt s'applique-t-il ici ? » avant de lancer les tests qui démarrent un bac
  à sable, et les envoyer au juge externe au lieu de les voir échouer.
- *Écarter comme backend macOS.* OpenShell ne confine rien sur le noyau macOS : Landlock et seccomp tournent dans une
  VM Linux (`support-matrix.mdx:191`). C'est un modèle pour le backend Linux de 495 (Landlock plutôt que ou en plus de
  bubblewrap), pas un substitut de Seatbelt.
- *Écarter pour Testcontainers.* La charge refuse `mount`, `setns` et les espaces de noms utilisateur. OpenShell ne
  répond donc pas au besoin 2 pour Docker : la frontière qui le sert reste une VM qui porte son propre démon, comme
  Docker Sandboxes. C'est une déduction.
