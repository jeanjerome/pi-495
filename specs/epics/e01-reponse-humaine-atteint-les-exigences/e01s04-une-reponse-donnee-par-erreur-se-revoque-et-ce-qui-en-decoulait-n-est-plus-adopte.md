STORY KEY: e01s04
TITLE:     Révoquer la réponse ou la clôture donnée par erreur à une question matérielle, et défaire ce qui a été adopté sur sa foi
TYPE:      Story
PARENT:    e01
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-28
MATURITY:  4
SIZE:      L

### 1. Business narrative [draft]

Un propriétaire répond « 400 » à une question matérielle alors qu'il voulait « 422 ». Depuis
e01s01, sa réponse atteint les exigences adoptées à G1, puis le protocole gelé à G2 et les contrôles
qui en découlent. La faute de saisie va donc jusqu'au bout : le changement est construit, vérifié et
accepté sur un contrat que son propriétaire n'a pas voulu. Rien ne lui permet de reprendre sa
réponse. Il ne peut qu'abandonner le changement et tout recommencer.

Le noyau sait enregistrer une révocation, mais aucune commande de Pi ne l'atteint. Et même
atteinte, elle ne défait rien pour une réponse : la question reste répondue, le mandat et les
exigences restent adoptés, et le dossier dirait « révoquée » d'une décision dont l'effet tient
toujours.

Le même manque vaut pour une clôture. Depuis e01s03, le propriétaire peut déclarer qu'une question
n'est plus matérielle. S'il s'est trompé, rien ne rouvre la question.

Le résultat attendu : le propriétaire révoque ce qu'il a décidé d'une question matérielle, sa
réponse ou sa clôture, tant que le candidat n'est pas accepté. La question lui est reposée avec
toutes ses issues. Rien de ce qui a été adopté depuis ne reste adopté, et la spécification est
réécrite sur sa nouvelle décision. Une réponse humaine ne cesse de lier que par une décision humaine.
La révocation en est une.

#### ADDED: DEC-06 — Décision humaine et dérogation

Le propriétaire d'un changement peut **révoquer la résolution d'une question matérielle** : la
réponse qu'il lui a donnée, ou la clôture qui l'a déclarée non matérielle, que cette clôture vienne
d'IH-01 ou de `/495 close`. La révocation passe par `/495 revoke <question>`. C'est un acte humain,
inscrit au journal sous l'acteur qui l'a donné. Elle est admise tant que le changement est actif et
que son candidat n'est pas accepté. La question est reposée par IH-01, avec ses trois issues :
répondre, clore, abandonner. La spécification est réécrite après la nouvelle résolution, et aucun
rapport écrit avant la révocation n'est repris.

#### MODIFIED: DEC-06 — Décision humaine et dérogation

**Before:** le noyau enregistre la révocation **d'une décision humaine**, IH-01 comprise, en ne
vérifiant **que l'origine** de l'acteur. Pour une réponse, elle **ne défait rien** : la question
reste répondue, aucune gate n'est retirée, le mandat et les exigences restent adoptés, le changement
reste dans sa phase. Le dossier exporté dit la décision **non révoquée**. **Aucune commande** de Pi
ne l'atteint.

**After:** la seule révocation du noyau porte sur **la résolution d'une question matérielle**. Elle
vérifie la provenance comme une réponse à une décision, sur trois axes. Elle retire la réponse ou la
clôture, révoque la décision qui l'avait donnée, retire G0 et toutes les gates suivantes, et laisse
**aucun artefact adopté**. Elle ramène le changement en clarification et repose la question. Le
dossier exporté comme le rapport disent révoquée toute décision que l'état tient pour révoquée.
`/495 revoke` l'atteint ; l'outil exposé au modèle ne l'atteint pas.

### 2. Value statement [draft]

As a propriétaire d'un changement, I want révoquer la réponse ou la clôture que j'ai donnée par erreur à une question matérielle, tant que le candidat n'est pas accepté, so that la question m'est reposée, que plus rien de ce qui en découlait ne reste adopté, et que le changement se reconstruit sur ce que j'ai réellement décidé sans que je doive l'abandonner.

### 3. Actors and permissions [draft]

- **Propriétaire du changement** (external) : révoque la réponse ou la clôture d'une question
  matérielle (`/495 revoke`), puis résout la question reposée (IH-01). Il doit être un humain
  qualifié : origine TUI ou hôte RPC ou SDK qualifié, authentifié.
- **Modèle de l'intervention `specify`** (system, non fiable) : réécrit la spécification après la
  nouvelle résolution. Il ne révoque rien.
- **Modèle de la session Pi** (system, non fiable) : appelle l'outil `harness495`, qui n'offre aucune
  révocation.
- **Noyau 495** (system) : vérifie la provenance et la portée de la révocation, défait ce qui a été
  adopté depuis G0 et repose la question dans la même décision.

### 4. Trigger and preconditions [draft]

**Déclencheur :** le propriétaire lance `/495 revoke <question>`.

**Préconditions :**
- la question est matérielle et résolue : répondue ou close ;
- le changement est actif et n'a pas atteint l'intégration : son candidat n'est pas accepté ;
- aucune intervention ni aucune vérification ne tourne ;
- la session a un humain qualifié : TUI, ou hôte RPC ou SDK qualifié.

### 5. Main flow and business logic [reviewed]

1. Le propriétaire a répondu « 400 » à la question matérielle Q1. Le changement a passé G2 et
   attend l'acceptation du candidat (IH-10). Le propriétaire lance `/495 revoke Q1`.
2. Dans le TUI, une confirmation dit ce que la révocation défait : la question sera reposée, et le
   mandat, les exigences et tout ce qui a été adopté depuis ne le seront plus. Le propriétaire
   confirme.
3. Le noyau vérifie la provenance par la vérification qu'emploient la réponse à une décision et la
   clôture. Il vérifie aussi la portée (précondition du §4). Il inscrit la révocation sous l'acteur
   qui l'a donnée, et révoque la décision IH-01 qui avait répondu à Q1.
4. Dans la même décision, le noyau défait ce qui a été adopté depuis G0 :
   - G0 et toutes les gates suivantes sont retirées ;
   - le mandat, les exigences, le protocole, la préparation et la conception ne sont plus adoptés,
     et le protocole n'est plus gelé ;
   - les preuves et les relectures sont invalidées ;
   - les décisions humaines enregistrées, hors réponses aux questions, sont révoquées ;
   - les décisions en attente, hors questions, sont retirées ;
   - le changement revient en clarification.
5. Q1 est reposée telle que le journal la tient, par IH-01 et ses trois issues : répondre, clore,
   abandonner. La révocation ne lance aucune intervention.
6. Le propriétaire répond « 422 ». La spécification est réécrite : aucun rapport écrit avant la
   révocation n'est repris, ni ce qu'il déclarait. La demande porte « 422 » comme réponse à déclarer.
   La clarification et les gates suivent ensuite leurs règles, comme après une première réponse : les
   exigences adoptées à G1 lient « 422 » à une exigence du rapport écrit après elle, et le protocole
   est gelé de nouveau à G2 sur ces exigences.

Interruption point: entre les étapes 5 et 6. La question est reposée au journal, et le changement
attend la décision sans limite de temps.

### 6. Alternative flows and exceptions [draft]

6a. **Révocation d'une clôture** : Q1 a été close, par IH-01 ou par `/495 close`. La révocation
retire la clôture et l'acteur qui l'avait donnée, révoque la décision IH-01 quand la clôture en
venait, et défait le reste comme aux étapes 4 et 5. Le mandat proposé ensuite ne porte plus Q1 comme
close tant que le propriétaire ne l'a pas close de nouveau.

6b. **Clôture de la question reposée** : devant IH-01, le propriétaire clôt Q1 au lieu d'y répondre.
La spécification est réécrite comme à l'étape 6, et sa demande dit Q1 close. Aucun rapport écrit
avant la révocation n'est repris : un rapport qui liait Q1 à une exigence tirée de la réponse
révoquée ne fonde pas le mandat.

6c. **Révocation avant G0** : le changement est en clarification, par exemple arrêté parce que la
spécification perd la réponse sans progresser (e01s02). Rien n'est adopté : la révocation lève
l'arrêt et repose Q1.

6d. **Décisions en attente et décisions enregistrées** : une acceptation (IH-10), une adoption
(IH-02) ou une extension de budget (IH-07) attend le propriétaire. Elle est retirée : son sujet
n'existe plus. Les décisions enregistrées autres que les réponses aux questions sont révoquées.
Les réponses aux autres questions matérielles restent enregistrées et valides.

6e. **Une autre question attend sa réponse** : IH-01 est en attente pour Q2 quand Q1 est révoquée.
La décision de Q2 reste en attente, et Q1 est reposée à côté d'elle.

6f. **Révocation par autre chose qu'un humain qualifié** : une révocation portée par un agent, une
sortie de modèle, un appel d'outil ou une origine non authentifiée est refusée pour sa provenance.
Rien n'est inscrit. L'outil `harness495` n'offre aucune révocation.

6g. **Révocation en mode `print` ou `json`** : la session n'a pas d'humain qualifié. `/495 revoke`
le dit et n'inscrit rien.

6h. **Révocation hors d'atteinte** : la révocation est refusée, en disant pourquoi, et rien n'est
inscrit, dans ces cas :
- une question inconnue, non matérielle, ou ni répondue ni close ;
- un changement clos ou annulé ;
- un candidat accepté, dès que le changement est en intégration ;
- une intervention ou une vérification qui tourne ;
- une autre opération 495 qui tient la session.

6i. **Révocation abandonnée à la confirmation** : dans le TUI, le propriétaire refuse la
confirmation. Rien n'est inscrit, et le changement reste tel qu'il était.

### 7. Interface elements [draft]

```
Context: existing
Static elements:  sous-commande /495 revoke <question>, mention de revoke dans l'aide de /495
Dynamic elements: confirmation de la révocation, IH-01 reposée pour la question, statut du changement revenu en clarification
```

`/495 revoke` suit la forme de `/495 close` : liaison exigée, session libre exigée, provenance
humaine exigée, confirmation dans le TUI, puis la conduite du changement reprend et présente la
question reposée. La confirmation dit ce que la révocation défait. Un refus du noyau affiche son code
et son motif, comme pour `/495 close`.

### 8. Domain model [draft]

**Entité touchée : la question ouverte du changement.** Elle perd sa résolution, la réponse ou la
clôture et son acteur, et reçoit l'identifiant de la décision IH-01 qui la repose. Elle reste
inscrite comme posée et matérielle. Le journal garde la réponse ou la clôture révoquée, et la
révocation elle-même : l'historique n'est jamais réécrit, seule la validité courante change.

**Commande et événements nouveaux :**
- une révocation de la résolution d'une question, désignée par la question et non par une décision,
  qui porte la demande IH-01 qui la repose ;
- l'événement qui inscrit la révocation sous l'acteur qui l'a donnée ;
- un retrait de décision en attente.

La révocation, les invalidations, les retraits et la question reposée sont émis dans une seule
décision du noyau. Aucune question révoquée n'est donc inscrite sans la décision qui la repose.

**Point d'entrée.** Un seul : `/495 revoke`, par une méthode du harnais qui construit la demande
IH-01 comme la clarification la construit. La provenance est vérifiée par la fonction qu'emploient
déjà la réponse à une décision et la clôture, sans nouvelle copie. `decision.revoke` disparaît avec
la cause d'invalidation `authorization_revoked`. Cette révocation par décision, que rien n'atteint,
ne vérifiait que l'origine de l'acteur, et la capsule laisse irrévocables depuis Pi les décisions
autres que celles d'une question. Le noyau n'a plus qu'une révocation.

**Ce que la révocation défait.** Ce que défait la révision du mandat (spécification fonctionnelle
§6.4, invalidation conservative) :
- G0 et suivantes ;
- toutes les preuves et relectures valides ;
- toutes les décisions humaines valides hors IH-01 ;
- le retour en clarification.

À cela s'ajoutent :
- le retrait de l'adoption de tout artefact adopté ;
- le protocole gelé ;
- le retrait des décisions en attente hors IH-01.

**Où l'état naît, qui le lit.**
- La résolution retirée naît dans l'application de l'événement de révocation. La clarification, G0,
  G1 et le mandat la lisent, par les prédicats existants (`isQuestionClosed`, réponse nulle).
- La coupure de la spécification ne crée aucun état. Les rapports écrits avant la dernière
  révocation sont lus dans le journal, là où l'historique de la spécification lit déjà quels
  rapports ont suivi le dernier acte humain. La clarification ne les reprend pas comme rapport
  courant, et ni elle ni la spécification n'en héritent.

**Contrats :** aucun schéma ne change. La décision exportée garde son champ `revoked`, qui dit
désormais ce que l'état tient.

**Entité créée :** aucune. Aucun identifiant de composant nouveau.

**Raison de la profondeur** : la seule abstraction ajoutée est le retrait d'une décision en attente.
Elle existe parce qu'une révocation admise pendant qu'une acceptation attend laisserait sinon
présentée au propriétaire une décision sur un candidat que la révocation vient d'invalider.

### 9. Integrations and boundaries [draft]

- **Commande `/495`** (perennial, direction: in) : sous-commande `revoke` ajoutée ; les autres ne
  changent pas.
- **Outil `harness495`** (perennial, direction: in) : inchangé. Le test d'e01s03 qui épingle sa
  surface interdit déjà `revoke`.
- **Dialogue de décision de Pi** (perennial, direction: both) : `ctx.ui.confirm` confirme
  `/495 revoke`, comme `/495 close` ; `ctx.ui.select` présente IH-01 reposée, sans changement.
- **Modèle de l'intervention `specify`, par le worker Pi** (perennial, direction: both) : sa demande
  après une révocation porte la nouvelle résolution et ne dit aucune réponse déjà déclarée par un
  rapport antérieur à la révocation. La forme du rapport ne change pas.
- **Dossier exporté** (perennial, direction: out) : l'index des décisions dit révoquée toute décision
  que l'état tient pour révoquée.

### 10. Background processes [draft]

Not applicable. La révocation a lieu dans une commande humaine, pas sur une horloge.

### 11. Notifications [draft]

Not applicable. La question reposée s'affiche comme toute décision IH-01 ; aucune notification
nouvelle.

### 12. Audit and logging [draft]

**Entité auditée :** le changement. Le journal inscrit la révocation avec la question, l'acteur qui
l'a donnée et l'instant, et la décision IH-01 qu'elle révoque quand il y en a une. Chaque gate
retirée, preuve et relecture invalidée, décision révoquée ou retirée y est inscrite avec son motif.
Le dossier montre la question posée, sa réponse ou sa clôture, sa révocation, puis sa nouvelle
résolution. Le rapport dit « (revoked) » de chaque décision révoquée, et l'index exporté des
décisions la dit `revoked`. Une révocation refusée n'inscrit rien : le refus revient à l'appelant
avec son code et son motif. La story ne change pas ce qu'une décision refusée laisse au journal
(`BUG-2026-09-27T170000`, ouvert).

### 13. Solution variabilities [reviewed]

Not applicable. Aucun réglage : la révocation ne dépend que de la décision du propriétaire.

### 14. Quality attributes *NFR* [draft]

- Artefact adopté, gate retirée ou décision en attente qui subsiste après une révocation, hors
  décisions IH-01 d'autres questions : 0.
- Rapport de spécification écrit avant une révocation, repris ou hérité après elle : 0.
- Révocation inscrite sans humain qualifié : 0.
- Intervention lancée par la révocation elle-même : 0.
- Décision que l'état tient pour révoquée et que le dossier exporté dit non révoquée : 0.

### 15. Security and compliance *NFR* [draft]

- **M3 :** la révocation passe par la vérification de provenance de la réponse à une décision et de
  la clôture, sur trois axes : acteur humain, origine humaine (TUI, RPC ou SDK qualifié),
  authentification autre que `none`. Elle refuse un agent, une sortie de modèle et un appel d'outil.
  `decision.revoke`, qui ne vérifiait que l'origine, disparaît : il ne reste aucune copie plus
  faible. L'outil `harness495` n'a pas de révocation, et le test d'e01s03 qui épingle sa surface
  l'interdit. En mode `print` ou `json`, la révocation est refusée en le disant.
- **M4 :** la révocation part de la question, jamais d'un identifiant de décision fourni par un
  appelant. Elle défait la résolution que la question porte, et révoque la décision IH-01 que le
  noyau a lui-même associée à la question en la posant. Elle ne peut donc défaire ni la mauvaise
  réponse ni aucune.
- **M5 :** l'effet est tenu dans la décision même qui inscrit la révocation : aucune gate, aucune
  adoption, aucune décision en attente n'y survit, hors IH-01 des autres questions. Le rapport et le
  dossier exporté ne disent révoquée qu'une décision que l'état tient pour révoquée.
- **M6 :** la révocation est refusée tant qu'une intervention ou une vérification tourne, et
  `/495 revoke` tant qu'une autre opération 495 tient la session. Aucun rapport n'est donc écrit sur
  la foi d'une réponse déjà révoquée. La story ne présume d'aucun bail entre sessions (e09).
- **Coût (M7) :** la révocation ne lance aucune intervention. La réécriture qui suit la nouvelle
  résolution en lance une, sur l'acte du propriétaire.
- **Classification des données :** inchangée. Le refus nomme la question par son identifiant ; la
  question reposée porte son texte, comme la première fois.

### 16. UX and accessibility *NFR* [draft]

- La confirmation dit ce que la révocation défait avant qu'elle ne soit inscrite.
- Le propriétaire n'a pas à relancer quoi que ce soit : la question reposée lui est présentée dès la
  révocation inscrite.
- Langue : la confirmation et la question reposée suivent la langue de la session, en français et en
  anglais ; les refus du noyau sont en anglais, comme les autres.

### 17. Acceptance criteria [reviewed]

```
Scenario: Révoquer une réponse reporte la question et ne laisse rien d'adopté (étapes 1 à 5)
  Given une réponse « 400 » à Q1 donnée par IH-01
  And   un changement qui a passé G2 et attend l'acceptation de son candidat (IH-10)
  When  le propriétaire révoque la réponse à Q1
  Then  la révocation est inscrite sous son nom et la décision IH-01 qui avait répondu est révoquée
  And   Q1 n'a plus de réponse et une décision IH-01 la repose, avec les issues répondre, clore et abandonner
  And   IH-10 n'est plus en attente
  And   G0 et les gates suivantes sont retirées, et aucun artefact n'est adopté
  And   le changement est en clarification
  And   aucune intervention n'est lancée

Scenario: La nouvelle réponse atteint les exigences et le protocole (étape 6)
  Given une réponse à Q1 révoquée après G2
  When  le propriétaire répond « 422 » à Q1 reposée
  Then  une intervention de spécification est lancée, dont la demande porte « 422 » comme réponse à déclarer
  And   les exigences adoptées à G1 lient « 422 » à une exigence du rapport écrit après elle
  And   le protocole est gelé de nouveau à G2 sur ces exigences

Scenario: Révoquer une clôture rouvre la question (6a)
  Given Q1 close par IH-01, ou par /495 close
  When  le propriétaire révoque la clôture de Q1
  Then  Q1 n'est plus close et une décision IH-01 la repose
  And   la décision IH-01 qui l'avait close est révoquée, quand la clôture en venait

Scenario: Clore la question reposée réécrit la spécification (6b)
  Given une réponse à Q1 révoquée, que le dernier rapport liait à une exigence
  When  le propriétaire clôt Q1 reposée
  Then  une intervention de spécification est lancée, dont la demande dit Q1 close
  And   le mandat proposé porte Q1 close, avec l'acteur

Scenario: Révoquer devant l'arrêt d'une spécification qui ne progresse plus (6c)
  Given un changement arrêté en clarification parce que la spécification perd la réponse à Q1
  When  le propriétaire révoque la réponse à Q1
  Then  l'arrêt est levé et une décision IH-01 repose Q1
  And   aucune intervention n'est lancée

Scenario: Les décisions qui dépendaient de la réponse cessent, les autres réponses restent (6d)
  Given des réponses à Q1 et Q2, et une décision IH-10 en attente
  When  le propriétaire révoque la réponse à Q1
  Then  IH-10 est retirée et les décisions enregistrées autres que les réponses aux questions sont révoquées
  And   la réponse à Q2 et sa décision IH-01 restent enregistrées et valides

Scenario: Une autre question en attente le reste (6e)
  Given une décision IH-01 en attente pour Q2 et une réponse enregistrée pour Q1
  When  le propriétaire révoque la réponse à Q1
  Then  IH-01 est en attente pour Q2 et pour Q1

Scenario: Une révocation qui n'a pas de provenance humaine qualifiée est refusée (6f)
  Given une réponse enregistrée pour Q1
  When  une révocation est portée par un agent, une sortie de modèle, un appel d'outil ou une origine non authentifiée
  Then  elle est refusée pour sa provenance
  And   Q1 reste répondue et rien n'est inscrit

Scenario: L'outil exposé au modèle n'offre aucune révocation (6f)
  Given l'outil harness495 enregistré dans Pi
  When  ses opérations sont lues
  Then  aucune ne révoque

Scenario: /495 revoke est refusée en mode print ou json (6g)
  Given une session Pi en mode print ou json liée à un changement dont Q1 est répondue
  When  /495 revoke Q1 est lancée
  Then  la sortie dit qu'une provenance humaine est exigée
  And   rien n'est inscrit

Scenario: /495 revoke est refusée hors d'atteinte (6h)
  Given une question inconnue, non matérielle ou ni répondue ni close, un changement clos, annulé ou en intégration, une intervention ou une vérification qui tourne, ou une autre opération 495 qui tient la session
  When  une révocation est demandée
  Then  elle est refusée en disant pourquoi
  And   rien n'est inscrit

Scenario: Renoncer à la confirmation n'inscrit rien (6i)
  Given une session TUI liée à un changement dont Q1 est répondue
  When  le propriétaire lance /495 revoke Q1 puis refuse la confirmation
  Then  rien n'est inscrit et le changement reste tel qu'il était

Scenario: Le dossier dit révoquée la décision révoquée (§12)
  Given une réponse à Q1 révoquée
  When  le rapport est produit et le dossier exporté
  Then  le rapport dit la décision IH-01 de Q1 révoquée
  And   l'index exporté des décisions la dit revoked
```

### 18. Out of scope [draft]

- Les autres décisions humaines restent irrévocables depuis Pi : adoptions, dérogations,
  acceptations, autorisations d'intégration (capsule, hors périmètre). Une révocation d'une question
  les révoque par invalidation, jamais sur désignation.
- Une réponse ne se révoque plus une fois le candidat accepté. En intégration, le propriétaire décline
  l'intégration ou annule le changement ; clos, le changement ne rouvre pas.
- Une révocation ne porte pas de motif écrit, pas plus qu'une clôture (e01s03).
- Une révocation ne rend pas le budget de tentatives : le changement reconstruit dépense sur le même
  budget.
- Révoquer une révocation : la nouvelle résolution de la question reposée en tient lieu.
- Ce qu'une décision refusée laisse au journal (`BUG-2026-09-27T170000`) et le verrou de session que
  `/495 verify` prend sans le lire (`BUG-2026-09-27T220000`) restent ouverts. `/495 revoke` lit ce
  verrou avant de le prendre, comme `/495 close`.
- La preuve par une campagne réelle, révocation exercée dans Pi comprise, relève d'e01s05.

### 19. Open questions [draft]

Aucune. La capsule fixe le but : une réponse révoquée ne lie plus rien, la question est reposée avec
toutes ses issues, et ce qui a été adopté sur sa foi cesse de l'être. Le code et les stories
précédentes fixent le reste :
- **La révocation couvre la clôture.** e01s03 §18 renvoie ici la révocation d'une clôture, et le
  propriétaire a accepté e01s03 ainsi. La ligne de la capsule qui limite la révocation aux réponses
  exclut les décisions qu'elle énumère (adoptions, dérogations, autorisations d'intégration), et une
  clôture n'en fait pas partie. Une clôture par `/495 close` n'a pas de décision IH-01 : c'est
  pourquoi la révocation désigne la question, non une décision.
- **La spécification est réécrite après toute révocation.** Le rapport écrit sur la foi de la
  réponse révoquée déclare encore la question liée. Repris, il porterait la nouvelle réponse sur une
  exigence écrite pour l'ancienne, ce qui est le défaut que l'epic ferme. Clore la question reposée
  ne suffit pas non plus : ce rapport garde l'exigence tirée de la réponse révoquée.
- **La question est reposée par la révocation elle-même.** La clarification ne pose que les
  questions du rapport courant, et saute toute question que le journal tient déjà. Reposée plus tard,
  la question dépendrait de ce que le modèle redemande.
- **La révocation est admise jusqu'à la décision, décisions en attente comprises.** Sous une
  politique d'acceptation humaine, le changement attend IH-10 dès que son candidat est vérifié. C'est
  là que le propriétaire voit le contrat qu'il a obtenu. Refuser la révocation pendant une décision
  en attente la rendrait inatteignable au moment où elle sert.

### 20. References [draft]

- `specs/archive/amont/expression-besoins.md` : DEC-06 et sa recette.
- `specs/archive/amont/specification-fonctionnelle.md` : IH-01 (issues d'une clarification
  métier), §6.4 (retours arrière et invalidation conservative), RM-024.
- `specs/epics/e01-reponse-humaine-atteint-les-exigences/epic.yaml` : position de la story, état à
  l'ouverture (« brancher une commande ne suffit donc pas ») et hors périmètre.
- `specs/epics/e01-reponse-humaine-atteint-les-exigences/e01s03-seul-l-humain-declare-qu-une-question-n-est-plus-materielle.md` :
  la clôture, sa vérification de provenance, `/495 close` et le §18 qui renvoie ici la révocation
  d'une clôture.
- `specs/security/epics/e01/THREAT_MODEL.md` : M3, M4, M5, M6 et M7.
- `specs/adr/D-37-*.md`, `specs/adr/D-39-*.md` : les réponses qui atteignent les exigences et les
  liaisons héritées.
- `specs/adr/D-52-une-commande-verify-s-ecrit-rouge.md`,
  `specs/adr/D-63-le-rouge-d-une-tache-est-une-assertion-de-la-story-vue-avant-le-code.md` : la forme
  des tâches et de leur rouge.
- `specs/bugs/registry.yaml` : `BUG-2026-09-27T170000`, `BUG-2026-09-27T220000`.
- Fichiers touchés : `src/domain/change/commands.ts`, `src/domain/change/events.ts`,
  `src/domain/change/decide.ts`, `src/domain/change/apply.ts`, `src/domain/invalidation.ts`,
  `src/application/artifacts.ts`, `src/application/phases/clarify.ts`, `src/application/harness.ts`,
  `src/export/export-service.ts`, `src/extension/command.ts`.
