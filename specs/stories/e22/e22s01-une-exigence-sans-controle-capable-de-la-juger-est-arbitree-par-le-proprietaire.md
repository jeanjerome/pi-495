# Une exigence sans contrôle capable de la juger est arbitrée par le propriétaire

Story : e22s01
Epic : e22
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire dont une exigence obligatoire reste sans test capable de la juger voit aujourd'hui le
changement s'arrêter sur « no discriminant test could be prepared after two preparation
interventions », avec pour seule issue d'annuler. Le constat est juste, mais il n'offre aucune voie
de sortie : le diagnostic qui le motive (l'exigence, ce que la référence fait déjà ou non, ce que les
tests en place exécutent) n'est présenté à personne, et le propriétaire n'a ni de quoi essayer une
préparation de plus, ni de quoi dire qu'il jugera cette exigence lui-même.

Après la story, ce blocage devient une décision : le propriétaire voit l'exigence, la lacune et le
risque, et choisit entre une préparation de plus et une acceptation qui repose sur lui pour cette
exigence, le dossier disant laquelle des deux a été prise.

## 2. Promesses

Scenario: Une exigence que deux préparations n'ont pas rendue jugeable ouvre une décision, pas un arrêt
  Given une exigence obligatoire qu'aucun test ne discrimine, et deux préparations qui n'ont retenu aucun test discriminant
  When la conception de la vérification reprend
  Then une décision IH-04 est en attente, qui nomme l'exigence, la lacune lue dans le diagnostic et le risque de laisser l'exigence sans contrôle
  And ses options sont « préparer » et « assigner à une revue humaine », chacune avec son effet
  And le changement n'est pas bloqué sur capability_missing, et aucune obligation n'est encore assignée à une décision humaine

Scenario: Répondre « préparer » accorde une préparation de plus et ne la promet qu'une fois
  Given une décision IH-04 en attente
  When le propriétaire répond « préparer »
  Then une troisième préparation s'ouvre
  And si elle ne retient encore aucun test discriminant, une nouvelle décision IH-04 est demandée au lieu d'une quatrième préparation

Scenario: Répondre « assigner à une revue humaine » fait de l'exigence une décision du propriétaire
  Given une décision IH-04 en attente pour l'exigence R1
  When le propriétaire répond « assigner à une revue humaine »
  Then le protocole gelé porte pour R1 une obligation de combinaison human_decision, assignée à IH-10, et G2 passe
  And le rapport du changement liste « requirement_decided_by_a_human » pour R1 parmi les risques résiduels
  And si les exigences sont révisées ensuite, cette réponse ne vaut plus et IH-04 est demandée de nouveau

Scenario: La ligne d'une exigence décidée par le propriétaire ne porte aucun verdict de contrôle
  Given un protocole dont l'obligation de R1 est une décision humaine assignée à IH-10, et une preuve du contrôle unit qui cite R1 parmi ses exigences
  When le rapport du changement est rendu
  Then la ligne de R1 dit qu'elle est décidée par le propriétaire et ne porte aucun verdict de contrôle, et la ligne d'une exigence portée par des contrôles garde ses verdicts

Scenario: Avec un agent scripté déclaré, le changement sans test discriminant aboutit à une décision et à un rapport qui le dit
  Given un changement dont la préparation scriptée ne retient aucun test discriminant, conduit dans un vrai Pi
  When la décision IH-04 est répondue « assigner à une revue humaine »
  Then le changement atteint G2 puis la décision d'acceptation du candidat, et le rapport nomme l'exigence comme décidée par un humain
  And sur la construction d'avant la story, le même changement s'arrête sur capability_missing avec la seule issue d'annuler

## 3. Sécurité

- Provenance : la réponse à IH-04 vient du propriétaire du changement, par le dialogue de Pi, comme
  celles d'IH-02 et d'IH-10. Aucun agent ne la donne, aucun modèle ne la propose comme fait acquis.
- Ce que le dossier prouve : une exigence assignée à une revue humaine n'est établie par aucune
  mesure. Le rapport la nomme comme telle en risque résiduel, à l'endroit où il liste ce que les
  contrôles n'ont pas établi, jamais dans une note, et sa ligne d'exigence ne reprend pas le verdict
  d'un contrôle qui a passé sur le candidat sans la porter.
- Portée de la réponse : elle porte sur la révision des exigences qui l'a motivée. Une révision des
  exigences la fait tomber, comme les autres décisions attachées à ces exigences.
- Aucun chemin protégé, aucune sandbox ni aucune sortie de données ne sont touchés.

## 4. Tâches

### Tâche 1 — Deux préparations sans test discriminant ouvrent IH-04

La conception de la vérification demande une décision IH-04 au lieu de lever `CAPABILITY_MISSING` après
la deuxième préparation. Le constructeur de demandes de décision sait construire IH-04 : la question
nomme l'exigence, les faits portent la lacune du diagnostic et le risque, et les options sont
« préparer » et « assigner à une revue humaine », avec l'effet de chacune.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « given two preparation interventions that retained no discriminant test, when the verification design resumes, then an IH-04 decision is pending naming the requirement, the gap and the risk, with the options prepare and assign_review, and the change is not blocked »
- Rouge : `openPreparation` lève `CAPABILITY_MISSING` (« no discriminant test could be prepared after two preparation interventions ») avec `cancel` pour seule issue, et `IH-04` est exclu du domaine de `buildDecisionRequest` et de `requestDecision`

### Tâche 2 — « Préparer » accorde une préparation de plus

Une réponse « préparer » à IH-04 lève d'un cran la borne de deux préparations, pour cette décision
seulement. Si la préparation accordée échoue, IH-04 est demandée de nouveau.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « given an IH-04 answered prepare, then a third preparation opens, and when it retains no discriminant test either, then IH-04 is asked again instead of a fourth preparation »
- Rouge : la borne est fixée à deux (`alreadyTried >= 2`) et aucune réponse ne la déplace, si bien qu'une réponse « préparer » n'ouvre aucune préparation

### Tâche 3 — « Assigner à une revue humaine » produit l'obligation et la dit au rapport

Une réponse « assigner à une revue humaine » fait geler, pour l'exigence concernée, une obligation de
combinaison `human_decision` assignée à IH-10. La réponse porte la révision des exigences qui l'a
motivée : une révision les fait tomber. Le rapport liste l'exigence parmi les risques résiduels.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « given an IH-04 answered assign_review, then the frozen protocol holds a human_decision obligation on IH-10 for that requirement, G2 passes and the report lists requirement_decided_by_a_human, and a revision of the requirements asks IH-04 again »
- Rouge : `freeze` donne à chaque obligation les contrôles du protocole en `all_pass` et ne produit jamais `human_decision` ; sans contrôle qui la juge, l'exigence fait échouer G2 avec « has no control and no assigned human decision »

### Tâche 4 — La ligne d'une exigence décidée par le propriétaire ne montre aucun verdict de contrôle

Le rapport lit l'obligation de chaque exigence : quand c'est une décision humaine, sa ligne dit qu'elle
est décidée par le propriétaire au lieu de lister les verdicts des contrôles qui citent l'exigence.

- Vérifie : `node --test test/v0-pure/engineering-report.test.ts`
- Tient : `test/v0-pure/engineering-report.test.ts`, « given a requirement whose obligation is a human decision, when the report is rendered, then its line says it is decided by the owner and carries no control verdict, while a requirement carried by controls keeps its verdicts »
- Rouge : `buildEngineeringReport` construit les contrôles de chaque exigence depuis les preuves qui la citent, sans lire son obligation, si bien que la ligne d'une exigence décidée par un humain affiche `unit=PASS`

## 5. Hors périmètre

- L'issue « réviser l'exigence » : e22s02. La réouverture de la spécification part aujourd'hui d'une
  question matérielle et de sa réponse ; y brancher une réponse à IH-04 est un mécanisme à concevoir,
  et la demande ne l'offre qu'une fois qu'il existe.
- Le refus, par le propriétaire, des tests que 495 recommanderait, et la recommandation elle-même :
  e12, qui rangera ce refus dans cette même décision IH-04.
- Les autres insuffisances d'un oracle (un capteur non qualifié, un contrôle instable) : elles
  gardent leur voie actuelle. La story ne traite que l'exigence obligatoire sans test capable de la
  juger.
- Une consigne libre du propriétaire à la préparation accordée : aucune campagne ne montre qu'elle
  manquerait, et elle ajouterait un champ à la décision.
