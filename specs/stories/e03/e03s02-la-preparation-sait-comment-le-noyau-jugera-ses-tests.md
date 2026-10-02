# La préparation sait comment le noyau jugera ses tests

Story : e03s02
Epic : e03
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui conduit une campagne sur une cible sans tests — le cas pour lequel la
préparation existe — paie un producteur qui écrit des tests sans savoir avec quelle commande le
noyau les jugera. La préparation s'ouvre avant que le protocole soit gelé, et la consigne de
vérification ne se construit qu'à partir d'un protocole gelé : le producteur de la préparation ne
reçoit ni `mvn -B -q -o test`, ni ce que les autres contrôles liront de son arbre. Celui du candidat
les reçoit ; celui d'une préparation rouverte après un gel aussi. La recette de e03s01 l'a observé
sur la cible Maven, et le défaut est inscrit au registre (`BUG-2026-09-28T222200`).

C'est un défaut et non une préférence : un producteur qui ne connaît pas la commande de son juge se
vérifie au hasard, ou pas du tout, et un test qui ne compile pas sous cette commande fait échouer
la préparation entière. L'epic e03 promet que le mandat est cohérent avec la vérification ; sur son
chemin le plus courant, la vérification n'est pas dite.

## 2. Promesses

Scenario: Le producteur d'une première préparation reçoit la consigne de vérification
  Given une cible Maven sans test pour l'exigence, avec JaCoCo et des frontières d'architecture, et aucun protocole gelé
  When l'intervention de préparation reçoit son contexte
  Then la consigne lui demande de lancer `mvn -B -q -o test` avant de répondre
  And elle nomme coverage et structure avec ce qu'ils lisent, sans leur prêter de commande

Scenario: La consigne vient des contrôles que le noyau a détectés sur la cible
  Given une cible Node sans test, et aucun protocole gelé
  When l'intervention de préparation reçoit son contexte
  Then la consigne nomme la commande du contrôle unit que la détection a produit

Scenario: Une intervention qui ne fait que lire ne reçoit toujours aucune consigne de vérification
  Given le même changement
  When l'intervention de spécification reçoit son contexte
  Then son contexte ne porte aucune consigne « The kernel will judge your work »

## 3. Sécurité

Sans objet : la consigne ajoutée vient de la détection du noyau, contenu de confiance, et ne change
ni la provenance, ni le confinement, ni l'environnement, ni la sortie de données.

## 4. Tâches

### Tâche 1 — La préparation reçoit les contrôles détectés

Quand aucun protocole n'est gelé, le contexte du producteur de la préparation porte la consigne de
vérification construite sur les contrôles que la détection de la cible a produits, dans la forme que
`buildContext` donne déjà à celle du producteur du candidat — la forme Maven, commande lancée et
contrôles lus, est tenue par le test de e03s01 « on a Maven reactor with JaCoCo, the producer is asked
to run mvn -B -q -o test… ». Le test de cette tâche tient l'acheminement : les contrôles détectés
atteignent le contexte de `prepare` avant le gel, et celui de `specify` n'en reçoit aucun.

- Vérifie : `node --test test/v2-kernel/preparation.test.ts`
- Tient : `test/v2-kernel/preparation.test.ts`, « on a target without tests, the preparation producer is told the detected control commands before any protocol is frozen, and the specification producer is told none »
- Rouge : le harnais construit les contrôles du contexte à partir du dernier protocole, absent pendant la préparation ; les consignes de confiance de l'intervention `prepare` ne portent aucune ligne « The kernel will judge your work »

## 5. Hors périmètre

- Quels contrôles un producteur doit lancer lui-même — la mutation compris, qui refait un build
  complet — et si la préparation doit être jugée sur d'autres contrôles que son capteur : e04.
- Les frontières d'architecture portées au producteur de la préparation avant le gel : e04, avec le
  découpage des consignes par phase.
- L'entrée `BUG-2026-09-28T222200` du registre passe `fixed` à la main après le versement, avec le
  commit versé.
