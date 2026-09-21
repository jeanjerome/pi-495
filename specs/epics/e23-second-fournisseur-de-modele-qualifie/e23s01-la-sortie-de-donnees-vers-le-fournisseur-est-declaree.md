STORY KEY: e23s01
TITLE:     Déclarer la sortie de données vers le fournisseur de modèle
TYPE:      Story
PARENT:    e23
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-21
MATURITY:  3
SIZE:      S

### 1. Business narrative [draft]

495 n'appelle jamais un modèle lui-même. Il remet un mandat à un processus worker, et ce worker
joint le fournisseur configuré dans Pi. Pour qu'il le puisse, il est le seul processus du harnais
qui ne soit pas confiné pour le réseau. Cette exemption est une décision prise et écrite, mais elle
est portée par une omission : le worker est démarré sans passer par le bac à sable, et rien dans le
code ne dit que cette omission est voulue ni ce qu'elle laisse partir.

Tant que le seul fournisseur configuré répond sur `127.0.0.1`, la question reste théorique : rien ne
quitte la machine. Elle cesse de l'être dès qu'un fournisseur distant est qualifié. Ce qui part
alors, ce sont les extraits de code et les invites — l'essentiel de ce qu'une intervention a lu. La
campagne qui mesure l'absence de télémétrie porte sur la télémétrie du produit et affirme qu'aucune
connexion n'est ouverte ; elle ne mesure pas le canal modèle, et sa lettre laisserait croire le
contraire à qui la lit vite.

L'exigence de réduction d'exposition réclame trois choses : une liste explicite des variables
d'environnement et secrets transmis, une politique de sorties réseau, et l'expurgation des rapports.
Les deux premières n'existent pas pour le canal modèle. La troisième n'existe qu'à l'export. Le
résultat attendu est qu'une destination soit écrite avant qu'on lui envoie quoi que ce soit, qu'une
destination non écrite soit refusée, et qu'un secret du contrôleur n'emprunte le canal dans aucun
sens.

#### MODIFIED: SEC-05 — Réduire l'exposition de données

**Before:** l'exigence est tenue sur les seuls artefacts. Le service d'export expurge les objets
textuels d'un dossier, signale ce qu'il a retiré, et la matrice de traçabilité porte l'exigence sur
ce service et sur lui seul. Aucune politique de sorties réseau n'existe : le mot « réseau » ne
désigne dans les sources que le confinement d'un processus lancé, sous trois valeurs — refusé,
boucle locale, autorisé. Le canal par lequel les extraits et les invites atteignent le modèle n'est
nommé nulle part, et le processus qui l'emprunte échappe au confinement par omission.

**After:** la politique active porte la liste des destinations vers lesquelles des extraits et des
invites ont le droit de partir, chacune située — sur la machine, ou hors d'elle. Une intervention
dont la destination n'est pas dans cette liste est refusée avant qu'aucun processus ne démarre,
sous le motif de refus par politique qui existe déjà. Un secret sentinelle placé dans
l'environnement du contrôleur n'atteint ni l'environnement du worker ni le texte remis au modèle,
et son retrait de l'export reste signalé par son emplacement et son compte, jamais par sa valeur.

### 2. Value statement [draft]

As a propriétaire du harnais, I want que toute destination recevant des extraits de mon code soit
déclarée avant d'être jointe et refusée sinon, so that ouvrir un fournisseur distant soit une
décision écrite et non un effet de bord de la configuration.

### 3. Actors and permissions [draft]

- **Propriétaire** (external) — écrit la liste des destinations déclarées dans la configuration du
  harnais ; c'est la seule autorité qui l'élargit.
- **Contrôleur 495** (system) — lit la liste, refuse une intervention dont la destination en est
  absente, n'écrit jamais dans la liste.
- **Producteur / worker Pi** (system) — joint la destination ; ne lit pas la liste et ne peut pas
  l'élargir, conformément à l'interdiction faite à un producteur de modifier la politique.
- **Lecteur d'un dossier** (external) — lit dans l'état exporté d'un changement quelle destination
  a été employée, sans accès à la machine qui l'a produit.

### 4. Trigger and preconditions [draft]

**Déclencheur :** l'ouverture d'une intervention, au point où le superviseur vérifie déjà qu'un bac
à sable est qualifié et qu'un modèle est disponible.

**Préconditions :**
- la politique active est chargée, depuis la configuration ou par défaut ;
- une sélection de modèle peut être résolue ou non : quand elle ne l'est pas, l'identifiant de
  fournisseur est vide, et c'est la vérification de capacité qui le nomme, pas la déclaration ;
- aucun processus worker n'a encore été démarré.

### 5. Main flow and business logic [reviewed]

1. Le harnais charge la politique active. À défaut de configuration, la liste déclarée contient la
   seule destination employée aujourd'hui : le fournisseur local, situé sur la machine.
2. Une phase demande l'ouverture d'une intervention pour un rôle.
3. Le superviseur lit l'identifiant de fournisseur de la sélection de modèle.
4. Il le compare à la liste déclarée. La comparaison est exacte : ni motif, ni préfixe, ni joker.
5. Destination déclarée : le superviseur poursuit sur la vérification de capacité qui existe déjà —
   bac à sable qualifié, puis modèle disponible — puis construit le mandat et démarre le worker.
6. Le mandat porte un profil dont le réseau reste refusé. La déclaration ne confine rien : elle dit
   ce qui sort, l'exemption dit ce qui est permis, et les deux restent des objets distincts.
7. L'environnement remis au worker reste la liste courte déjà en place ; aucune variable du
   contrôleur ne s'y ajoute.
8. L'identifiant de fournisseur employé est déjà inscrit à l'état du changement, donc déjà porté au
   dossier exporté. Rien n'est à ajouter pour qu'un lecteur du dossier sache où les extraits sont
   allés.

Interruption point: entre les étapes 4 et 5 — la destination est jugée, rien n'est encore engagé.

### 6. Alternative flows and exceptions [draft]

6a. **Destination non déclarée** — le superviseur lève un refus par politique avant l'étape 5.
Aucun processus n'est démarré, aucune intervention n'est ouverte, aucun octet n'est émis. Le refus
lui-même est inscrit au journal comme tout blocage — voir §12. Le motif d'arrêt est celui du refus
par politique, il est déclaré reprenable, et les actions proposées nomment la déclaration à écrire
avant la sélection du modèle. La déclaration étant lue au démarrage, le message dit qu'une nouvelle
prend effet dans une nouvelle session : une reprise dans la même session serait jugée contre la
politique d'avant l'édition.

6b. **Liste déclarée vide** — aucune intervention ne peut démarrer. C'est le comportement voulu et
non une panne : une liste vide dit qu'aucune destination n'a été écrite. Le refus nomme la liste
vide plutôt que la destination, pour que la cause soit lisible sans deviner.

6c. **Configuration partielle** — une configuration qui mentionne la politique sans mentionner la
liste garde la liste par défaut. Une configuration qui mentionne la liste la remplace entièrement.
Une fusion qui viderait la liste en silence transformerait une configuration anodine en interdiction
générale.

6d. **Secret sentinelle dans l'environnement du contrôleur** — il n'atteint ni l'environnement du
worker, construit à partir d'une liste courte et fermée, ni le texte remis au modèle, que le
constructeur de contexte compose sans lire l'environnement.

6e. **Secret sentinelle dans un objet textuel du dossier** — l'export expurgé le remplace, et le
signalement porte l'emplacement et le compte des retraits. La valeur retirée n'apparaît ni dans le
signalement, ni dans le manifeste, ni dans un diagnostic.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  entrée de configuration portant la liste déclarée ; valeur par défaut du harnais
Dynamic elements: message de refus nommant la destination et la liste ; motif d'arrêt du changement
```

Le refus emprunte le chemin de présentation existant : il est rendu dans chaque entrée Pi qualifiée
sans composant propre.

### 8. Domain model [draft]

**Entité touchée :** la politique active du noyau de domaine, objet configuré avant exécution,
versionné, qu'un producteur ne modifie jamais. Elle gagne un champ décrivant les sorties déclarées :
une liste de destinations, chacune portant l'identifiant de fournisseur et sa situation — sur la
machine ou hors d'elle.

**Entité créée :** aucune. Aucun identifiant de composant nouveau : la déclaration appartient au
noyau de domaine, le refus au superviseur d'intervention, tous deux déjà au catalogue.

**Relations changées :** aucune. Le superviseur lit déjà la politique pour ses budgets ; il y lit
une chose de plus.

**Raison de la profondeur** — la situation de chaque destination (sur la machine ou hors d'elle) est
le seul élément de structure ajouté au-delà d'une liste de chaînes. Elle est ce qui distingue une
invite qui reste sur `127.0.0.1` d'une invite remise à un tiers, c'est-à-dire exactement ce que
l'exigence cherche à réduire ; sans elle la liste dit qui, jamais si quelque chose est sorti.

### 9. Integrations and boundaries [draft]

- **Fournisseur de modèle, par le worker Pi** (perennial, direction: both) — la frontière que cette
  story déclare. 495 ne compose ni l'adresse, ni les en-têtes, ni l'authentification : Pi résout le
  fournisseur depuis sa propre configuration et présente un jeton d'abonnement. Ce que 495 tient est
  le droit de partir, pas le départ lui-même.
- **Configuration du harnais** (perennial, direction: in) — source de la liste déclarée.
- **Dossier exporté** (perennial, direction: out) — porte déjà l'identifiant de fournisseur employé
  dans l'état du changement.

### 10. Background processes [draft]

Not applicable — la déclaration est lue au démarrage d'une intervention, jamais sur horloge ni sur
événement différé.

### 11. Notifications [draft]

Not applicable — aucun destinataire hors de la session en cours ; le refus est rendu à l'appelant
par le chemin de diagnostic existant.

### 12. Audit and logging [draft]

**Entité auditée :** l'intervention. Le champ qui porte l'audit de cette story — l'identifiant de
fournisseur et de modèle employés — est déjà inscrit à l'état du changement et déjà écrit dans le
dossier exporté. Un lecteur du dossier sait donc vers quelle destination les extraits sont partis
sans consulter la machine.

Un refus pour destination non déclarée n'ouvre aucune intervention, donc le journal ne porte aucune
trace d'intervention. Il porte en revanche le refus lui-même : le noyau inscrit un blocage, de motif
`policy_denied`, comme pour tout autre refus — c'est ce qui rend un dossier clos lisible. Le détail
de ce blocage nomme les destinations déclarées, et le flux d'événements part au dossier exporté :
les noms des fournisseurs que cette installation a le droit de joindre voyagent donc avec tout
dossier remis à un tiers. Ce sont des noms de politique, pas des secrets, et le dire ici vaut mieux
que le laisser découvrir.

### 13. Solution variabilities [reviewed]

- **Liste des destinations déclarées** (config) — vide : aucune intervention ne démarre. Par
  défaut : le fournisseur local seul. Élargie : chaque destination écrite autorise son fournisseur
  et aucun autre.
- **Situation d'une destination** (config) — sur la machine, ou hors d'elle. Ne change aucun refus
  aujourd'hui ; elle est ce qu'un lecteur interroge pour savoir si quelque chose est sorti.

### 14. Quality attributes *NFR* [draft]

- Refus d'une destination non déclarée : 0 processus démarré, 0 octet émis, 0 intervention ouverte.
- Coût de la décision : une appartenance à une liste, mesurée à 0,00001 ms sur dix entrées, au pire
  cas sans correspondance. Rien ne borne la longueur de la liste ; la mesure dit ce qu'elle coûte,
  pas ce qu'elle promet.
- La décision est prise deux fois par intervention : à l'ouverture, puis à l'entrée du superviseur
  qui démarre le worker. La seconde ne peut plus garder le journal propre — elle arrête le worker.

### 15. Security and compliance *NFR* [draft]

- **Authentification :** aucune côté 495 ; les identifiants du fournisseur restent gérés par Pi et
  leur fichier est refusé en lecture par le profil de bac à sable.
- **Autorisation :** la liste déclarée est une politique du contrôleur. Un producteur ne peut ni la
  lire ni l'élargir ; une configuration de projet ne peut pas élargir une politique supérieure.
- **Classification des données :** extraits de code source et invites du projet cible —
  confidentiels. Secrets du contrôleur — jamais transmis.
- **Contrôles :** liste fermée des variables d'environnement remises au worker ; constructeur de
  contexte qui ne lit pas l'environnement ; expurgation à l'export signalée par emplacement et
  compte, jamais par valeur ; refus par politique avant tout engagement.
- **Limite revendiquée :** le confinement des voies d'action est revendiqué pour les outils, pas
  pour le canal modèle. Cette story ne referme pas cet écart ; elle le déclare et lui donne un
  droit d'entrée.

### 16. UX and accessibility *NFR* [draft]

- Le message de refus est disponible dans chaque entrée Pi qualifiée — affichage, appel structuré,
  mode imprimé — avec le même verdict sur les mêmes faits, et sans composant d'affichage imposé aux
  modes sans écran.
- Langue : les intitulés de l'affichage suivent la configuration, française par défaut ; le détail
  du refus lui-même est en anglais, comme tout détail d'erreur du noyau. Le traduire déborde cette
  story et vaudrait pour tous les motifs d'arrêt, pas pour celui-ci seul.
- Le refus nomme la destination refusée et la liste déclarée, de sorte que la correction se déduise
  du message sans lire le code.

### 17. Acceptance criteria [reviewed]

```
Scenario: Une destination déclarée ouvre l'intervention (§5)
  Given une politique dont la liste déclarée porte le fournisseur de la sélection de modèle
  When  une phase demande l'ouverture d'une intervention
  Then  le superviseur poursuit sur la vérification de capacité existante
  And   le profil du mandat porte toujours un réseau refusé

Scenario: Une destination non déclarée est refusée avant tout engagement (6a)
  Given une politique dont la liste déclarée ne porte pas le fournisseur de la sélection de modèle
  When  une phase demande l'ouverture d'une intervention
  Then  un refus par politique est levé
  And   aucun processus worker n'a été démarré
  And   aucune intervention n'est ouverte

Scenario: Une liste vide refuse toute intervention et le dit (6b)
  Given une politique dont la liste déclarée est vide
  When  une phase demande l'ouverture d'une intervention
  Then  un refus par politique est levé
  And   le message nomme la liste vide plutôt que la destination

Scenario: Une configuration partielle ne vide pas la liste (6c)
  Given une configuration qui mentionne la politique sans mentionner la liste déclarée
  When  la configuration est chargée
  Then  la liste déclarée est celle du harnais par défaut
  And   une configuration qui mentionne la liste la remplace entièrement

Scenario: Un secret du contrôleur n'emprunte pas le canal modèle (6d)
  Given un secret sentinelle placé dans l'environnement du contrôleur
  When  une intervention est ouverte sur une destination déclarée
  Then  l'environnement remis au worker ne porte pas le secret
  And   le texte remis au modèle ne porte pas le secret

Scenario: Un secret retiré du dossier est signalé sans être divulgué (6e)
  Given un objet textuel du dossier portant un secret sentinelle
  When  le dossier est exporté en profil expurgé
  Then  le secret n'apparaît dans aucun objet textuel du dossier
  And   le signalement porte l'emplacement et le compte des retraits
  And   le signalement ne porte pas la valeur retirée
```

### 18. Out of scope [draft]

- Le bac à sable ne bouge pas. Le worker reste exempté de confinement réseau pour joindre le
  fournisseur, et cette story ne tente pas de le confiner : une extension Pi ne peut pas confiner
  l'appel modèle sans priver le worker du fournisseur.
- La politique n'est pas écrite au dossier exporté comme artefact à part. L'identifiant de
  fournisseur employé y figure par l'état du changement, et les destinations déclarées y figurent
  par le détail d'un blocage quand il y en a eu un : cela suffit à dire où les extraits sont allés,
  et en ajouter une copie serait une garantie de second ordre qu'aucune exigence ne réclame.
- L'observation effective du trafic n'est pas revendiquée. 495 tient le droit de partir, jamais le
  départ : rien ici ne vérifie qu'aucune connexion vers une destination non déclarée n'a lieu.
- La qualification du fournisseur d'abonnement, la mesure du bloc système qu'il impose et le
  remesurage des budgets appartiennent aux stories suivantes de l'epic.
- L'expurgation du texte remis au modèle n'est pas entreprise. Cette story prouve qu'aucun secret du
  contrôleur n'y entre ; expurger les extraits du projet cible eux-mêmes serait un autre objet.

### 19. Open questions [draft]

- Quel identifiant de fournisseur porte le chemin d'abonnement de Pi — le fichier d'identifiants de
  la machine est vide, aucun abonnement n'y est configuré, et la valeur ne se lit donc nulle part
  aujourd'hui. Elle se relève au moment où l'abonnement est ajouté, ce que la story de campagne
  suppose faite. — owner: jeanjerome, needed by: 2026-10-05
- Faut-il qu'une destination située hors de la machine demande une confirmation la première fois
  qu'elle est employée, en plus d'être déclarée. La déclaration seule suffit à cette story ; la
  question se repose quand une destination distante entre réellement dans la liste. — owner:
  jeanjerome, needed by: 2026-10-05

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` — SEC-05, exigence de réduction d'exposition et sa
  recette ; NFR-06, dont la campagne porte sur la télémétrie produit et non sur ce canal.
- `specs/adr/D-11-modele-de-confinement-du-worker-pi.md` — l'exemption de confinement réseau du
  worker, et la limite qu'elle pose au confinement revendiqué.
- `specs/adr/D-46-un-second-fournisseur-de-modele-est-qualifie-avant-le-reste.md` — l'écart que
  cette story ferme, nommé dans ses conséquences.
- `specs/adr/D-49-l-identite-claude-cli-est-acceptee-pour-la-seule-machine-de-reference.md` — 495 ne
  compose pas les en-têtes du fil ; la destination est choisie par Pi.
- `specs/adr/D-52-une-commande-verify-s-ecrit-rouge.md` — pourquoi les commandes de ce plan échouent
  au moment où elles sont écrites.
- `specs/tech-architecture/IMPACT_LATEST.md` — rayon d'impact relevé avant ce plan.
- `specs/epics/e23-second-fournisseur-de-modele-qualifie/epic.yaml` — position de la story dans
  l'ordre contraint de l'epic.
