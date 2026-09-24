STORY KEY: e25s03
TITLE:     Lire la situation du modèle de son adresse, la porter au dossier et annoncer un modèle hors de la machine
TYPE:      Story
PARENT:    e25
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-24
MATURITY:  4
SIZE:      M

### 1. Business narrative [draft]

Depuis e25s01, choisir un modèle dans Pi suffit à l'admettre : aucune liste ne borne plus les
destinations, et plus rien ne dit si le modèle choisi tourne sur la machine ou hors d'elle. Pourtant
la différence compte : un modèle local garde sur la machine les extraits du projet que 495 lui
remet, un modèle distant les envoie à un tiers. La personne qui passe par `/model` d'un modèle local
à un modèle distant le fait peut-être sans y penser. Le dossier, lui, ne permet pas de savoir après
coup où sont partis les extraits.

Avant e25s01, la situation était déclarée dans `config.json`, et une déclaration peut être fausse.
Pi tient pour chaque modèle l'adresse à laquelle il le joint. Cette adresse est le fait observé :
une adresse de bouclage garde les échanges sur la machine, toute autre adresse les fait sortir.

Le résultat attendu est que 495 lise la situation du modèle choisi de l'adresse que Pi tient pour
lui, l'inscrive au démarrage de chaque intervention, et signale sans bloquer un modèle hors de la
machine, à l'ouverture de session comme à chaque changement de modèle.

#### MODIFIED: SEC-05 — Réduire l'exposition de données

**Before:** le modèle choisi dans Pi est admis sans configuration (e25s01). Rien ne dit s'il est sur
la machine ou hors d'elle : ni le dossier, ni la session. Le démarrage d'une intervention inscrit le
fournisseur, le modèle et le niveau de réflexion.

**After:** la situation du modèle, sur la machine ou hors d'elle, est lue de l'adresse que Pi tient
pour lui. Une adresse de bouclage le situe sur la machine ; toute autre adresse, y compris une
adresse absente ou illisible, le situe hors d'elle. Le démarrage de chaque intervention inscrit
cette situation à côté du fournisseur et du modèle, sans l'adresse elle-même. Un modèle hors de la
machine est annoncé avec son fournisseur à l'ouverture de session et à chaque changement de modèle,
sur toutes les entrées de Pi. L'annonce ne bloque rien.

### 2. Value statement [draft]

As a utilisateur de Pi, I want être prévenu quand le modèle choisi est hors de la machine, et que le
dossier dise où chaque intervention a envoyé ses extraits, so that je sache ce qui quitte la machine
sans rien déclarer moi-même.

### 3. Actors and permissions [draft]

- **Utilisateur de Pi** (external) — choisit le modèle par `/model` ou par le cycle de modèles, ou le
  retrouve à la reprise d'une session ; reçoit l'annonce.
- **Pi** (system) — tient le catalogue des modèles, et l'adresse de chacun (`baseUrl`) ; notifie
  l'extension d'un changement de modèle (`model_select`).
- **Contrôleur 495** (system) — lit la situation de l'adresse du modèle sélectionné, l'inscrit au
  démarrage de l'intervention, et annonce un modèle hors de la machine.
- **Lecteur du dossier** (external) — lit, dans le journal ou l'export, la situation du modèle de
  chaque intervention.

### 4. Trigger and preconditions [draft]

**Déclencheurs :**
- l'ouverture de session (`session_start`) ;
- un changement de modèle dans Pi (`model_select`, sources `set` et `cycle`) ;
- une phase qui demande l'ouverture d'une intervention.

**Préconditions :**
- pour l'annonce, un modèle est sélectionné dans Pi ; sans modèle, rien n'est annoncé ;
- pour l'inscription, les préconditions de e25s02 : le runtime existe, et la sélection est lue une
  fois au démarrage de l'intervention.

### 5. Main flow and business logic [reviewed]

**Lecture de la situation.**

1. 495 prend l'adresse que Pi tient pour le modèle (`baseUrl`).
2. Il en lit le nom d'hôte sans résoudre aucun nom et sans ouvrir aucune connexion.
3. Le modèle est sur la machine si ce nom est `localhost`, une adresse IPv4 de `127.0.0.0/8` ou
   l'adresse IPv6 `::1`. Il est hors de la machine dans tous les autres cas : une adresse absente,
   vide ou illisible compte comme hors de la machine.

Une erreur de lecture va donc vers l'annonce, jamais vers le silence.

**Inscription.**

4. Au démarrage d'une intervention, la lecture unique de la sélection établie par e25s02 porte aussi
   la situation du modèle lu.
5. Le démarrage inscrit la situation à côté du fournisseur, du modèle et du niveau de réflexion.
   L'adresse elle-même n'est pas inscrite.

**Annonce.**

6. À l'ouverture de session, si le modèle sélectionné est hors de la machine, 495 prépare une
   annonce qui nomme le fournisseur et le modèle.
7. À chaque changement de modèle, si le nouveau modèle est hors de la machine, 495 prépare la même
   annonce pour lui.
8. L'annonce est dite comme un diagnostic d'ouverture : un écran la reçoit aussitôt, et les entrées
   structurées (print, JSON, RPC) la reçoivent au premier `/495` ou au premier appel de l'outil qui
   suit. Chaque annonce est dite une fois par canal.

La situation inscrite en 5 et celle qui est annoncée en 6 ou 7 sont lues par la même règle. La
situation inscrite est celle du modèle jugé par la vérification de capacité, puisqu'elle vient de la
même lecture.

### 6. Alternative flows and exceptions [draft]

6a. **Modèle sur la machine** — rien n'est annoncé, ni à l'ouverture ni au changement. Le démarrage
inscrit la situation « sur la machine ».

6b. **Passage d'un modèle local à un modèle distant par `/model`** — le nouveau modèle est annoncé
dès la sélection. La prochaine intervention inscrit la situation « hors de la machine ».

6c. **Passage d'un modèle distant à un autre modèle distant** — le nouveau modèle est annoncé aussi.
Chaque destination hors de la machine est dite, pas seulement la première.

6d. **Retour à un modèle local** — rien n'est annoncé, et aucune annonce de levée n'est émise.

6e. **Modèle retrouvé à la reprise d'une session** — Pi 0.87.1 n'émet pas `model_select` pour un
modèle restauré. Le modèle actif à l'ouverture de session est jugé à l'étape 6 : s'il est hors de la
machine, il est annoncé à l'ouverture.

6f. **Adresse absente, vide ou illisible** — le modèle est situé hors de la machine, annoncé et
inscrit comme tel.

6g. **Nom qui imite le bouclage** — un nom d'hôte comme `localhost.example.com`, `127.0.0.1.nip.io`
ou `0.0.0.0` n'est pas une adresse de bouclage : le modèle est situé hors de la machine. Une forme
IPv4 que l'analyseur d'URL normalise, comme `127.1`, est lue après sa normalisation.

6h. **Aucun modèle sélectionné à l'ouverture** — rien n'est annoncé. Le premier modèle choisi ensuite
est jugé à l'étape 7.

6i. **Runtime qui n'a pas pu être créé** — l'annonce reste due : elle dit un fait de Pi, pas de 495.
Les entrées structurées la reçoivent avec la réponse de refus du premier `/495`.

6j. **Dossier écrit avant cette story** — ses démarrages n'ont pas de situation. Un lecteur la lit
comme absente, jamais comme « sur la machine ».

6k. **Même modèle sélectionné à nouveau** — Pi n'émet pas `model_select` quand le fournisseur et
l'identifiant ne changent pas ; rien n'est annoncé de nouveau.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  none
Dynamic elements: annonce « 495: the selected model <fournisseur>/<modèle> is reached off this machine; what 495 sends it leaves the machine »
```

L'annonce est une notification d'avertissement à l'écran et un message `495` sur les entrées
structurées, comme les diagnostics d'ouverture. Elle est en anglais, comme eux. Elle ne contient
jamais l'adresse.

### 8. Domain model [draft]

**Entité créée :** la situation d'un modèle, `on_machine` ou `off_machine`. Le type et la règle de
lecture vivent dans le domaine, à la place du type `EgressLocation` que e25s01 a retiré faute de
lecteur. La règle est une fonction pure de l'adresse. Aucun identifiant de composant nouveau.

**Entité touchée :** la sélection de modèle (`ModelSelection`) porte la situation lue en même temps
que le fournisseur, le modèle et le niveau. Le démarrage d'intervention inscrit la sélection entière,
donc la situation aussi. Pour un dossier ancien, le champ est facultatif.

**Relations changées :** l'extension écoute `model_select` en plus de `session_start`. Les deux
alimentent la file d'annonces que la session tient déjà pour les diagnostics d'ouverture.

**Raison de la profondeur** — la situation est lue de l'adresse que Pi rapporte, pas déclarée par
l'utilisateur ni déduite du nom du fournisseur. La lire dans la même lecture que la sélection évite
un second lecteur du modèle, et garantit que la situation inscrite est celle du modèle jugé. La file
d'annonces existe déjà et sait parler à chaque entrée. Un canal nouveau devrait réapprendre ce qu'elle
sait.

### 9. Integrations and boundaries [draft]

- **Catalogue de modèles de Pi** (perennial, direction: in) — l'adresse `baseUrl` du modèle
  sélectionné, lue dans le contexte de la commande, de l'outil ou de l'événement.
- **Événement `model_select` de Pi** (perennial, direction: in) — sources `set` et `cycle` dans Pi
  0.87.1 ; `restore` est déclaré dans le type mais n'est pas émis.
- **Worker Pi** (perennial, direction: both) — joint le modèle nommé par le mandat ; inchangé. Il
  résout le même couple fournisseur/modèle depuis `models.json` et le catalogue intégré de Pi, sans
  autre extension chargée.

### 10. Background processes [draft]

Not applicable — la situation est lue sur événement de Pi ou au démarrage d'une intervention.

### 11. Notifications [draft]

- **Annonce d'un modèle hors de la machine** — destinataire : l'utilisateur de la session, sur
  l'entrée qu'il emploie. Déclencheur : ouverture de session ou changement de modèle, avec un modèle
  hors de la machine. Contenu : fournisseur et modèle, jamais l'adresse. Aucune action requise.

### 12. Audit and logging [draft]

**Entité auditée :** l'intervention. Son démarrage porte désormais la situation du modèle, à côté du
fournisseur, du modèle et du niveau de réflexion. L'export du dossier la montre dans son journal.
L'annonce elle-même n'est pas inscrite au dossier : elle s'adresse à la session, et le dossier dit
déjà, intervention par intervention, où les extraits sont partis.

### 13. Solution variabilities [reviewed]

Not applicable — aucun réglage. La liste des adresses de bouclage est fixe.

### 14. Quality attributes *NFR* [draft]

- Lecture de la situation : 0 résolution de nom, 0 connexion ouverte.
- Adresse de bouclage (`localhost`, `127.0.0.0/8`, `::1`) : 100 % sur la machine. Toute autre
  adresse, y compris absente ou illisible : 100 % hors de la machine.
- Ouverture puis changement vers un modèle distant : 1 annonce par modèle distant et par canal.
- Modèle local : 0 annonce.
- Intervention démarrée : 1 situation inscrite, égale à celle du modèle jugé.

### 15. Security and compliance *NFR* [draft]

- **Classification des données :** l'adresse n'est ni inscrite, ni exportée, ni annoncée. Elle peut
  porter un jeton de requête ou un chemin privé, et le dossier est exportable.
- **Défaut sûr :** l'incertitude situe le modèle hors de la machine. Un nom qui ressemble au bouclage
  sans l'être n'est pas admis comme local.
- **Autorisation :** inchangée. L'annonce prévient et ne refuse rien ; le modèle choisi dans Pi reste
  admis (e25s01).
- **Limite connue :** la situation est lue du catalogue de la session Pi. Le worker résout le même
  couple depuis `models.json` et le catalogue intégré, sans les autres extensions de la session. Une
  extension de la session qui redéfinirait l'adresse d'un fournisseur (`registerProvider`) ferait
  lire à 495 une adresse que le worker ne joint pas. Ce cas n'est pas mesuré ici.

### 16. UX and accessibility *NFR* [draft]

- L'annonce parvient sur chaque entrée Pi qualifiée : TUI, print, JSON, RPC.
- Elle ne demande aucune réponse et n'interrompt aucune commande.
- Langue : anglais, comme les diagnostics d'ouverture.

### 17. Acceptance criteria [reviewed]

```
Scenario: Une adresse de bouclage situe le modèle sur la machine (§5)
  Given un modèle dont l'adresse est http://127.0.0.1:8000/v1, http://localhost:1234 ou http://[::1]:8080
  When  sa situation est lue
  Then  il est sur la machine

Scenario: Toute autre adresse situe le modèle hors de la machine (6f, 6g)
  Given un modèle dont l'adresse est https://api.example.com, absente, vide, illisible,
        http://localhost.example.com ou http://0.0.0.0:8000
  When  sa situation est lue
  Then  il est hors de la machine
  And   aucun nom n'a été résolu

Scenario: Le démarrage d'une intervention inscrit la situation de son modèle (§5, 6a)
  Given un modèle sélectionné dont l'adresse est de bouclage
  When  une intervention démarre
  Then  son démarrage inscrit la situation « sur la machine » avec le fournisseur et le modèle
  And   l'adresse n'apparaît ni au journal ni dans l'export

Scenario: Un changement vers un modèle distant se lit au journal (6b)
  Given une intervention terminée avec un modèle sur la machine
  And   un modèle hors de la machine sélectionné ensuite
  When  l'intervention suivante démarre
  Then  son démarrage inscrit la situation « hors de la machine »
  And   l'export montre les deux situations

Scenario: Un modèle distant actif à l'ouverture est annoncé (§5, 6e)
  Given un modèle hors de la machine sélectionné quand la session s'ouvre
  When  la session s'ouvre
  Then  un écran reçoit aussitôt l'annonce qui nomme son fournisseur et son modèle
  And   une entrée structurée la reçoit au premier /495 qui suit

Scenario: Un changement vers un modèle distant est annoncé (6b, 6c)
  Given une session ouverte
  When  un modèle hors de la machine est sélectionné par /model
  Then  l'annonce nomme ce modèle, sans son adresse
  And   aucune commande n'est bloquée

Scenario: Un modèle local n'est pas annoncé (6a, 6d)
  Given une session ouverte avec un modèle sur la machine
  When  un autre modèle sur la machine est sélectionné
  Then  aucune annonce n'est émise
```

### 18. Out of scope [draft]

- La recette par exécution réelle, avec un modèle distant choisi par `/model` en cours de session,
  et la décision D-61 appartiennent à e25s04.
- Aucune liste de destinations n'est rétablie, et l'annonce ne refuse aucun modèle.
- La section `<cwd>` que Pi ajoute à l'invite reste une question ouverte du propriétaire (capsule de
  l'epic, `hors_perimetre`).
- Une adresse redéfinie par une autre extension de la session (§15, limite connue) n'est pas traitée.
- Une adresse de réseau local privé (`10.0.0.0/8`, `192.168.0.0/16`, un nom `.local`) reste hors de
  la machine : elle sort de la machine, même si elle ne sort pas du réseau.

### 19. Open questions [draft]

Aucune question au propriétaire. Un point est lu dans le code de Pi et pas encore mesuré : pour un
modèle restauré (§6e), `ctx.model` est déjà lisible dans `session_start`. Dans Pi 0.87.1,
`createAgentSession` (`core/sdk.js`) résout le modèle restauré avant que `bindExtensions` émette
`session_start`. Le test de la tâche 3 le vérifie dans un vrai `pi --mode rpc`.

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` — SEC-05 et sa recette.
- `specs/epics/e25-le-modele-choisi-dans-pi-est-autorise/epic.yaml` — position de la story.
- `specs/epics/e25-le-modele-choisi-dans-pi-est-autorise/e25s01-le-fournisseur-du-modele-choisi-est-admis-sans-configuration.md`
  — le type de situation retiré faute de lecteur, que cette story réintroduit.
- `specs/epics/e25-le-modele-choisi-dans-pi-est-autorise/e25s02-le-modele-choisi-par-model-est-celui-de-l-intervention-suivante.md`
  — la lecture unique de la sélection au démarrage de l'intervention, qui porte ici la situation.
- `node_modules/@earendil-works/pi-ai/dist/types.d.ts`, `Model.baseUrl` — l'adresse que Pi tient
  pour chaque modèle (Pi 0.87.1).
- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`, `ModelSelectEvent`
  — le modèle nouveau, le précédent et la source.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js`, `_emitModelSelect` —
  émis par `setModel` (`set`) et par le cycle (`cycle`), jamais quand le couple ne change pas.
- `node_modules/@earendil-works/pi-coding-agent/examples/extensions/model-status.ts` — une extension
  qui écoute `model_select`.
- `src/adapters/pi-worker/worker-main.ts` — le worker résout le modèle depuis `models.json` et le
  catalogue intégré.
- `specs/adr/D-52-une-commande-verify-s-ecrit-rouge.md` — pourquoi les commandes du plan échouent au
  moment où elles sont écrites.
- Fichiers touchés prévus : `src/domain/policy.ts`, `src/ports/execution.ts`,
  `src/domain/change/commands.ts`, `src/domain/change/events.ts`, `src/domain/change/state.ts`,
  `src/extension/conduct.ts`, `src/extension/session.ts`, `src/extension/index.ts`,
  `test/v1/model-location.test.ts`, `test/v2/model-location-journal.test.ts`,
  `test/v3/model-select.test.ts`.
