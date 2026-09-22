STORY KEY: e23s03
TITLE:     Refuser un profil incapable avant une intervention facturée
TYPE:      Story
PARENT:    e23
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-22
MATURITY:  3
SIZE:      M

### 1. Business narrative [draft]

Le harnais refuse un modèle qu'il ne peut pas employer, avant d'ouvrir l'intervention qui s'en
servirait. La clause existe depuis que les capacités des moteurs ont été exprimées, et elle a un
porteur dans le code : avant chaque intervention, le noyau demande au port d'agent de décrire le
modèle retenu et refuse quand la description le dit indisponible.

Ce qu'il demande là reçoit une réponse tautologique. Le couple fournisseur-modèle est construit
depuis le modèle que Pi a déjà résolu pour la session ; la description répond « disponible » dès que
ce couple n'est pas vide. Elle ne peut donc être fausse que lorsqu'aucun modèle n'est configuré du
tout. Tout modèle configuré est déclaré capable, quoi qu'il sache faire, et la description tient en
quatre champs là où l'exigence en énumère sept sortes.

Les faits qui refuseraient sont lus, mais trop tard et pas tous. Le worker, une fois lancé, demande
à Pi si le modèle est au catalogue et si le fournisseur a une authentification valide ; chacune des
deux réponses négatives produit une intervention échouée, inscrite au dossier, qui consomme une
tentative. Un troisième fait n'est jamais lu : le niveau de raisonnement demandé. Pi rabat un niveau
non supporté sur le plus proche qu'il accepte, sans rien dire ; le dossier garde le niveau demandé,
et le fournisseur a reçu l'autre. Sur le modèle local de cette machine, `xhigh` et `max` sont dans
ce cas, et tout modèle déclaré sans raisonnement ramène n'importe quelle demande à `off`.

Tant que le témoin était le modèle local, l'écart coûtait du temps machine. La campagne suivante
consomme un quota d'abonnement. Un profil incapable qui échoue en cours d'intervention se paie ; le
même refusé avant lancement ne se paie pas.

Le résultat attendu tient en trois points. La description porte ce que l'exigence énumère — outils,
streaming, annulation, sessions, paramètres de raisonnement, limites connues, forme des résultats —
et dit de chaque valeur si elle est rapportée par Pi ou redite par 495. Elle est lue chez Pi, qui
tient le catalogue, l'authentification et les niveaux acceptés ; ce qu'il ne rapporte pas est
observé par une requête minimale, ou nommé comme non établi. Et le refus a un effet avant lancement :
le changement se bloque sur un manque de capacité, aucune intervention n'est inscrite, et le motif
nomme ce qui manque.

#### MODIFIED: AGT-01 — Décrire les capacités réelles

**Before:** le port d'agent décrit un modèle par quatre champs — le fournisseur, le modèle, un
booléen de disponibilité et des motifs. Le superviseur Pi calcule ce booléen comme « les deux
identifiants sont non vides », c'est-à-dire comme une propriété du couple qu'on lui a remis et non
du modèle qu'il désigne. Aucune des sept sortes de capacité n'est décrite. Le niveau de raisonnement
demandé est transmis à Pi tel quel et rabattu en silence s'il n'est pas supporté. Le catalogue et
l'authentification sont vérifiés dans le worker, après lancement, et produisent une intervention
échouée.

**After:** la description porte les sept sortes, chacune avec l'origine de sa valeur — rapportée par
l'hôte, ou redite par 495 — et une valeur absente là où rien ne l'établit, jamais une valeur par
défaut. Le catalogue, l'authentification et les niveaux de raisonnement acceptés sont lus chez Pi
avant lancement. Le format d'appels d'outils, que Pi ne rapporte d'aucun modèle, est observé par une
requête minimale, une fois par couple et par session. Un niveau non supporté est refusé, jamais
converti. Le refus survient avant qu'une intervention soit inscrite, et son motif nomme le fait
manquant.

### 2. Value statement [draft]

As a propriétaire d'un changement conduit sur un fournisseur facturé, I want que le harnais refuse
un modèle incapable avant d'ouvrir l'intervention, so that l'incapacité se paie une requête minimale
et non une intervention entière.

### 3. Actors and permissions [draft]

- **Superviseur d'intervention 495** (system) — décrit le modèle depuis ce que l'hôte rapporte, et
  observe ce qu'il ne rapporte pas. Il ne choisit pas le modèle et ne corrige aucun paramètre.
- **Noyau 495** (system) — refuse ou laisse passer. Il connaît le rôle, le niveau demandé et la
  politique ; c'est lui qui décide, jamais l'adaptateur.
- **Hôte Pi** (external) — tient le catalogue des modèles, l'authentification des fournisseurs et
  les niveaux de raisonnement que chaque modèle accepte. Il est la source de ce qui est rapporté.
- **Fournisseur de modèle** (external) — reçoit la requête d'observation et y répond, ou n'y répond
  pas. Rien ne l'oblige à honorer les outils qu'on lui présente.
- **Propriétaire** (external) — configure le fournisseur, le modèle et le niveau de raisonnement
  dans Pi. Il lit le refus et corrige la configuration ; il ne désactive pas la vérification.

### 4. Trigger and preconditions [draft]

**Déclencheur :** la demande de capacité que le noyau adresse au port d'agent avant chaque
intervention, au point où il juge déjà la qualification du bac à sable.

**Préconditions :**
- la destination a déjà été jugée contre la liste des sorties déclarées : un fournisseur non déclaré
  est refusé avant que quoi que ce soit lui soit envoyé, donc avant l'observation ;
- le bac à sable a déjà été jugé : un backend non qualifié refuse en premier, et le modèle n'est pas
  même décrit ;
- pour ce que Pi rapporte : le catalogue de modèles de l'hôte est atteignable depuis le processus
  qui décrit. Il l'est dans une session Pi, et il ne l'est pas ailleurs — §6e dit ce qui en découle.

### 5. Main flow and business logic [draft]

1. Une phase demande l'ouverture d'une intervention pour un rôle.
2. Le noyau juge la destination, puis le bac à sable, puis demande la description du modèle retenu.
3. Le superviseur cherche le couple au catalogue de l'hôte. Absent : la description est indisponible,
   avec ce motif, et rien d'autre n'est tenté.
4. Il demande à l'hôte si le fournisseur a une authentification complète. Non : indisponible, avec ce
   motif, et rien d'autre n'est tenté.
5. Il relève chez l'hôte ce que le modèle rapporte de lui-même — les niveaux de raisonnement
   acceptés, la fenêtre de contexte, le plafond de sortie, les modalités d'entrée — et marque chaque
   valeur comme rapportée.
6. Il renseigne les sortes que l'hôte ne rapporte d'aucun modèle — streaming, annulation, sessions —
   depuis le contrat que l'hôte publie pour tous, et les marque comme redites, avec la raison.
7. Le format d'appels d'outils n'est rapporté ni par le catalogue, ni par le fichier de déclaration
   des modèles. Le superviseur l'observe : une requête minimale, un seul outil trivial présenté,
   aucune donnée du projet. Un appel d'outil en retour établit le format ; une réponse sans appel
   l'infirme ; une erreur de transport le laisse non établi, avec le message reçu. Le résultat est
   retenu pour le couple, le temps de la session.
8. Le noyau reçoit la description et décide. Il refuse quand le couple est indisponible, quand le
   niveau de raisonnement demandé n'est pas parmi ceux que le modèle accepte, ou quand le format
   d'appels d'outils n'est pas établi — chaque rôle reçoit des outils, donc la règle ne se branche
   pas sur le rôle.
9. Un refus lève un manque de capacité nommant le fait manquant. Le changement se bloque sur ce
   motif, aucune intervention n'est inscrite, et le blocage est levable : la configuration corrigée,
   la reprise repasse par la même vérification.
10. Aucun refus : l'intervention s'ouvre comme aujourd'hui, avec le niveau demandé, dont il est
    désormais établi que le modèle l'accepte.

Interruption point: entre 8 et 9 — un refus laisse le changement bloqué et reprenable ; c'est le
seul point où cette tranche s'arrête, et elle n'a rien écrit avant lui.

### 6. Alternative flows and exceptions [draft]

6a. **Le couple n'est pas au catalogue de l'hôte** — indisponible, motif nommant le couple. Le
worker portait déjà ce constat après lancement ; il le garde, parce qu'une configuration peut changer
entre la description et le démarrage, mais il ne l'atteint plus en marche normale.

6b. **Le fournisseur n'a pas d'authentification complète** — indisponible, même traitement. Ces deux
cas sont les seuls où l'observation n'est pas tentée : demander à un endpoint qu'on ne peut pas
joindre ce qu'il sait faire n'apprendrait rien.

6c. **Le niveau de raisonnement demandé n'est pas accepté** — refus, jamais conversion. L'hôte
rabattrait le niveau sur le plus proche accepté sans le dire ; le harnais ne peut pas empêcher cette
conversion, seulement ne jamais la déclencher. Le motif nomme le niveau demandé et ceux que le
modèle accepte, de sorte que la correction se lise sans ouvrir la configuration.

6d. **L'endpoint répond sans appeler l'outil qu'on lui présente** — le format d'appels d'outils est
infirmé, et le refus le dit. C'est le cas d'un serveur local compatible dans sa forme mais démarré
sans le nécessaire aux appels d'outils : la compatibilité annoncée n'est pas la preuve, et
l'observation est ce qui les sépare.

6e. **Le catalogue de l'hôte n'est pas atteignable depuis le processus qui décrit** — indisponible,
motif le disant. L'absence de moyen de vérifier n'est pas une vérification réussie ; c'est le sens
inverse de la règle d'aujourd'hui, qui déclarait capable ce qu'elle n'avait pas regardé.

6f. **L'observation n'aboutit pas** — délai dépassé, connexion refusée, erreur du fournisseur. Le
format reste non établi et le refus porte le message reçu. Un endpoint qu'on ne joint pas pour une
requête minimale ne conduira pas une intervention.

6g. **L'observation a déjà été conduite pour ce couple dans cette session** — son résultat est repris
sans nouvelle requête. Une session qui ouvre dix interventions sur le même modèle l'observe une fois.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  aucun
Dynamic elements: le motif du blocage, là où l'opérateur lit l'état du changement
```

Rien de cette tranche n'ajoute d'affichage. Le refus emprunte le chemin qu'un manque de capacité
emprunte déjà — l'erreur de domaine, le blocage du changement, son motif et son détail — et ce
chemin est rendu par les vues existantes, en TUI comme en sortie structurée.

### 8. Domain model [draft]

**Entité touchée :** la description des capacités d'un modèle, portée par le port d'agent. Elle
garde le couple, sa disponibilité et ses motifs, et gagne les sept sortes que l'exigence énumère.

**Entité créée :** le fait de capacité — une valeur, l'origine de cette valeur, et une note. La
valeur est absente quand rien ne l'établit : une absence, jamais une valeur par défaut. L'origine
dit si l'hôte l'a rapportée ou si 495 la redit ; la note porte, dans le second cas, ce sur quoi la
redite repose, et dans le premier ce qui a été cherché et non trouvé.

**Relations changées :** aucune. Le noyau demandait déjà la description avant chaque intervention ;
il en lit davantage et décide de davantage.

**Aucun identifiant de composant nouveau :** décrire et observer appartiennent au superviseur
d'intervention, déjà au catalogue ; décider appartient au noyau, également.

**Raison de la profondeur** — l'origine paie sa place. Deux des sept sortes sont rapportées par
l'hôte modèle par modèle, trois sont redites depuis un contrat qui vaut pour tous, une est observée
et une reste parfois non établie. Une description qui les donnerait toutes du même ton ferait croire
que 495 sait de chacune ce qu'il sait des premières, et la prochaine lecture devrait refaire l'étude
pour savoir laquelle vaut quoi.

### 9. Integrations and boundaries [draft]

- **Catalogue de modèles de l'hôte** (perennial, direction: in) — source du couple, de
  l'authentification et des niveaux acceptés. Lu en mémoire, sans réseau, dans le processus de la
  session.
- **Endpoint du fournisseur** (ethereal, direction: both) — reçoit la requête d'observation et y
  répond. Une fois par couple et par session, jamais pendant une intervention.
- **Dossier du changement** (perennial, direction: out) — porte le blocage et son motif, comme tout
  manque de capacité aujourd'hui.

### 10. Background processes [draft]

Not applicable — la description est demandée avant chaque intervention, sur le fil de la phase ; ni
horloge, ni tâche différée. La mémoire du résultat vit dans le superviseur, pas dans un processus.

### 11. Notifications [draft]

Not applicable — aucun destinataire hors de la session. Le refus est rendu là où l'état du changement
est lu.

### 12. Audit and logging [draft]

**Entité auditée :** le changement, par son événement de blocage. Le blocage porte déjà un motif de
manque de capacité, son détail et le fait qu'il soit reprenable ; il portera désormais le fait
manquant nommé — le couple absent, le fournisseur non authentifié, le niveau refusé, le format non
établi.

Aucune intervention n'est inscrite pour un profil refusé : c'est la différence que cette story
installe, et elle se lit au dossier comme une absence. La requête d'observation n'est l'événement
d'aucun changement — elle précède l'intervention et ne porte rien du projet.

### 13. Solution variabilities [draft]

- **Modèle retenu** (config) — décide des niveaux acceptés et des limites rapportées. Changer de
  modèle change ce qui est refusé.
- **Niveau de raisonnement** (config) — décide du refus de §6c. Un niveau que le modèle accepte
  passe ; un autre est refusé, là où il était rabattu.
- **Endpoint du fournisseur** (config) — décide du résultat de l'observation. Le même modèle servi
  par deux endpoints n'a pas la même réponse.

### 14. Quality attributes *NFR* [draft]

- Coût des vérifications lues chez l'hôte : aucune requête, aucune entrée-sortie. Ce sont des
  lectures du catalogue déjà chargé en mémoire.
- Coût de l'observation : une requête, un outil présenté, un plafond de sortie de 256 jetons, et une
  seule par couple et par session. Ce qu'elle remplace est une intervention, dont le budget est de
  vingt minutes et cent appels d'outils.
- L'observation n'est tentée que si les vérifications gratuites passent : un couple absent ou non
  authentifié ne produit aucune requête.
- Un refus survient avant que la première tentative soit inscrite : le budget de tentatives du
  changement est intact quand l'opérateur corrige la configuration.

### 15. Security and compliance *NFR* [draft]

- **Authentification :** aucune côté 495. L'hôte présente ses propres identifiants pour la requête
  d'observation comme pour une intervention ; 495 ne les lit pas et n'en compose aucun en-tête.
- **Autorisation :** la destination de l'observation est celle qui a déjà été jugée contre les
  sorties déclarées, parce que le jugement de la destination précède la description dans le même
  appel. Aucune requête ne part vers un fournisseur non déclaré.
- **Classification des données :** la requête d'observation ne porte rien du projet — ni extrait, ni
  invite, ni chemin, ni nom de fichier. Son texte est fixe et tient en deux phrases.
- **Contrôles :** refus fermé sur les trois clauses ; absence de moyen de vérifier traitée comme
  refus et non comme succès.
- **Limite revendiquée :** 495 ne peut pas empêcher l'hôte de rabattre un niveau de raisonnement, il
  peut seulement ne jamais lui en demander un qu'il rabattrait. Si la configuration change entre la
  description et le démarrage du worker, le constat tardif du worker reste le dernier filet.

### 16. UX and accessibility *NFR* [draft]

- Les motifs de refus sont en anglais, comme les autres messages d'erreur de domaine du dépôt, et
  nomment le fait manquant plutôt que la règle enfreinte.
- Le motif d'un niveau refusé porte le niveau demandé et la liste de ceux que le modèle accepte : la
  correction se déduit du message.
- Aucun affichage n'est ajouté et aucune modalité nouvelle n'est requise : le blocage se lit là où
  les blocages se lisent déjà.

### 17. Acceptance criteria [reviewed]

```
Scenario: La description porte ce que l'exigence énumère (§5)
  Given un modèle que l'hôte rapporte
  When  le superviseur décrit ce modèle
  Then  la description porte les outils, le streaming, l'annulation, les sessions, les niveaux de
        raisonnement, les limites connues et la forme des résultats
  And   chaque sorte dit si sa valeur est rapportée par l'hôte ou redite par 495
  And   une sorte que rien n'établit porte une valeur absente et la note de ce qui a été cherché

Scenario: Un couple absent du catalogue est refusé avant lancement (6a)
  Given un couple fournisseur-modèle que l'hôte ne connaît pas
  When  le noyau demande la capacité pour un rôle
  Then  il refuse sur un manque de capacité nommant le couple
  And   aucun worker n'est démarré

Scenario: Un fournisseur sans authentification est refusé avant lancement (6b)
  Given un couple au catalogue dont le fournisseur n'a pas d'authentification complète
  When  le noyau demande la capacité pour un rôle
  Then  il refuse sur un manque de capacité nommant l'authentification
  And   aucune requête n'est émise vers le fournisseur

Scenario: Un niveau de raisonnement non supporté est refusé, jamais converti (6c)
  Given un modèle dont l'hôte rapporte qu'il n'accepte pas le niveau demandé
  When  le noyau demande la capacité pour un rôle
  Then  il refuse sur un manque de capacité nommant le niveau demandé et ceux que le modèle accepte
  And   aucune intervention n'est ouverte avec un niveau différent de celui qui a été demandé

Scenario: Un endpoint local sans appels d'outils est refusé avant lancement (6d)
  Given un endpoint local que sa déclaration annonce compatible
  And   qui répond sans appeler l'outil qu'on lui présente
  When  le noyau demande la capacité pour un rôle
  Then  il refuse sur un manque de capacité nommant le format d'appels d'outils
  And   le changement se bloque sans qu'aucune intervention soit inscrite

Scenario: Un endpoint qui appelle l'outil est accepté (§5)
  Given un endpoint local qui répond par un appel de l'outil qu'on lui présente
  When  le noyau demande la capacité pour un rôle
  Then  il ne refuse pas
  And   l'intervention s'ouvre avec le niveau de raisonnement demandé

Scenario: Un catalogue hors d'atteinte ne vaut pas une vérification (6e)
  Given un superviseur qui n'a reçu aucun catalogue de modèles
  When  il décrit le modèle retenu
  Then  la description est indisponible et dit que le couple n'a pas pu être consulté
  And   aucune sorte de capacité n'est affirmée

Scenario: L'observation n'est conduite qu'une fois par couple (6g)
  Given un couple dont le format d'appels d'outils a déjà été observé dans cette session
  When  le noyau demande la capacité pour une seconde intervention sur le même couple
  Then  aucune requête n'est émise vers le fournisseur
  And   la description porte le résultat de la première observation
```

### 18. Out of scope [draft]

- Les limites rapportées — fenêtre de contexte, plafond de sortie, taille maximale de requête — sont
  décrites mais ne fondent aucun refus. Les opposer au budget d'entrée d'une intervention demanderait
  de convertir des octets en jetons, donc de poser un rapport que rien ne mesure ; la story préfère
  porter la limite à celui qui lit plutôt qu'un chiffre inventé.
- Le changement de modèle en cours de session n'est pas suivi. L'hôte publie l'événement qui
  l'annonce, et 495 fige le couple à la première ouverture de son runtime ; ce que vaut le couple
  figé face au modèle courant est un sujet distinct, qui touche le cycle de vie du runtime et non la
  description des capacités.
- Aucune variante d'instruction indexée sur les capacités décrites. Adapter ce que 495 écrit à ce que
  le modèle sait faire appartient au travail sur les invites, qui le porte comme axe de dépendance au
  modèle.
- La comptabilité des jetons n'est pas touchée. Ce que la compaction et les réessais consomment reste
  hors du compteur, comme aujourd'hui ; c'est un sujet propre, dû avant la campagne et non avant
  cette story.
- Le refus tardif du worker n'est pas retiré. Il devient inatteignable en marche normale et reste le
  filet du cas où la configuration change entre la description et le démarrage.

### 19. Open questions [draft]

- Une requête d'observation par couple et par session est-elle le bon rythme sur un fournisseur
  facturé, ou faut-il retenir le résultat au-delà de la session — et alors, sous quelle clé et avec
  quelle péremption ? — owner: jeanjerome, needed by: 2026-10-05
- Le harnais laisse l'hôte résumer la conversation quand elle devient trop longue, et n'observe rien
  de ce que ce résumé produit. Avant la première campagne facturée : couper le résumé, l'observer et
  l'enregistrer, ou mesurer d'abord si le cas peut seulement survenir dans le budget d'une
  intervention ? — owner: jeanjerome, needed by: 2026-10-05

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` § AGT-01 — la clause exercée ici, et sa recette.
- `specs/archive/amont/expression-besoins.md` § AGT-02 — la seconde clause de sa recette, qu'aucun
  fournisseur ne mettait à l'épreuve.
- `specs/adr/D-46-un-second-fournisseur-de-modele-est-qualifie-avant-le-reste.md` — pourquoi le refus
  d'un profil incompatible doit avoir un effet avant la campagne.
- `specs/adr/D-55-495-s-appuie-sur-l-api-de-pi-avant-de-reconstruire-ou-de-deduire.md` — la règle qui
  fait de ce que l'hôte rapporte la source, et de ce que 495 redit une attente.
- `specs/adr/D-57-le-format-d-appels-d-outils-est-observe-une-fois-par-couple.md` — pourquoi le seul
  fait que l'hôte ne rapporte pas est observé, à quel rythme, et ce que l'observation coûte.
- `specs/epics/e23-second-fournisseur-de-modele-qualifie/epic.yaml` — la position de cette story dans
  l'epic et le motif de son rang.
- `specs/epics/e23-second-fournisseur-de-modele-qualifie/e23s01-la-sortie-de-donnees-vers-le-fournisseur-est-declaree.md`
  — la story qui juge la destination avant que la description soit demandée.
