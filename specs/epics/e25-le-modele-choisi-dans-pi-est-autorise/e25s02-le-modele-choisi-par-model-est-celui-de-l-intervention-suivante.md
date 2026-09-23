STORY KEY: e25s02
TITLE:     Employer pour chaque intervention le modèle sélectionné quand elle démarre
TYPE:      Story
PARENT:    e25
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-23
MATURITY:  4
SIZE:      M

### 1. Business narrative [draft]

Au premier usage, une personne ouvre Pi, choisit son modèle par `/model`, puis lance `/495 start`.
Aujourd'hui 495 a lu le modèle une seule fois, à l'ouverture de session, avant ce choix. Si aucun
modèle n'était actif à l'ouverture, le changement est refusé comme s'il n'y avait pas de modèle. Si
un autre modèle était actif, 495 joint celui que la personne vient de quitter, et le dossier inscrit
un fournisseur qu'elle n'a pas choisi pour ce travail.

Le même écart vaut en cours de route. Changer de modèle entre deux interventions est un geste
normal : un modèle local pour rédiger, un modèle plus capable pour une conception difficile. 495
l'ignore jusqu'à la session suivante.

Le résultat attendu est que le modèle sélectionné dans Pi quand une intervention démarre soit celui
qu'elle emploie, qu'il soit jugé capable avant d'être joint, et que le dossier montre où le modèle a
changé.

#### MODIFIED: AGT-07 — Changement de modèle et coût

**Before:** le modèle d'une intervention est celui que Pi tenait pour sélectionné à l'ouverture de
session. Un changement de modèle dans Pi n'atteint 495 qu'à la session suivante. Chaque intervention
inscrit à son démarrage le fournisseur, le modèle et le niveau de réflexion employés.

**After:** le modèle d'une intervention est celui que Pi tient pour sélectionné quand elle démarre,
avec son niveau de réflexion. Il est lu une seule fois, à ce moment, et c'est cette lecture qui est
jugée par la vérification de capacité, inscrite au démarrage, et remise au worker. Deux interventions
successives qui emploient des modèles différents montrent la frontière au journal. Une intervention
en cours garde le modèle avec lequel elle a démarré. Les tokens et coûts restent consignés comme
aujourd'hui, par intervention.

### 2. Value statement [draft]

As a utilisateur de Pi, I want que le modèle choisi par `/model` soit celui de l'intervention
suivante, so that choisir un modèle en cours de session suffise à le faire employer.

### 3. Actors and permissions [draft]

- **Utilisateur de Pi** (external) — choisit le modèle par `/model`, par le cycle de modèles, ou le
  retrouve à la reprise d'une session ; règle le niveau de réflexion.
- **Pi** (system) — tient la sélection courante et la donne à l'extension au moment où elle la lit.
- **Contrôleur 495** (system) — lit la sélection au démarrage d'une intervention, vérifie les
  capacités du modèle lu, inscrit ce modèle au démarrage et le remet au worker.
- **Producteur / worker Pi** (system) — joint le modèle qui lui est remis dans son mandat.

### 4. Trigger and preconditions [draft]

**Déclencheur :** une phase demande l'ouverture d'une intervention pour un rôle.

**Préconditions :**
- le runtime a été créé à l'ouverture de session ;
- aucune intervention n'est en cours pour ce changement ;
- une sélection de modèle existe dans Pi, ou aucune : la vérification de capacité nomme alors le
  modèle comme non configuré, comme aujourd'hui.

### 5. Main flow and business logic [reviewed]

1. La session s'ouvre ; 495 crée son runtime sans en figer le modèle.
2. L'utilisateur choisit un modèle par `/model`, puis lance `/495 start`.
3. Une phase demande l'ouverture d'une intervention.
4. 495 lit, une fois, le modèle que Pi tient pour sélectionné et son niveau de réflexion.
5. Le superviseur vérifie que le bac à sable est qualifié pour le rôle et que ce modèle a les
   capacités requises.
6. Le démarrage de l'intervention inscrit ce fournisseur, ce modèle et ce niveau.
7. Le contexte déclare les couches que ce fournisseur impose, et le mandat remis au worker nomme ce
   modèle.

Interruption point: entre les étapes 5 et 6 — le modèle lu est jugé, rien n'est encore inscrit.

La lecture de l'étape 4 est la seule : si l'utilisateur change de modèle pendant les étapes 5 à 7, la
capacité jugée, le modèle inscrit et le modèle joint restent le même.

### 6. Alternative flows and exceptions [draft]

6a. **Session ouverte sans modèle** — le runtime se crée comme aujourd'hui. Un modèle choisi ensuite
par `/model` est celui de la première intervention : `/495 start` n'est pas refusé.

6b. **Changement entre deux interventions d'un même changement** — l'intervention suivante emploie le
nouveau modèle. Le journal inscrit un modèle différent au démarrage de chacune, et le contexte remis
à la seconde est inscrit comme pour toute intervention : la frontière et le contexte retransmis se
lisent au dossier.

6c. **Changement pendant une intervention** — elle garde son modèle jusqu'à sa fin. Le nouveau vaut
pour la suivante.

6d. **Niveau de réflexion changé seul** — il fait partie de la sélection : l'intervention suivante
l'emploie, et un niveau que le modèle n'accepte pas est refusé par la capacité, comme aujourd'hui.

6e. **Sélection retirée ou modèle sans fournisseur** — la vérification de capacité refuse le modèle
comme non configuré ; aucun worker ne démarre.

6f. **Modèle retrouvé à la reprise d'une session** — il est la sélection courante, et il est employé
comme un modèle choisi par `/model`.

6g. **Session remplacée sans que 495 se recrée** — le mode RPC de Pi démarre deux fois la même
session sur `new_session`, `switch_session`, `fork` et `clone`, et 495 garde le runtime du premier
démarrage. Pi rend caduc le contexte de la session qu'il remplace : il lève une erreur à la lecture
de son modèle. L'intervention suivante lit donc la sélection dans le contexte de la commande ou de
l'outil qui fait avancer le changement, jamais dans celui de l'ouverture de session.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  none
Dynamic elements: message de progression « intervention <rôle> started (<fournisseur>/<modèle>) »
```

Le message de progression existant nomme le modèle lu à l'étape 4. Aucun élément nouveau.

### 8. Domain model [draft]

**Entité touchée :** la sélection de modèle cesse d'être un réglage du runtime pour devenir une
lecture faite au démarrage de chaque intervention. Ni le runtime ni la session 495 ne gardent de
quoi la lire : chaque commande ou outil qui fait avancer le changement remet au harnais un lecteur
de la sélection attaché à son propre contexte.

**Entité créée :** aucune. Aucun identifiant de composant nouveau.

**Relations changées :** le superviseur d'intervention reçoit le modèle avec la demande d'ouverture,
au lieu de le tenir de sa construction. La vérification de capacité, l'inscription du démarrage, le
contexte et le mandat reçoivent la même lecture.

**Raison de la profondeur** — aucun état n'est ajouté à 495 : la sélection reste celle que Pi tient.
Pi donne à l'extension un contexte dont le modèle et le niveau de réflexion sont lus au moment de
l'appel (`createContext` dans `core/extensions/runner.js`, Pi 0.87.1). Suivre `model_select` pour en
garder une copie ferait tenir à 495 un fait que Pi rapporte déjà, avec un second écrivain à
synchroniser. L'annonce d'un changement de modèle, qui a besoin de l'événement, appartient à e25s03.
Le contexte lu est celui de l'appel en cours, pas celui de l'ouverture de session : Pi invalide le
contexte d'une session qu'il remplace ou recharge (`dispose` et `reload` dans
`core/agent-session.js`), et le lire ensuite lève une erreur.

### 9. Integrations and boundaries [draft]

- **Sélection de modèle de Pi** (perennial, direction: in) — lue au démarrage de chaque intervention,
  dans le contexte de la commande `/495` ou de l'outil `495` qui fait avancer le changement.
- **Fournisseur de modèle, par le worker Pi** (perennial, direction: both) — joint le modèle nommé
  par le mandat ; inchangé.

### 10. Background processes [draft]

Not applicable — la sélection est lue quand une intervention démarre, pas sur événement ni horloge.

### 11. Notifications [draft]

Not applicable — l'annonce d'un changement de modèle appartient à e25s03.

### 12. Audit and logging [draft]

**Entité auditée :** l'intervention. Son démarrage porte le fournisseur, le modèle et le niveau de
réflexion lus à l'étape 4 ; son contexte porte ce qui a été retransmis. Deux démarrages successifs
qui portent des modèles différents sont la frontière qu'exige AGT-07. Aucun événement nouveau n'est
inscrit : le changement de modèle se lit par différence entre deux démarrages.

### 13. Solution variabilities [reviewed]

Not applicable — aucun réglage : le modèle est celui de Pi.

### 14. Quality attributes *NFR* [draft]

- Session ouverte sans modèle, puis `/model`, puis `/495 start` : 0 refus de capacité.
- Deux interventions séparées par un changement de modèle : 2 démarrages inscrits, 2 modèles
  différents, chacun égal au modèle sélectionné au démarrage.
- Changement de modèle entre la vérification de capacité et le démarrage du worker : le modèle
  inscrit et le modèle remis au worker sont celui qui a été jugé.
- Session remplacée après la création du runtime, contexte d'ouverture rendu caduc : 0 erreur de
  contexte caduc à l'intervention suivante.

### 15. Security and compliance *NFR* [draft]

- **Authentification :** aucune côté 495. Les identifiants du fournisseur restent gérés par Pi.
- **Autorisation :** le modèle joint est celui que l'utilisateur a sélectionné dans Pi. La sélection
  vient de l'hôte, jamais d'un fichier du projet cible.
- **Contournement de la sonde :** un changement de modèle ne permet pas de joindre un modèle qui n'a
  pas été jugé. La sélection est lue une fois ; la vérification de capacité, l'inscription et le
  mandat reçoivent la même valeur.
- **Classification des données :** inchangée. Cette story change quel modèle reçoit les extraits,
  pas ce qui part. La politique chargée à l'ouverture de session ne change pas avec le modèle.

### 16. UX and accessibility *NFR* [draft]

- Le parcours du premier usage, `/model` puis `/495 start`, aboutit dans chaque entrée Pi qualifiée.
- Langue : le message de progression reste en anglais, comme aujourd'hui.

### 17. Acceptance criteria [reviewed]

```
Scenario: Un modèle choisi après l'ouverture de session est employé (6a)
  Given une session ouverte sans modèle sélectionné
  And   un modèle sélectionné ensuite dans Pi
  When  le changement avance jusqu'à sa première intervention
  Then  l'intervention démarre sans refus de capacité
  And   son démarrage inscrit le modèle sélectionné

Scenario: Un changement de modèle entre deux interventions se lit au journal (6b)
  Given une intervention terminée avec un premier modèle
  And   un second modèle sélectionné ensuite dans Pi
  When  l'intervention suivante démarre
  Then  son démarrage inscrit le second modèle
  And   le démarrage de la première inscrit toujours le premier

Scenario: Le modèle jugé est celui qui est joint (§5, 6c)
  Given un modèle sélectionné quand l'intervention démarre
  When  la sélection change après la vérification de capacité
  Then  le modèle inscrit au démarrage et le modèle remis au worker sont celui qui a été jugé

Scenario: Un niveau de réflexion changé seul est employé (6d)
  Given un modèle inchangé et un niveau de réflexion changé dans Pi
  When  l'intervention suivante démarre
  Then  son démarrage inscrit le nouveau niveau

Scenario: Une sélection sans fournisseur reste refusée par la capacité (6e)
  Given une sélection de modèle retirée après l'ouverture de session
  When  une phase demande l'ouverture d'une intervention
  Then  un refus de capacité est levé et aucun worker ne démarre

Scenario: Une session remplacée lit la sélection de la session qui la remplace (6g)
  Given un runtime créé au premier démarrage d'une session
  And   ce contexte d'ouverture rendu caduc par Pi, qui a remplacé la session
  When  une commande de la session de remplacement fait avancer le changement
  Then  l'intervention démarre avec le modèle sélectionné dans cette session
  And   aucune erreur de contexte caduc n'est levée
```

### 18. Out of scope [draft]

- Annoncer un modèle hors de la machine, à l'ouverture comme à chaque changement de modèle, et lire
  sa situation de son adresse appartient à e25s03, qui écoutera `model_select` pour l'annonce.
- La recette par exécution réelle, dont un modèle distant choisi par `/model` en cours de session,
  appartient à e25s04.
- Aucun repli d'un fournisseur vers un autre n'est introduit : 495 suit le choix de l'utilisateur.
- Un modèle changé ne recharge pas la configuration : la politique reste celle qui a été chargée à
  l'ouverture de session.

### 19. Open questions [draft]

Aucune. La capsule fixe le sens de « modèle choisi » (`sens_du_modele_choisi`) et le sort d'une
intervention en cours (`hors_perimetre`).

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` — AGT-07 et sa recette.
- `specs/epics/e25-le-modele-choisi-dans-pi-est-autorise/epic.yaml` — position de la story et sens
  du modèle choisi.
- `specs/epics/e25-le-modele-choisi-dans-pi-est-autorise/e25s01-le-fournisseur-du-modele-choisi-est-admis-sans-configuration.md`
  — le modèle lu à la création du runtime, que cette story remplace par une lecture par intervention.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/runner.js`, `createContext` —
  le modèle et le niveau de réflexion du contexte sont lus à l'appel (Pi 0.87.1).
- `node_modules/@earendil-works/pi-coding-agent/examples/extensions/model-status.ts` — `model_select`
  et ses trois sources, `set`, `cycle` et `restore`.
- `specs/adr/D-52-une-commande-verify-s-ecrit-rouge.md` — pourquoi les commandes du plan échouent au
  moment où elles sont écrites.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js`, `dispose` et `reload` —
  le contexte d'une session remplacée ou rechargée est rendu caduc, et sa lecture lève une erreur.
- `test/v3/session-start-twice.test.ts` — le runtime du premier démarrage est gardé au second.
- Fichiers touchés : `src/extension/session.ts`, `src/extension/runtime.ts`,
  `src/extension/command.ts`, `src/extension/tool.ts`, `src/extension/conduct.ts`,
  `src/application/harness.ts`, `src/application/intervention.ts`, `test/helpers/harness-fixture.ts`,
  `test/v2/model-admitted.test.ts`, `test/v3/model-select.test.ts`.
