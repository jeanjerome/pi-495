STORY KEY: e01s02
TITLE:     Arrêter avant G0 une spécification qui ne progresse plus, et la faire réécrire à la reprise
TYPE:      Story
PARENT:    e01
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-26
MATURITY:  4
SIZE:      L

### 1. Business narrative [draft]

Un propriétaire a répondu à une question matérielle. La spécification a été rouverte pour en tenir
compte, et le rapport obtenu perd encore la réponse sans rien gagner sur ceux qui le précèdent. La
réouverture n'a plus le droit de relancer : sans humain entre deux relances, un modèle qui oscille
les consommerait sans fin (e01s01).

Aujourd'hui, ce rapport est tenu pour établi. Son mandat est proposé à G0 et, si l'adoption est
humaine, le propriétaire est invité à adopter un mandat bâti sur un rapport qui a perdu sa réponse.
G1 refuse ensuite les exigences en nommant la réponse, et propose `revise_requirements`, qu'aucune
commande ne tient. Une reprise rejoue la même phase sur le même rapport : même document, même refus.
Passé G0, les phases ne reviennent plus en arrière. Le changement est perdu.

Le même arrêt vient d'un rapport qui déclare une réponse en la rattachant à une exigence qu'il ne
porte pas, ou à aucune exigence obligatoire. La réouverture le tient pour portée, G1 la refuse.

Le résultat attendu est que le changement s'arrête en clarification, avant que le mandat ne soit
proposé, en nommant la réponse perdue. Deux issues s'offrent alors au propriétaire, par des
commandes qui existent : reprendre, et la spécification est réécrite ; abandonner. Un refus de G1
cesse de nommer une action que rien ne tient.

#### MODIFIED: BES-02 — Clarifier sans inventer

**Before:** un rapport qui ne porte pas une réponse matérielle enregistrée, et que la borne de
progression interdit de rouvrir, **est tenu pour établi** : son mandat est proposé à G0, puis G1
refuse les exigences en nommant la réponse, avec l'action `revise_requirements` qu'aucune commande
ne tient. Une reprise reproduit le même document et le même refus. Un rapport qui déclare une
réponse **compte comme la portant, même si la déclaration nomme une exigence qu'il ne porte pas** ou
aucune exigence obligatoire.

**After:** un tel rapport **arrête le changement en clarification, avant que le mandat ne soit
proposé**. L'arrêt est une stagnation qui nomme les réponses perdues et les deux issues. Une reprise
humaine produit une nouvelle intervention de spécification : la borne de progression se mesure
depuis la dernière réponse matérielle **ou la dernière reprise humaine d'un arrêt**. L'abandon reste
l'autre issue. Un rapport ne porte une réponse que si sa déclaration tient dans ses propres
exigences, comme G1 en juge. Un refus de G1 nomme l'abandon, seule issue qu'une commande tienne une
fois le mandat adopté.

### 2. Value statement [draft]

As a propriétaire d'un changement, I want que le changement s'arrête avant le mandat quand la
spécification perd une réponse que j'ai donnée et ne progresse plus, so that je décide de la relancer
ou de l'abandonner au lieu de voir un mandat proposé puis un refus que rien ne permet de lever.

### 3. Actors and permissions [draft]

- **Propriétaire du changement** (external) — reprend le changement arrêté (`/495 resume`) ou
  l'abandonne (`/495 cancel`). Seul un humain lève un arrêt : un acteur agent, une sortie de modèle
  ou un appel d'outil ne le peut pas, et l'outil 495 exposé au modèle n'a pas de reprise.
- **Modèle de l'intervention `specify`** (system, non fiable) — écrit le rapport de spécification.
  Il ne décide ni de l'arrêt ni de la reprise.
- **Noyau 495** (system) — juge chaque rapport au regard des réponses enregistrées, arrête le
  changement quand la spécification ne progresse plus, et relance la spécification à la reprise.

### 4. Trigger and preconditions [draft]

**Déclencheur :** la clarification dispose d'un rapport qui ne porte pas une réponse matérielle
enregistrée, et que la borne de progression interdit de rouvrir.

**Préconditions :**
- au moins une question matérielle du changement porte une réponse enregistrée ;
- le changement est en clarification ;
- le rapport ne pose aucune question matérielle encore sans réponse.

### 5. Main flow and business logic [reviewed]

1. La clarification dispose d'un rapport, trouvé en reprenant ou obtenu à l'instant.
2. Le noyau établit ce que ce rapport porte. Une réponse est portée quand sa déclaration, propre ou
   héritée, tient dans les exigences du rapport : une réponse observable nomme des exigences que le
   rapport porte, dont une obligatoire au moins. Une réponse déclarée non observable est portée.
3. Le noyau relève les réponses matérielles enregistrées que le rapport ne porte pas.
4. Si le rapport doit être rouvert selon la borne de progression, la spécification est réécrite
   comme dans e01s01.
5. Sinon, si une réponse reste non portée, le changement s'arrête en clarification. L'arrêt est une
   stagnation, levable par une reprise. Son détail nomme chaque réponse perdue et les deux issues :
   reprendre, qui réécrit la spécification, ou abandonner. Aucun mandat n'est proposé, G0 n'est pas
   évalué.
6. Le propriétaire reprend le changement.
7. La borne de progression repart de cette reprise. Le rapport trouvé est celui sur lequel la
   reprise a été donnée : il est rouvert parce qu'il ignore une réponse. Une nouvelle intervention
   `specify` reçoit la demande, qui dit quelles réponses sont à déclarer.
8. Le rapport obtenu est jugé comme à l'étape 2. S'il porte toutes les réponses, il devient la base
   du mandat proposé à G0.

Interruption point: entre les étapes 5 et 6. L'arrêt est inscrit au journal ; le changement attend
une commande humaine sans limite de temps.

### 6. Alternative flows and exceptions [draft]

6a. **Reprise qui obtient un rapport sans progrès** : le rapport obtenu après la reprise perd encore
la réponse et ne porte rien que le rapport repris ne portait. Le changement s'arrête de nouveau,
après une seule intervention. Chaque reprise obtient au moins une réécriture, et la borne limite
celles qui suivent.

6b. **Abandon après l'arrêt** : le propriétaire abandonne le changement. Il est clos comme
abandonné ; aucune intervention n'est lancée.

6c. **Rapports qui oscillent** : un rapport reprend la réponse A et perd B, le suivant reprend B et
perd A. Le second ne gagne rien : le changement s'arrête en clarification en nommant A, au lieu
d'aller à G1.

6d. **Adoption humaine du mandat** : un rapport qui perd une réponse n'atteint jamais G0. Aucune
adoption n'est demandée au propriétaire pour un mandat bâti sur lui.

6e. **Déclaration qui nomme une exigence absente ou aucune exigence obligatoire** : la réponse n'est
pas portée. Le rapport est rouvert si la borne le permet, et le changement s'arrête sinon, comme
pour une réponse que le rapport ne déclare pas.

6f. **Refus de G1 pour un défaut de structure** : un document d'exigences qui porte deux fois le
même identifiant, par exemple, est refusé à G1. Le refus nomme l'abandon comme issue, plus
`revise_requirements`.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  none
Dynamic elements: état du changement « blocked: stagnation — <détail> — resume retries it »
```

Le détail nomme chaque réponse perdue par son identifiant et les deux issues. Il s'affiche là où
`/495 status` et la conduite d'un changement affichent déjà un arrêt. Le refus de G1 affiche
`cancel` à la place de `revise_requirements`. Aucun élément nouveau.

### 8. Domain model [draft]

**Entité touchée :** la situation d'une spécification face aux réponses enregistrées. Trois
changements :
- une réponse n'est portée que si sa déclaration tient dans les exigences du rapport, qu'elle soit
  propre au rapport ou héritée. C'est le prédicat de G1. La réouverture et la mesure de progrès le
  lisent l'une et l'autre ;
- la situation distingue un rapport établi, qui porte toutes les réponses, d'un rapport qui en perd
  une sans pouvoir être rouvert. Le second arrête le changement ;
- la progression se mesure depuis la dernière réponse matérielle ou la dernière reprise humaine d'un
  arrêt. L'ordre des rapports, des réponses et des reprises est lu dans le journal du changement.
  Seule la reprise lève un arrêt, et l'acteur qui la donne est inscrit.

**Arrêt :** motif existant `stagnation`, levable par une reprise. Aucun motif nouveau, aucun
événement nouveau, aucun contrat changé.

**Refus de G1 :** l'action suivante devient `cancel`.

**Entité créée :** aucune. Aucun identifiant de composant nouveau.

**Raison de la profondeur** : aucune abstraction n'est ajoutée. L'arrêt reprend le mécanisme de
blocage et de reprise qui existe, et la réouverture lit le prédicat de G1 au lieu d'un second qui
diverge.

### 9. Integrations and boundaries [draft]

- **Modèle de l'intervention `specify`, par le worker Pi** (perennial, direction: both) : il reçoit
  une demande de plus à chaque reprise. La forme de la demande et celle du rapport ne changent pas.
- **Commande `/495`** (perennial, direction: in) : `resume` et `cancel` existent et ne changent pas.

### 10. Background processes [draft]

Not applicable. L'arrêt et la reprise ont lieu dans la conduite du changement, pas sur une horloge.

### 11. Notifications [draft]

Not applicable. L'arrêt s'affiche comme tout arrêt d'un changement (§7). Aucune décision nouvelle
n'est demandée.

### 12. Audit and logging [draft]

**Entité auditée :** le changement. L'arrêt est inscrit avec son motif, son détail et le fait qu'il
se lève par une reprise. La reprise est inscrite sous l'acteur qui l'a donnée, et l'intervention
qu'elle déclenche avec la demande qui lui est remise. Le dossier montre donc le rapport qui a perdu
la réponse, l'arrêt qui la nomme, qui a repris, et le rapport suivant. Aucun événement nouveau.

### 13. Solution variabilities [reviewed]

Not applicable. Aucun réglage : l'arrêt ne dépend que des réponses enregistrées et des rapports.

### 14. Quality attributes *NFR* [draft]

- Mandat proposé à G0 depuis un rapport qui ne porte pas une réponse matérielle enregistrée : 0.
- Reprise d'un arrêt de stagnation qui ne produit aucune intervention de spécification : 0.
- Interventions de spécification entre deux actes humains, réponse ou reprise : au plus une de plus
  que les réponses matérielles enregistrées, comme dans e01s01.
- Document d'exigences adopté à G1 qui perd une réponse : 0. Le refus de G1 reste fermé.
- Refus de G1 qui nomme une action qu'aucune sous-commande `/495` ne tient : 0.

### 15. Security and compliance *NFR* [draft]

- **Menace couverte :** M2 du modèle de menace de l'epic. Le recours relance ou arrête ; il n'adopte
  jamais un document qui perd une réponse. G1 reste le seul juge des exigences, et son refus reste
  fermé.
- **Coût (M7) :** chaque reprise lance au moins une intervention facturée ou longue. Seul un humain
  la déclenche : la levée d'un arrêt est refusée à un agent, à une sortie de modèle et à un appel
  d'outil, et l'outil 495 n'a pas de reprise. Après la reprise, la borne de progression limite les
  relances automatiques comme dans e01s01. Le budget de tentatives n'en borne aucune
  (`BUG-2026-09-23T155707`, ouvert).
- **Autorité :** l'arrêt ne lie ni ne délie aucune réponse. La reprise non plus : seul le rapport qui
  en résulte déclare une liaison, et G1 la vérifie.
- **Classification des données :** inchangée. Le détail de l'arrêt nomme les réponses par leur
  identifiant, sans leur texte.

### 16. UX and accessibility *NFR* [draft]

- Le propriétaire voit l'arrêt avant qu'on lui demande d'adopter quoi que ce soit, et sait quelles
  réponses ont été perdues et quelles commandes s'offrent à lui.
- Langue : le détail de l'arrêt est en anglais, comme les autres arrêts du noyau.

### 17. Acceptance criteria [reviewed]

```
Scenario: Un rapport rouvert qui perd encore une réponse sans rien gagner arrête le changement avant G0
  Given une réponse matérielle liée par un rapport à une exigence obligatoire
  And   un rapport rouvert qui perd cette réponse
  And   un rapport suivant qui la perd encore et ne porte rien qu'un rapport antérieur ne portait
  When  le changement avance
  Then  le changement s'arrête en clarification pour stagnation, levable par une reprise
  And   l'arrêt nomme la réponse perdue
  And   aucun mandat n'est proposé et G0 n'est pas évalué

Scenario: Le même cas sur le code d'avant la story atteint G1 (contrôle négatif)
  Given le même déroulé que ci-dessus
  When  il est rejoué sur le code d'avant la story
  Then  un mandat est proposé
  And   G1 refuse la réponse perdue

Scenario: La reprise fait réécrire la spécification (étapes 6 à 8)
  Given un changement arrêté parce que la spécification perd une réponse sans progresser
  When  le propriétaire le reprend
  Then  une nouvelle intervention de spécification est demandée
  And   sa demande indique que la réponse perdue est à déclarer
  And   un rapport qui la déclare mène le changement au-delà de G1

Scenario: Une reprise qui obtient un rapport sans progrès arrête de nouveau le changement (6a)
  Given un changement arrêté parce que la spécification perd une réponse sans progresser
  When  le propriétaire le reprend et le rapport obtenu perd encore la réponse sans rien gagner
  Then  une seule intervention de spécification a été demandée depuis la reprise
  And   le changement s'arrête de nouveau en clarification en nommant la réponse

Scenario: L'abandon clôt le changement arrêté (6b)
  Given un changement arrêté parce que la spécification perd une réponse sans progresser
  When  le propriétaire l'abandonne
  Then  le changement est clos comme abandonné
  And   aucune intervention de spécification n'est demandée

Scenario: Des rapports qui oscillent arrêtent le changement avant G0 (6c)
  Given des rapports successifs qui reprennent une réponse et en perdent une autre, tour à tour
  When  le changement avance sans réponse humaine nouvelle
  Then  le changement s'arrête en clarification en nommant la réponse perdue
  And   G0 n'est pas évalué

Scenario: Aucune adoption n'est demandée pour un rapport qui perd une réponse (6d)
  Given l'adoption du mandat confiée à un humain
  And   un rapport rouvert qui perd une réponse et ne porte que des réponses déjà portées
  When  le changement avance
  Then  aucune adoption du mandat n'est demandée
  And   le changement s'arrête en clarification en nommant la réponse perdue

Scenario: Une déclaration qui nomme une exigence absente ne porte pas la réponse (6e)
  Given un rapport qui déclare une réponse en nommant une exigence qu'il ne porte pas
  When  le changement avance
  Then  la spécification est rouverte pour cette réponse
  And   si le rapport suivant ne gagne rien, le changement s'arrête en clarification en la nommant

Scenario: Une déclaration qui ne nomme aucune exigence obligatoire ne porte pas la réponse (6e)
  Given un rapport qui déclare une réponse en ne nommant que des exigences facultatives
  When  le changement avance
  Then  la spécification est rouverte pour cette réponse

Scenario: Un refus de G1 pour un défaut de structure nomme l'abandon (6f)
  Given un rapport qui porte toutes les réponses et deux exigences de même identifiant
  When  le changement avance jusqu'à G1
  Then  G1 refuse le document
  And   l'action suivante nommée est l'abandon
  And   revise_requirements n'est nommée nulle part
```

### 18. Out of scope [draft]

- Clore une question qui n'est plus matérielle, troisième issue de l'arrêt, relève d'e01s03, de même
  que le pouvoir du rapport de déclarer une réponse « non observable ».
- Révoquer une réponse donnée par erreur relève d'e01s04.
- Les défauts de structure que G1 refuse (identifiant répété, critère vide, aucune exigence) ne sont
  pas jugés avant G0 : seul le nom de l'issue change. Les juger avant le mandat serait une seconde
  copie de G1 que l'objet de l'epic ne demande pas.
- Le budget de tentatives, qui ne borne pas les reprises, reste `BUG-2026-09-23T155707`.
- La preuve par une campagne réelle relève d'e01s05.

### 19. Open questions [draft]

Aucune. La capsule fixe le but : s'arrêter avant G0 en nommant la réponse perdue, réécrire à la
reprise, et ne plus nommer à G1 une action sans commande. Le code fixe le reste :
- les phases ne reviennent pas en arrière après G0, si bien que la réécriture n'est possible qu'en
  clarification, et que l'abandon est la seule issue d'un refus de G1 ;
- `resume` et `cancel` existent, et la reprise lève déjà un arrêt levable.

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` : BES-02 et sa recette.
- `specs/archive/amont/specification-fonctionnelle.md` : RM-010 et RM-011, et le motif d'arrêt
  `stagnation` (RM-035).
- `specs/epics/e01-reponse-humaine-atteint-les-exigences/epic.yaml` : position de la story.
- `specs/epics/e01-reponse-humaine-atteint-les-exigences/e01s01-un-rapport-qui-defait-une-liaison-sans-rien-demander-rouvre-la-specification.md` :
  la borne de progression et les scénarios 6b, 6c, 6g, 6h et 6j, dont l'attendu passe du refus de
  G1 à l'arrêt avant G0.
- `specs/security/epics/e01/THREAT_MODEL.md` : M2 et M7.
- `specs/adr/D-37-*.md` et `specs/adr/D-39-*.md` : G1 refuse une réponse qu'aucune exigence
  obligatoire ne porte, et une déclaration héritée tombe avec son exigence.
- `specs/adr/D-52-une-commande-verify-s-ecrit-rouge.md` : pourquoi les commandes du plan échouent au
  moment où elles sont écrites.
- Fichiers touchés : `src/domain/change/state.ts`, `src/application/phases/clarify.ts`,
  `src/application/artifacts.ts`, `src/application/harness.ts`,
  `src/application/phases/specify.ts`, `src/domain/change/decide.ts`,
  `test/v2/specification-reopening.test.ts`, `test/v2/harness.test.ts`.
