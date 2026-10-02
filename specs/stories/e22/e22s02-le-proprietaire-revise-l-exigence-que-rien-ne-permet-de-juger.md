# Le propriétaire révise l'exigence que rien ne permet de juger

Story : e22s02
Epic : e22
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire à qui 495 demande que faire d'une exigence sans test capable de la juger n'a que deux
issues : une préparation de plus, ou juger l'exigence lui-même à l'acceptation. Quand l'exigence est
en cause, parce qu'elle est écrite d'une façon qu'aucun test ne peut trancher, aucune des deux ne la
répare : il doit annuler le changement et le reprendre à zéro pour la reformuler.

Après la story, la demande offre une troisième issue, « réviser l'exigence » : le propriétaire dit en
texte libre ce qu'elle doit devenir, la spécification est refaite avec cette consigne, et il adopte
les nouvelles exigences par le dialogue habituel. La nouvelle formulation reçoit ses propres
préparations avant qu'on lui redemande de trancher.

## 2. Promesses

Scenario: La décision offre la révision de l'exigence, avec un texte libre
  Given une exigence obligatoire qu'aucun test ne discrimine, après deux préparations sans test discriminant
  When la décision IH-04 est demandée
  Then ses options sont « préparer », « assigner à une revue humaine » et « réviser l'exigence », chacune avec son effet
  And la réponse « réviser l'exigence » accepte un texte libre, qui dit ce que l'exigence doit devenir

Scenario: Répondre « réviser l'exigence » rouvre la spécification avec la consigne du propriétaire
  Given une décision IH-04 en attente pour l'exigence R1
  When le propriétaire répond « réviser l'exigence » avec un texte
  Then le changement revient à la spécification, et l'intervention de spécification reçoit ce texte en nommant R1
  And les exigences, le protocole et la préparation adoptés jusque-là ne sont plus en vigueur
  And les exigences refaites sont adoptées par le propriétaire, par la décision d'adoption des exigences, comme toutes les autres

Scenario: La nouvelle formulation reçoit ses deux préparations avant qu'IH-04 soit redemandée
  Given des exigences révisées à la demande du propriétaire, dont une reste sans test capable de la juger
  When la conception de la vérification reprend
  Then deux préparations s'ouvrent pour ces exigences avant qu'une décision IH-04 soit demandée de nouveau
  And cette décision porte la révision des nouvelles exigences, non celle des anciennes

Scenario: Avec un agent scripté déclaré, une exigence réécrite en comportement que la référence a déjà aboutit
  Given un changement dont l'exigence n'est jugeable par aucun test, conduit dans un vrai Pi, et une spécification scriptée qui réécrit cette exigence en comportement que la référence exhibe déjà
  When le propriétaire répond « réviser l'exigence » à la décision IH-04
  Then la spécification est refaite et adoptée, G2 passe avec un contrôle qui porte l'exigence, et le changement atteint un verdict à G5
  And sur la construction d'avant la story, la décision IH-04 ne propose que deux issues et aucune ne rouvre la spécification

## 3. Sécurité

- Provenance : la réponse vient du propriétaire du changement, par le dialogue de Pi, comme celles des
  autres décisions. Son texte est enregistré avec la décision, si bien que la nouvelle formulation se
  relie à ce que le propriétaire a demandé.
- Le texte du propriétaire arrive à l'intervention de spécification dans sa demande, comme les
  réponses aux questions matérielles (`D-37`). Les exigences refaites passent par les mêmes contrôles
  qu'à la première fois, dont G1, et par l'adoption du propriétaire.
- Ce qui borne la boucle : chaque tour de révision suspend le changement et attend une réponse du
  propriétaire, et une formulation qui n'aboutit pas revient à la décision. Aucun compte n'est
  ajouté : `D-37` borne de la même façon la réouverture qui part d'une réponse matérielle.
- Aucun chemin protégé, aucune sandbox ni aucune sortie de données ne sont touchés.

## 4. Tâches

### Tâche 1 — IH-04 offre « réviser l'exigence » et un texte libre

Le constructeur de demandes de décision ajoute l'option « réviser l'exigence » à IH-04, avec son effet,
et autorise le texte libre pour cette réponse.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « the IH-04 request offers prepare, assign_review and revise, and accepts a free text for revise »
- Rouge : `buildDecisionRequest` construit IH-04 avec deux options seulement, et n'autorise le texte libre que pour IH-01, IH-02 et IH-07

### Tâche 2 — La réponse « réviser » rouvre la spécification avec la consigne du propriétaire

Une réponse « réviser l'exigence » ramène le changement à la spécification, invalide ce que les
exigences précédentes avaient adopté, et remet le texte du propriétaire à l'intervention de
spécification en nommant l'exigence.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « given an IH-04 answered revise with a text, then the change is back in specifying, the specification request carries that text and names the requirement, and the requirements, protocol and preparation adopted before no longer hold »
- Rouge : la réponse est enregistrée et rien d'autre ne se passe : le changement reste à la conception de la vérification, et `artifact.revise` exige une révision déjà écrite (`ref`) que le propriétaire ne fournit pas

### Tâche 3 — Les exigences révisées reçoivent leurs deux préparations

Les préparations s'ouvrent depuis la dernière révision des exigences, pas depuis la dernière
révocation : la nouvelle formulation reçoit ses deux tours avant qu'IH-04 soit redemandée.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « given requirements revised at the owner's request and still not judgeable, then two preparations open before IH-04 is asked again, on the revision of the new requirements »
- Rouge : `openPreparation` compte les préparations écrites depuis la dernière révocation d'une question (`proposedSinceRevocation`), et une révision des exigences n'en est pas une : les deux préparations d'avant comptent pour la nouvelle formulation, et IH-04 est redemandée sans qu'aucune préparation s'ouvre

## 5. Hors périmètre

- Une garantie que la formulation refaite soit jugeable : la spécification est un agent, et une
  formulation qui n'aboutit pas revient à la décision, où le propriétaire choisit de nouveau.
- Le propriétaire qui écrit lui-même la nouvelle exigence dans un éditeur : le dialogue de Pi ne
  porte que des options et un texte libre.
- Une IH-04 périmée qui reste répondable après une révision des exigences : `T190000`, au registre.
- Le refus, par le propriétaire, des tests que 495 recommanderait : e12, qui le rangera dans cette même
  décision.
