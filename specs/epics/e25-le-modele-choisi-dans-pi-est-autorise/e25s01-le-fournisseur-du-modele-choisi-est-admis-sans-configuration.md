STORY KEY: e25s01
TITLE:     Admettre le fournisseur du modèle choisi sans configuration
TYPE:      Story
PARENT:    e25
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-23
MATURITY:  4
SIZE:      M

### 1. Business narrative [draft]

Une personne qui installe 495 a déjà choisi son modèle dans Pi, avec `/model`. Elle ouvre son
projet, lance `/495 start`, et le changement est bloqué avant la première intervention. Le motif est
que son fournisseur n'est pas dans une liste qu'elle n'a jamais écrite. En l'absence de
configuration, cette liste ne nomme que le fournisseur local d'une seule machine, celle sur laquelle
495 a été développé. Tout autre utilisateur est refusé au premier usage, et le README consacre une
étape entière du démarrage à contourner ce refus.

Ce refus ne protège rien que la personne n'ait déjà accordé. En choisissant le modèle, elle a
consenti à lui envoyer ce que la session contient. La liste lui redemande ce consentement, dans son
propre répertoire de données. Elle ne borne d'ailleurs que le canal de 495 : dans la même session,
l'agent de Pi joint le même fournisseur sans rien demander.

Le propriétaire a tranché le 2026-09-23 : `config.json` ne porte plus aucune configuration de
modèle. Le résultat attendu est que le premier `/495 start` aboutisse avec le modèle choisi, et que
personne n'ait plus à écrire de liste pour s'en servir.

#### MODIFIED: SEC-05 — Réduire l'exposition de données

**Before:** une intervention dont le fournisseur n'est pas nommé dans `policy.egress` est refusée
avant tout envoi. Sans cette clé, ou sans fichier de configuration, la liste ne nomme que `omlx`,
situé sur la machine. Une liste vide, malformée ou illisible ne déclare rien et refuse tout (D-53).
La politique de sorties réseau du canal modèle est cette liste.

**After:** le fournisseur du modèle choisi dans Pi est admis. `config.json` ne porte plus de liste de
destinations, ni de défaut `omlx`. Aucune intervention n'est refusée au motif de sa destination. Une
clé `policy.egress` restée dans un fichier existant est ignorée, et un diagnostic d'ouverture de
session le dit. La politique de sorties réseau du canal modèle est le choix du modèle dans Pi. La
liste fermée des variables remises au worker et l'expurgation de l'export ne changent pas.

### 2. Value statement [draft]

As a utilisateur qui a choisi son modèle dans Pi, I want que mon premier `/495 start` aboutisse sans
fichier de configuration, so that choisir le modèle suffise à l'autoriser.

### 3. Actors and permissions [draft]

- **Utilisateur de Pi** (external) — choisit le modèle par `/model`. Ce choix admet son fournisseur.
- **Propriétaire de l'installation** (external) — écrit `config.json`, qui ne porte plus rien sur le
  modèle. Il restreint les modèles joignables dans Pi, s'il le veut.
- **Contrôleur 495** (system) — charge la configuration, signale une clé qu'il ne lit plus, et
  vérifie les capacités du modèle avant toute intervention.
- **Producteur / worker Pi** (system) — joint le fournisseur du modèle choisi.

### 4. Trigger and preconditions [draft]

**Déclencheur :** l'ouverture d'une intervention, au point où le superviseur jugeait la destination
avant la sonde de capacité.

**Préconditions :**
- la configuration du harnais a été chargée à la création du runtime, avec ou sans fichier ;
- une sélection de modèle est connue, ou son fournisseur est vide : la vérification de capacité le
  nomme alors comme un modèle non configuré ;
- aucun processus worker n'a encore été démarré.

### 5. Main flow and business logic [reviewed]

1. Le runtime charge la configuration. Le fichier est absent, ou il ne nomme pas `policy.egress`.
2. Aucun diagnostic sur le modèle n'est émis à l'ouverture de session.
3. Une phase demande l'ouverture d'une intervention pour un rôle.
4. Le superviseur vérifie, comme aujourd'hui, que le bac à sable est qualifié pour le rôle et que le
   modèle a les capacités requises. Aucune destination n'est plus jugée.
5. Il construit le mandat et démarre le worker.
6. L'intervention inscrit à son démarrage le fournisseur et le modèle employés, comme aujourd'hui.

Interruption point: entre les étapes 4 et 5 — les capacités sont jugées, rien n'est encore engagé.

### 6. Alternative flows and exceptions [draft]

6a. **Fichier qui porte encore `policy.egress`** — la clé est ignorée, quelle que soit sa forme :
liste, liste vide ou valeur malformée. Les autres réglages du fichier s'appliquent. L'ouverture de
session émet un diagnostic : la clé n'est plus lue, et le modèle choisi dans Pi est employé. Le
diagnostic ne reproduit pas son contenu. L'annonce compte parce que qui a écrit une liste pour
restreindre les destinations doit apprendre qu'elle ne restreint plus rien.

6b. **Fichier illisible** — le diagnostic existant dit qu'il est ignoré. Il ne dit plus que toute
intervention est refusée : il n'y a plus de liste dont l'absence refuserait.

6c. **Modèle sans fournisseur** — la vérification de capacité le refuse comme un modèle non
configuré, comme aujourd'hui. Aucun refus par politique n'est levé.

6d. **Installation qui avait écrit `omlx` pour suivre l'ancien README** — cas particulier de 6a :
sa liste est ignorée et annoncée, et un modèle d'un autre fournisseur choisi dans Pi est employé.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  README, démarrage et table de configuration
Dynamic elements: diagnostic d'ouverture de session pour une clé qui n'est plus lue
```

Le README perd son étape « Declare your model provider », et sa table de configuration perd la ligne
`policy.egress`.

### 8. Domain model [draft]

**Entité touchée :** la politique active perd son champ `egress`. Le type des destinations déclarées
et la règle qui refusait une destination non déclarée disparaissent du noyau. La situation « sur la
machine / hors d'elle » reste un type du noyau : e25s03 la lit de l'adresse du modèle.

**Entité créée :** aucune. Aucun identifiant de composant nouveau.

**Relations changées :** le superviseur d'intervention ne lit plus la politique pour juger la
destination. Il la lit encore pour ses budgets.

**Raison de la profondeur** — aucune abstraction n'est ajoutée ; la story retire du code.

### 9. Integrations and boundaries [draft]

- **Fournisseur de modèle, par le worker Pi** (perennial, direction: both) — Pi résout le
  fournisseur du modèle choisi ; 495 ne compose ni l'adresse ni l'authentification, et ne juge plus
  la destination.
- **Configuration du harnais** (perennial, direction: in) — ne porte plus rien sur le modèle.
- **Sélection de modèle de Pi** (perennial, direction: in) — lue à la création du runtime. La suivre
  en cours de session appartient à e25s02.

### 10. Background processes [draft]

Not applicable — rien n'est jugé sur horloge ni sur événement différé.

### 11. Notifications [draft]

Not applicable — aucun destinataire hors de la session. Le diagnostic emprunte le chemin existant :
l'écran le reçoit à l'ouverture, les entrées structurées au premier `/495`.

### 12. Audit and logging [draft]

**Entité auditée :** l'intervention. Son démarrage porte déjà le fournisseur, le modèle et le niveau
de réflexion employés, et le dossier exporté les montre. Un lecteur sait donc vers quel fournisseur
les extraits sont partis.

Aucun blocage de motif `policy_denied` ne peut plus être inscrit au titre de la destination. Les
dossiers déjà écrits qui en portent un restent lisibles : le motif existe toujours pour les autres
refus par politique.

### 13. Solution variabilities [reviewed]

- **`policy.egress`** (config) — n'est plus lue. Présente sous une forme quelconque : ignorée, et
  annoncée à l'ouverture. Absente : rien n'est annoncé.

### 14. Quality attributes *NFR* [draft]

- Premier `/495 start` sans fichier de configuration, avec un fournisseur autre que `omlx` : 0 refus.
- Ouverture de session sans `policy.egress` : 0 diagnostic sur le modèle.
- Ouverture de session avec `policy.egress` : 1 diagnostic, sans le contenu de la clé.

### 15. Security and compliance *NFR* [draft]

- **Authentification :** aucune côté 495. Les identifiants du fournisseur restent gérés par Pi.
- **Autorisation :** l'autorisation d'une destination est le choix du modèle par l'utilisateur dans
  Pi. 495 n'en tient plus de seconde.
- **Classification des données :** extraits de code source et invites du projet cible —
  confidentiels. Cette story ne change pas ce qui part, seulement qui décide de la destination.
- **Contrôles conservés :** l'environnement remis au worker reste une liste fermée ; le constructeur
  de contexte ne lit pas l'environnement ; l'export expurge et signale sans divulguer. Les tests du
  secret sentinelle de e23s01 passent inchangés.
- **Contrôle retiré :** le refus d'une destination non déclarée. Un modèle distant choisi dans Pi
  reçoit des extraits sans déclaration préalable ; l'annoncer appartient à e25s03. D-61, écrite en
  e25s04, consigne ce retrait et rend D-53 sans objet.

### 16. UX and accessibility *NFR* [draft]

- Le démarrage du README passe de trois étapes à deux : installer, puis lancer un changement.
- Le diagnostic d'une clé ignorée est rendu dans chaque entrée Pi qualifiée.
- Langue : le diagnostic est en anglais, comme les autres diagnostics de configuration.

### 17. Acceptance criteria [reviewed]

```
Scenario: Sans configuration, le fournisseur du modèle choisi est admis (§5)
  Given un répertoire de données sans fichier de configuration
  And   un modèle choisi dont le fournisseur n'est pas omlx
  When  le changement avance jusqu'à sa première intervention
  Then  l'intervention démarre
  And   le journal inscrit ce fournisseur à son démarrage
  And   l'ouverture de session n'a émis aucun diagnostic sur le modèle

Scenario: Une clé policy.egress restée dans le fichier est ignorée et annoncée (6a)
  Given une configuration qui porte policy.egress et policy.budgets
  When  la configuration est chargée
  Then  la politique ne porte aucune liste de destinations
  And   le réglage de budget s'applique
  And   un diagnostic dit que policy.egress n'est plus lue
  And   le diagnostic ne reproduit pas le contenu de la clé

Scenario: Une clé policy.egress malformée est ignorée comme une autre (6a)
  Given une configuration dont policy.egress est une liste vide, une chaîne ou un objet
  When  la configuration est chargée
  Then  le même diagnostic est émis, et aucune intervention n'est refusée pour autant

Scenario: Un fichier illisible ne refuse plus aucun fournisseur (6b)
  Given un fichier de configuration qui ne se lit pas
  When  la configuration est chargée
  Then  le diagnostic dit qu'il est ignoré
  And   il ne dit pas que toute intervention est refusée

Scenario: Un modèle sans fournisseur reste refusé par la capacité (6c)
  Given une sélection de modèle dont le fournisseur est vide
  When  une phase demande l'ouverture d'une intervention
  Then  un refus de capacité est levé
  And   aucun refus par politique n'est levé

Scenario: Une liste omlx héritée de l'ancien README ne restreint plus (6d)
  Given une configuration dont policy.egress ne nomme que omlx
  And   un modèle choisi d'un autre fournisseur
  When  le changement avance jusqu'à sa première intervention
  Then  l'intervention démarre
  And   le diagnostic d'une clé ignorée a été émis
```

### 18. Out of scope [draft]

- Suivre un changement de modèle par `/model` en cours de session appartient à e25s02. Ici, le
  modèle employé est celui que le runtime a lu à sa création.
- Lire la situation du modèle depuis son adresse, la porter au dossier et annoncer un modèle hors de
  la machine appartient à e25s03.
- La décision D-61 et la recette par exécution réelle appartiennent à e25s04.
- Aucune liste n'est rétablie sous une autre forme. Qui veut restreindre les modèles joignables le
  fait dans Pi.

### 19. Open questions [draft]

Aucune. La décision du propriétaire du 2026-09-23 fixe la forme de la configuration, et la capsule
fixe le sens de « modèle choisi » (`sens_du_modele_choisi`).

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` — SEC-05 et sa recette.
- `specs/product/SCOPE_LATEST.yaml` — entrée `e25-le-modele-choisi-dans-pi-est-autorise`, avant et
  après.
- `specs/adr/D-53-une-declaration-de-sortie-malformee-ne-declare-rien.md` — la règle que le retrait
  de la liste rend sans objet.
- `specs/epics/e23-second-fournisseur-de-modele-qualifie/e23s01-la-sortie-de-donnees-vers-le-fournisseur-est-declaree.md`
  — la déclaration obligatoire que cette story retire, et les tests du secret sentinelle qu'elle
  garde.
- `specs/adr/D-52-une-commande-verify-s-ecrit-rouge.md` — pourquoi les commandes du plan échouent au
  moment où elles sont écrites.
- `specs/epics/e25-le-modele-choisi-dans-pi-est-autorise/epic.yaml` — position de la story et
  décision du propriétaire.
- Fichiers touchés : `src/domain/policy.ts`, `src/extension/config.ts`,
  `src/application/intervention.ts`, `test/v1/egress.test.ts`, `test/v2/egress-refusal.test.ts`,
  `test/v2/imposed-layers-divergence.test.ts`, `test/v2/harness.test.ts`,
  `test/helpers/harness-fixture.ts`, `README.md`.
