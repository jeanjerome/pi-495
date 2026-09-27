STORY KEY: e01s03
TITLE:     Laisser à l'humain seul la clôture d'une question, et faire de « non observable » une proposition qu'il tranche
TYPE:      Story
PARENT:    e01
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-27
MATURITY:  4
SIZE:      L

### 1. Business narrative [draft]

Un propriétaire se voit poser une question matérielle. Il n'a que deux issues : répondre, ou
abandonner le changement. Il arrive pourtant que la question ne compte plus : le périmètre a changé,
la réponse n'importe pas au résultat, ou la spécification l'a rendue sans objet. Rien ne lui permet
de le dire. Il doit inventer une réponse, qui liera ensuite une exigence qu'il ne voulait pas, ou
abandonner un changement qui pouvait aboutir.

Le même manque pèse sur l'arrêt que la story précédente installe. Quand la spécification perd une
réponse et ne progresse plus, le changement s'arrête avant le mandat, et le propriétaire peut
relancer la spécification ou abandonner. Relancer dépend encore du modèle. S'il décide que la
réponse perdue ne compte plus, il n'a aucun moyen de faire décider le changement avec ce qui est
acquis.

À l'inverse, le modèle a ce pouvoir, et personne ne le contrôle. Un rapport de spécification peut
déclarer qu'une réponse humaine « ne fixe rien d'observable ». La réponse est alors dispensée de
toute exigence, adoptée à G1 sans obligation, et aucun contrôle ne la vérifie. Un modèle l'a déjà
fait pour passer G1 (D-37). Une réponse « 422 » ainsi déclarée laisse accepter un changement qui
rend 400, soit le défaut que l'epic existe pour fermer.

Le résultat attendu tient en une règle : une réponse humaine ne cesse de lier que par une décision
humaine. Le propriétaire peut clore une question qui n'est plus matérielle, devant la question
elle-même comme devant l'arrêt de la spécification. Le rapport peut encore dire qu'une réponse ne
fixe rien d'observable, mais ce n'est plus qu'une proposition : le changement s'arrête pour que le
propriétaire la confirme, en closant la question, ou la refuse.

#### ADDED: BES-02 — Clarifier sans inventer

Le propriétaire d'un changement peut **clore une question matérielle** en déclarant qu'elle n'est
plus matérielle. Deux points l'offrent : la question elle-même (IH-01), qui propose désormais trois
issues, répondre, clore ou abandonner ; et l'arrêt d'une spécification qui ne progresse plus, par
`/495 close <question>`. La clôture est un acte humain inscrit au journal sous l'acteur qui l'a
donné. Une question close n'est plus posée, G0 ne la compte pas comme ouverte, G1 n'exige plus
qu'une exigence la porte, et le mandat la porte comme close avec le nom de qui l'a close.

#### MODIFIED: BES-02 — Clarifier sans inventer

**Before:** un rapport de spécification qui déclare une réponse matérielle `observable: false`
**la porte sans exigence** : la réponse compte comme portée pour la réouverture et pour la mesure de
progrès, le document des exigences la recopie comme ne fixant rien d'observable, et **G1 saute toute
vérification de liaison** pour elle. IH-01 n'offre que **répondre** et **abandonner**.

**After:** la déclaration `observable: false` d'une réponse **n'est qu'une proposition**. Elle ne
porte la réponse que si le propriétaire a clos la question ; sinon la réponse compte comme non
portée, et le rapport est rouvert ou arrête le changement comme dans e01s02, l'arrêt nommant la
proposition. G1 refuse une réponse matérielle déclarée non observable dont la question n'est pas
close. IH-01 offre **répondre**, **clore** et **abandonner**.

### 2. Value statement [draft]

As a propriétaire d'un changement, I want être seul à pouvoir déclarer qu'une question n'est plus matérielle, devant la question comme devant l'arrêt de la spécification, so that je fais décider le changement avec ce qui est acquis sans inventer de réponse, et qu'aucune réponse que j'ai donnée ne cesse de lier sans que je l'aie décidé.

### 3. Actors and permissions [draft]

- **Propriétaire du changement** (external) — répond à une question matérielle, la clôt ou abandonne
  le changement (IH-01) ; clôt une question devant l'arrêt de la spécification (`/495 close`) ;
  reprend (`/495 resume`) ou abandonne (`/495 cancel`) un changement arrêté. Il doit être un humain
  qualifié : origine TUI ou hôte RPC ou SDK qualifié, authentifié.
- **Modèle de l'intervention `specify`** (system, non fiable) — écrit le rapport de spécification. Il
  peut proposer qu'une réponse ne fixe rien d'observable. Il ne clôt rien et ne dispense aucune
  réponse.
- **Modèle de la session Pi** (system, non fiable) — appelle l'outil `harness495`, qui n'offre
  aucune clôture.
- **Noyau 495** (system) — inscrit la clôture après avoir vérifié sa provenance, juge chaque rapport
  au regard des réponses et des clôtures, et arrête le changement quand une proposition attend le
  propriétaire.

### 4. Trigger and preconditions [draft]

**Déclencheurs :**
- une question matérielle est posée au propriétaire (IH-01) ;
- le changement est arrêté parce que la spécification perd une réponse ou propose qu'elle ne fixe
  rien d'observable, sans progresser ;
- un rapport de spécification déclare une réponse matérielle `observable: false`.

**Préconditions :**
- le changement est en clarification ;
- la question est matérielle et n'est pas déjà close ;
- la session a un humain qualifié : TUI, ou hôte RPC ou SDK qualifié.

### 5. Main flow and business logic [reviewed]

1. La clarification pose une question matérielle au propriétaire. IH-01 offre trois issues :
   répondre, clore la question parce qu'elle n'est plus matérielle, ou abandonner le changement.
2. Le propriétaire choisit de clore. Le noyau vérifie la provenance de la décision : un humain
   qualifié, ni sortie de modèle ni appel d'outil. Il inscrit la décision, puis la clôture de la
   question sous l'acteur qui l'a donnée.
3. La question close n'est plus posée. Le rapport qui l'avait posée n'est pas réécrit : si toutes
   les autres réponses matérielles sont portées, il devient la base du mandat.
4. Le mandat porte la question comme close, avec l'acteur qui l'a close, même quand le rapport qui
   le fonde ne la pose plus. G0 ne la compte pas comme ouverte.
5. G1 n'exige d'aucune exigence qu'elle porte une question close. Le document des exigences la
   recopie, quand elle a reçu une réponse, comme ne fixant rien d'observable.

Interruption point: entre les étapes 1 et 2. La question est inscrite au journal, et le changement
attend la décision sans limite de temps.

### 6. Alternative flows and exceptions [draft]

6a. **Clôture devant l'arrêt de la spécification** : le changement est arrêté parce que la
spécification perd une réponse sans progresser (e01s02). Le détail de l'arrêt nomme désormais trois
issues : reprendre, abandonner, ou clore la question par `/495 close <question>`. Le propriétaire
clôt la question ; la clôture est inscrite sous son nom, l'arrêt est levé comme par une reprise, et
la clarification continue avec ce qui est acquis. Le rapport arrêté devient la base du mandat s'il
porte toutes les autres réponses. Aucune intervention n'est lancée pour cela.

6b. **Clôture d'une réponse parmi plusieurs perdues** : l'arrêt nomme deux réponses perdues, le
propriétaire en clôt une. La levée vaut reprise : la spécification est réécrite une fois pour
l'autre réponse, puis la borne de progression s'applique comme dans e01s02.

6c. **Proposition « non observable » après une réponse** : le rapport réécrit après une réponse
déclare cette réponse `observable: false`. La réponse compte comme non portée. Le rapport ne gagne
rien sur celui que la réponse a rouvert : le changement s'arrête en clarification, et l'arrêt dit
que le rapport propose que la réponse ne fixe rien d'observable. Aucun mandat n'est proposé.

6d. **Confirmation de la proposition** : devant cet arrêt, le propriétaire clôt la question. Le
rapport arrêté devient la base du mandat, et le changement passe G1 sans qu'aucune exigence ne
porte la réponse.

6e. **Refus de la proposition** : devant cet arrêt, le propriétaire reprend le changement. La
spécification est réécrite, et la demande dit que la réponse est à déclarer. Un rapport qui la lie
à une exigence obligatoire mène le changement au-delà de G1 ; un rapport qui la propose encore non
observable arrête de nouveau le changement.

6f. **Proposition qui remplace une liaison refusée** : un rapport fait passer une réponse d'une
liaison que G1 refuserait à `observable: false`. Ce n'est pas un progrès : la réponse reste non
portée, et le changement s'arrête au lieu d'aller à G1 (le cas de D-37).

6g. **Document d'exigences qui déclare non observable une réponse dont la question n'est pas
close** : G1 le refuse en nommant la réponse. Aucun chemin de la clarification n'y mène plus ; le
refus reste le dernier rempart.

6h. **Clôture par autre chose qu'un humain qualifié** : une clôture portée par un agent, une sortie
de modèle, un appel d'outil ou une origine non authentifiée est refusée, par la même vérification
que celle d'une décision humaine. L'outil `harness495` n'offre aucune clôture.

6i. **Clôture en mode `print` ou `json`** : la session n'a pas d'humain qualifié. `/495 close` le
dit et n'inscrit rien.

6j. **Clôture hors d'atteinte** : `/495 close` est refusée, en le disant, pour une question
inconnue, non matérielle ou déjà close, pour un changement sorti de la clarification, tant qu'une
intervention tourne, ou tant qu'une décision attend le propriétaire. Dans ce dernier cas, la
décision en attente est la voie : IH-01 offre la clôture de sa question.

6k. **Clôture abandonnée à la confirmation** : dans le TUI, `/495 close` demande de confirmer que la
question n'est plus matérielle et que sa réponse ne liera plus aucune exigence. Le propriétaire
renonce : rien n'est inscrit.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  option « Clore : la question n'est plus matérielle » d'IH-01, sous-commande /495 close <question>
Dynamic elements: confirmation de la clôture, détail de l'arrêt qui nomme la clôture et la proposition, mandat qui porte la question close
```

IH-01 affiche trois options au lieu de deux ; la clôture est marquée risquée, comme l'abandon.
`/495 close` suit la forme de `/495 cancel` : liaison exigée, provenance humaine exigée, confirmation
dans le TUI, puis la conduite du changement reprend comme après `/495 resume`. Le détail de l'arrêt
d'une spécification qui ne progresse plus nomme `close` à côté de `resume` et `cancel`, et dit quelle
réponse le rapport propose de ne lier à rien.

### 8. Domain model [draft]

**Entité touchée : la question ouverte du changement.** Elle gagne sa clôture : l'acteur qui l'a
close, l'instant, et la décision humaine quand la clôture vient d'IH-01. Elle reste inscrite comme
posée et matérielle : une question close n'est pas une question oubliée. Qui la lit :
- la clarification, qui ne la pose plus ;
- la situation de la spécification, pour laquelle une question close n'a plus de réponse à porter ;
- G0, qui ne la compte pas comme ouverte ;
- G1, qui n'exige aucune exigence pour elle ;
- le mandat, qui la porte comme close, avec l'acteur ;
- la demande de spécification, qui la dit close au modèle.

**Déclaration d'une réponse par un rapport.** `observable: false` ne porte la réponse que si la
question est close. La réouverture, la mesure de progrès et G1 lisent le même prédicat, comme depuis
e01s01.

**Commande et événement nouveaux :** une clôture de question, et l'événement qui l'inscrit. Deux
points d'entrée, comme l'abandon, qu'IH-01 et `/495 cancel` atteignent tous deux : l'option d'IH-01,
dans la réponse à la décision, et `/495 close`, par une commande du noyau. Les deux inscrivent le
même événement. La provenance est vérifiée par une seule fonction, celle des décisions humaines,
écrite une fois et appelée par les deux ; e01s04 l'appellera pour la révocation. Où l'état naît :
dans l'application de l'événement de clôture au changement. Aucun état de conduite nouveau : la
clôture ne crée ni statut, ni motif d'arrêt, ni cycle de vie ; elle lève l'arrêt existant par la
levée existante.

**Arrêt :** motif existant `stagnation`, levable par une reprise ; son détail nomme la clôture et la
proposition. Aucun motif nouveau.

**Contrats :** aucun schéma changé. Le document des exigences garde son champ `observable`, qui ne
vaut plus `false` que pour une question close par un humain. Le rapport de spécification garde le
sien, qui devient une proposition.

**Entité créée :** aucune. Aucun identifiant de composant nouveau.

**Raison de la profondeur** : la seule abstraction ajoutée est la vérification de provenance tirée
de la réponse à une décision. Elle existe parce qu'une seconde copie, plus faible, est exactement ce
que M3 décrit : le chemin où une vérification moindre décide d'un effet humain.

### 9. Integrations and boundaries [draft]

- **Modèle de l'intervention `specify`, par le worker Pi** (perennial, direction: both) : la consigne
  de son rôle dit que `observable: false` est une proposition que le propriétaire tranche, et sa
  demande dit close une question close. La forme du rapport ne change pas.
- **Commande `/495`** (perennial, direction: in) : sous-commande `close` ajoutée ; `resume` et
  `cancel` ne changent pas.
- **Outil `harness495`** (perennial, direction: in) : inchangé. Un test, qui n'existait pas, épingle
  sa surface et qu'elle n'offre aucune clôture.
- **Dialogue de décision de Pi** (perennial, direction: both) : `ctx.ui.select` affiche une option
  de plus pour IH-01 ; `ctx.ui.confirm` confirme `/495 close`, comme pour `/495 cancel`.

### 10. Background processes [draft]

Not applicable. La clôture a lieu dans une décision ou une commande humaine, pas sur une horloge.

### 11. Notifications [draft]

Not applicable. IH-01 et l'arrêt s'affichent comme aujourd'hui (§7) ; aucune décision nouvelle
n'est ouverte.

### 12. Audit and logging [draft]

**Entité auditée :** le changement. La clôture est inscrite avec la question, l'acteur qui l'a donnée,
l'instant, et la décision humaine quand elle vient d'IH-01 ; celle-ci est aussi enregistrée comme
toute décision, avec son option. Le dossier montre donc la question posée, sa réponse si elle en a
reçu une, qui l'a close, et le mandat qui la porte close. Une clôture refusée pour sa provenance
laisse la décision refusée au journal, comme toute décision refusée.

### 13. Solution variabilities [reviewed]

Not applicable. Aucun réglage : la clôture ne dépend que de la décision du propriétaire.

### 14. Quality attributes *NFR* [draft]

- Réponse matérielle dont la question n'est pas close, adoptée à G1 sans qu'une exigence obligatoire
  la porte : 0.
- Clôture inscrite sans humain qualifié : 0.
- Intervention de spécification lancée par une clôture qui laisse toutes les autres réponses
  portées : 0.
- Question close reposée au propriétaire : 0.

### 15. Security and compliance *NFR* [draft]

- **Menace couverte : M1** du modèle de menace de l'epic. La déclaration « non observable » du
  modèle cesse de suffire à G1 ; seule une clôture humaine dispense une réponse de toute exigence. Un
  test déterministe tient qu'un rapport déclarant « 422 » non observable ne passe plus G1 sans elle,
  et échoue sur le code d'avant.
- **Menace couverte : M3.** La clôture passe par la même vérification de provenance que la réponse à
  une décision, sur trois axes : acteur humain, origine humaine (TUI, RPC ou SDK qualifié),
  authentification autre que `none`. Elle refuse un agent, une sortie de modèle et un appel d'outil.
  L'outil `harness495` n'a pas de clôture. Aucun test n'épingle aujourd'hui sa surface : celui que
  la story écrit la fixe entière, lecture et démarrage seuls, sans décision, adoption ni clôture. En
  mode `print` ou `json`, la clôture est refusée en le disant.
- **M6 :** `/495 close` est refusée tant qu'une intervention tourne ; le rapport en cours ne peut
  donc pas être jugé sur une clôture qu'il n'a pas vue naître.
- **Coût (M7) :** la clôture est une issue de l'arrêt qui ne coûte aucune intervention quand elle
  laisse toutes les autres réponses portées.
- **Classification des données :** inchangée. Le détail de l'arrêt nomme les questions par leur
  identifiant, sans le texte des réponses ; le mandat porte le texte de la réponse, comme aujourd'hui.

### 16. UX and accessibility *NFR* [draft]

- Le propriétaire voit la clôture parmi les issues là où il décide : dans le dialogue d'IH-01 et
  dans le détail de l'arrêt. Il n'a pas à connaître une commande qu'on ne lui nomme pas.
- La confirmation de `/495 close` dit ce que la clôture défait : la réponse ne liera plus aucune
  exigence.
- Langue : les options d'IH-01 et la confirmation suivent la langue de la session, en français et en
  anglais ; le détail de l'arrêt est en anglais, comme les autres arrêts du noyau.

### 17. Acceptance criteria [reviewed]

```
Scenario: Le propriétaire clôt une question matérielle devant IH-01 (étapes 1 à 5)
  Given un rapport qui pose une question matérielle et porte toutes les autres réponses
  When  le propriétaire choisit « clore » dans IH-01
  Then  la décision et la clôture sont inscrites sous son nom
  And   aucune intervention de spécification n'est lancée
  And   le mandat proposé porte la question comme close, avec l'acteur
  And   G0 et G1 passent sans qu'aucune exigence ne porte la question

Scenario: IH-01 offre trois issues (étape 1)
  Given une question matérielle posée au propriétaire
  When  la décision est présentée, en français ou en anglais
  Then  ses options sont répondre, clore et abandonner

Scenario: Le propriétaire clôt la réponse perdue devant l'arrêt (6a)
  Given un changement arrêté parce que la spécification perd une réponse sans progresser
  When  le propriétaire clôt la question par /495 close
  Then  la clôture est inscrite sous son nom
  And   aucune intervention de spécification n'est lancée
  And   le rapport arrêté devient la base du mandat, qui porte la question close
  And   le changement passe G1

Scenario: L'arrêt nomme la clôture parmi ses issues (6a)
  Given un rapport qui perd une réponse sans progresser
  When  le changement s'arrête en clarification
  Then  le détail de l'arrêt nomme resume, cancel et close

Scenario: Clore une réponse parmi deux perdues réécrit une fois pour l'autre (6b)
  Given un changement arrêté sur deux réponses perdues
  When  le propriétaire clôt l'une des deux questions
  Then  une seule intervention de spécification est lancée
  And   sa demande dit la question close et l'autre réponse à déclarer

Scenario: Une réponse déclarée non observable arrête le changement avant G0 (6c)
  Given une réponse matérielle « 422 » enregistrée
  And   un rapport réécrit qui la déclare observable false
  When  le changement avance
  Then  le changement s'arrête en clarification pour stagnation
  And   l'arrêt dit que le rapport propose que la réponse ne fixe rien d'observable
  And   aucun mandat n'est proposé

Scenario: Le même cas sur le code d'avant la story passe G1 (contrôle négatif de M1)
  Given le même déroulé que ci-dessus
  When  il est rejoué sur le code d'avant la story
  Then  G1 passe sans qu'aucune exigence ne porte la réponse « 422 »

Scenario: Le propriétaire confirme la proposition en closant la question (6d)
  Given un changement arrêté sur une réponse que le rapport propose non observable
  When  le propriétaire clôt la question
  Then  le changement passe G1 sans qu'aucune exigence ne porte la réponse
  And   le document des exigences la recopie comme ne fixant rien d'observable

Scenario: Le propriétaire refuse la proposition en reprenant le changement (6e)
  Given un changement arrêté sur une réponse que le rapport propose non observable
  When  le propriétaire le reprend
  Then  une intervention de spécification est lancée, dont la demande dit la réponse à déclarer
  And   un rapport qui la lie à une exigence obligatoire mène le changement au-delà de G1

Scenario: Passer d'une liaison refusée à « non observable » n'est pas un progrès (6f)
  Given un rapport qui lie une réponse à une exigence qu'il ne porte pas
  And   un rapport suivant qui la déclare observable false et ne porte rien d'autre de nouveau
  When  le changement avance
  Then  le changement s'arrête en clarification en nommant la réponse
  And   G0 n'est pas évalué

Scenario: G1 refuse une réponse déclarée non observable dont la question n'est pas close (6g)
  Given un document d'exigences qui déclare non observable une réponse matérielle
  And   une question qui n'est pas close
  When  G1 est évalué
  Then  G1 refuse en nommant la réponse

Scenario: Une clôture qui n'a pas de provenance humaine qualifiée est refusée (6h)
  Given une question matérielle d'un changement en clarification
  When  une clôture est portée par un agent, une sortie de modèle, un appel d'outil ou une origine non authentifiée
  Then  elle est refusée pour sa provenance
  And   la question reste ouverte

Scenario: L'outil exposé au modèle n'offre aucune clôture (6h)
  Given l'outil harness495 enregistré dans Pi
  When  ses opérations sont lues
  Then  aucune ne clôt une question

Scenario: /495 close est refusée en mode print ou json (6i)
  Given une session Pi en mode print ou json liée à un changement arrêté
  When  /495 close est lancée sur la réponse perdue
  Then  la sortie dit qu'une provenance humaine est exigée
  And   rien n'est inscrit

Scenario: /495 close est refusée hors d'atteinte (6j)
  Given une question inconnue, non matérielle ou déjà close, un changement sorti de la clarification, une intervention qui tourne, ou une décision en attente
  When  une clôture est demandée par /495 close
  Then  elle est refusée en disant pourquoi
  And   rien n'est inscrit

Scenario: Renoncer à la confirmation n'inscrit rien (6k)
  Given un changement arrêté et une session TUI
  When  le propriétaire lance /495 close puis refuse la confirmation
  Then  rien n'est inscrit et le changement reste arrêté
```

### 18. Out of scope [draft]

- Révoquer une réponse donnée par erreur, ou une clôture, relève d'e01s04. La vérification de
  provenance tirée ici est celle que la révocation appellera.
- La clôture n'est offerte qu'en clarification. Passé G0, les phases ne reviennent pas en arrière et
  un refus de G1 nomme l'abandon (e01s02) ; ouvrir la clôture après G0 demanderait de réévaluer un
  mandat adopté, ce que l'objet de l'epic ne demande pas.
- Une clôture ne porte pas de motif écrit. Le dossier dit qui a clos, pas pourquoi ; un motif
  demanderait une saisie que ni la capsule ni le modèle de menace ne réclament.
- Aucune décision nouvelle n'est ouverte pour une proposition « non observable » : elle arrête le
  changement par l'arrêt d'e01s02, dont la clôture et la reprise sont les réponses.
- Les schémas du rapport de spécification et du document des exigences ne changent pas.
- La preuve par une campagne réelle, clôture exercée dans Pi comprise, relève d'e01s05.

### 19. Open questions [draft]

Aucune. La capsule fixe le but : la clôture est une décision humaine, offerte devant la question et
devant l'arrêt, portée au mandat, et seule à dispenser une réponse de toute exigence. Le code fixe le
reste :
- l'arrêt d'e01s02 se lève par une commande `/495`, si bien que la clôture devant l'arrêt en est une,
  sur le modèle de `/495 cancel`, qui double déjà l'abandon d'IH-01 ;
- le rapport qui a rouvert la spécification sur une réponse ne peut pas porter cette réponse, donc
  une proposition « non observable » ne peut venir que d'une réécriture, et la borne de progression
  l'arrête sans relance de plus : la proposition atteint le propriétaire par l'arrêt existant ;
- une levée d'arrêt est déjà lue comme un acte humain par la borne de progression, si bien qu'une
  clôture qui lève l'arrêt réécrit au plus une fois ce qui reste perdu.

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` : BES-02 et sa recette.
- `specs/archive/amont/specification-fonctionnelle.md` : IH-01 (issues d'une clarification métier),
  PF-03 (« G0 passe uniquement lorsque les questions matérielles sont closes ou couvertes par un
  mandat préalable »), RM-024 (une sortie d'agent est une proposition, jamais une décision
  normative) et le motif d'arrêt `stagnation`.
- `specs/epics/e01-reponse-humaine-atteint-les-exigences/epic.yaml` : position de la story et
  décision du propriétaire du 2026-09-25.
- `specs/epics/e01-reponse-humaine-atteint-les-exigences/e01s02-une-specification-qui-ne-progresse-plus-arrete-le-changement-avec-un-recours.md` :
  l'arrêt dont la clôture devient la troisième issue, et la borne qui se mesure depuis la dernière
  levée.
- `specs/security/epics/e01/THREAT_MODEL.md` : M1, M3, M6 et M7.
- `specs/adr/D-37-*.md` : le modèle qui fait passer une réponse à `observable: false` pour franchir
  G1.
- `specs/adr/D-52-une-commande-verify-s-ecrit-rouge.md` : pourquoi les commandes du plan échouent au
  moment où elles sont écrites.
- Fichiers touchés : `src/domain/change/state.ts`, `src/domain/change/decide.ts`,
  `src/domain/change/commands.ts`, `src/domain/change/events.ts`, `src/domain/change/apply.ts`,
  `src/application/phases/clarify.ts`, `src/application/phases/specify.ts`,
  `src/application/context.ts`, `src/application/decisions.ts`, `src/application/harness.ts`,
  `src/extension/command.ts`.
