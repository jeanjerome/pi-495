STORY KEY: e23s05
TITLE:     Remesurer les budgets d'intervention sur un modèle frontière
TYPE:      Story
PARENT:    e23
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-23
MATURITY:  4
SIZE:      L

### 1. Business narrative [draft]

Une intervention a deux bornes : 20 minutes et 100 appels d'outils. Elles ont été réglées sur le
modèle local, dont on disait qu'il conduisait 2,5 appels par minute. Ce chiffre avait été relevé sur
une autre cible, avec le même modèle. Sur la cible de la campagne à deux fournisseurs, le même
modèle en conduit 4,6 par minute, et le modèle distant 16,0. Le débit dépend donc du modèle et de la
cible, et aucun chiffre unique ne règle une borne par défaut. Ce que la mesure établit, c'est quelle
borne tombe en premier. Sur le modèle local, c'est la durée, vers 92 appels. Sur le modèle distant,
c'est le nombre d'appels, en un peu plus de 6 minutes, et les deux tiers de la durée ne servent
jamais.

Les deux bornes n'ont pas le même effet. La durée suspend l'intervention : le producteur reprend
sur son espace de travail, sans consommer de tentative. Le nombre d'appels l'annule. Sondé avec un
producteur scripté, le changement est bloqué comme une « erreur d'exécution », avec pour détail
« producer intervention cancelled ». La lecture du code montre le même désordre dans les autres
rôles : la spécification lève une erreur de configuration, la préparation continue avec ce qu'elle
a produit, et la revue est inscrite invalide. Le même travail a donc un sort différent selon la
vitesse du modèle. Et le dossier ne dit jamais ce qui s'est réellement passé, à savoir que la
limite fixée par le propriétaire a été atteinte.

L'epic disait qu'avec un modèle frontière, la borne cessait d'être le temps pour devenir la fenêtre
d'abonnement. Pi dit le contraire, et c'est lui l'hôte : l'usage d'un abonnement Claude par un
harnais tiers est facturé au jeton, sur l'usage supplémentaire du compte, et non prélevé sur les
plafonds du plan. Sur ce chemin, ce qui borne la dépense, c'est ce que le propriétaire paie. L'hôte
calcule ce montant pour chaque réponse, au tarif de son catalogue, et 495 n'en lit rien. Le relevé
de la campagne distante ne peut donc que l'encadrer : 78 615 jetons, entre deux et soixante-dix-neuf
centimes selon la part d'entrée, de sortie et de cache, que le dossier ne garde pas.

Le propriétaire a tranché le 2026-09-23 : quand le nombre d'appels est atteint, le changement
s'arrête et attend, sous le nom de ce qui s'est passé, et rien n'est dépensé au-delà sans son geste.

#### MODIFIED: NFR-04 — Une borne atteinte a un effet qui la nomme

**Before:** une intervention arrêtée par son nombre d'appels est annulée. Le producteur voit son
changement bloqué comme une erreur d'exécution. La spécification lève une erreur de configuration,
la préparation continue sur un résultat partiel, et la revue est inscrite invalide. Le motif
d'arrêt `budget_exhausted` existe dans le vocabulaire des contrats, et rien ne l'émet.

**After:** quel que soit le rôle, une intervention arrêtée par son nombre d'appels arrête le
changement sous le motif `budget_exhausted`, et ce blocage se lève par une relance. Le dossier nomme
la borne, sa valeur et ce qui a été consommé. Rien n'est dépensé au-delà de la limite avant la
relance. Le producteur relancé reprend sur l'espace de travail de sa tentative, et il sait qu'il
reprend.

#### MODIFIED: AGT-07 — Les coûts sont consignés quand l'hôte les rapporte

**Before:** le dossier compte les jetons d'une intervention et ignore son coût. L'hôte le calcule
pourtant, résumés et rafraîchissements du cache compris.

**After:** le dossier porte, pour chaque intervention, le coût que l'hôte totalise pour la session,
avec sa provenance : un calcul au tarif du catalogue de l'hôte, qui dit aussi si le fournisseur est
employé par abonnement. Un modèle que le catalogue ne tarife pas a un coût inconnu, jamais nul.

#### MODIFIED: AGT-02 — Les bornes par défaut portent leur motif

**Before:** les bornes sont dites calibrées sur 2,5 appels par minute, et l'epic annonce que la
fenêtre d'abonnement devient la borne d'un modèle frontière.

**After:** chaque borne dit ce qu'elle arrête et laquelle tombe en premier aux débits mesurés. La
mesure se relit depuis un dossier conservé. La prémisse de la fenêtre d'abonnement est corrigée là
où elle est écrite.

### 2. Value statement [draft]

As a propriétaire d'un changement conduit sur un fournisseur facturé, I want qu'une borne atteinte
arrête le changement sous son nom et que le dossier dise ce que l'intervention a coûté, so that rien
ne soit dépensé au-delà de la limite fixée sans mon geste, et que je sache ce que j'ai payé.

### 3. Actors and permissions [draft]

- **Propriétaire** (external) — fixe les bornes dans la configuration de la campagne, lit le
  dossier, et décide seul de relancer un changement arrêté sur une borne. C'est lui qui engage la
  dépense au-delà.
- **Noyau 495** (system) — compte les appels d'outils au fur et à mesure et refuse celui qui
  dépasse la borne. Il décide de l'arrêt et le nomme.
- **Superviseur d'intervention 495** (system) — interrompt la session quand le noyau refuse un
  appel, et lit ce que l'hôte rapporte de la session avant de la fermer.
- **Hôte Pi** (external) — tient le catalogue et ses tarifs, sait si un fournisseur est employé par
  abonnement, et totalise l'usage et le coût de la session.
- **Fournisseur d'abonnement** (external) — facture au jeton ce qu'il a servi.

### 4. Trigger and preconditions [draft]

Déclencheur : une intervention atteint la borne de son nombre d'appels d'outils, ou se termine
d'une autre façon. Dans les deux cas, l'hôte a un usage à rapporter.

Préconditions :

1. Les quatre stories qui précèdent sont tenues. La campagne à deux fournisseurs a produit les deux
   dossiers dont la mesure part.
2. Preflight est vert, et `dist/` est reconstruit depuis les sources.
3. Pour la recette, Pi est authentifié auprès du fournisseur d'abonnement, et la configuration de la
   campagne déclare ce fournisseur hors de la machine.

### 5. Main flow and business logic [draft]

1. Le débit réel d'appels d'outils et la durée de chaque intervention se relisent depuis le journal
   d'un dossier conservé, sans ouvrir Pi. Aux bornes en vigueur, la relecture dit laquelle tombe en
   premier. C'est une projection, et elle est présentée comme telle.
2. À la fin de chaque intervention, le coût que l'hôte totalise pour la session est inscrit au
   dossier, avec sa provenance. Un modèle dont le catalogue ne porte aucun tarif a un coût inconnu.
3. Quand le noyau refuse l'appel qui dépasse la borne, la session est interrompue, et le changement
   s'arrête sous le motif `budget_exhausted`. Le motif nomme la borne, sa valeur et ce qui a été
   consommé.
4. Le propriétaire lit l'arrêt et le coût. S'il veut dépenser davantage, il relève la borne dans la
   configuration de la campagne et relance le changement.
5. À la relance, le producteur reprend dans la même tentative, sur le même espace de travail, et on
   lui dit qu'il reprend. Un rôle qui ne garde rien d'une exécution à l'autre refait son
   intervention.
6. Chaque borne par défaut porte, à côté d'elle, ce qu'elle arrête et laquelle tombe en premier aux
   débits mesurés. La décision est consignée, et elle corrige la prémisse de la fenêtre
   d'abonnement.
7. Une campagne réelle sur le fournisseur d'abonnement exerce l'arrêt et la relance. Son dossier
   porte le coût. Le dossier d'une campagne sur le modèle local porte un coût inconnu.

**Pas-à-pas de la campagne.** Il demande le signal du propriétaire et consomme de l'usage facturé.

1. Choisir un répertoire de données neuf, sur la cible de la campagne à deux fournisseurs.
2. Dans sa configuration, déclarer le fournisseur hors de la machine, et régler une borne d'appels
   inférieure à ce qu'une intervention de ce cas a consommé. La valeur retenue, et ce qu'on attend
   d'elle, sont écrits avant le départ.
3. Conduire le changement jusqu'à l'arrêt, puis lire le dossier en lecture seule.
4. Relever la borne, ouvrir une nouvelle session Pi et relancer le changement jusqu'à son verdict.
5. Relire le dossier, et y lancer la relecture de l'étape 1.
6. Conduire le même cas sur le modèle local dans un autre répertoire, et y lire un coût inconnu.

Interruption point: entre l'arrêt sur la borne et la relance. C'est le but de la story : le
changement attend là, sans dépenser, que le propriétaire décide.

### 6. Alternative flows and exceptions [draft]

1. **La durée tombe la première.** L'intervention est suspendue et reprend d'elle-même dans la
   limite des continuations, comme aujourd'hui. Le propriétaire a tranché pour la borne d'appels, pas
   pour la durée.
2. **La spécification atteint la borne.** Le changement s'arrête sous `budget_exhausted`, et non sur
   une erreur de configuration. La relance refait la spécification, qui n'écrit rien.
3. **La préparation atteint la borne.** Le changement s'arrête au lieu de juger un résultat partiel.
   La relance refait la préparation.
4. **La revue atteint la borne.** Le changement s'arrête au lieu d'inscrire une revue invalide et de
   passer à la suivante.
5. **Le catalogue ne tarife pas le modèle.** Le dossier porte un coût inconnu, avec sa raison. Un
   zéro calculé sur un tarif nul n'est jamais inscrit comme une gratuité.
6. **L'hôte ne rapporte aucun usage.** C'est le cas d'une intervention qui échoue avant sa première
   requête : le coût est inconnu, et non nul.
7. **Le propriétaire relance sans relever la borne.** Le producteur reprend avec la même limite, et
   le changement s'arrête de nouveau dès qu'elle est atteinte. Rien n'est dépensé au-delà.
8. **Un dossier écrit avant cette story est relu.** La relecture dit que le coût n'y est pas inscrit,
   au lieu de l'afficher nul.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  le fil d'événements de la campagne ; l'état d'un changement arrêté
Dynamic elements: le motif d'arrêt sur la borne d'appels ; le coût d'une intervention
```

Aucune surface nouvelle dans Pi. La relecture d'un dossier se fait hors de Pi, au terminal.

### 8. Domain model [draft]

Aucune entité nouvelle. Ce qu'un dossier sait d'une intervention gagne son coût : un montant, ou
l'inconnu avec sa raison. Il gagne aussi sa provenance : le catalogue de l'hôte, et l'emploi ou non
d'un abonnement. Toucher à la forme des contrats change l'empreinte d'environnement et invalide le
protocole d'un changement en cours. On n'engage donc rien pendant qu'une campagne tourne.

Le motif `budget_exhausted`, déjà déclaré parmi les motifs d'arrêt, reçoit son premier émetteur. Il
est de ceux qu'une relance lève.

### 9. Integrations and boundaries [draft]

- **Hôte Pi** — `perennial`, `direction: in`. Il fournit le total de la session, le tarif du
  catalogue et l'emploi d'un abonnement. Il est la source du coût ; 495 ne tient aucune table de
  prix.
- **Fournisseur d'abonnement** — `perennial`, `direction: out`. Il facture au jeton ; 495 ne voit
  jamais sa facture.

### 10. Background processes [draft]

Not applicable — l'arrêt et la lecture du coût ont lieu dans le déroulement d'une intervention ;
aucun processus ne tourne en dehors.

### 11. Notifications [draft]

Not applicable — le propriétaire lit l'arrêt au terminal, dans le fil de la campagne. Aucun canal
n'est ouvert vers un tiers.

### 12. Audit and logging [draft]

Le journal porte, pour chaque intervention, son coût ou la raison pour laquelle il est inconnu, avec
sa provenance. Pour un changement arrêté sur une borne, il porte le motif, la borne, sa valeur et ce
qui a été consommé. La relance est un événement du journal comme les autres, datée et attribuée au
propriétaire.

### 13. Solution variabilities [draft]

- **Borne d'appels par intervention** — source `config`. Par défaut, 100. Atteinte, elle arrête le
  changement jusqu'à une relance.
- **Borne de durée par intervention** — source `config`. Par défaut, 20 minutes. Atteinte, elle
  suspend l'intervention, qui reprend d'elle-même dans la limite des continuations.
- **Borne de durée de l'incrément** — source `config`. Par défaut, 120 minutes, inchangée.
- **Tarif d'un modèle** — tenu par le catalogue de l'hôte, jamais par 495. Un tarif nul rend le
  coût inconnu.

### 14. Quality attributes *NFR* [draft]

Ce sont des mesures relevées sur cette machine, pas des cibles imposées à la campagne :

- Débit d'appels d'outils sur le cas de contrat minimal, le 2026-09-22 : 4,6 par minute pour
  `omlx/qwen3.8-27b-oq8e`, de 3,8 à 5,3 selon l'intervention ; 16,0 par minute pour
  `anthropic/claude-sonnet-5`, de 13,9 à 19,0.
- Aux bornes par défaut (20 minutes, 100 appels) : la durée tombe vers 92 appels sur le modèle
  local ; le nombre d'appels tombe au bout de 6 minutes 15 environ sur le modèle distant.
- Tarif au catalogue de l'hôte pour `anthropic/claude-sonnet-5`, en dollars par million de jetons :
  2 en entrée, 10 en sortie, 0,2 en lecture de cache, 2,5 en écriture de cache.
- Tarif déclaré pour `omlx/qwen3.8-27b-oq8e` : 0 partout.
- Consommation maximale entre deux gestes du propriétaire : une borne d'appels par intervention.

### 15. Security and compliance *NFR* [draft]

- Aucune dépense au-delà de la borne d'appels sans une relance du propriétaire.
- Le jeton d'abonnement reste tenu par l'hôte. Lire le total de la session ne demande ni de lire, ni
  de recopier, ni de journaliser un secret.
- Le coût inscrit est le calcul de l'hôte, et le dossier le présente comme tel. Aucune facture n'est
  lue, et aucun montant n'est présenté comme facturé.
- Les invites et les extraits suivent la même sortie déclarée qu'avant ; cette story n'ouvre aucune
  destination.

### 16. UX and accessibility *NFR* [draft]

Sortie terminale, en français. L'arrêt nomme la borne et sa valeur, et dit qu'une relance le lève.
Un coût inconnu dit pourquoi il l'est. Relire un dossier ne demande ni Pi ni outil graphique.

### 17. Acceptance criteria [draft]

```
Scenario: la borne d'appels arrête le producteur et attend la relance
  Given un producteur qui demande plus d'appels d'outils que sa borne
  When le noyau refuse l'appel qui la dépasse
  Then le changement s'arrête sous le motif budget_exhausted, qui nomme la borne et sa valeur
  And aucune intervention ne démarre avant une relance
```

```
Scenario: le producteur relancé reprend là où il en était
  Given un changement arrêté sur la borne d'appels pendant l'implémentation
  When le propriétaire le relance
  Then le producteur reprend dans la même tentative, sur le même espace de travail
  And on lui dit qu'il reprend
```

```
Scenario: une relance sans borne relevée s'arrête de nouveau
  Given un changement arrêté sur la borne d'appels
  When il est relancé avec la même borne et que le producteur l'atteint encore
  Then le changement s'arrête de nouveau sous le même motif
```

```
Scenario: la durée suspend toujours sans demander
  Given un producteur arrêté par la borne de durée
  When l'étape suivante est conduite
  Then il reprend de lui-même sur son espace de travail, dans la limite des continuations
```

```
Scenario Outline: tout rôle qui atteint la borne arrête le changement
  Given une intervention <rôle> qui dépasse sa borne d'appels
  When le noyau refuse l'appel
  Then le changement s'arrête sous le motif budget_exhausted
  And il n'est inscrit ni comme une erreur de configuration, ni comme une erreur d'exécution, ni comme une revue invalide

  Examples:
    | rôle          |
    | specification |
    | preparation   |
    | revue         |
```

```
Scenario: le coût que l'hôte totalise est au dossier
  Given une intervention conduite sur un modèle que le catalogue de l'hôte tarife
  When elle se termine
  Then le dossier porte le coût que l'hôte totalise pour la session
  And il dit que c'est un calcul au tarif du catalogue, et si le fournisseur est employé par abonnement
```

```
Scenario: un modèle sans tarif a un coût inconnu
  Given un modèle dont le catalogue de l'hôte porte un tarif nul
  When l'intervention se termine
  Then le dossier porte un coût inconnu et sa raison, jamais un coût nul
```

```
Scenario: une session sans usage a un coût inconnu
  Given une intervention qui échoue avant sa première requête
  When elle se termine
  Then le dossier porte un coût inconnu
```

```
Scenario: la mesure se relit depuis un dossier conservé
  Given un dossier de campagne conservé
  When la relecture le parcourt sans ouvrir Pi
  Then elle rend, par intervention, les appels, la durée, le débit, les jetons et le coût
  And elle dit laquelle des bornes en vigueur tombe en premier à ce débit, comme une projection
  And pour un dossier écrit avant cette story, elle dit que le coût n'y est pas inscrit
```

```
Scenario: la campagne réelle s'arrête sur la borne puis reprend
  Given une campagne sur le fournisseur d'abonnement, avec une borne d'appels plus basse que le cas
  When le changement atteint la borne, puis que le propriétaire relève la borne et le relance
  Then le dossier porte l'arrêt, la relance et le verdict
  And chaque intervention y porte son coût
```

### 18. Out of scope [draft]

- Aucune borne en argent. Aucune exigence n'en demande, et la dépense est déjà bornée par le nombre
  d'appels, intervention par intervention. Le coût est inscrit au dossier, pas opposé à une limite.
- La valeur des bornes par défaut ne change pas. La mesure porte sur un cas minimal, qui n'a atteint
  aucune borne. Elle dit laquelle tombe en premier, pas quelle valeur conviendrait à un changement
  long. Le motif écrit à côté de chaque borne le dit.
- La borne de durée garde son effet. Elle suspend et reprend d'elle-même, comme `D-19` l'a décidé.
- La préparation ne garde pas son espace de travail d'une exécution à l'autre. Relancée, elle refait
  son intervention. La faire reprendre là où elle en était serait un changement de plus, et ce
  n'est pas celui que l'arrêt demande.
- Le compteur de jetons n'est pas repris. Le dossier continue de compter les jetons comme
  `e23s04` l'a fait ; le coût vient du total de l'hôte. Si les deux divergent, la campagne le dit
  sans le corriger.
- La campagne à deux fournisseurs n'est pas reconduite. Ses dossiers sont relus, pas refaits.

### 19. Open questions [draft]

Aucune. L'effet de la borne d'appels a été tranché par le propriétaire le 2026-09-23 : le
changement s'arrête et attend.

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` § NFR-04, § AGT-07, § NFR-06 — les budgets
  appliqués, les coûts consignés quand ils sont disponibles, et les coûts indisponibles qui restent
  inconnus.
- `specs/verifications/e23-deux-fournisseurs.md` — les débits mesurés, et la borne qui tombe en
  premier de chaque côté.
- `specs/adr/D-19-une-intervention-tronquee-est-suspendue-pas-annulee.md` — l'effet de la borne de
  durée, que cette story ne change pas.
- `specs/adr/D-46-un-second-fournisseur-de-modele-est-qualifie-avant-le-reste.md` — la prémisse de
  la fenêtre d'abonnement, corrigée ici.
- `node_modules/@earendil-works/pi-coding-agent/docs/providers.md` § Subscriptions — l'usage par un
  harnais tiers facturé au jeton, hors des plafonds du plan.
- `node_modules/@earendil-works/pi-coding-agent/docs/models.md` § cost — un tarif absent vaut zéro.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.d.ts` — `getSessionStats()`
  agrège toutes les entrées de la session, historique résumé compris, et porte `cost`.
- `src/domain/policy.ts` — les bornes par défaut.
