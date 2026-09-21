STORY KEY: e23s02
TITLE:     Déclarer au manifeste la strate imposée par le fournisseur
TYPE:      Story
PARENT:    e23
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-21
MATURITY:  3
SIZE:      M

### 1. Business narrative [draft]

Le manifeste de contexte énonce ce qui a été mis devant le modèle : les instructions de confiance
que 495 compose, les révisions adoptées par référence et par empreinte, les extraits du projet
étiquetés non fiables, le budget d'entrée et le schéma de sortie attendu. Il est écrit au dossier à
chaque intervention, et il est la seule pièce qui dise ce qu'une intervention a reçu. Le texte
exact remis au modèle est déposé à côté, adressé par empreinte, de sorte qu'un lecteur du dossier
puisse le relire plutôt que le reconstituer.

Tant que le fournisseur configuré répond sur la boucle locale, ce que 495 compose est tout ce que
le modèle reçoit, et le manifeste est vrai sans rien avoir à déclarer. Le chemin d'abonnement
change cela. Le fournisseur écrit un premier bloc système de son cru, au-dessus des instructions de
495, qui passent en second. Rien dans le harnais ne l'écrit, rien ne l'empêche, et rien ne le dit :
le manifeste continue d'affirmer la seule liste qu'il compose, et affirme donc à faux la totalité
de ce qui a été mis devant le modèle.

Un manifeste faux vaut moins qu'aucun manifeste : il fait croire à une garantie qui n'existe pas.
L'exigence de maîtrise des instructions effectives porte déjà la clause qui répond à ce cas — les
contraintes imposées par un fournisseur doivent être reconnues comme extérieures à la hiérarchie
locale — mais elle n'a jamais été éprouvée, faute d'un fournisseur qui en impose. La déclarer est
donc le premier exercice de la clause, et non une entorse.

Le résultat attendu tient en trois points. La strate imposée est nommée au manifeste, distincte des
instructions de confiance et située au-dessus d'elles. Elle est renseignée depuis le fournisseur
retenu, et vide pour un fournisseur qui n'impose rien. Et un contrôle relit le paquet du
fournisseur que le dépôt épingle : il refuse quand le texte imposé, la condition à laquelle il
s'applique ou sa position ne sont plus ce que la déclaration affirme.

#### MODIFIED: CTX-02 — Maîtriser les instructions effectives

**Before:** la hiérarchie est appliquée et le manifeste en porte la moitié locale : les instructions
de confiance composées par le constructeur de contexte, dans leur ordre, et les données du projet
étiquetées non fiables. Aucune strate extérieure n'est nommée nulle part. Le mot « fournisseur » ne
désigne dans les sources qu'un identifiant de sélection de modèle et une destination déclarée ; la
clause exigeant que les contraintes imposées par un fournisseur soient reconnues comme extérieures
à la hiérarchie locale n'a aucun porteur dans le code. Un fournisseur qui écrit au-dessus de 495
rend le manifeste faux sans que rien ne le relève.

**After:** le manifeste porte une liste de strates imposées, à côté des instructions de confiance
et jamais mêlée à elles. Chaque strate nomme le fournisseur qui l'impose, sa position par rapport
aux instructions locales, la condition à laquelle le fournisseur l'applique, et son texte mot pour
mot. La liste est renseignée depuis le fournisseur retenu pour l'intervention, et vide — présente,
mais vide — pour un fournisseur qui n'impose rien. Un contrôle lit le paquet du fournisseur épinglé
par le dépôt, y relève le bloc imposé, et refuse quand le texte, la condition ou la position
diffèrent de ce qui est déclaré.

### 2. Value statement [draft]

As a lecteur d'un dossier 495, I want que le manifeste nomme ce qu'un fournisseur a mis devant le
modèle sans passer par 495, so that ce que je lis soit ce que le modèle a reçu et non la seule part
que le harnais a composée.

### 3. Actors and permissions [draft]

- **Constructeur de contexte 495** (system) — nomme la strate au manifeste ; ne la compose pas, ne
  l'émet pas, ne peut pas l'empêcher.
- **Fournisseur de modèle** (external) — impose la strate. Il n'est lié par aucune politique du
  harnais et ne lit rien de lui.
- **Propriétaire** (external) — choisit le fournisseur, donc décide indirectement si une strate est
  imposée. Il n'écrit pas la déclaration : ce qu'un fournisseur impose est un fait constaté sur son
  paquet, pas une politique à configurer.
- **Lecteur d'un dossier** (external) — lit au manifeste ce que 495 n'a pas composé, sans accès à
  la machine qui l'a produit.
- **Contrôle de Preflight** (system) — relit le paquet épinglé et refuse l'écart. Il ne corrige
  rien et ne met à jour aucune déclaration.

### 4. Trigger and preconditions [draft]

**Déclencheur :** la construction du contexte d'une intervention, au point où le noyau compose déjà
les instructions de confiance et le manifeste qui les énumère.

**Préconditions :**
- la sélection de modèle est connue du noyau — résolue, ou vide quand aucun modèle n'est configuré ;
- la destination a déjà été jugée contre la liste des sorties déclarées, donc le fournisseur nommé
  ici est un fournisseur que la politique autorise à recevoir des extraits ;
- pour le contrôle seul : le paquet du fournisseur est une dépendance du dépôt, donc présent partout
  où Preflight s'exécute.

### 5. Main flow and business logic [draft]

1. Une phase demande l'ouverture d'une intervention pour un rôle.
2. Le noyau lit l'identifiant du fournisseur dans la sélection de modèle qu'il tient déjà.
3. Il demande au domaine les strates que ce fournisseur impose. La réponse est une liste, vide pour
   un fournisseur qui n'impose rien et pour un fournisseur dont rien n'est su.
4. Le constructeur de contexte reçoit cette liste en entrée. Il ne la joint pas aux instructions de
   confiance : ces strates ne sont pas de lui, et les ranger parmi ce qu'il compose serait
   exactement la falsification que cette story corrige.
5. Il compose les instructions locales comme aujourd'hui, sans rien y changer, et le manifeste porte
   les deux listes côte à côte — ce que 495 a écrit, et ce qu'un tiers écrit au-dessus.
6. Chaque strate déclarée nomme quatre choses : le fournisseur qui l'impose, sa position par rapport
   aux instructions locales, la condition à laquelle le fournisseur l'applique, et son texte mot
   pour mot.
7. Le manifeste est écrit à l'état du changement et le texte réellement remis part au magasin
   d'objets, l'un et l'autre inchangés dans leur mécanique : 495 n'émet pas cette strate, donc
   l'enregistrement de ce qu'il a émis ne la contient pas.
8. Hors intervention, au moment de Preflight, un contrôle lit le paquet du fournisseur épinglé par
   le dépôt, y relève le bloc imposé avec sa condition et sa position, et les compare à la
   déclaration. Une égalité laisse passer ; tout écart refuse.

Interruption point: N/A — la construction du contexte est synchrone et sans effet de bord ; le
contrôle est une lecture de fichiers qui ne laisse rien derrière elle.

### 6. Alternative flows and exceptions [draft]

6a. **Fournisseur qui n'impose rien** — le fournisseur local en est un. Le manifeste porte une
liste vide, et non un champ absent : un champ absent ne se distingue pas d'une version du harnais
qui ne savait pas encore répondre à la question, alors qu'une liste vide est une réponse.

6b. **Sélection de modèle non résolue** — l'identifiant de fournisseur est vide. Aucune strate n'est
déclarée. L'absence de modèle configuré est déjà nommée là où elle se décide, par la vérification de
capacité ; y répondre ici donnerait deux diagnostics à une seule cause.

6c. **Fournisseur inconnu de la déclaration** — liste vide également. 495 ne devine pas : d'un
fournisseur dont il ne sait rien, il ne déclare rien, et le manifeste ne prétend pas le contraire.
C'est une garantie plus faible que la précédente, et §15 la nomme comme telle.

6d. **Le paquet épinglé ne porte plus le texte déclaré** — le contrôle refuse et montre les deux
textes, le relevé en regard du déclaré, pour que l'écart se lise sans ouvrir le paquet.

6e. **Le paquet épinglé ne porte plus la forme que le contrôle sait lire** — le contrôle refuse
aussi, en disant qu'il n'a rien pu relever. Ne rien trouver n'est pas la preuve que rien n'est
imposé : c'est la perte du moyen de le vérifier, et un contrôle qui laisserait passer cette
perte-là ne refuserait plus jamais rien.

6f. **Le fournisseur applique sa strate sous une condition que 495 n'observe pas** — le bloc n'est
imposé que sur le chemin d'abonnement, et 495 ne connaît que l'identifiant de fournisseur, jamais le
mode d'authentification que le paquet hôte a retenu. La strate est donc déclarée dès que le
fournisseur est retenu, avec sa condition écrite en toutes lettres. Le manifeste sur-déclare alors
une contrainte au lieu d'en taire une — l'erreur est prise dans le sens prudent, et §19 la porte
comme question ouverte.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  la liste des strates imposées, dans le manifeste écrit au dossier
Dynamic elements: le message du contrôle, nommant le texte relevé en regard du texte déclaré
```

Rien de cette tranche n'atteint l'affichage ni les entrées structurées : ce qu'elle écrit est un
artefact du dossier, et ce qu'elle refuse est refusé à Preflight, par le chemin que les autres
contrôles empruntent déjà.

### 8. Domain model [draft]

**Entité créée :** la strate imposée — un identifiant de fournisseur, une position relative aux
instructions locales, la condition d'application, et le texte. Elle appartient au noyau de domaine,
avec la déclaration des strates connues, parce qu'elle est un fait pur : aucune entrée-sortie,
aucune horloge, aucune configuration.

**Entité touchée :** le manifeste de contexte, qui gagne la liste de ces strates à côté des
instructions de confiance. Son entrée de construction gagne la même liste, que le noyau remet depuis
la sélection de modèle qu'il tient déjà.

**Relations changées :** aucune. Le noyau lit déjà la sélection de modèle pour ouvrir une
intervention ; il en tire une chose de plus avant de construire le contexte.

**Aucun identifiant de composant nouveau :** le module de déclaration existe pour le constructeur de
contexte et rien d'autre ; il porte son identifiant, déjà au catalogue.

**Raison de la profondeur** — au-delà d'une simple chaîne de texte, la strate porte deux champs, et
chacun paie sa place. La position est le sujet même de la story : un bloc écrit au-dessus des
instructions locales ne laisse pas celles-ci dire la même chose qu'un bloc écrit en dessous, et un
manifeste qui donnerait le texte sans dire où il tombe ne réglerait rien. La condition est ce qui
garde la déclaration honnête sur un fournisseur joignable de deux façons : sans elle, la
sur-déclaration décrite en §6f serait invisible au lecteur du dossier.

### 9. Integrations and boundaries [draft]

- **Fournisseur de modèle, par le worker** (perennial, direction: both) — celui qui impose la
  strate. 495 ne compose ni l'adresse, ni les en-têtes, ni l'authentification ; il constate.
- **Paquet du fournisseur épinglé par le dépôt** (perennial, direction: in) — lu par le seul
  contrôle, jamais pendant une intervention. C'est une dépendance du dépôt, donc une version connue
  et reproductible, et non ce que telle machine a installé.
- **Dossier exporté** (perennial, direction: out) — porte le manifeste, donc désormais la strate.

### 10. Background processes [draft]

Not applicable — la déclaration est lue à la construction d'un contexte, et le contrôle à
l'exécution de Preflight ; ni horloge, ni événement différé, ni tâche de fond.

### 11. Notifications [draft]

Not applicable — aucun destinataire hors de la session en cours. Le refus du contrôle est rendu à
qui a lancé Preflight, par sa sortie d'erreur.

### 12. Audit and logging [draft]

**Entité auditée :** l'intervention, par son manifeste de contexte. Le manifeste est déjà proposé
comme artefact à chaque intervention et adressé par empreinte dans l'état du changement ; il porte
désormais, en plus des instructions composées, les strates qui ne le sont pas. C'est cet ajout qui
rend l'audit complet : jusqu'ici le dossier prouvait ce que 495 avait écrit, jamais ce que le modèle
avait reçu.

Le refus du contrôle n'est l'événement d'aucun changement : il arrive avant qu'un changement existe,
et rien n'en est inscrit au journal. C'est une sortie non nulle de Preflight, comme les autres.

### 13. Solution variabilities [draft]

- **Fournisseur retenu** (config) — décide quelles strates sont nommées au manifeste. Le fournisseur
  local : aucune. Un fournisseur qui impose : la sienne, avec sa condition.
- **Version du paquet du fournisseur** (dépendance du dépôt) — décide si le contrôle passe. Une
  montée de version qui change le bloc imposé rend Preflight rouge, ce qui est l'effet voulu : la
  déclaration doit être relue avant que le harnais reparte.

### 14. Quality attributes *NFR* [draft]

- Octets supplémentaires émis vers le fournisseur : 0. La strate est nommée, jamais composée ni
  renvoyée.
- Coût à la construction d'un contexte : une lecture de liste bornée par le nombre de fournisseurs
  déclarés, soit une entrée aujourd'hui.
- Coût du contrôle : 12 ms mesurées sur l'arborescence distribuée de la version épinglée — 275
  fichiers, 10,2 Mo lus. La mesure dit ce que coûte cette version, pas ce que coûteront les
  suivantes.
- Le contrôle relève exactement une occurrence du bloc imposé dans le paquet. Deux occurrences, ou
  zéro, sont des refus : le premier cas veut dire que le fournisseur impose à plusieurs endroits, le
  second que le moyen de relever a été perdu.

### 15. Security and compliance *NFR* [draft]

- **Authentification :** aucune côté 495 ; les identifiants du fournisseur restent gérés par le
  paquet hôte, et le contrôle ne les lit pas — il lit le code distribué, jamais le fichier
  d'authentification.
- **Autorisation :** la déclaration n'est pas une politique et personne ne l'élargit par
  configuration. Un producteur ne peut ni la lire ni la modifier.
- **Classification des données :** le texte imposé est public, distribué dans le paquet du
  fournisseur. Le manifeste où il est écrit porte par ailleurs des invites confidentielles, et sa
  classification ne change pas.
- **Contrôles :** comparaison mot pour mot, sur le texte, la condition et la position à la fois ;
  refus quand le moyen de relever disparaît.
- **Limite revendiquée :** 495 ne peut pas empêcher la strate, seulement la nommer. La garantie
  passe de « tout ce que le modèle reçoit est composé ici » à « ce qui ne l'est pas est déclaré ».
  C'est plus faible, et c'est écrit ici plutôt que découvert par un lecteur du dossier. Une seconde
  limite tient à §6c : d'un fournisseur inconnu, rien n'est déclaré, et le manifeste est alors muet
  sans être faux.

### 16. UX and accessibility *NFR* [draft]

- Le refus du contrôle est en anglais, comme tout message de contrôle du dépôt, et nomme les deux
  textes — relevé et déclaré — de sorte que la correction se déduise du message sans ouvrir le
  paquet.
- Aucun affichage n'est ajouté : rien de cette tranche ne passe par le TUI, donc aucune contrainte
  de modalité, de langue d'interface ni d'accessibilité ne s'y applique.
- Le manifeste reste lisible tel quel : la liste ajoutée porte des noms de champ explicites plutôt
  qu'un code, parce que son lecteur peut n'avoir jamais vu le harnais.

### 17. Acceptance criteria [reviewed]

```
Scenario: La strate imposée est nommée au manifeste (§5)
  Given un fournisseur retenu dont il est déclaré qu'il impose un bloc système
  When  une intervention est ouverte et son contexte construit
  Then  le manifeste porte une strate imposée nommant ce fournisseur
  And   elle porte le texte mot pour mot, sa position au-dessus des instructions locales,
        et la condition à laquelle le fournisseur l'applique
  And   les instructions de confiance sont inchangées et ne la contiennent pas

Scenario: Un fournisseur qui n'impose rien déclare une liste vide (6a)
  Given le fournisseur local comme fournisseur retenu
  When  le contexte d'une intervention est construit
  Then  le manifeste porte une liste de strates imposées vide
  And   le champ est présent

Scenario: Une sélection de modèle non résolue ne déclare rien (6b)
  Given une sélection de modèle dont l'identifiant de fournisseur est vide
  When  le contexte d'une intervention est construit
  Then  le manifeste porte une liste de strates imposées vide
  And   aucun diagnostic de configuration n'est émis par le constructeur de contexte

Scenario: Un fournisseur inconnu ne déclare rien (6c)
  Given un fournisseur retenu dont aucune strate n'est déclarée
  When  le contexte d'une intervention est construit
  Then  le manifeste porte une liste de strates imposées vide

Scenario: Le texte imposé par le paquet a changé (6d)
  Given un paquet de fournisseur dont le bloc imposé diffère du texte déclaré
  When  le contrôle est exécuté
  Then  il refuse
  And   son message porte le texte relevé et le texte déclaré

Scenario: Le bloc imposé n'est plus relevable dans le paquet (6e)
  Given un paquet de fournisseur où la forme attendue ne se trouve pas
  When  le contrôle est exécuté
  Then  il refuse
  And   son message dit qu'aucun bloc imposé n'a pu être relevé

Scenario: La condition d'application est déclarée avec la strate (6f)
  Given un fournisseur qui n'impose son bloc que sur un chemin d'authentification particulier
  When  le contexte d'une intervention est construit
  Then  la strate déclarée porte cette condition en toutes lettres
  And   elle est déclarée que ce chemin soit emprunté ou non

Scenario: Le dossier écrit porte la strate (§5)
  Given une campagne conduite jusqu'à sa clôture
  When  les artefacts de contexte du changement sont relus depuis le journal
  Then  chacun porte la liste des strates imposées
  And   le texte remis au modèle, adressé par empreinte, ne contient pas cette strate
```

### 18. Out of scope [draft]

- Cette story ne publie pas de schéma de contrat pour le manifeste de contexte. Le manifeste reste
  un type interne, écrit au dossier sans schéma opposable, comme aujourd'hui — un lecteur extérieur
  n'a toujours rien contre quoi le valider. C'est un arbitrage du propriétaire, pris en connaissance
  de ce qu'il laisse de côté, et la publication reste un travail candidat à part entière.
- Le contrôle ne lit pas le paquet du fournisseur installé sur la machine, seulement celui que le
  dépôt épingle. Les deux ont déjà divergé, et une campagne emploie l'installé : cette story accepte
  donc de ne pas voir cette divergence-là, en échange d'un contrôle qui ne s'esquive jamais.
- Aucun refus à l'exécution : une intervention n'est pas arrêtée parce que le paquet diverge de la
  déclaration. Le refus est celui de Preflight, avant que le harnais reparte.
- Aucune variante d'instruction selon la strate imposée. Adapter ce que 495 écrit à ce qu'un
  fournisseur a écrit au-dessus appartient au travail sur les invites, qui le porte comme axe de
  dépendance au modèle.
- Aucune mesure de la stabilité du bloc au-delà de la version épinglée : la story installe le moyen
  de voir un changement, elle n'établit pas à quelle fréquence il survient.

### 19. Open questions [draft]

- La condition d'application n'est pas observable par 495, qui ne connaît que l'identifiant de
  fournisseur et jamais le mode d'authentification retenu par le paquet hôte. Faut-il l'observer —
  ce qui suppose d'élargir le port d'agent et de faire remonter un fait du paquet hôte — ou s'en
  tenir à la déclarer et assumer la sur-déclaration ? — owner: jeanjerome, needed by: 2026-10-05
- Que doit produire un changement du bloc imposé entre deux versions du fournisseur, au-delà du
  refus de Preflight que cette story installe ? La mesure de stabilité d'une version à l'autre reste
  à conduire, et la réponse peut demander de porter la version du fournisseur dans la déclaration
  elle-même. — owner: jeanjerome, needed by: 2026-10-05

### 20. References [draft]

- `specs/adr/D-48-le-bloc-systeme-impose-par-le-fournisseur-est-declare-au-manifeste.md` — la
  décision de déclarer plutôt que de refuser le profil, et le constat sur le paquet installé.
- `specs/adr/D-46-un-second-fournisseur-de-modele-est-qualifie-avant-le-reste.md` — pourquoi un
  second fournisseur est qualifié avant le reste.
- `specs/archive/amont/expression-besoins.md` § CTX-02 — la clause exercée ici pour la première fois.
- `specs/archive/amont/conception-technique.md` §4.1 — le catalogue des composants, inchangé par
  cette story.
- `specs/epics/e23-second-fournisseur-de-modele-qualifie/epic.yaml` — la position de cette story
  dans l'epic et le motif de son rang.
- `specs/epics/e23-second-fournisseur-de-modele-qualifie/e23s01-la-sortie-de-donnees-vers-le-fournisseur-est-declaree.md`
  — la story qui a déclaré la destination, et dont celle-ci réutilise l'identifiant de fournisseur.
