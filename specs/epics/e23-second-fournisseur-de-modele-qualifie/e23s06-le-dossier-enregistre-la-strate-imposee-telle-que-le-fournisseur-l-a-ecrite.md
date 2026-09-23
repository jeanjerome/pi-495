STORY KEY: e23s06
TITLE:     Enregistrer au dossier la strate imposée telle que le fournisseur l'a écrite
TYPE:      Story
PARENT:    e23
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-23
MATURITY:  4
SIZE:      L

### 1. Business narrative [draft]

Sur le chemin d'abonnement, le fournisseur écrit un bloc système de son cru au-dessus des
instructions de 495. Depuis `e23s02`, le manifeste de contexte le nomme. Mais ce qu'il nomme vient
d'une table que 495 entretient à la main : elle dit ce que 495 a lu un jour dans le paquet du
fournisseur, pas ce que le modèle a reçu pendant l'intervention. Deux défauts en découlent, et tous
deux sont déjà constatés.

Le premier est une sur-déclaration. 495 ne sait pas par quel chemin d'authentification l'hôte
joint le fournisseur. La strate est donc déclarée dès que le fournisseur est retenu, même quand elle
n'est pas imposée. La campagne de recette d'`e23s02` l'a montré : sous un fournisseur nommé
`anthropic` mais servi par le modèle local, le manifeste déclarait un bloc que personne n'a écrit.

Le second est un changement que rien ne voit. Le contrôle de Preflight qui devait relire le paquet
du fournisseur a été retiré. Lire du code tiers avec des expressions ne peut pas être complet : ce
qu'un motif ne reconnaît pas ne fait aucun bruit, et le silence passait pour une absence. Un
fournisseur qui modifie son bloc ne serait aujourd'hui vu par personne.

Pi remet pourtant ce fait. L'accroche `before_provider_request` passe à une extension la charge
utile de chaque requête, une fois que le fournisseur l'a construite, juste avant l'envoi. La lecture
de Pi 0.87.0 dit aussi pourquoi aucune autre accroche ne suffit. Le bloc d'abonnement est ajouté par
le fournisseur au moment où il sérialise la requête. `context_with_system` passe plus tôt : elle
porte la transcription de Pi, message système en tête, mais pas ce que le fournisseur y ajoute.

Cette story fait de l'observation la source. Pour chaque intervention, le dossier porte ce que le
fournisseur a écrit autour des instructions de 495 dans la requête réellement envoyée, et il le
présente comme un fait relevé. La déclaration reste au manifeste, mais comme une attente. Un écart
entre les deux est écrit au dossier. Et quand 495 n'a pas pu observer, le dossier le dit, au lieu de
laisser croire que rien n'était imposé.

#### MODIFIED: CTX-02 — Maîtriser les instructions effectives

**Before:** le manifeste porte la liste des strates imposées, tirée d'une table de domaine. Elle est
déclarée dès que le fournisseur est retenu, avec sa condition d'application écrite en prose. Rien ne
la confronte à ce qui est parti vers le fournisseur. Le contrôle qui relisait le paquet du
fournisseur n'est plus dans Preflight. Un bloc déclaré à tort, ou un bloc modifié par le
fournisseur, reste invisible.

**After:** pour chaque intervention, le dossier porte les textes que le fournisseur a écrits
au-dessus et au-dessous des instructions de 495, relevés mot pour mot dans la requête envoyée. Ils
sont marqués comme observés. La liste du manifeste reste, avec le statut d'attente. Chaque écart
entre l'attente et l'observation est nommé au dossier. Une requête que 495 ne sait pas lire, ou une
intervention où rien n'a pu être observé, est inscrite comme non observée, avec sa raison, et jamais
comme une absence de strate.

### 2. Value statement [draft]

As a lecteur d'un dossier 495, I want que le dossier dise ce que le fournisseur a réellement écrit
autour des instructions de 495 dans les requêtes de l'intervention, so that je lise un fait relevé,
et non ce que 495 croyait savoir du paquet du fournisseur.

### 3. Actors and permissions [draft]

- **Worker 495** (system) — observe chaque requête que sa session envoie. Il ne la modifie jamais :
  son observateur ne renvoie rien. Il ne garde de la requête que les textes système que 495 n'a pas
  écrits.
- **Hôte Pi** (external) — émet l'accroche avec la charge utile construite. Il garantit qu'un
  gestionnaire qui ne renvoie rien laisse la charge inchangée, et qu'un gestionnaire en erreur ne
  bloque pas la requête.
- **Fournisseur de modèle** (external) — construit la requête et y écrit, selon le chemin
  d'authentification, un bloc que 495 ne compose pas. Il ne lit rien de 495.
- **Noyau 495** (system) — inscrit l'observation au dossier, à côté de la déclaration, et nomme les
  écarts. Il n'arrête aucune intervention sur un écart.
- **Lecteur d'un dossier** (external) — lit l'observation, sa nature et les écarts, sans Pi et sans
  la machine qui a produit le dossier.
- **Propriétaire** (external) — autorise la campagne de recette sur le chemin d'abonnement, qui est
  facturée.

### 4. Trigger and preconditions [draft]

**Déclencheur :** chaque requête que la session d'une intervention envoie au fournisseur.

**Préconditions :**
- `e23s02` est tenue : le manifeste porte la déclaration, qui devient l'attente ;
- le worker ouvre sa session avec un chargeur de ressources qui lui appartient ;
- la version de Pi épinglée par le dépôt publie l'accroche. Elle est confirmée sur Pi 0.87.0, dans la
  documentation livrée (`docs/extensions.md`) et dans les types (`BeforeProviderRequestEvent`).

### 5. Main flow and business logic [draft]

1. Le worker ouvre la session de l'intervention avec un observateur posé sur l'accroche de requête.
   L'observateur est chargé par le chargeur de ressources du worker. Rien d'autre n'y entre : ni
   extension du projet, ni compétence, ni fichier d'instructions.
2. À chaque requête, l'hôte passe à l'observateur la charge utile que le fournisseur a construite.
   L'observateur la lit et ne renvoie rien. La requête part telle que le fournisseur l'a construite.
3. L'observateur repère les instructions de 495 dans la partie système de la requête. Il relève mot
   pour mot ce que le fournisseur a écrit au-dessus d'elles et au-dessous. Il ne garde rien d'autre
   de la charge : ni la conversation, ni les extraits du projet, ni les résultats d'outils.
4. La première observation d'une intervention est transmise au noyau. Une requête suivante n'est
   transmise que si ce qu'elle porte diffère de la précédente.
5. Le noyau inscrit l'observation au dossier de l'intervention. Elle y est marquée comme un fait
   relevé dans la requête, distincte de la déclaration du manifeste, qui reste l'attente.
6. Le noyau compare l'attente et l'observation, et inscrit le résultat : la concordance, ou chaque
   écart avec son nom.

**Pas-à-pas de la campagne de recette.** Elle demande le signal du propriétaire, parce qu'elle
consomme de l'usage facturé.

1. Choisir un répertoire de données neuf, sur la cible JS minimale déjà employée par `e23s02`.
2. Conduire un changement jusqu'à son verdict sur le fournisseur d'abonnement, avec l'extension
   chargée depuis `dist/`.
3. Relire le dossier en lecture seule. Chaque intervention doit porter le bloc observé, et la
   concordance avec l'attente.
4. Contrôle négatif, sans dépense : rejouer le même cas sous un fournisseur nommé `anthropic` mais
   servi par le modèle local, dans une configuration de Pi isolée. Le dossier doit nommer l'écart :
   une strate attendue et non observée, avec sa condition à côté.
5. Écrire ce que la campagne établit et ce qu'elle n'établit pas.

Interruption point: N/A — l'observation est une lecture synchrone dans le fil de la requête, et son
inscription suit le chemin des autres événements d'intervention.

### 6. Alternative flows and exceptions [draft]

6a. **Fournisseur qui n'impose rien.** C'est le cas du modèle local. L'observation est inscrite
comme relevée et vide. Elle se distingue d'une observation manquante, et elle concorde avec une
attente vide.

6b. **Strate attendue et non observée.** Le fournisseur est retenu, mais le chemin
d'authentification n'est pas celui où il impose son bloc. Le dossier nomme l'écart et place la
condition déclarée à côté. C'est la sur-déclaration du §6f d'`e23s02`, rendue visible. Ce n'est pas
une erreur.

6c. **Strate observée et non attendue, ou texte différent.** Le fournisseur écrit un bloc que la
table ignore, ou il a changé le sien. Le dossier nomme l'écart et donne les deux textes. C'est le
changement que le contrôle retiré de Preflight devait voir. Il se voit désormais sur la version de
Pi réellement installée, à la première requête.

6d. **Requête d'une forme que le relevé ne sait pas lire.** Soit l'API du modèle n'est pas une de
celles que le relevé connaît, soit une API connue a changé de forme. L'intervention est inscrite
comme non observée, avec la raison. Elle continue : ne pas voir n'est pas voir que rien n'est
imposé, et ce n'est pas non plus une raison d'arrêter le travail.

6e. **Instructions de 495 introuvables telles quelles dans la requête.** Le fournisseur les a
réécrites ou déplacées. L'écart est nommé, et les textes système relevés sont inscrits sans être
classés au-dessus ou au-dessous.

6f. **L'accroche ne se déclenche pas.** Pi l'a retirée ou renommée, ou la version installée n'est
pas celle que le dépôt épingle. Si la session a reçu une réponse du modèle sans qu'aucune
observation arrive, l'intervention est inscrite comme non observée : l'hôte n'a remis aucune
requête à l'observateur. Sur la version épinglée, la disparition de l'accroche fait échouer la
vérification de types, avant toute campagne.

6g. **La session n'envoie aucune requête.** Le modèle n'est pas configuré, ou l'intervention échoue
avant son premier appel. Rien n'est observé, et le dossier le dit : aucune requête n'a été observée,
et le modèle n'a pas répondu.

6h. **L'observateur échoue en lisant.** L'hôte écarte l'erreur d'un gestionnaire et envoie la charge
inchangée (Pi 0.87.0, `ExtensionRunner.emitBeforeProviderRequest`). La requête n'est donc jamais
bloquée par l'observation. L'intervention est inscrite comme non observée, avec l'erreur.

6i. **Les requêtes d'une même intervention diffèrent.** Par exemple après une réécriture du
contexte. Chaque changement est inscrit, dans l'ordre. Les requêtes identiques ne le sont pas.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  l'observation et la comparaison, dans le dossier de chaque intervention
Dynamic elements: aucun
```

Rien de cette story n'atteint l'affichage. Ce qu'elle écrit est une pièce du dossier, qui se relit
sans Pi depuis le journal et le magasin d'objets.

### 8. Domain model [draft]

**Entité créée : l'observation des strates imposées**, une par changement de contenu au cours d'une
intervention. Elle a trois formes :

- **relevée** — elle porte l'API lue, les textes écrits au-dessus des instructions de 495, et les
  textes écrits au-dessous ;
- **instructions introuvables** — elle porte l'API lue et les textes système, sans les classer ;
- **non relevée** — elle porte la raison.

**Entité créée : la comparaison**, entre l'attente du manifeste et une observation. Elle porte la
concordance, la liste des écarts, ou le fait qu'il n'y avait rien à comparer. Chaque écart a un
type : attendu et non observé (avec la condition déclarée), observé et non attendu (avec sa
position), ou instructions de 495 introuvables. Un texte changé par le fournisseur donne deux
écarts, l'attendu et le relevé : les deux textes sont au dossier.

**Entités touchées :** les événements d'intervention gagnent une variante fermée, comme la
réécriture du contexte en a gagné une (`D-58`). Le relevé de fin d'intervention porte
l'observation et la comparaison, à côté du coût. La déclaration du domaine garde sa forme ; son
commentaire dit désormais qu'elle est l'attente.

**Identifiants de composant :** aucun nouveau. Le relevé de la charge utile vit avec le worker, sous
`CMP-INT`, parce qu'il lit la forme d'une requête de l'hôte et d'elle seule. La comparaison vit au
noyau, parce qu'elle oppose deux faits du dossier.

**Raison de la profondeur :** la forme « non relevée » existe parce qu'une liste vide ne suffit pas.
Une liste vide dit que rien n'a été imposé, et une observation manquante ne dit pas cela. Les
confondre reproduirait exactement le défaut du contrôle retiré, où le silence passait pour une
absence.

### 9. Integrations and boundaries [draft]

- **Hôte Pi, accroche `before_provider_request`** (perennial, direction: in) — confirmée contre Pi
  0.87.0. Pi la présente comme un outil de débogage. 495 ne lui suppose donc aucune stabilité : il
  répond à sa disparition par §6f, et à un changement de forme par §6d.
- **Paquet du fournisseur, par l'hôte** (perennial, direction: in) — sa forme de requête est la
  seule que le relevé lise. Deux formes sont connues : celle des messages Anthropic, dont le système
  est une liste de blocs de texte, et celle des complétions compatibles OpenAI, dont le système est
  le premier message. Toute autre est non relevée.
- **Dossier exporté** (perennial, direction: out) — porte l'observation et la comparaison.

### 10. Background processes [draft]

Not applicable — l'observation a lieu dans le fil de chaque requête, sans horloge, sans tâche
différée et sans processus de plus.

### 11. Notifications [draft]

Not applicable — un écart est un fait du dossier, et non une alerte. Aucun destinataire n'est
prévenu hors de la lecture du dossier.

### 12. Audit and logging [draft]

**Entité auditée :** l'intervention. Jusqu'ici, son dossier prouvait ce que 495 avait composé, et
déclarait ce qu'il croyait imposé. Il prouve désormais aussi ce que le fournisseur a écrit, dans la
requête elle-même. L'observation suit le chemin des événements d'intervention déjà inscrits. Elle
n'est pas écartée comme un texte de modèle : elle n'est pas du contenu produit, c'est un fait
opposable au manifeste.

### 13. Solution variabilities [draft]

- **Fournisseur et chemin d'authentification** (configuration de Pi) — décident ce qui est observé.
  495 ne les choisit pas et ne les déduit plus.
- **Version de Pi installée** (machine) — décide si l'accroche existe et quelle forme a la requête.
  Une version qui change l'une ou l'autre produit une observation manquante, jamais une absence.

### 14. Quality attributes *NFR* [draft]

- **Octets modifiés dans la requête : aucun.** Ce point est établi par exécution : la requête reçue
  par un point d'accès de substitution est la même avec et sans observateur.
- **Ce qui est gardé** se limite aux textes système que le fournisseur a écrits hors des
  instructions de 495. Une requête identique à la précédente n'ajoute rien au dossier.
- **Une observation qui échoue** ne retarde ni ne bloque la requête.

### 15. Security and compliance *NFR* [draft]

- **Authentification :** l'observateur ne voit pas les en-têtes, qui passent par une autre
  accroche, et 495 ne s'y abonne pas. Le jeton n'est ni lu ni inscrit.
- **Autorisation :** l'observateur ne renvoie jamais de valeur. Il ne peut donc pas réécrire une
  requête. Le producteur ne peut ni lire ni modifier l'observation.
- **Données :** la charge utile contient la conversation entière, extraits non fiables et résultats
  d'outils compris. Rien de cela n'est gardé. Seuls les textes système écrits par le fournisseur
  sont inscrits, et ce sont des textes publics, distribués dans son paquet. L'export du dossier
  applique à l'observation la même rédaction qu'au reste.
- **Garantie revendiquée :** le dossier dit ce que le fournisseur a écrit dans les requêtes que
  l'hôte a remises à l'observateur. Il ne dit rien des requêtes que l'hôte émet sans passer par
  l'accroche.

### 16. UX and accessibility *NFR* [draft]

- L'observation porte des noms de champ explicites. Son lecteur peut n'avoir jamais vu le harnais.
- Une raison de non-observation est écrite en anglais, comme les autres détails du dossier, et elle
  nomme la cause : API inconnue, forme inattendue, accroche muette, ou erreur de lecture.
- Aucun affichage n'est ajouté.

### 17. Acceptance criteria [draft]

```
Scenario: Le bloc imposé est relevé dans la requête et inscrit comme observé (§5)
  Given une session sur un point d'accès de substitution au format des messages Anthropic
  And   un jeton d'abonnement, de sorte que le fournisseur impose son bloc
  When  l'intervention envoie sa requête
  Then  le dossier porte le bloc relevé mot pour mot au-dessus des instructions de 495
  And   il est marqué comme observé
  And   la comparaison avec l'attente du manifeste est une concordance

Scenario: L'observation ne modifie pas la requête (§5)
  Given une session sur un point d'accès de substitution qui garde le corps reçu
  When  la même requête est envoyée avec l'observateur, puis sans lui
  Then  les deux corps reçus sont identiques

Scenario: Un fournisseur qui n'impose rien est observé vide (6a)
  Given une session sur un point d'accès compatible OpenAI
  When  l'intervention envoie sa requête
  Then  l'observation est relevée et ne porte aucun texte au-dessus ni au-dessous
  And   elle concorde avec une attente vide

Scenario: Une strate attendue et non observée est un écart nommé (6b)
  Given un fournisseur nommé anthropic, servi sans le chemin d'abonnement
  When  l'intervention envoie sa requête
  Then  le dossier nomme une strate attendue et non observée
  And   la condition déclarée est écrite à côté de l'écart

Scenario: Une strate non attendue, ou un texte changé, est un écart nommé (6c)
  Given une requête dont le bloc système du fournisseur diffère de l'attente
  When  l'observation est comparée à l'attente
  Then  le dossier nomme l'écart et porte les deux textes

Scenario: Une forme de requête inconnue n'est jamais prise pour une absence (6d)
  Given une charge utile d'une API que le relevé ne connaît pas, ou d'une forme inattendue
  When  l'observateur la lit
  Then  l'intervention est inscrite comme non observée, avec sa raison
  And   aucune liste vide de strates observées n'est inscrite
  And   l'intervention continue

Scenario: Des instructions de 495 réécrites sont un écart nommé (6e)
  Given une requête où les instructions de 495 ne figurent pas telles quelles
  When  l'observateur la lit
  Then  l'écart « instructions introuvables » est nommé
  And   les textes système relevés sont inscrits sans être classés

Scenario: Une accroche muette laisse une trace (6f)
  Given une session qui reçoit une réponse du modèle sans que l'observateur soit appelé
  When  l'intervention se termine
  Then  elle est inscrite comme non observée : l'hôte n'a remis aucune requête

Scenario: Une session sans requête ne prétend rien observer (6g)
  Given une intervention qui échoue avant son premier appel au modèle
  When  elle se termine
  Then  le dossier dit qu'aucune requête n'a été observée et que le modèle n'a pas répondu

Scenario: Une erreur de l'observateur ne bloque pas la requête (6h)
  Given un observateur qui échoue en lisant la charge utile
  When  la session envoie sa requête
  Then  la requête part inchangée
  And   l'intervention est inscrite comme non observée, avec l'erreur

Scenario: Seul un changement entre deux requêtes est inscrit (6i)
  Given une intervention dont deux requêtes portent les mêmes textes système, puis une troisième qui diffère
  When  l'intervention se termine
  Then  le dossier porte deux observations, dans l'ordre

Scenario: Une campagne réelle concorde, et le contrôle négatif ne concorde pas (§5)
  Given une campagne conduite jusqu'à son verdict sur le fournisseur d'abonnement
  And   le même cas rejoué sous un fournisseur nommé anthropic servi localement
  When  les deux dossiers sont relus en lecture seule
  Then  le premier porte le bloc observé et la concordance à chaque intervention
  And   le second porte, à chaque intervention, l'écart d'une strate attendue et non observée
```

### 18. Out of scope [draft]

- **Les noms d'outils.** Sur le chemin d'abonnement, le fournisseur renomme aussi les outils déclarés
  dans la requête. C'est visible dans la même charge utile, mais cette story ne l'inscrit pas.
- **Les en-têtes de la requête.** L'identité annoncée au fournisseur (`D-49`) passe par une autre
  accroche, que cette story n'observe pas.
- **Les requêtes émises hors de l'accroche.** L'hôte câble l'accroche sur la boucle de l'agent. La
  lecture de Pi 0.87.0 n'établit pas si l'écriture d'un résumé de compaction y passe. Cette story ne
  le revendique pas.
- **Arrêter une intervention sur un écart.** Un écart est un fait du dossier, pas une porte.
- **Rétablir le contrôle qui relisait le paquet du fournisseur.** L'observation reprend son but, sur
  la version réellement installée. Le contrôle n'est pas remis dans Preflight, et sa branche n'est
  pas fusionnée.
- **Un schéma de contrat publié** pour l'observation ou pour le manifeste. Ce sont des types
  internes, comme aujourd'hui.

### 19. Open questions [draft]

Not applicable — cette story clôt les deux questions qu'`e23s02` laissait ouvertes, et n'en ouvre
aucune. La condition d'application n'a plus à être observée à part : une strate attendue et non
observée se lit au dossier. Un changement du bloc entre deux versions du fournisseur apparaît dans
l'écart dès la première requête, sur la version installée.

### 20. References [draft]

- `specs/adr/D-55-495-s-appuie-sur-l-api-de-pi-avant-de-reconstruire-ou-de-deduire.md` — la
  décision qui ouvre cette story, et les quatre limites acquises avant de commencer.
- `specs/adr/D-48-le-bloc-systeme-impose-par-le-fournisseur-est-declare-au-manifeste.md` — la
  déclaration qui devient l'attente.
- `specs/adr/D-58-ce-que-l-hote-rapporte-de-la-reecriture-du-contexte-est-lu.md` — le précédent
  d'un fait rapporté par l'hôte et inscrit au dossier.
- `specs/epics/e23-second-fournisseur-de-modele-qualifie/e23s02-le-manifeste-declare-la-strate-imposee-par-le-fournisseur.md`
  — la déclaration, sa condition en §6f et ses deux questions ouvertes.
- `node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` § `before_provider_request` et
  § `context_with_system` — la règle de retour, et ce que chaque accroche porte.
- `node_modules/@earendil-works/pi-coding-agent/examples/extensions/provider-payload.ts` — l'exemple
  livré par Pi qui lit la même charge utile.
- `@earendil-works/pi-ai/dist/api/anthropic-messages.js`, `buildParams` — le point où le bloc
  d'abonnement est ajouté, après `context_with_system`.
- `specs/archive/amont/expression-besoins.md` § CTX-02 — la clause des contraintes imposées par un
  fournisseur.
