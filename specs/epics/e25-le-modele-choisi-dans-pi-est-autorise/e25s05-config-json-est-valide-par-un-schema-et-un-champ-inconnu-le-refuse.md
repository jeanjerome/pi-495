STORY KEY: e25s05
TITLE:     Valider config.json contre un schéma JSON strict, et refuser un champ inconnu
TYPE:      Story
PARENT:    e25
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-24
MATURITY:  3
SIZE:      M

### 1. Business narrative [draft]

`config.json` porte des réglages qui décident qui adopte une exigence ou une conception, combien de
tentatives un changement reçoit, et si l'intégration locale est permise. Sa lecture ne vérifie que
deux choses : que le fichier se lit, et que ses sections sont des objets. Tout le reste passe tel
qu'il est écrit.

Trois conséquences sont consignées au registre des défauts. Une valeur du mauvais type est chargée
comme écrite : `"design": "Human"` avec une majuscule remet au noyau une décision que le
propriétaire voulait garder pour un humain, et rien ne l'annonce. `"integration_enabled": "false"`
est une chaîne non vide, donc vraie. Une section `baseline` partielle perd ses autres champs, et la
comparaison avec la référence est sautée. Une clé mal orthographiée, elle, n'est même pas vue : elle
est ignorée en silence. Seule `policy.egress` a reçu un diagnostic, ajouté à la main quand la liste a
été retirée.

Chaque réglage a donc dû être prouvé un par un, par un test puis par une campagne. Le propriétaire a
tranché le 2026-09-24 : `config.json` est validé contre un schéma JSON strict, et un champ inconnu
n'y a pas sa place.

#### MODIFIED: SEC-05 — Réduire l'exposition de données

**Before:** une clé `policy.egress` restée dans `config.json` est ignorée, et un diagnostic
d'ouverture de session le dit (e25s01). Toute autre clé inconnue est ignorée sans diagnostic. Une
valeur du mauvais type est chargée comme écrite. Seuls un fichier illisible et une section qui n'est
pas un objet arrêtent tout changement.

**After:** `config.json` est validé à l'ouverture de 495 contre un schéma JSON 2020-12 qui nomme
chaque clé permise, son type et ses valeurs. Un fichier qui ne le respecte pas arrête tout
changement, comme un fichier illisible : clé inconnue, `policy.egress` comprise, valeur du mauvais
type, valeur hors de celles permises. Le refus nomme l'emplacement de chaque écart et ce qui y est
attendu, jamais la valeur écrite. Le schéma est publié avec les autres contrats de 495.

### 2. Value statement [draft]

As a propriétaire d'une installation de 495, I want que `config.json` soit refusé dès qu'il porte
un champ inconnu ou une valeur invalide, so that aucun réglage que j'ai écrit ne soit ignoré ou mal
lu sans que je le sache.

### 3. Actors and permissions [draft]

- **Propriétaire** (external) — écrit `config.json` dans le répertoire de données ; lit le refus et
  corrige le fichier.
- **Pi** (system) — charge 495 à l'ouverture de session et à `/reload`, et affiche ses messages sur
  toutes ses entrées.
- **Contrôleur 495** (system) — lit le fichier, le valide contre le schéma et refuse tout changement
  si la validation échoue.

### 4. Trigger and preconditions [draft]

**Déclencheur :** la session de 495 s'ouvre, ou Pi recharge ses extensions par `/reload`.

**Préconditions :** un fichier `config.json` est présent dans le répertoire de données. Sans
fichier, les réglages par défaut s'appliquent, comme aujourd'hui.

### 5. Main flow and business logic [draft]

1. 495 lit `config.json` : fichier ordinaire, texte lisible, JSON valide, comme aujourd'hui.
2. Le contenu est validé contre le schéma du fichier de configuration.
3. Le schéma est fermé à chaque niveau : un objet n'admet que les clés qu'il nomme. Toutes les clés
   sont facultatives ; une clé absente prend sa valeur par défaut.
4. Le schéma nomme les clés que la lecture accepte aujourd'hui, et rien d'autre :
   - `policy` : `policy_id`, `revision`, `budgets`, `adoption`, `g5_human_acceptance`,
     `integration_enabled`, `baseline`, `stagnation_identical_candidates`, `required_reviews` ;
   - `policy.budgets` : les sept bornes, en entiers non négatifs ; `max_attempts`, les deux durées
     et la borne d'appels d'outils valent au moins 1 ;
   - `policy.adoption` : `mandate`, `requirements` et `design`, chacun `kernel` ou `human` ;
     `protocol`, s'il est écrit, ne peut valoir que `kernel` ;
   - `policy.baseline` : les quatre champs de la politique de comparaison, avec leurs valeurs
     permises ;
   - `isolation.allow_unconfined`, `human_origin.rpc_actor_env`, `workspace_exclusions`, `language`
     (`fr` ou `en`) ;
   - `$schema`, une chaîne, pour qu'un éditeur puisse pointer vers le schéma publié.
5. Si la validation passe, chaque section est fusionnée sur ses valeurs par défaut, `baseline`
   comprise. Les variables d'environnement s'appliquent ensuite, comme aujourd'hui.
6. Si elle échoue, le fichier est refusé comme un fichier illisible : aucun changement ne démarre
   jusqu'à ce qu'il soit corrigé ou retiré et que Pi recharge ses extensions (`/reload`) ou ouvre
   une nouvelle session. Le refus nomme les trois premiers écarts et compte les autres.

Interruption point: entre les étapes 2 et 5 — rien n'est appliqué d'un fichier qui ne passe pas la
validation.

### 6. Alternative flows and exceptions [draft]

6a. **Clé `policy.egress`** — c'est une clé inconnue comme les autres, et le fichier est refusé. Le
refus dit, pour elle seule, que la liste n'est plus lue et que le modèle choisi dans Pi est employé.
Cela remplace le diagnostic de e25s01, qui l'ignorait et appliquait le reste du fichier.

6b. **Clé inconnue** — le refus nomme son emplacement : `policy.adoptoin`, par exemple. Un nom de
clé est écrit par le propriétaire et part dans le contexte du modèle de la session. Il n'est donc
cité que s'il est un identifiant court (lettres, chiffres, `_`, `-`, 40 caractères au plus).
Sinon, le refus dit « une clé inconnue » sous la section qui la porte.

6c. **Valeur du mauvais type ou hors des valeurs permises** — le refus nomme l'emplacement et ce qui
y est attendu, par exemple « `policy.adoption.design` doit valoir `kernel` ou `human` », sans
reproduire la valeur écrite.

6d. **`policy.adoption.protocol` qui vaut autre chose que `kernel`** — refusé. Aujourd'hui, la valeur
est remplacée par `kernel` sans rien dire. Un propriétaire qui écrit `human` croit avoir gardé
l'adoption du protocole ; le refus lui apprend que le noyau la garde.

6e. **Section `baseline` partielle** — elle est fusionnée sur la politique de comparaison par défaut,
comme les autres sections. `{"tolerance": "no_aggravation"}` ne retire plus
`compare_to_reference`.

6f. **Fichier valide** — il est chargé comme aujourd'hui, sans aucun diagnostic.

6g. **Variables d'environnement** — elles ne sont pas validées par le schéma et gardent leur effet.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  none
Dynamic elements: refus « config.json cannot be read: <écart>[; <écart>][; <écart>][; and <n> more]; no change runs until it is fixed or removed and Pi is reloaded (/reload) or a new session is started »
```

Chaque écart suit une de ces formes :
- `policy.egress is no longer read, since the model selected in Pi is used`
- `<emplacement> is not a known setting`
- `<section> holds a key that is not a known setting`
- `<emplacement> must be <attendu>`

Le refus reprend le message et le canal du fichier illisible. Il est en anglais, comme lui.

### 8. Domain model [draft]

**Entité créée :** le contrat du fichier de configuration, un schéma TypeBox parmi les contrats de
`src/contracts/v1/`, émis en JSON Schema 2020-12 sous `contracts/v1/` comme les autres (ADR-006).
Il reprend `BaselinePolicy`, qui existe déjà.

**Entité touchée :** la lecture de la configuration, `src/extension/config.ts`. La validation
remplace ses vérifications de section une par une.

**Raison de la profondeur** — un schéma est la seule description de ce que le fichier peut porter.
La lecture, le refus et la documentation publiée s'en déduisent. Vérifier chaque clé à la main est
ce qui a laissé passer les défauts du registre.

### 9. Integrations and boundaries [draft]

- **`config.json` du répertoire de données** (perennial, direction: in) — lu à l'ouverture de 495,
  validé avant tout usage.
- **Schéma publié** (perennial, direction: out) — `contracts/v1/`, dans le paquet npm, comme les
  autres contrats.

### 10. Background processes [draft]

Not applicable — le fichier est lu à l'ouverture de 495, jamais sur horloge.

### 11. Notifications [draft]

Not applicable — le refus emprunte le canal existant du fichier illisible.

### 12. Audit and logging [draft]

Not applicable — un fichier refusé n'ouvre aucun changement, donc rien n'est inscrit à un dossier.

### 13. Solution variabilities [reviewed]

Not applicable — la validation n'a pas de réglage.

### 14. Quality attributes *NFR* [draft]

- Chaque clé que la lecture accepte aujourd'hui est acceptée par le schéma : un fichier valide donne
  la même configuration qu'avant la story, `baseline` exceptée (6e).
- Une clé inconnue, à chaque niveau, fait refuser le fichier.
- Les quatre cas du registre sont refusés : `design: "Human"`, `integration_enabled: "false"`,
  `allow_unconfined: "no"` et `baseline: "x"`.
- 0 valeur écrite reproduite dans un refus, sur toutes les formes d'écart.

### 15. Security and compliance *NFR* [draft]

- **Défaut sûr :** un fichier que le schéma refuse arrête tout changement, au lieu de céder la place
  aux valeurs par défaut. Un réglage qui réserve une décision à un humain n'est jamais perdu en
  silence.
- **Classification des données :** le refus atteint l'écran, les entrées structurées et le contexte
  du modèle de la session. Il ne reproduit aucune valeur, ni un nom de clé qui n'est pas un
  identifiant court.
- **Aucun contrôle retiré :** le refus d'un fichier illisible, d'un lien symbolique brisé et d'un
  fichier qui n'est pas un fichier ordinaire reste tel quel.

### 16. UX and accessibility *NFR* [draft]

- Le refus dit où corriger : chaque écart nomme son emplacement dans le fichier.
- Le README décrit la validation et pointe vers le schéma publié.
- Langue : le refus reste en anglais, comme les autres messages de 495.

### 17. Acceptance criteria [reviewed]

```
Scenario: Un fichier valide est chargé comme avant (6f)
  Given un config.json qui ne porte que des clés connues, avec des valeurs permises
  When  la session de 495 s'ouvre
  Then  la configuration est celle que la lecture donnait avant la story
  And   aucun diagnostic n'est émis

Scenario: Une clé inconnue fait refuser le fichier (6b)
  Given un config.json qui porte policy.adoptoin
  When  la session de 495 s'ouvre
  Then  aucun changement ne peut démarrer
  And   le refus nomme policy.adoptoin

Scenario: policy.egress fait refuser le fichier, avec son motif (6a)
  Given un config.json qui porte encore une liste policy.egress
  When  la session de 495 s'ouvre
  Then  aucun changement ne peut démarrer
  And   le refus dit que la liste n'est plus lue et que le modèle choisi dans Pi est employé
  And   le refus ne reproduit aucune entrée de la liste

Scenario: Une valeur invalide fait refuser le fichier sans être reproduite (6c)
  Given un config.json dont policy.adoption.design vaut "Human"
  When  la session de 495 s'ouvre
  Then  aucun changement ne peut démarrer
  And   le refus nomme policy.adoption.design et les valeurs permises
  And   le refus ne contient pas "Human"

Scenario: Une section baseline partielle garde ses autres champs (6e)
  Given un config.json dont policy.baseline ne porte que tolerance
  When  la session de 495 s'ouvre
  Then  la comparaison avec la référence reste active

Scenario: Un fichier corrigé est accepté après /reload (§5 étape 6)
  Given une session où config.json a été refusé
  When  le fichier est corrigé et Pi recharge ses extensions
  Then  un changement peut démarrer
```

### 18. Out of scope [draft]

- Le budget de tentatives écrit dans `config.json` n'atteint toujours pas un changement (défaut
  ouvert du registre). Le schéma le valide, mais le livrer au changement est une autre correction.
- Aucune commande `/495 doctor` : `/reload` relance la validation et affiche le résultat.
- Le fichier de configuration d'un projet cible n'existe pas ; seul celui du répertoire de données
  est lu.
- La recette par exécution réelle de l'epic appartient à e25s04, qui tourne sur le build de cette
  story.

### 19. Open questions [draft]

Aucune. Le propriétaire a tranché le 2026-09-24 : validation par un schéma JSON strict, et refus
d'un champ inconnu. `policy.egress` en est un : la décision du 2026-09-23 (ignorer et annoncer) est
remplacée par ce refus.

### 20. References [draft]

- `specs/bugs/registry.yaml` — le champ du mauvais type chargé tel qu'écrit, et les quatre cas qui
  atteignent une garde.
- `specs/adr/ADR-006-json-schema-2020-12-aux-frontieres.md` — schémas générés depuis TypeBox et
  validés à l'exécution.
- `specs/epics/e25-le-modele-choisi-dans-pi-est-autorise/e25s01-le-fournisseur-du-modele-choisi-est-admis-sans-configuration.md`
  — le diagnostic de `policy.egress` ignorée, et le refus du fichier illisible, que cette story
  étend.
- `src/contracts/v1/protocol.ts`, `BaselinePolicy` — la politique de comparaison déjà décrite en
  contrat.
- `specs/adr/D-52-une-commande-verify-s-ecrit-rouge.md` — pourquoi les commandes du plan échouent au
  moment où elles sont écrites.
- Fichiers touchés : `src/contracts/v1/config.ts`, `src/contracts/registry.ts`,
  `contracts/v1/harness-config.json`, `src/extension/config.ts`, `README.md`,
  `test/v1/config-schema.test.ts`, `test/v1/model-admitted.test.ts`, `test/v3/config-refused.test.ts`.
