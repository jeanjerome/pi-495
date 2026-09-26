STORY KEY: e01s01
TITLE:     Rouvrir la spécification quand un rapport défait la liaison d'une réponse sans rien demander
TYPE:      Story
PARENT:    e01
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-25
MATURITY:  4
SIZE:      M

### 1. Business narrative [draft]

Un propriétaire répond à une question matérielle : un nom trop long rend 422 avec un message exact.
Le rapport de spécification suivant rattache cette réponse à une exigence obligatoire, et le noyau
reporte cette liaison d'un rapport à l'autre (D-39). Il pose ensuite deux nouvelles questions. Le
propriétaire y répond, et la spécification est rouverte pour en tenir compte.

Le rapport rouvert porte les deux nouvelles réponses, mais il renomme l'exigence qui portait la
première. La liaison héritée tombe, comme D-39 le prévoit, et la réponse n'est plus portée par rien.
Ce rapport ne pose aucune question. Le noyau le tient pour établi, propose le mandat, puis G1 refuse
les exigences en nommant la réponse perdue. La reprise reproduit le même document et le même refus.
Le changement est perdu (`~/.495-campagnes/java-flashnext-L2`, événements 183 à 195).

Deux écarts produisent cet arrêt. La réouverture ne compte que les réponses aux questions que le
rapport a lui-même posées, alors que G1 refuse toute réponse matérielle qu'aucune exigence ne porte.
Et la réouverture n'est jugée que sur le rapport présent au moment où la clarification reprend,
jamais sur le rapport qu'elle vient elle-même d'obtenir. Un rapport rouvert qui ne pose aucune
question n'est donc jamais comparé aux réponses enregistrées avant G1.

Le résultat attendu est que la spécification soit rouverte pour toute réponse matérielle enregistrée
qu'un rapport ne porte pas, y compris le rapport qu'une réouverture vient de produire, et que la
réouverture reste bornée sans qu'un humain intervienne entre deux relances.

#### MODIFIED: BES-02 — Clarifier sans inventer

**Before:** la spécification est rouverte quand le rapport présent au moment où la clarification
reprend ne dit rien d'une réponse matérielle enregistrée **à une question qu'il a lui-même posée**.
Un rapport produit par une réouverture n'est jugé à son tour que si le changement revient en
clarification, c'est-à-dire s'il pose une question matérielle nouvelle. Une réouverture n'est
relancée que si le rapport porte une réponse que **le rapport précédent** ne portait pas.

**After:** la spécification est rouverte quand un rapport ne porte pas une réponse matérielle
enregistrée, **qu'il ait posé la question ou non** : ce sont les réponses que G1 refuse. Le rapport
qu'une réouverture vient de produire est jugé de la même façon avant que le mandat ne soit proposé.
Le rapport sur lequel la dernière réponse humaine a été donnée a été écrit avant elle : il est
rouvert dès qu'il en perd une. Un rapport écrit depuis n'est rouvert que s'il porte une réponse
**qu'aucun rapport écrit depuis la dernière réponse, celui-là compris, ne portait**. Sinon le rapport
va à G1, qui le refuse en nommant la réponse perdue, comme aujourd'hui. Adopter le mandat ou le voir
refusé à G0 n'est pas une réponse : la clarification qui reprend alors ne rouvre pas le même rapport.

### 2. Value statement [draft]

As a propriétaire d'un changement, I want que la spécification soit refaite quand un rapport perd la
liaison d'une réponse que j'ai donnée, so that ma décision atteigne les exigences adoptées au lieu
d'arrêter le changement à G1.

### 3. Actors and permissions [draft]

- **Propriétaire du changement** (external) — répond aux questions matérielles par IH-01. Il n'a
  rien de plus à faire dans cette story : la réouverture ne lui demande aucune décision.
- **Modèle de l'intervention `specify`** (system, non fiable) — écrit le rapport de spécification.
  Il ne décide pas de la réouverture.
- **Noyau 495** (system) — juge chaque rapport au regard des réponses enregistrées, relance la
  spécification ou propose le mandat, et décide G1.

### 4. Trigger and preconditions [draft]

**Déclencheur :** la clarification dispose d'un rapport de spécification, qu'elle l'ait trouvé en
reprenant ou qu'elle vienne de l'obtenir.

**Préconditions :**
- au moins une question matérielle du changement porte une réponse enregistrée ;
- le changement est en clarification et n'est pas bloqué.

### 5. Main flow and business logic [reviewed]

1. La clarification reprend après une réponse humaine et trouve le dernier rapport.
2. Le noyau établit ce que ce rapport porte : ses propres déclarations de réponse, et celles qu'il
   hérite des rapports antérieurs tant qu'elles tiennent encore (D-39).
3. Le noyau relève les réponses matérielles enregistrées que ce rapport ne porte pas, que le rapport
   ait posé la question ou non.
4. Si une telle réponse existe, et que le rapport est celui sur lequel la dernière réponse a été
   donnée, ou porte une réponse qu'aucun rapport écrit depuis cette réponse, celui-là compris, ne
   portait, la spécification est rouverte : une nouvelle intervention `specify` reçoit la demande,
   qui indique pour chaque réponse si elle est déjà déclarée ou encore à déclarer.
5. Le rapport obtenu est enregistré.
6. S'il pose une question matérielle nouvelle, elle est posée par IH-01, et le jugement reprend à
   l'étape 1 après la réponse.
7. Sinon, le noyau juge le rapport obtenu comme à l'étape 2, avant de proposer le mandat. S'il doit
   être rouvert, le parcours reprend à l'étape 4.
8. Un rapport qui porte toutes les réponses enregistrées, ou qui n'a rien gagné sur les rapports
   écrits depuis la dernière réponse, devient la base du mandat proposé à G0.

Interruption point: entre les étapes 5 et 7. Le rapport est enregistré, mais le mandat n'est pas
encore proposé. Une reprise juge ce rapport comme à l'étape 2.

### 6. Alternative flows and exceptions [draft]

6a. **Rapport qui renomme l'exigence porteuse sans rien demander** : c'est le cas de
`java-flashnext-L2`. La liaison héritée tombe. Le rapport porte deux réponses qu'aucun rapport
antérieur ne portait. La spécification est rouverte, et la demande indique que la réponse perdue est
à déclarer.

6b. **Rapport rouvert qui perd encore la réponse sans rien gagner** : il porte seulement des réponses
qu'un rapport antérieur portait déjà. Il n'est pas rouvert. Il va à G1, qui le refuse en nommant la
réponse, comme aujourd'hui. Ce qui suit ce refus relève d'e01s02.

6c. **Rapports qui oscillent** : un rapport reprend la réponse A et perd la réponse B, le suivant
reprend B et perd A. Le second ne porte rien qu'un rapport antérieur n'ait déjà porté. Il n'est pas
rouvert, et le changement va à G1 au lieu de relancer sans fin.

6d. **Premier rapport du changement** : aucune réponse n'est encore enregistrée, et il n'y a rien à
rouvrir. Ses questions matérielles sont posées comme aujourd'hui.

6e. **Rapport qui déclare une réponse « non observable »** : il la porte. La réouverture ne la
compte pas comme perdue, et G1 ne lui demande aucune exigence, comme aujourd'hui. Retirer au modèle
ce pouvoir relève d'e01s03.

6f. **Rapport rouvert qui pose aussi une question matérielle nouvelle** : la question est posée
d'abord. Le jugement du rapport suit la réponse, comme aujourd'hui.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  none
Dynamic elements: message de progression « specification reopened by <n> material answer(s): <ids> »
```

Le message existant nomme aussi une réponse perdue par un rapport qui ne l'avait pas demandée.
Aucun élément nouveau.

### 8. Domain model [draft]

**Entité touchée :** la situation d'une spécification face aux réponses enregistrées. Deux
changements :
- la liste des réponses ignorées retient toute réponse matérielle enregistrée que le rapport ne
  porte pas ;
- la progression se mesure contre tous les rapports écrits depuis la dernière réponse matérielle,
  celui sur lequel elle a été donnée compris, pas seulement le précédent. Mesurée contre tous les
  rapports du changement, une réponse donnée après un rapport qui n'a rien gagné n'atteindrait
  aucune réécriture. Mesurée depuis l'entrée en clarification, une adoption du mandat ou un refus de
  G0 rouvrirait le même rapport à chaque fois. L'ordre des rapports et des réponses est lu dans le
  journal du changement.

**Entité créée :** aucune. Aucun identifiant de composant nouveau, aucun événement nouveau.

**Relations changées :** la clarification juge aussi le rapport qu'elle vient d'obtenir, avant de
proposer le mandat.

**Raison de la profondeur** : aucune abstraction n'est ajoutée. La réouverture et G1 lisent les
mêmes réponses enregistrées. La story aligne le prédicat de la réouverture sur celui de G1 au lieu
d'en garder deux qui divergent.

### 9. Integrations and boundaries [draft]

- **Modèle de l'intervention `specify`, par le worker Pi** (perennial, direction: both) : il reçoit
  une demande de plus quand un rapport perd une liaison. La forme de la demande et celle du rapport
  ne changent pas.

### 10. Background processes [draft]

Not applicable. Le jugement a lieu dans la clarification, pas sur une horloge.

### 11. Notifications [draft]

Not applicable. Le message de progression existant suffit (§7). Aucune décision n'est demandée à
l'humain.

### 12. Audit and logging [draft]

**Entité auditée :** le changement. Chaque rapport reste inscrit comme proposition de diagnostic, et
chaque réouverture comme intervention `specify` avec la demande qui lui a été remise. Le dossier
montre donc le rapport qui a perdu la liaison, la demande qui la réclame, et le rapport suivant.
Aucun événement nouveau.

### 13. Solution variabilities [reviewed]

Not applicable. Aucun réglage : la borne ne dépend que des réponses enregistrées.

### 14. Quality attributes *NFR* [draft]

- Réponse matérielle enregistrée qu'aucun rapport ne porte, dans un mandat proposé à G0 sans que la
  borne ait arrêté la réouverture : 0.
- Réouvertures consécutives sans réponse humaine entre elles : au plus une de plus que les réponses
  matérielles enregistrées. Le rapport sur lequel la dernière réponse a été donnée est rouvert dès
  qu'il en perd une ; chaque réouverture suivante doit porter une réponse qu'aucun rapport écrit
  depuis cette réponse, celui-là compris, ne portait. Une adoption du mandat ou un refus de G0 n'en
  ajoute aucune.
- Document d'exigences adopté à G1 qui perd une réponse : 0. Le refus de G1 reste fermé.

### 15. Security and compliance *NFR* [draft]

- **Menace couverte :** M2 du modèle de menace de l'epic. Un rapport défait une liaison, et le
  changement s'arrête sans recours. La réouverture est le recours automatique. Elle n'adopte jamais
  un document qui perd une réponse : G1 reste le seul juge et son refus reste fermé.
- **Coût (M7) :** chaque réouverture est une intervention facturée ou longue, et aucun humain ne la
  déclenche. La borne du §14 limite leur nombre aux réponses enregistrées. Un modèle qui oscille ne
  peut pas les consommer sans fin.
- **Autorité :** la réouverture ne lie ni ne délie aucune réponse. Seul le rapport qui en résulte
  déclare une liaison, et G1 la vérifie.
- **Classification des données :** inchangée. La demande porte les réponses humaines comme
  aujourd'hui.

### 16. UX and accessibility *NFR* [draft]

- Le propriétaire n'a aucune action nouvelle à faire. Une réponse qu'il a donnée n'arrête plus le
  changement parce qu'un rapport a renommé une exigence.
- Langue : le message de progression reste en anglais, comme aujourd'hui.

### 17. Acceptance criteria [reviewed]

```
Scenario: Un rapport rouvert qui renomme l'exigence porteuse sans rien demander est rouvert (6a)
  Given une réponse matérielle liée par un rapport à une exigence obligatoire
  And   une seconde réponse enregistrée qui rouvre la spécification
  And   un rapport rouvert qui porte la seconde réponse, renomme l'exigence de la première, et ne pose aucune question
  When  le changement avance
  Then  une nouvelle intervention de spécification est demandée
  And   sa demande indique que la première réponse est à déclarer
  And   un rapport qui la déclare mène le changement au-delà de G1

Scenario: Le même cas sur le code d'avant la story s'arrête à G1 (contrôle négatif)
  Given le même déroulé que ci-dessus
  When  il est rejoué sur le code d'avant la story
  Then  aucune intervention de spécification n'est demandée après le rapport qui perd la liaison
  And   G1 refuse la première réponse

Scenario: Un rapport rouvert qui ne gagne rien n'est pas rouvert (6b)
  Given un rapport rouvert qui perd une réponse et ne porte que des réponses déjà portées par un rapport antérieur
  When  le changement avance
  Then  aucune intervention de spécification n'est demandée pour lui
  And   G1 refuse la réponse perdue en la nommant
  And   rien n'est adopté à G1

Scenario: Des rapports qui oscillent ne relancent pas sans fin (6c)
  Given des rapports successifs qui reprennent une réponse et en perdent une autre, tour à tour
  When  le changement avance sans réponse humaine nouvelle
  Then  la spécification n'est plus rouverte après le premier rapport qui ne porte que des réponses déjà portées par un rapport antérieur
  And   le changement s'arrête à G1

Scenario: Une réponse donnée après un rapport qui n'a rien gagné atteint une réécriture (6f)
  Given un rapport rouvert qui reprend une réponse, en perd une autre, et pose une question matérielle nouvelle
  When  le changement avance
  Then  la question est posée d'abord
  And   après la réponse, une nouvelle intervention de spécification est demandée
  And   un rapport qui porte toutes les réponses mène le changement au-delà de G1

Scenario: Adopter le mandat ne rouvre pas le rapport adopté (6g)
  Given l'adoption du mandat demandée à un humain
  And   un rapport rouvert qui perd une réponse et ne porte que des réponses déjà portées
  When  l'humain adopte le mandat et le changement avance
  Then  aucune intervention de spécification n'est demandée pour lui
  And   G1 refuse la réponse perdue en la nommant

Scenario: Ce que porte le rapport sur lequel la dernière réponse a été donnée compte comme déjà porté (6h)
  Given un rapport qui porte une réponse et pose une question matérielle nouvelle
  And   un rapport rouvert sur la réponse à cette question qui ne porte que la première
  When  le changement avance
  Then  la spécification n'est rouverte qu'une fois
  And   G1 refuse la réponse perdue en la nommant

Scenario: Une réponse déclarée non observable n'est pas comptée comme perdue (6e)
  Given un rapport qui déclare une réponse enregistrée non observable
  When  le changement avance
  Then  la spécification n'est pas rouverte pour cette réponse
```

### 18. Out of scope [draft]

- Ce qui suit le refus de G1 quand la réouverture n'a plus le droit de relancer relève d'e01s02 :
  l'arrêt avant G0 en nommant la réponse perdue, la reprise qui produit une nouvelle spécification,
  et l'action `revise_requirements` qu'aucune commande ne tient.
- Retirer au rapport le pouvoir de déclarer une réponse « non observable » relève d'e01s03.
- Les exigences ne sont pas reportées d'un rapport à l'autre (D-39). La réouverture demande une
  déclaration nouvelle. Elle ne reconstruit pas la liaison perdue.
- La preuve par une campagne réelle relève d'e01s05.

### 19. Open questions [draft]

Aucune. La capsule fixe le but, à savoir que la réouverture juge les mêmes réponses que G1 et reste
bornée. Le relevé de `java-flashnext-L2` fixe ce qu'il faut pour l'atteindre :
- le rapport rouvert, qui ne pose aucune question, doit être jugé ;
- la borne doit tenir sans humain entre deux relances.

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` : BES-02 et sa recette.
- `specs/archive/amont/specification-fonctionnelle.md` : RM-010 et RM-011, cités par les tests
  existants de la réouverture.
- `specs/epics/e01-reponse-humaine-atteint-les-exigences/epic.yaml` : position de la story.
- `specs/security/epics/e01/THREAT_MODEL.md` : M2 et M7.
- `specs/adr/D-39-*.md` : le report des déclarations, et la chute d'une déclaration dont l'exigence
  disparaît.
- `~/.495-campagnes/java-flashnext-L2` : les rapports 43, 96 et 183, et les événements 183 à 195.
  Q1 est liée par le rapport 96 à `REQ-422-MESSAGE`. Le rapport 183 remplace cette exigence par
  `REQ-422-BODY-FORMAT`, porte Q6 et Q7, et ne pose aucune question. G1 refuse Q1 deux fois.
- `specs/adr/D-52-une-commande-verify-s-ecrit-rouge.md` : pourquoi les commandes du plan échouent au
  moment où elles sont écrites.
- Fichiers touchés : `src/domain/change/state.ts`, `src/application/phases/clarify.ts`,
  `test/v2/harness.test.ts`, `test/v2/specification-reopening.test.ts`.
