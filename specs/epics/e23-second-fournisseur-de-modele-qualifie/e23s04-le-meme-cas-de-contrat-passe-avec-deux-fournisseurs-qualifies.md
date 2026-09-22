STORY KEY: e23s04
TITLE:     Tenir le même cas de contrat avec deux fournisseurs qualifiés
TYPE:      Story
PARENT:    e23
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-22
MATURITY:  3
SIZE:      L

### 1. Business narrative [draft]

La recette des capacités des moteurs demande que le même cas de contrat passe avec deux fournisseurs
qualifiés. Elle est tenue aujourd'hui par des preuves unitaires : chaque pièce du chemin a son test,
aucun parcours complet n'a jamais été conduit deux fois. Une recette formulée sur un parcours et
tenue par des pièces prouve que les pièces fonctionnent, pas que le parcours aboutit.

Le témoin manque. Les campagnes qui fondent le travail ouvert ont toutes tourné sur le modèle local,
et celles que le dossier appelle `anthropic` ne font pas exception : la configuration Pi qu'elles ont
employée déclare un fournisseur nommé `anthropic` dont l'adresse est `http://127.0.0.1:8000/v1`,
c'est-à-dire l'endpoint local sous un autre nom. C'était le bon montage pour éprouver une table
indexée sur l'identifiant du fournisseur, et c'est pourquoi leur déclaration de sortie porte
`on_machine` sans mentir. Il reste qu'aucune requête n'a jamais quitté cette machine, et que le
fichier d'authentification de Pi est vide.

Ce que cela coûte est précis. Tant que le seul témoin est un modèle qui rend deux fois sur trois un
rapport que le schéma refuse, une instruction mauvaise et un modèle incapable produisent la même
trace, et rien dans le dossier ne les sépare. Les epics suivants héritent de cette confusion :
chacun de leurs verdicts se lit « sous réserve du modèle ».

Cette story conduit deux fois le même cas de contrat — une fois sur le modèle local, une fois sur le
fournisseur d'abonnement — chacune dans son propre répertoire de données, puis relit les deux
dossiers depuis leur journal et énonce l'écart là où il existe. Elle commence par réparer ce que
l'instrument jetait : l'hôte rapporte qu'il a réécrit la conversation pour la faire tenir dans la
fenêtre, et le harnais n'en lisait rien, de sorte que le manifeste restait le seul mot du dossier sur
ce que le modèle tenait, et que le compteur de jetons ignorait ce que le résumé avait coûté. Sur un
fournisseur gratuit, cet oubli ne coûtait rien ; sur celui-ci, il fausse la seule mesure que la
campagne existe pour produire.

#### MODIFIED: AGT-02 — La recette des deux fournisseurs

**Before:** la clause est portée par des preuves unitaires. Le format d'appels d'outils est observé
et prouvé sur un endpoint local de test ; la déclaration de sortie, le manifeste et le refus avant
lancement ont chacun leurs tests ; aucun parcours complet n'a été conduit sur un second fournisseur,
et aucun dossier ne peut être comparé à un autre.

**After:** la clause est portée par deux campagnes réelles sur le même cas de contrat, relues depuis
leur journal et comparées gate par gate. La matrice porte la campagne à la place des preuves
unitaires, et nomme la preuve conservée. Ce que l'hôte rapporte de la réécriture du contexte est
lu, compté et inscrit au dossier, de sorte que la mesure déposée en preuve couvre ce que
l'intervention a réellement consommé.

### 2. Value statement [draft]

As a propriétaire d'un changement conduit par 495, I want que le même cas de contrat aboutisse sur
deux fournisseurs qualifiés et que les deux dossiers se comparent, so that un verdict du noyau cesse
de se lire « sous réserve du modèle ».

### 3. Actors and permissions [draft]

- **Propriétaire** (external) — authentifie Pi auprès du fournisseur d'abonnement, déclare la
  destination dans la configuration de la campagne, donne le signal de départ et lit les deux
  dossiers. Lui seul engage une dépense.
- **Noyau 495** (system) — décide des gates depuis des contrôles exécutés. Il ne sait pas quel
  fournisseur sert le modèle et ne change rien à sa décision selon lui.
- **Superviseur d'intervention 495** (system) — lance un worker par intervention, lit ce que la
  session rapporte, applique les budgets. Il observe ; il ne corrige pas.
- **Hôte Pi** (external) — tient le catalogue, l'authentification, le jeton d'abonnement et la
  fenêtre de contexte. C'est lui qui réécrit la conversation quand elle ne tient plus, et lui qui
  le rapporte.
- **Fournisseur d'abonnement** (external) — répond aux requêtes, impose son propre bloc système
  au-dessus des instructions locales, et facture ce qu'il a servi.

### 4. Trigger and preconditions [draft]

Le propriétaire ouvre la campagne. Avant qu'elle parte :

1. Les trois stories qui la précèdent sont tenues : la sortie de données est déclarée, le manifeste
   porte la strate imposée par le fournisseur, et un profil incapable est refusé avant lancement.
2. Preflight est vert, et `dist/` est reconstruit depuis les sources.
3. Pi est authentifié auprès du fournisseur d'abonnement. Au 22 septembre 2026, `~/.pi/agent/auth.json`
   est vide : aucune authentification n'y est enregistrée, et l'ouverture de session est un geste
   interactif que seul le propriétaire conduit.
4. La configuration de la campagne distante déclare le fournisseur `off_machine`. Les campagnes
   antérieures le déclaraient `on_machine`, ce qui était exact tant que l'adresse était locale et
   cesse de l'être au premier appel réel.
5. Les deux campagnes ont chacune leur répertoire de données. Un seul pilote par changement, et
   jamais pendant qu'une autre campagne tourne.

### 5. Main flow and business logic [draft]

1. L'instrument est réparé avant de servir de preuve : le worker lit ce que la session rapporte de
   la réécriture du contexte, compte ce que le résumé a consommé et inscrit l'événement au dossier.
   Ce que le harnais ne lit pas ne peut pas être opposé.
2. Le cas de contrat est conduit de bout en bout sur le modèle local, dans son répertoire de
   données. Le dossier est complet : gates franchies, contrat rendu, budgets consommés.
3. Le même cas de contrat est conduit sur le fournisseur d'abonnement, dans un répertoire distinct.
   La description du modèle est demandée avant lancement ; un refus arrête la campagne sans qu'une
   intervention soit inscrite.
4. Les deux dossiers sont relus depuis leur journal, sans ouvrir Pi : mêmes gates franchies, même
   contrat rendu, et l'écart de chemin énoncé là où il existe.
5. La matrice de traçabilité porte la clause sur cette campagne au lieu des preuves unitaires qui la
   tenaient, et nomme la preuve conservée.
6. Le relevé est déposé en preuve : débit d'appels d'outils, durées d'intervention, jetons consommés
   — réécriture du contexte comprise — et ce que le schéma a refusé de part et d'autre.

Interruption point: entre les deux campagnes. Chaque dossier est complet en lui-même et la
comparaison les relit à froid ; une campagne interrompue se reprend sans toucher à l'autre.

### 6. Alternative flows and exceptions [draft]

1. **Le fournisseur n'est pas authentifié.** La description le dit indisponible, le changement se
   bloque sur un manque de capacité, aucune intervention n'est inscrite et rien n'est facturé.
2. **L'endpoint n'honore pas les appels d'outils.** L'observation le constate par une requête
   minimale, le refus nomme le fait, et le coût est cette requête au lieu d'une intervention entière.
3. **La destination n'est pas déclarée.** La sortie est refusée avant que la description soit
   demandée : aucune requête ne part, y compris celle de l'observation.
4. **L'hôte réécrit le contexte pendant l'intervention.** Le dossier porte l'événement — motif,
   jetons remplacés, jetons restants, coût du résumé — et le compteur ajoute ce que le résumé a
   consommé. Le manifeste scellé au départ cesse d'être le dernier mot sur ce que le modèle tenait.
5. **La réécriture échoue ou est interrompue.** Elle est inscrite comme n'ayant pas eu lieu, avec
   son motif : la fenêtre qui l'a rendue nécessaire est toujours pleine, et l'intervention qui suit
   peut s'arrêter dessus.
6. **Un budget met fin à l'intervention.** Le résultat est une intervention écourtée, jamais un
   échec : l'arbre partiel reste dans l'espace de travail et le noyau l'apprend comme tel.
7. **Les deux dossiers ne rendent pas le même contrat.** La recette n'est pas tenue. L'écart est
   énoncé et conservé ; il n'est ni lissé ni réessayé jusqu'à concorder.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  le fil d'événements de la campagne ; le relevé déposé en preuve
Dynamic elements: l'événement de réécriture du contexte, affiché comme les autres événements du fil
```

Aucune surface nouvelle. La comparaison des deux dossiers se lit hors de Pi, par une lecture du
journal.

### 8. Domain model [draft]

Aucune entité nouvelle. Le contrat d'événements d'intervention gagne une variante, `context_compacted`,
qui porte le motif de la réécriture, les jetons remplacés, les jetons restants, le coût du résumé et,
le cas échéant, la raison pour laquelle la réécriture n'a pas eu lieu. La forme des compteurs est
inchangée : ce que le résumé consomme s'ajoute aux jetons connus de l'intervention.

L'événement traverse le filtre du journal là où les événements de modèle sont écartés : un texte de
modèle est du bruit, une réécriture du contexte est un fait du dossier.

### 9. Integrations and boundaries [draft]

- **Hôte Pi** — `perennial`, `direction: both`. Tient le catalogue, l'authentification, la session
  et la réécriture du contexte. Source de tout ce qui est rapporté.
- **Fournisseur d'abonnement** — `perennial`, `direction: out`. Reçoit les invites et les extraits ;
  la destination est jugée contre les sorties déclarées avant qu'une requête parte.
- **Endpoint local** — `perennial`, `direction: out`. Sur la machine ; la déclaration de sortie le
  dit et le distingue du précédent.

### 10. Background processes [draft]

- Réécriture du contexte par l'hôte — `event`. Elle se déclenche quand la conversation dépasse le
  seuil de la fenêtre, ou quand le fournisseur refuse la requête pour dépassement.

### 11. Notifications [draft]

Not applicable — la campagne est conduite au terminal par le propriétaire, qui lit le fil au moment
où il défile. Aucun canal n'est ouvert vers un tiers.

### 12. Audit and logging [draft]

Le journal de la campagne porte, par intervention : les gates décidées, les budgets consommés, le
résultat, et désormais chaque réécriture du contexte. Les événements de modèle — texte, réflexion,
usage — restent hors du journal ; ils portent du contenu et non un fait opposable.

### 13. Solution variabilities [draft]

- **Fournisseur et modèle** — source `config`. Lus dans la configuration Pi du propriétaire ; le
  harnais n'en choisit aucun et n'applique aucun repli.
- **Destinations déclarées** — source `config`. Une destination absente vaut refus ; une destination
  hors machine est annoncée par un diagnostic.
- **Seuils de réécriture du contexte** — source `config`. Tenus par l'hôte, avec un réglage par
  modèle ; 495 ne les fixe pas et lit ce qui a été appliqué.

### 14. Quality attributes *NFR* [draft]

Mesures relevées sur cette machine, non des cibles imposées à la campagne :

- Budget d'une intervention : 20 minutes, 100 appels d'outils, 3 tentatives.
- Modèle local : fenêtre de 131 072 jetons, sortie plafonnée à 32 768. Réserve par défaut de l'hôte :
  16 384 jetons, soit une réécriture au-delà de 114 688 jetons de contexte.
- Interventions relevées au journal des campagnes du 21 et du 22 septembre 2026 : 17 241, 21 195 et
  19 080 jetons pour 104, 102 et 35 secondes ; 10 169, 40 984 et 107 095 jetons pour 70, 138 et 300
  secondes. Aucune n'a atteint le seuil de réécriture ; la plus longue s'en est approchée.
- Observation du format d'appels d'outils : une requête par couple et par session, environ 60 jetons
  présentés et 256 au plus rendus.

### 15. Security and compliance *NFR* [draft]

- Le jeton d'abonnement est tenu par l'hôte et n'est jamais lu, recopié ni journalisé par 495.
- La destination est déclarée avant toute sortie, l'observation comprise ; une destination non
  déclarée refuse la requête au lieu de l'émettre.
- Aucun secret sur la ligne de commande, et la liste des variables transmises au worker reste
  explicite.
- Aucun fichier du projet n'est poussé dans une invite ; la requête d'observation ne porte ni
  extrait, ni chemin, ni invite du projet.
- L'usage par un harnais tiers d'un abonnement Claude Pro/Max est facturé au jeton sur l'usage
  supplémentaire du compte, et non prélevé sur les plafonds du plan : la campagne dépense de
  l'argent mesuré, pas un quota inclus.

### 16. UX and accessibility *NFR* [draft]

Sortie terminale, en français. Un refus nomme le fait manquant plutôt que de qualifier le modèle. La
comparaison des deux dossiers se lit sans ouvrir Pi et sans outil graphique.

### 17. Acceptance criteria [draft]

```
Scenario: le même cas de contrat aboutit des deux côtés
  Given un cas de contrat conduit de bout en bout sur le modèle local
  And le même cas conduit sur le fournisseur d'abonnement, dans un autre répertoire de données
  When les deux dossiers sont relus depuis leur journal
  Then les mêmes gates sont franchies et le même contrat est rendu
  And l'écart de chemin est énoncé là où il existe
```

```
Scenario: un fournisseur non authentifié ne coûte rien
  Given un fournisseur d'abonnement sans authentification enregistrée chez l'hôte
  When la campagne demande la description du modèle
  Then le changement se bloque sur un manque de capacité
  And aucune intervention n'est inscrite au dossier
```

```
Scenario: un endpoint qui n'appelle pas d'outil est refusé pour une requête
  Given un endpoint qui annonce un dialecte compatible et répond en prose
  When l'observation lui présente un outil trivial
  Then le refus nomme le format d'appels d'outils
  And le coût est cette requête, non une intervention entière
```

```
Scenario: rien ne part vers une destination non déclarée
  Given une configuration de campagne qui ne déclare pas le fournisseur
  When la campagne est ouverte
  Then la sortie est refusée avant que la description soit demandée
  And aucune requête n'atteint le fournisseur
```

```
Scenario: une réécriture du contexte est comptée et inscrite
  Given une intervention dont la conversation dépasse le seuil de la fenêtre
  When l'hôte remplace une partie de la conversation par un résumé
  Then le dossier porte l'événement avec les jetons remplacés et les jetons restants
  And les jetons du résumé s'ajoutent à ce que l'intervention est connue avoir consommé
```

```
Scenario: une réécriture qui n'a pas eu lieu est inscrite comme telle
  Given une réécriture interrompue ou refusée par l'hôte
  When la session le rapporte
  Then le dossier porte l'événement avec la raison, sans jetons remplacés
  And le compteur n'ajoute rien
```

```
Scenario: un budget écourte l'intervention sans la condamner
  Given une intervention qui atteint son budget de durée
  When la session est arrêtée
  Then le résultat est une intervention écourtée et non un échec
  And l'arbre partiel reste dans l'espace de travail
```

```
Scenario: deux contrats différents ne sont pas lissés
  Given deux dossiers dont le contrat rendu diffère
  When la comparaison est faite
  Then la recette n'est pas tenue
  And l'écart est énoncé et conservé
```

### 18. Out of scope [draft]

- Le coût en argent n'est pas porté au dossier. L'hôte le rapporte pour chaque réponse, avec le
  détail par entrée, sortie et cache ; 495 n'en lit rien et ne compte que les jetons. Remesurer les
  budgets sur un modèle frontière est le sujet de la story suivante, et c'est là que ce chiffre a sa
  place.
- La strate imposée reste déclarée et non observée. Lire ce que le fournisseur a réellement écrit
  au-dessus des instructions locales demande la charge utile de la requête, que l'hôte publie, et
  c'est l'objet de la dernière story de cet epic.
- Les bornes de budget ne sont pas retouchées. Elles sont calibrées sur un débit d'appels d'outils
  mesuré sur le modèle local ; la campagne les mesure, elle ne les corrige pas.
- Aucun troisième fournisseur. La recette demande deux fournisseurs qualifiés, et un troisième ne
  dirait rien de plus sur le point qu'elle éprouve.
- L'usage au-delà de la machine de référence n'est pas revendiqué. L'identité annoncée sur le fil est
  acceptée pour cette machine seulement.

### 19. Open questions [draft]

- Le moment où les deux campagnes sont conduites : elles dépensent sur le compte du propriétaire et
  demandent une ouverture de session interactive que lui seul fait. — owner: jeanjerome, needed by:
  2026-10-05

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` § AGT-02 — la clause que cette campagne tient sur un
  parcours complet.
- `specs/adr/D-46-un-second-fournisseur-de-modele-est-qualifie-avant-le-reste.md` — pourquoi cette
  qualification précède le reste du travail ouvert.
- `specs/adr/D-57-le-format-d-appels-d-outils-est-observe-une-fois-par-couple.md` — l'observation qui
  précède toute intervention facturée, et son rythme.
- `specs/adr/D-58-ce-que-l-hote-rapporte-de-la-reecriture-du-contexte-est-lu.md` — pourquoi la
  réécriture est lue plutôt que coupée, et pourquoi le rythme de l'observation reste la session.
- `specs/epics/e23-second-fournisseur-de-modele-qualifie/e23s01-la-sortie-de-donnees-vers-le-fournisseur-est-declaree.md`
  — la porte que toute sortie franchit, l'observation comprise.
- `specs/epics/e23-second-fournisseur-de-modele-qualifie/e23s03-le-refus-d-un-profil-incapable-a-un-effet-avant-une-intervention-facturee.md`
  — le refus avant lancement dont cette campagne est la mise à l'épreuve.
- `node_modules/@earendil-works/pi-coding-agent/docs/compaction.md` — ce que l'hôte fait de la
  conversation quand elle ne tient plus, et ce qu'il en rapporte.
- `node_modules/@earendil-works/pi-coding-agent/docs/providers.md` — le chemin d'abonnement et sa
  facturation.
