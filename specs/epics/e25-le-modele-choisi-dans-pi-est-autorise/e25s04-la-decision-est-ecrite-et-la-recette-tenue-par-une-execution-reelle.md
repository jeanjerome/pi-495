STORY KEY: e25s04
TITLE:     Écrire la décision du modèle admis et la tenir par trois exécutions réelles
TYPE:      Story
PARENT:    e25
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-24
MATURITY:  3
SIZE:      S

### 1. Business narrative [draft]

Les quatre stories précédentes ont changé ce que 495 fait du modèle choisi dans Pi. Le fournisseur de
ce modèle est admis sans configuration (e25s01). Le modèle est lu au démarrage de chaque
intervention (e25s02). Sa situation est lue de l'adresse que Pi tient pour lui, inscrite au dossier
et annoncée quand il est hors de la machine (e25s03). `config.json` est validé contre un schéma
strict, et une liste `policy.egress` restée dans le fichier le fait refuser (e25s05). Chacune de ces stories a été recettée par des
campagnes réelles, mais aucune n'a joint un modèle réellement distant. Le modèle « hors de la
machine » de e25s03 était le modèle local, joint par un nom public qui revient à la machine, et le
relevé de e25s03 renvoie cette recette à e25s04.

Deux écrits décrivent encore l'état d'avant. `D-53` règle ce qu'une liste de destinations malformée
déclare, pour une liste que plus rien ne lit. Et aucune décision ne dit que la politique de sorties
réseau que SEC-05 exige est, pour le canal modèle, le choix du modèle dans Pi. Qui lit les décisions
pour comprendre pourquoi un modèle distant reçoit des extraits sans déclaration ne trouve que la
déclaration obligatoire introduite par e23s01.

Le résultat attendu est une décision qui dit l'état d'arrivée, et une recette qui l'éprouve sur un
seul build : un modèle local sans configuration, un modèle réellement distant choisi en cours de
session, et une liste restée dans un `config.json`, refusée jusqu'à ce qu'elle soit retirée.

#### ADDED: D-61 — le modèle choisi dans Pi est admis, et sa situation est observée

**Before:** la seule décision sur la destination du canal modèle est `D-53`, qui suppose une liste
`policy.egress` lue et opposée avant chaque intervention. Le retrait de cette liste, la lecture du
modèle à chaque intervention, la situation lue de l'adresse et la validation du fichier ne sont
écrits que dans les spécifications de e25s01 à e25s03 et de e25s05.

**After:** `D-61` dit que le modèle choisi dans Pi est admis, que `config.json` ne porte plus aucune
configuration de modèle, et que la situation du modèle est observée plutôt que déclarée. Elle dit
que le fichier est validé contre un schéma strict, qui refuse `policy.egress`. Elle dit que la
politique de sorties réseau de SEC-05, sur le canal modèle, est le choix du modèle dans Pi,
et ce qui reste de SEC-05 sans changer. Elle remplace la déclaration obligatoire introduite par
e23s01. `D-53` porte qu'elle est rendue sans objet par `D-61`.

### 2. Value statement [draft]

As a propriétaire du harnais, I want une décision qui dit pourquoi le modèle choisi dans Pi est
admis, et une recette qui l'éprouve avec un modèle réellement distant, so that ce que 495 envoie
hors de la machine soit à la fois voulu, écrit et observé en situation.

### 3. Actors and permissions [draft]

- **Propriétaire** (external) — a décidé le 2026-09-23 qu'il n'y a plus de configuration de modèle
  dans `config.json` ; valide la décision et confirme la recette.
- **Agent** (system) — écrit `D-61`, conduit les campagnes, relit les dossiers en lecture seule et
  écrit le relevé.
- **Pi** (system) — tient le modèle sélectionné et son adresse, et joint le fournisseur par
  l'abonnement du propriétaire.
- **Relecteur** (external) — lit la décision pour savoir pourquoi aucune liste ne borne plus les
  destinations, et le relevé pour savoir ce qui a été observé et ce qui a été feint.

### 4. Trigger and preconditions [draft]

**Déclencheur :** e25s01 à e25s03 et e25s05 sont versées sur `main`, et la décision comme la recette par un
modèle réellement distant leur sont renvoyées.

**Préconditions :**
- `dist/` est construit depuis `main` sous Node 24.21.0, et les trois campagnes le chargent tel quel ;
- le modèle local `omlx/qwen3.8-27b-oq8e` répond sur la machine ;
- l'abonnement Anthropic du propriétaire est lié à Pi, qui joint `anthropic/claude-sonnet-5` par
  lui, comme la campagne distante de e23s06 ;
- la Seatbelt est qualifiée sur la machine.

### 5. Main flow and business logic [draft]

1. `D-61` est écrite. Elle dit :
   - que le fournisseur du modèle choisi dans Pi est admis, et qu'aucune intervention n'est refusée
     au motif de sa destination ;
   - que `config.json` ne porte plus de configuration de modèle, et qu'il est validé contre un
     schéma JSON strict : une clé `policy.egress` restée dans un fichier le fait refuser, avec son
     motif, sans que la liste soit reproduite ;
   - que le modèle est lu au démarrage de chaque intervention, pas à l'ouverture de session ;
   - que sa situation est lue de l'adresse que Pi tient pour lui : seule une adresse de bouclage le
     situe sur la machine, et l'incertitude le situe hors d'elle ; elle est inscrite au démarrage de
     chaque intervention, sans l'adresse ;
   - qu'un modèle hors de la machine est annoncé, sans rien bloquer, à l'ouverture de session et à
     chaque changement de modèle ;
   - que la politique de sorties réseau de SEC-05, sur le canal modèle, est le choix du modèle dans
     Pi ; la liste fermée des variables remises au worker et l'expurgation de l'export restent ;
   - ce qui reste de `D-53` : un `config.json` illisible ou invalide arrête toujours tout
     changement, pour un autre motif, qui est de ne pas remettre au noyau un arbitrage réservé à un
     humain.
2. `D-53` reçoit le statut « rendue sans objet par `D-61` ». Son texte ne change pas.
3. Un build unique de `main` est fait. Son empreinte d'environnement est relevée dans chaque dossier.
4. **Campagne `e25s04-local`** — répertoire de données sans `config.json`, session ouverte sur
   `omlx/qwen3.8-27b-oq8e`, `/495 start` sur la cible JS minimale, conduite jusqu'à son verdict.
5. **Campagne `e25s04-distant`** — répertoire de données sans `config.json`, session ouverte sur
   `omlx/qwen3.8-27b-oq8e`, `/495 start`, puis sélection de `anthropic/claude-sonnet-5` dès que le
   journal porte le premier démarrage d'intervention, conduite jusqu'à son verdict.
6. **Campagne `e25s04-negatif`** — répertoire de données dont `config.json` porte une liste
   `policy.egress` qui ne nomme qu'un fournisseur témoin, `temoin-liste-e25s04` : elle exclut donc
   le modèle choisi. Session ouverte sur `omlx/qwen3.8-27b-oq8e`, `/495 start` : refusé, le refus
   dit que la liste n'est plus lue. La clé est retirée du fichier, Pi recharge ses extensions
   (`/reload`), `/495 start` de nouveau, conduit jusqu'à son verdict.
7. Chaque dossier est relu en lecture seule, depuis SQLite, le magasin d'objets et l'export. Chaque
   répertoire de données est fouillé pour l'adresse des deux fournisseurs, leurs jetons et le nom
   témoin.
8. Le relevé `specs/verifications/e25s04-modele-choisi-admis.md` est écrit : par campagne, ce qui a
   été observé, à l'écran, sur l'entrée structurée et au journal, et ce qui a été feint.
9. La matrice de traçabilité porte SEC-05 avec les preuves de l'epic. AGT-07, `[P1]`, n'a pas de
   ligne dans la matrice archivée, qui ne porte que les exigences `[P0]` ; ses preuves sont dans le
   relevé de vérification.

Interruption point: entre les étapes 2 et 3 — la décision est écrite, aucune campagne n'a tourné.
Les campagnes 4 à 6 tournent l'une après l'autre : un seul serveur de modèle local les sert.

### 6. Alternative flows and exceptions [draft]

6a. **Une campagne n'atteint pas son verdict** — le relevé le dit avec l'état du changement et le
motif d'arrêt lus au journal. Une campagne rejouée garde le premier dossier, sous un autre nom.

6b. **Le jeton de l'abonnement a expiré** — Pi le renouvelle à la première requête. S'il ne le peut
pas, la campagne distante est suspendue et le propriétaire relance la connexion (`! pi` puis
`/login`) ; aucune autre voie vers un modèle distant ne la remplace.

6c. **Un comportement observé contredit une spécification de e25s01 à e25s03** — il est consigné
comme défaut dans `specs/bugs/`, avec sa campagne. La story ne se clôt pas sur une campagne dont
l'écart n'est ni corrigé ni tranché par le propriétaire.

6d. **Le premier `/495 start` du contrôle négatif n'est pas refusé** — la validation de e25s05 n'a
pas tenu dans un vrai Pi. C'est un défaut, consigné comme en 6c.

### 7. Interface elements [draft]

Not applicable — la story n'ajoute rien à l'écran. Les campagnes observent l'annonce d'un modèle
hors de la machine et le refus d'une liste `policy.egress` tels qu'ils existent.

### 8. Domain model [draft]

**Entité touchée :** aucune dans le code. La décision est un texte versionné sous `specs/adr/`, le
relevé un texte versionné sous `specs/verifications/`.

**Entité créée :** aucune. Aucun identifiant de composant nouveau.

### 9. Integrations and boundaries [draft]

- **Modèle local** (perennial, direction: both) — `omlx/qwen3.8-27b-oq8e`, servi sur la machine.
- **Fournisseur distant par l'abonnement du propriétaire** (perennial, direction: both) —
  `anthropic/claude-sonnet-5`. La campagne distante envoie réellement à Anthropic les extraits de la
  cible JS minimale, qui ne porte aucune donnée privée. Elle consomme du quota de l'abonnement,
  comme la campagne distante de e23s06.
- **Pi en mode RPC** (perennial, direction: both) — `pi -ne --mode rpc --no-session -e
  dist/extension/index.js`, piloté par un script de campagne sous `~/.495-campagnes/scripts/`.

### 10. Background processes [draft]

Not applicable — les campagnes sont conduites à la demande, jamais sur horloge.

### 11. Notifications [draft]

Not applicable — les annonces observées existent déjà ; la story n'en ajoute pas.

### 12. Audit and logging [draft]

**Entité auditée :** l'intervention, dans chaque dossier de campagne. Le relevé cite, par
intervention, le fournisseur, le modèle et la situation inscrits à son démarrage, et, à sa fin,
l'API et la strate imposée observées dans la requête que le worker a envoyée (`D-60`) : c'est elle
qui prouve quel fournisseur a réellement été joint. La ligne de coût ne nomme le modèle que lorsque
le coût est inconnu. Les dossiers restent sous `~/.495-campagnes/`, hors du dépôt.

### 13. Solution variabilities [reviewed]

Not applicable — aucun réglage.

### 14. Quality attributes *NFR* [draft]

- `e25s04-local` : 0 annonce de modèle hors de la machine ; chaque démarrage inscrit la situation
  « sur la machine » ; changement accepté.
- `e25s04-distant` : 1 annonce à la sélection du modèle distant, à l'écran comme sur l'entrée
  structurée ; au journal, le premier démarrage porte `omlx` sur la machine et chacun des suivants
  `anthropic` hors d'elle ; les requêtes des interventions qui suivent sont
  observées en API `anthropic-messages`, avec le bloc du chemin d'abonnement ; changement accepté.
- `e25s04-negatif` : le premier `/495 start` est refusé, et le refus dit que `policy.egress` n'est
  plus lue ; 0 changement ouvert avant le retrait de la clé. Après le retrait et `/reload` :
  0 refus, changement accepté. Le nom témoin apparaît 0 fois dans le journal, le magasin d'objets,
  l'export et les messages de la session.
- Les trois répertoires de données portent 0 occurrence de l'adresse d'un fournisseur et 0 jeton.

### 15. Security and compliance *NFR* [draft]

- **Classification des données :** la cible JS minimale est un dépôt de démonstration. C'est la
  seule donnée envoyée à Anthropic.
- **Secrets :** le relevé ne reproduit aucune adresse de fournisseur ni aucun jeton ; il cite les
  situations lues au journal. La fouille de l'étape 8 le vérifie sur les dossiers.
- **Autorisation :** la décision consigne qu'il n'existe plus de seconde autorisation que le choix
  du modèle dans Pi, et ce qui reste de SEC-05 : liste fermée de l'environnement du worker,
  expurgation de l'export, refus d'un `config.json` illisible ou invalide.
- **Limites reprises dans la décision :** une extension de la session qui redéfinit l'adresse d'un
  fournisseur fait lire à 495 une adresse que le worker ne joint pas ; une adresse de réseau local
  privé est située hors de la machine ; la section `<cwd>` que Pi ajoute à l'invite reste une
  question ouverte du propriétaire.

### 16. UX and accessibility *NFR* [draft]

Not applicable — la story ne change aucun texte montré à l'utilisateur.

### 17. Acceptance criteria [reviewed]

```
Scenario: La décision dit l'état d'arrivée (§5 étapes 1 et 2)
  Given les spécifications de e25s01 à e25s03 versées sur main
  When  D-61 est écrite
  Then  elle dit le modèle admis, l'absence de configuration de modèle et la situation observée
  And   elle dit ce que devient la politique de sorties réseau de SEC-05 sur le canal modèle
  And   D-53 porte qu'elle est rendue sans objet par D-61

Scenario: Un modèle local sans configuration est admis sans annonce (§5 étape 4)
  Given un répertoire de données sans config.json et le modèle local sélectionné
  When  un changement est conduit jusqu'à son verdict
  Then  il est accepté
  And   chaque démarrage d'intervention inscrit la situation « sur la machine »
  And   aucune annonce de modèle hors de la machine n'est émise

Scenario: Un modèle réellement distant choisi en cours de session est admis et annoncé (§5 étape 5)
  Given un changement démarré avec le modèle local
  When  un modèle Anthropic est sélectionné après le premier démarrage d'intervention
  Then  il est annoncé une fois, sans son adresse
  And   les démarrages suivants inscrivent anthropic hors de la machine
  And   leurs requêtes sont observées comme celles du fournisseur Anthropic
  And   le changement est accepté

Scenario: Une liste restée dans config.json est refusée, puis rien ne la lit (§5 étape 6)
  Given un config.json dont policy.egress ne nomme qu'un fournisseur témoin
  When  un changement est demandé avec le modèle local
  Then  il est refusé, et le refus dit que la liste n'est plus lue
  When  la clé est retirée, Pi recharge ses extensions, et le changement est demandé de nouveau
  Then  il est conduit jusqu'à son verdict sans refus au motif de sa destination
  And   le nom témoin n'apparaît nulle part dans le dossier ni dans les messages de la session

Scenario: Le relevé ne porte ni adresse ni jeton (§15)
  Given les trois répertoires de données des campagnes
  When  ils sont fouillés pour l'adresse des fournisseurs et leurs jetons
  Then  aucune occurrence n'est trouvée, ni dans les dossiers ni dans le relevé
```

### 18. Out of scope [draft]

- Aucun comportement nouveau : un défaut trouvé par une campagne est consigné (6c), et sa
  correction est une story à part, sauf décision contraire du propriétaire.
- La section `<cwd>` que Pi ajoute à l'invite reste ouverte (capsule de l'epic, `hors_perimetre`).
- Une adresse redéfinie par une autre extension de la session n'est pas mesurée.
- `/model` dans l'interface texte n'est pas piloté : les campagnes emploient la commande RPC
  `set_model`, qui appelle le même `session.setModel` de Pi. Le relevé le déclare comme feint.

### 19. Open questions [draft]

Aucune question au propriétaire. La décision reprend celles qu'il a prises le 2026-09-23 et le
2026-09-24, et la campagne distante emploie son abonnement comme celle de e23s06.

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` — SEC-05, AGT-07 et leurs recettes.
- `specs/epics/e25-le-modele-choisi-dans-pi-est-autorise/epic.yaml` — objet, motif, décision du
  propriétaire et position de la story.
- `specs/adr/D-53-une-declaration-de-sortie-malformee-ne-declare-rien.md` — la règle rendue sans
  objet.
- `specs/adr/D-55-495-s-appuie-sur-l-api-de-pi-avant-de-reconstruire-ou-de-deduire.md` — pourquoi
  un fait que Pi tient, l'adresse du modèle, vaut mieux qu'une déclaration.
- `specs/epics/e23-second-fournisseur-de-modele-qualifie/e23s01-la-sortie-de-donnees-vers-le-fournisseur-est-declaree.md`
  — la déclaration obligatoire que `D-61` remplace.
- `specs/epics/e25-le-modele-choisi-dans-pi-est-autorise/e25s05-config-json-est-valide-par-un-schema-et-un-champ-inconnu-le-refuse.md`
  — la validation du fichier que la décision reprend et que le contrôle négatif éprouve.
- `specs/verifications/e25s03-verify.yaml` — ce que les campagnes de e25s03 ont feint, et qu'elles
  renvoient à e25s04.
- `specs/verifications/e23s06-strate-observee.md` — la forme d'un relevé de campagnes réelles, et la
  campagne distante par l'abonnement.
- `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-mode.js`, `set_model` — appelle
  `session.setModel`, comme `/model` dans l'interface texte (Pi 0.87.1).
- `specs/adr/D-52-une-commande-verify-s-ecrit-rouge.md` — pourquoi les commandes du plan échouent au
  moment où elles sont écrites.
- Fichiers touchés : `specs/adr/D-61-*.md`, `specs/adr/D-53-*.md`,
  `specs/verifications/e25s04-modele-choisi-admis.md`, `specs/archive/TRACEABILITY.md`.
