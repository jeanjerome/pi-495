# La recommandation d'architecture est argumentée par les contraintes du projet, fondée sur une revue de patterns, et arbitrée par le propriétaire

Story : e11s05
Epic : e11
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire d'un projet Maven ou Node qui a adopté la carte de son architecture lit dans l'état des
lieux chaque violation de ses règles (`e11s02`, `e11s04`). Il ne sait pas pour autant quoi en faire. Faut-il
garder l'organisation, l'ajuster ou la transformer ? Prenons un réacteur en oignon dont `app` appelle deux
fois l'infrastructure sans passer par un port, et une exigence qui demande d'ajouter un second moyen de
paiement sans toucher au domaine. Rien dans 495 ne pèse les options. Un modèle interrogé hors de 495 répond
par un style, l'hexagone partout, alors qu'`ARC-02` refuse d'imposer un style à tous les projets et demande
une alternative justifiée par une contrainte. `EXP-02` demande que chaque choix important porte ses
alternatives, leurs bénéfices, leurs coûts et leurs risques. `REC-33` attend d'un diagnostic des
« alternatives proportionnées et un choix justifié ».

Avec cette story, l'état des lieux qui a adopté une carte se termine par une recommandation. Un modèle la
propose en lecture seule, après la mesure et à partir de la carte, de ses constats et des contraintes du
projet. Ces contraintes sont les exigences de l'état des lieux et les réponses du propriétaire à ses
questions. Le modèle propose plusieurs alternatives : conserver, ajuster ou transformer. Chacune porte ses
bénéfices, son coût en complexité et en migration, ses risques, et les contraintes qu'elle cite. La
recommandation s'appuie sur une revue des patterns et des anti-patterns du code, chaque observation à ses
indices. Le noyau ne juge que la forme de l'argument, pas son fond. Une recommandation qui ne cite aucune
contrainte connue, ou dont une alternative n'a pas de risque, n'est pas présentée. Le propriétaire choisit
une alternative par la décision de choix de conception (`IH-05`), demande une autre analyse avec une
remarque, ou laisse le choix en suspens. Le rapport présente ce qu'il a tranché.

## 2. Promesses

Scenario: La recommandation se présente au propriétaire
  Given un réacteur Maven dont la carte adoptée met `domain` en oignon, et dont le `survey` a mesuré deux violations où `app` appelle `io.demo.infra` sans passer par un port
  And les exigences de l'état des lieux `R1`, sur l'architecture, et `R2`, « un second moyen de paiement s'ajoute sans modifier le domaine », et la réponse « deux équipes, une par module » du propriétaire à la question `q-equipes`
  And une recommandation proposée de trois alternatives : `A1` conserver, `A2` ajuster en ajoutant un port de paiement, `A3` transformer en un module par équipe, `A2` étant recommandée par une conclusion qui cite `R2`
  When l'état des lieux a mesuré la référence
  Then une intervention en lecture seule a proposé la recommandation
  And une décision `IH-05` demande au propriétaire de choisir, avec une issue par alternative, une issue `ask_analysis` qui demande une autre analyse avec une remarque, et une issue `suspend` qui laisse le choix en suspens
  And ses faits donnent chaque alternative avec sa nature, ses bénéfices, son coût en complexité et en migration, ses risques, et chaque contrainte qu'elle cite avec son énoncé ou sa réponse
  And la recommandation de la décision désigne `A2`, à part des faits, avec sa conclusion qui cite `R2`
  And aucune décision `IH-10` n'est demandée avant que le propriétaire ait répondu

Scenario: Le modèle reçoit la revue de patterns de la skill de 495, et aucune skill du projet
  Given un réacteur Maven qui porte une skill sous `.agents/skills/arch/SKILL.md`, et une carte adoptée
  When l'intervention qui propose la recommandation est ouverte
  Then le manifeste de son contexte nomme une skill que 495 embarque, avec `design-pattern-review` de `sirius-zuo/design-pattern-skill` parmi ses sources, son commit `66d78158` et sa date
  And sa consigne et la skill demandent une revue des patterns et des anti-patterns du code, chaque observation avec ses indices à leur fichier et à leur ligne, et des alternatives qui portent chacune ses bénéfices, son coût, ses risques et les contraintes qu'elle cite
  And son contexte porte la carte adoptée, les constats du `survey`, les exigences avec leurs identifiants et les réponses du propriétaire avec leurs questions
  And aucune skill du projet n'est chargée

Scenario: La revue de patterns accompagne la recommandation, à part des constats
  Given une recommandation dont la revue relève l'anti-pattern « appel direct de l'infrastructure depuis l'application » à l'indice `app/src/main/java/io/demo/app/OrderService.java:7`, et le pattern « repository » à l'indice `domain/src/main/java/io/demo/domain/port/OrderRepository.java:3`
  When la décision est présentée
  Then ses faits donnent ces deux observations comme revue de patterns, lecture du modèle, chacune avec son indice
  And aucune n'est un constat d'un contrôle, et aucun verdict du `survey` n'en dépend

Scenario: Une observation de la revue dont un indice ne désigne aucune ligne est écartée, et cela se dit
  Given une recommandation dont la revue porte une observation à l'indice `app/src/main/java/io/demo/app/Main.java:90`, alors que ce fichier a 20 lignes
  When la décision est présentée
  Then ses faits ne portent pas cette observation
  And ils disent qu'une observation a été écartée parce que son indice `app/src/main/java/io/demo/app/Main.java:90` ne désigne aucune ligne de la référence

Scenario: Une recommandation qui cite une contrainte inconnue n'est pas présentée
  Given une recommandation dont l'alternative `A3` cite la contrainte `R9`, que les exigences de l'état des lieux ne portent pas
  When l'état des lieux reçoit la recommandation
  Then aucune décision `IH-05` n'est demandée sur elle
  And la section état des lieux du rapport dit qu'aucune recommandation n'est donnée, avec la raison qui désigne `A3` et `R9`

Scenario: Une recommandation dont l'argument est incomplet n'est pas présentée
  Given une recommandation dont l'alternative `A1` ne porte aucun risque, ou qui ne porte qu'une alternative, ou dont la conclusion ne cite aucune contrainte, ou dont l'alternative recommandée n'est pas parmi les siennes
  When l'état des lieux reçoit la recommandation
  Then aucune décision `IH-05` n'est demandée sur elle
  And la section état des lieux du rapport dit qu'aucune recommandation n'est donnée, avec la raison qui désigne ce qui manque

Scenario: Le propriétaire choisit une alternative
  Given la décision `IH-05` qui présente la recommandation
  When le propriétaire choisit `A2`
  Then la décision enregistrée au journal porte `A2` et sa date
  And une décision `IH-10` demande ensuite l'acceptation de l'état des lieux
  And la section état des lieux du rapport présente, sous la carte, l'alternative choisie avec sa date, sa nature, ses bénéfices, son coût, ses risques et ses contraintes, les alternatives écartées, et la revue de patterns, en anglais et en français
  And aucun verdict du `survey` ne change, et l'arbre du projet a le même digest qu'avant la demande

Scenario: Le propriétaire laisse le choix en suspens
  Given la décision `IH-05` qui présente la recommandation
  When le propriétaire choisit `suspend`
  Then aucune alternative n'est enregistrée comme choisie
  And une décision `IH-10` demande ensuite l'acceptation de l'état des lieux
  And la section état des lieux du rapport présente les alternatives et dit que le propriétaire a laissé le choix en suspens, en anglais et en français

Scenario: Le propriétaire demande une autre analyse avec une remarque
  Given la décision `IH-05` qui présente la recommandation
  When le propriétaire choisit `ask_analysis` avec la remarque « deux équipes ne justifient pas deux modules »
  Then une nouvelle intervention en lecture seule reçoit la recommandation précédente et la remarque, et propose une recommandation
  And une nouvelle décision `IH-05` la présente, avec une issue par alternative, `ask_analysis` et `suspend`

Scenario: Dans Pi, demander une autre analyse ouvre la saisie de la remarque
  Given la décision `IH-05` qui présente la recommandation, présentée au propriétaire dans le dialogue de Pi
  When le propriétaire choisit `ask_analysis` et saisit la remarque « deux équipes ne justifient pas deux modules »
  Then Pi lui ouvre une saisie de texte qui demande « Votre remarque sur la recommandation » (« Your remark on the recommendation » en anglais)
  And la décision enregistrée au journal porte la remarque comme texte libre
  And le contexte de la seconde intervention porte « The owner's remark: deux équipes ne justifient pas deux modules »

## 3. Sécurité

L'intervention qui propose la recommandation tourne comme celle de la carte : dans une copie de la
référence, avec les seuls outils de lecture du rôle de spécification, réseau fermé. Elle n'écrit rien. Ce
qu'elle lit du projet est une donnée : une instruction trouvée dans une source n'a aucune autorité sur elle
(`D-41`). La skill qu'elle reçoit est embarquée par 495, copiée à des commits nommés et attribuée dans
`NOTICE`. Aucune skill ni aucun `AGENTS.md` du projet n'est chargé (`D-11`). La recommandation et la revue de
patterns sont des lectures du modèle : aucune n'est un constat et aucun verdict n'en dépend (`D-74`). Le noyau
confronte chaque contrainte citée aux exigences et aux réponses enregistrées, et chaque indice aux lignes de
la référence, avant de présenter la recommandation. Le choix est une décision humaine, prise dans un
dialogue de Pi : un modèle ne choisit jamais une alternative (`ADR-014`). La remarque du propriétaire est
enregistrée avec sa décision et transmise comme son texte. Rien n'est écrit dans le projet, et aucun outil n'y
est ajouté.

## 4. Tâches

### Tâche 1 — Un état des lieux à la carte adoptée demande une recommandation et la présente

Quand l'état des lieux d'une cible a adopté une carte et a mesuré la référence, une intervention en lecture
seule propose une recommandation, avant l'acceptation. Son contexte porte la carte adoptée, les constats du
`survey`, les exigences de l'état des lieux avec leurs identifiants et les réponses du propriétaire avec
leurs questions. Elle rend des alternatives, chacune avec un identifiant, sa nature parmi conserver,
ajuster et transformer, sa description, ses bénéfices, son coût en complexité et en migration, ses risques
et les contraintes qu'elle cite, puis l'alternative recommandée et sa conclusion, qui cite ses contraintes.
Une décision `IH-05` la présente, avec une issue par alternative, `ask_analysis` et `suspend`. Ses faits
donnent chaque alternative et l'énoncé de chaque contrainte citée. Sa recommandation désigne l'alternative
recommandée. La confronter aux contraintes est l'objet de la tâche 2.

- Vérifie : `node --test test/v2-kernel/architecture-recommendation-proposal.test.ts`
- Tient : `test/v2-kernel/architecture-recommendation-proposal.test.ts`, « après la mesure d'un état des lieux à la carte adoptée, une intervention en lecture seule propose une recommandation et une décision IH-05 la présente avec une issue par alternative, ask_analysis et suspend, des faits qui donnent chaque alternative avec sa nature, ses bénéfices, son coût, ses risques et l'énoncé de R2, et la recommandation A2 à part des faits, sans décision IH-10 demandée »
- Rouge : sur un état des lieux, `decide` (`src/application/phases/decide.ts`) appelle directement `judgeSurvey`, qui n'ouvre aucune intervention (`src/application/phases/survey.ts` : « No candidate is written and no intervention is opened ») et ne demande que l'acceptation `IH-10`. Aucune phase ne peut demander `IH-05` : `PhaseInteraction` l'exclut (`src/application/decisions.ts`).

### Tâche 2 — La forme de l'argument est vérifiée avant la présentation

Avant de présenter la recommandation, le noyau vérifie la forme de l'argument. Il faut au moins deux
alternatives, chacune avec au moins un bénéfice, un coût et un risque, et au moins une contrainte citée. La
conclusion cite au moins une contrainte, et l'alternative recommandée est l'une des alternatives. Chaque
contrainte citée est une exigence de l'état des lieux ou une question à laquelle le propriétaire a répondu.
Une recommandation dont la forme ne tient pas n'est pas présentée. La section état des lieux du rapport dit
alors qu'aucune recommandation n'est donnée, avec la raison qui désigne ce qui manque.

- Vérifie : `node --test test/v2-kernel/architecture-recommendation-form.test.ts`
- Tient : `test/v2-kernel/architecture-recommendation-form.test.ts`, « une recommandation dont A3 cite R9, que les exigences ne portent pas, n'est pas présentée et le rapport dit qu'aucune recommandation n'est donnée en désignant A3 et R9 », « une recommandation dont A1 ne porte aucun risque n'est pas présentée et le rapport désigne A1 et le risque manquant », « une recommandation d'une seule alternative, ou dont la conclusion ne cite aucune contrainte, ou dont l'alternative recommandée n'est pas parmi les siennes, n'est pas présentée et le rapport dit ce qui manque »
- Rouge : après la tâche 1, le noyau ne juge que la structure de la sortie de l'intervention. Une alternative qui cite `R9` est présentée comme les autres, et une décision `IH-05` est demandée. Le rapport ne dit rien d'une recommandation : `surveySection` (`src/application/report.ts`) ne rend que les exigences, les constats, les angles morts, le référentiel et la carte.

### Tâche 3 — La recommandation se fonde sur une revue de patterns

La skill que reçoit l'intervention qui propose la recommandation reprend la revue de patterns de
`design-pattern-review` (`sirius-zuo/design-pattern-skill`, commit `66d78158`, MIT), lue à ce commit et
adaptée au format de 495, avec une part Node écrite par 495 puisque la source ne couvre pas Node (`D-87`).
Elle demande les patterns et les anti-patterns du code, chaque observation avec ses indices, puis des
alternatives argumentées par les contraintes du projet et non par un style. Sa provenance et `NOTICE` le
disent. Le noyau confronte chaque indice de la revue à la référence. Une observation dont un indice ne
désigne aucune ligne est écartée, avec la raison, sans que la recommandation cesse de tenir. Les faits de
la décision donnent la revue sous son nom de lecture du modèle, à part des alternatives.

- Vérifie : `node --test test/v2-kernel/architecture-recommendation-review.test.ts`
- Tient : `test/v2-kernel/architecture-recommendation-review.test.ts`, « le manifeste de l'intervention qui propose la recommandation nomme la skill de 495 avec design-pattern-review, son commit 66d78158 et sa date, sa consigne et la skill demandent une revue des patterns et des anti-patterns avec leurs indices et des alternatives qui citent leurs contraintes, et aucune skill du projet n'est chargée », « les faits de la décision IH-05 donnent l'anti-pattern d'OrderService.java:7 et le pattern repository d'OrderRepository.java:3 comme revue de patterns, lecture du modèle » et « une observation à l'indice Main.java:90 d'un fichier de 20 lignes est écartée, les faits disent pourquoi, et la recommandation est présentée »
- Rouge : la skill que 495 embarque (`skills/architecture-map/SKILL.md`) dit dans sa provenance que la revue de patterns des sources a été laissée de côté. Rien ne demande de revue au modèle, et aucun fait de la décision ne porte d'observation de pattern ni d'observation écartée.

### Tâche 4 — Le choix du propriétaire est enregistré et présenté

Choisir une alternative enregistre la décision avec l'alternative et sa date. Laisser le choix en suspens
n'enregistre aucune alternative. Dans les deux cas, l'état des lieux passe à son acceptation `IH-10`. La
section état des lieux du rapport présente, sous la carte, la recommandation : l'alternative choisie et sa
date, ou le choix laissé en suspens, chaque alternative avec sa nature, ses bénéfices, son coût, ses risques
et ses contraintes, et la revue de patterns. Le texte le dit en anglais et en français. Aucun verdict ne
change, et le projet n'est pas modifié.

- Vérifie : `node --test test/v2-kernel/architecture-recommendation-choice.test.ts`
- Tient : `test/v2-kernel/architecture-recommendation-choice.test.ts`, « choisir A2 enregistre la décision avec A2 et sa date, l'acceptation IH-10 suit, et le rapport présente sous la carte l'alternative choisie avec sa date, sa nature, ses bénéfices, son coût, ses risques et R2, les alternatives écartées et la revue de patterns, en anglais et en français, sans changer de verdict ni le digest du projet » et « laisser le choix en suspens n'enregistre aucune alternative, l'acceptation IH-10 suit, et le rapport dit que le propriétaire a laissé le choix en suspens, en anglais et en français »
- Rouge : après les tâches 1 à 3, la réponse du propriétaire n'a pas d'effet. `surveySection` et `architectureSection` (`src/application/report.ts`) ne rendent aucune recommandation, et `formatReport` (`src/presentation/structured/text.ts`) n'écrit sous la carte que les paquets sans partie, ce que sa vérification ne voit pas et la lecture du modèle.

### Tâche 5 — Une autre analyse se demande avec une remarque

Demander une autre analyse ouvre une nouvelle intervention en lecture seule. Elle reçoit la recommandation
précédente et la remarque du propriétaire. Sa recommandation est vérifiée comme la première, puis présentée
par une nouvelle décision `IH-05` avec les mêmes issues.

- Vérifie : `node --test test/v2-kernel/architecture-recommendation-remark.test.ts`
- Tient : `test/v2-kernel/architecture-recommendation-remark.test.ts`, « demander une autre analyse avec la remarque deux équipes ne justifient pas deux modules ouvre une seconde intervention dont le contexte porte la recommandation précédente et la remarque, et une nouvelle décision IH-05 présente sa recommandation avec une issue par alternative, ask_analysis et suspend »
- Rouge : après la tâche 4, l'issue `ask_analysis` n'ouvre aucune intervention. Aucun contexte ne porte la remarque, et aucune seconde décision `IH-05` n'est demandée.

### Tâche 6 — Dans Pi, la remarque est demandée au propriétaire qui veut une autre analyse

Quand le propriétaire choisit, dans le dialogue de Pi, de demander une autre analyse, Pi lui ouvre une
saisie de texte qui demande sa remarque sur la recommandation, dans la langue de la session. Le texte saisi
est enregistré comme texte libre de la décision, et la seconde intervention le reçoit comme la remarque du
propriétaire.

- Vérifie : `node --test test/v3-pi/architecture-recommendation-remark-dialog.test.ts`
- Tient : `test/v3-pi/architecture-recommendation-remark-dialog.test.ts`, « choisir ask_analysis depuis Pi ouvre une saisie qui demande Votre remarque sur la recommandation, la décision enregistrée porte la remarque deux équipes ne justifient pas deux modules comme texte libre, et le contexte de la seconde intervention porte cette remarque »
- Rouge : dans `presentDecisions` (`src/extension/conduct.ts`), `freeTextPrompt` ne rend une invite que pour `answer`, `extend`, `refuse`, `revise` et `propose_map_again`, les clés de `FREE_TEXT_PROMPTS`. Pour `ask_analysis`, il rend null : `ctx.ui.input` n'est jamais appelé, et la décision est enregistrée avec `free_text: null`.

## 5. Hors périmètre

- Proposer comme règle de la carte un anti-pattern que la revue relève, pour qu'un outil le vérifie
  (`D-87`, Conséquences). La carte ne connaît que les relations permises entre parties et les règles de
  chaque style. Une règle d'une autre forme suppose d'en arrêter le catalogue et sa vérification par
  ArchUnit et par dependency-cruiser : ce catalogue revient au propriétaire. Une story suivante de `e11`,
  que le plan ne porte pas encore. Celle-ci livre déjà la recommandation, et y joindre ce catalogue en ferait
  deux.
- Juger le fond de la recommandation. Le noyau n'en vérifie que la forme, et le jugement reste au
  propriétaire (`EXP-02`). Qu'une petite application garde une structure simple, comme le demande la
  recette d'`ARC-02`, se voit à la recette avec un vrai modèle ; le noyau ne le promet pas.
- Citer comme contrainte un fait lu dans le code, comme la taille du projet. Une contrainte citée est une
  exigence ou une réponse du propriétaire, que le noyau peut confronter au dossier. Un fait du code entre
  dans la recommandation par la revue de patterns, avec ses indices.
- Écrire la cible choisie en carte, et la traduire en étapes avec contrats de transition et retour
  arrière : `e11s06`, qui part de l'alternative choisie ici.
- Une recommandation sans carte adoptée. Elle part du diagnostic de la carte : laisser l'exigence
  d'architecture en angle mort ne demande aucune recommandation.
- Recommander dans un changement à candidat : seul l'état des lieux propose une recommandation. Le choix de
  conception `IH-05` qu'attend G3 pour adopter une conception n'est pas touché.
- Garder l'alternative choisie d'un changement au suivant : comme la carte, elle vit dans l'état des lieux
  qui la choisit. La porter d'un changement à l'autre relève du programme à plusieurs incréments (`e10s04`).
- Rendre la remarque obligatoire : une saisie vide ou fermée reste une demande sans remarque, comme pour la
  carte (`e11s01`).
