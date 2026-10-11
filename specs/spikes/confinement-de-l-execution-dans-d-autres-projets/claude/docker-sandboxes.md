### Docker Sandboxes

Signée : Claude (Opus 5.5), le 11 octobre 2026.

Sources lues :
- [S1] github.com/docker/docs @ 18bbfeeb249da011f359d558dba84c4b6dc3a335 (2026-10-09), clone partiel (sparse) de
  `content/manuals/ai/sandboxes/`. C'est la source des pages publiées sous https://docs.docker.com/ai/sandboxes/.
  Pages lues : `_index.md`, `install.md`, `architecture.md`, `usage.md`, `security/_index.md`,
  `security/isolation.md`, `security/defaults.md`, `governance/access-controls/{network,local,filesystem}.md`,
  `configuration/environment-files.md` (extraits), `workflows/{development,git,automation,_index}.md`,
  `cloud/local-vs-cloud.md`, `cloud/usage.md` (extrait), `troubleshooting.md` (extrait), `release-notes.md` (0.47.0).
  Les chemins `fichier:ligne` ci-dessous sont relatifs à `content/manuals/ai/sandboxes/`, sauf mention contraire.
- [S2] même dépôt, `content/manuals/retired.md:148-153` : retrait du greffon `docker sandbox`.
- [S3] https://docs.docker.com/ai/sandboxes/ (lue le 2026-10-11) : la page publiée ne nomme que `sbx`.
- [S4] https://www.docker.com/blog/why-microvms-the-architecture-be (billet officiel Docker du 16 avril 2026, lu le
  2026-10-11) : choix d'un VMM maison.

Non lu :
- La documentation de l'ancienne commande `docker sandbox` de Docker Desktop. Elle a disparu des pages actuelles :
  le greffon a été retiré de Docker Desktop 4.80.0 au profit de la CLI autonome `sbx` [S2]. Les prérequis Docker
  Desktop de l'ancienne commande ne sont donc pas décrits ici. Le clone peu profond ne contient pas l'historique.
- Le code de `sbx` : seul un dépôt de publication existe (github.com/docker/sbx-releases, cité par `install.md:93`).
  Aucune affirmation ne vient du code.
- La spécification des kits (github.com/docker/sandbox-kit-spec), les pages de gouvernance d'organisation, d'audit et
  de l'API cloud.

Rien n'a été essayé : aucune affirmation ne vient d'une exécution.

1. **Ce qui est confiné.** Toute la session de l'agent tourne dans une micro-VM qui a son propre noyau Linux. Les
   commandes, les outils, les processus enfants et un moteur Docker privé y sont tous enfermés
   (`security/isolation.md:19-21`, `security/_index.md:17-19`). Dans la VM, l'agent a les pleins pouvoirs : un
   utilisateur non root avec sudo. C'est la frontière de l'hyperviseur qui isole, pas une séparation de privilèges
   dans la VM (`security/isolation.md:35-36`).

   Trois choses ne sont pas confinées :
   - les serveurs MCP locaux en stdio, qui tournent sur l'hôte avec ses droits et son Docker
     (`security/_index.md:136-139`, `architecture.md:120-123`) ;
   - les commandes « hôte » des fichiers d'environnement, soumises à approbation (`security/isolation.md:189-192`) ;
   - le magasin de skills partagé, monté en lecture seule par défaut (`security/_index.md:33-38`).

   L'espace de travail se présente sous trois formes (`security/isolation.md:108-117`) :
   - aucun montage ;
   - un montage direct en lecture-écriture du répertoire de l'hôte, au même chemin absolu (`architecture.md:24-34`) ;
   - le mode clone : le dépôt de l'hôte est monté en lecture seule sous `/run/sandbox/source` et l'agent travaille
     dans un clone privé (`architecture.md:36-38`).

2. **Droits.**
   - *Déclaration.* Les droits réseau se déclarent par `sbx policy allow|deny network`, globalement ou par bac
     (`governance/access-controls/local.md:113-130`). Au premier lancement, la CLI fait choisir un préréglage :
     Open, Balanced ou Locked Down (`local.md:40-62`). Une CI le fixe par `sbx policy init`
     (`local.md:96-106`).
   - *Découverte d'un droit réseau manquant.* Sous Balanced et Locked Down, une requête sans règle est bloquée et
     devient une demande d'approbation (`local.md:68-71`). La requête qui la déclenche est refusée : seule la suivante
     profite de l'accord (`network.md:136-139`). L'agent reçoit un message qui nomme la destination ; le
     propriétaire répond par `sbx policy approval ls|respond` (`network.md:119-175`). Un accord vaut pour une
     destination exacte, port compris, et pour le seul bac qui l'a demandée (`network.md:182-192`).
     `sbx policy log` montre les requêtes bloquées (`troubleshooting.md:98-107`). `sbx policy check network`
     évalue une destination sans jamais créer de demande (`local.md:291-312`).
   - *Qui accorde.* Le développeur en local. Quand une gouvernance d'organisation est active, ses règles
     d'autorisation priment et les règles locales d'autorisation sont inactives (`network.md:26-29`).
   - *Droits fichiers.* Ils ne se règlent qu'au niveau de l'organisation. Ils sont vérifiés au montage, donc à la
     création du bac, et un refus produit l'erreur `mount policy denied` (`filesystem.md:13-18`, `filesystem.md:45-55`).
     La source ne décrit aucune découverte d'un droit fichier manquant.
   - *Fichier d'environnement.* `sbx env` montre un plan : commandes hôte, secrets, ports, chemins, variables. Il
     demande une approbation, l'enregistre, puis la redemande quand le fichier change ou qu'une ressource manque
     (`configuration/environment-files.md:441-465`). Le fichier reste hors de l'espace de travail inscriptible de
     l'agent et y est monté en lecture seule (`environment-files.md:73-83`, `environment-files.md:586-587`).

3. **Refusé quoi qu'on déclare.** Aucune règle ne peut ouvrir (`security/defaults.md:81-91`) :
   - le système de fichiers de l'hôte hors des espaces montés et du magasin de skills ;
   - le démon Docker de l'hôte ;
   - le réseau direct entre bacs ;
   - l'ICMP.

   L'UDP vers le multicast, le lien-local et la diffusion est refusé avant toute règle
   (`local.md:274-280`). Une règle de refus l'emporte sur une autorisation, et une approbation ne passe pas un refus
   (`local.md:85-86`, `network.md:112-114`).

4. **Environnement de l'hôte.**
   - *Variables et secrets.* Aucun secret n'entre dans le bac sans `sbx secret` ou sans variable passée
     explicitement (`security/defaults.md:57-60`). Une variable passe par `-e` ou `--env-file` ; un nom sans valeur
     copie la valeur de l'hôte (`usage.md:197-210`). Les secrets restent sur l'hôte : le proxy les injecte dans les
     en-têtes HTTP (`security/isolation.md:270-279`).
   - *Configuration de l'hôte.* Hors de l'espace de travail, l'agent n'a aucun accès au système de fichiers de
     l'hôte (`security/_index.md:51-53`). J'en déduis que `~/.gitconfig`, `~/.ssh`, `~/.npm` et `~/.m2` restent
     invisibles ; la source ne nomme pas ces fichiers. En mode clone, les clés de signature et le `.git/config` de
     l'hôte restent sur l'hôte, et le clone a sa propre configuration (`security/isolation.md:261-263`).
   - *Exception notable.* Le transfert de l'agent SSH de l'hôte est **actif par défaut**. Tout processus du bac peut
     faire signer par cet agent (`security/isolation.md:281-286`), et la documentation s'en sert pour signer des
     commits depuis le bac (`workflows/git.md:190-211`).
   - *Caches.* Chaque bac a son propre cache d'images et ses propres paquets, sans partage entre bacs
     (`architecture.md:53-54`).
   - *Liens.* Les liens symboliques qui pointent hors de l'espace de travail ne sont pas suivis
     (`security/isolation.md:29-31`). Un lien dur vers un fichier extérieur donne en revanche lecture et écriture sur
     ce fichier : le contrôle se fait par chemin (`security/isolation.md:151-157`). Le mode clone ferme ce trou en
     montant le dépôt en lecture seule.

5. **Tester sous confinement.** La source ne dit rien des tests de `sbx` lui-même, ni du lancement de `sbx` dans un
   bac. Le tableau local/cloud range la « nested virtualization » parmi les intégrations matérielles possibles d'un bac
   local (`cloud/local-vs-cloud.md:18`). Je n'ai trouvé aucune option qui l'active dans la référence CLI : seul
   `data/sbx_cli/` a été parcouru. Lancer un bac à sable *dans* le bac n'est pas décrit. J'en déduis, sans l'avoir
   essayé, que bubblewrap y a ses chances, puisque l'agent a sudo et un noyau à lui ; Seatbelt n'y existe pas.

6. **Frontière pour un bac à sable ou Docker.** C'est le point fort du projet. Chaque micro-VM fait tourner son propre
   Docker Engine, et l'agent n'a aucun chemin vers le démon de l'hôte (`security/isolation.md:67-83`) :
   - `docker build` et `docker compose up` visent ce moteur ;
   - les conteneurs lancés n'apparaissent pas dans le `docker ps` de l'hôte (`workflows/development.md:22-26`) ;
   - le comparatif oppose ce modèle au montage du socket (démon de l'hôte partagé) et au Docker-in-Docker (privilégié)
     (`architecture.md:142-154`).

   La source ne nomme pas Testcontainers. J'en déduis, sans l'avoir essayé, qu'un `docker run` ou Testcontainers lancé
   par le code vise le démon privé de la VM. Il lui faut deux choses : que la politique réseau laisse tirer les images
   (Balanced autorise les registres de conteneurs, `local.md:61`), et que Testcontainers trouve le socket du moteur
   interne. En bac *cloud*, `docker exec` et les healthchecks peuvent viser le système de fichiers de la VM au lieu de
   celui du conteneur (`cloud/usage.md:375-394`). La limite est documentée pour le cloud seulement.

   L'ancienne commande `docker sandbox` vivait dans Docker Desktop. Elle a été retirée en 4.80.0 [S2]. `sbx` n'exige
   ni Docker Desktop ni Docker Engine (`install.md:9-10`).

7. **Coût.**
   - *Plateformes* (`install.md:19-46`) : macOS 14 ou plus sur Apple silicon ; Windows 11 x64 avec Windows
     Hypervisor Platform ; Ubuntu 24.04 ou plus avec KVM et l'utilisateur dans le groupe `kvm`. Dans une VM, la
     virtualisation imbriquée est requise.
   - *VMM.* Docker a écrit un VMM qui s'appuie sur Hypervisor.framework, Windows Hypervisor Platform et KVM [S4].
   - *Compte.* Une connexion à un compte Docker est obligatoire (`install.md:142-151`) ; une CI passe par un jeton
     personnel (`workflows/automation.md:12-21`).
   - *Prix.* Le bac local est gratuit ; la gouvernance d'organisation est payante (`_index.md:15-23`).
   - *Ressources.* Chaque bac coûte une VM et un démon (`architecture.md:151-152`). Il n'y a pas de cache d'images
     partagé entre bacs, et l'espace disque croît avec les images (`architecture.md:53-63`).
   - *Démarrage.* Aucun chiffre : le billet dit seulement « Cold starts are fast » [S4].
   - *Entretien.* Le rythme des versions est rapide : 0.47.0 est sortie le 2026-10-05 avec des correctifs de sécurité
     du proxy (`release-notes.md:19-41`). Le binaire est fermé.

**Pour 495.**
- *Besoin 2, reprendre comme juge externe (déduction, non essayé).* Une micro-VM `sbx` avec son moteur Docker privé
  est la seule frontière étudiée ici qui fait tourner Testcontainers sans exposer le démon de l'hôte (la source le
  dit : `security/isolation.md:67-83`). Le mode clone de la même révision va avec : le dépôt est en lecture seule et
  le clone est privé (`usage.md:291-336`). 495 pourrait y déléguer les contrôles qui exigent Docker. Le prix :
  - un compte Docker ;
  - Apple silicon ou KVM ;
  - un binaire fermé ;
  - un cache d'images par bac.
- *Besoin 1, adapter le modèle d'approbation de `sbx env`.* La source décrit un plan affiché, une approbation
  enregistrée, redemandée à chaque changement, et un fichier de déclaration gardé hors de l'arbre inscriptible et monté
  en lecture seule. Pour 495, j'en déduis que la déclaration des droits d'un contrôle doit vivre hors de la copie du
  candidat, et que tout écart avec l'état approuvé doit revenir devant le propriétaire.
- *Découverte d'un droit réseau.* La file d'approbation reprend la forme visée pour 495 : refus, entrée nommée, accord
  limité à une destination exacte et à un seul bac, la requête bloquée restant refusée (`network.md:119-192`). Pour les
  fichiers, la source n'offre aucune découverte : il n'y a rien à reprendre.
- *Écarter, sur les liens.* « Liens symboliques non suivis hors de l'espace de travail » ne couvre pas le cas
  `test-output -> .`, dont la cible est *dans* l'espace de travail. Les liens durs y sont un trou déclaré. La parade de
  la source est structurelle : la source en lecture seule plus un clone privé, pas un filtrage des chemins.
- *Écarter, sur l'agent SSH.* Le transfert de l'agent SSH actif par défaut va à l'inverse de ce que 495 veut pour
  `~/.ssh`. Il faudrait le couper explicitement (`configuration/credentials.md`, section SSH agent, non lue en détail).
