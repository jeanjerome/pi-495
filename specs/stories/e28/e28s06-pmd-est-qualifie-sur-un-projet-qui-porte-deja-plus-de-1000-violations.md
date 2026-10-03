# PMD est qualifié sur un projet qui porte déjà plus de 1000 violations

Story : e28s06
Epic : e28
Statut : à faire

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-10-03T193000 du registre. Le propriétaire d'un projet Maven ancien, qui demande
à 495 l'état des lieux de sa qualité pour engager une remédiation, voit aujourd'hui G2 refuser cet état des
lieux dès que le projet porte plus de 1000 violations PMD : le lecteur du rapport ne garde que les 1000
premiers constats, le constat que le témoin négatif a écrit dans son propre fichier tombe au-delà, le témoin
négatif est lu PASS, et `pmd` n'est pas qualifié avec la raison « the control does not detect the defect it
claims to cover », qui accuse le capteur alors que PMD a bien détecté le défaut. Le projet le plus chargé de
violations, celui qu'une remédiation vise d'abord, est justement celui qu'on ne peut pas mesurer. Dans
l'autre sens, un constat dans le fichier du témoin positif tombé au-delà de la borne n'est pas vu, et `pmd`
est qualifié alors que son témoin positif le contredit.

Le propriétaire gagne un capteur PMD jugé sur tout ce que le rapport dit des fichiers des témoins, quel que
soit le nombre de violations que le projet porte déjà : qualifié quand PMD détecte le défaut du témoin
négatif et rien dans le témoin positif, refusé sinon, avec la raison vraie.

## 2. Promesses

Scenario: PMD est qualifié quand la violation du témoin négatif vient après 1000 violations du projet
  Given un projet dont le rapport PMD porte 1000 violations dans ses propres fichiers, dans la copie de chaque témoin
  And le rapport de la copie du témoin négatif porte, après ces 1000 violations, une violation dans le fichier que le témoin négatif a écrit
  When le contrôle `pmd` est qualifié par ses témoins
  Then la qualification de `pmd` donne le témoin positif PASS, le témoin négatif FAIL, et la dit qualifiée
  And aucune note de la qualification ne dit que le contrôle ne détecte pas le défaut qu'il prétend couvrir

Scenario: Une violation du témoin positif venue après 1000 violations du projet refuse la qualification
  Given le même projet, dont le rapport de la copie du témoin positif porte, après ses 1000 violations, une violation dans le fichier que le témoin positif a écrit
  And le rapport de la copie du témoin négatif porte une violation dans le fichier du témoin négatif
  When le contrôle `pmd` est qualifié par ses témoins
  Then la qualification de `pmd` donne le témoin positif FAIL et la dit non qualifiée, avec une note « positive witness gave FAIL »

## 3. Sécurité

Sans objet : la qualification lit le même rapport que PMD écrit dans la copie de chaque témoin ; aucun
chemin lu ou écrit, aucun confinement, aucune provenance ni sortie de données ne change.

## 4. Tâches

### Tâche 1 — Les témoins de PMD sont jugés sur tout le rapport

Le jugement des témoins d'un capteur qui situe ses constats (`witnessFindings`,
`src/application/qualification.ts`) lit tout constat que le rapport place dans un fichier d'un témoin, même
au-delà des 1000 premiers que le lecteur garde (`MAX_QUALITY_FINDINGS`, `src/adapters/execution/parsers.ts`) :
les témoins sont jugés avant la coupe, ou les constats situés dans un fichier que l'exécution a introduit
sont gardés au-delà de la borne. Le rouge vient de `steps_to_reproduce` et `evidence` de l'entrée : un
rapport de plus de 1000 constats dont celui du témoin vient en dernier.

- Vérifie : `node --test test/v1-adapters/pmd-witness-past-bound.test.ts`
- Tient : `test/v1-adapters/pmd-witness-past-bound.test.ts`, « pmd est qualifié quand la violation du témoin négatif vient après 1000 violations du projet, sans note disant que le contrôle ne détecte pas le défaut, et ne l'est pas, avec la note positive witness gave FAIL, quand c'est une violation du témoin positif qui vient après elles »
- Rouge : avec un rapport qui porte 1000 violations de `src/main/java/io/h495/Grader.java` puis celle du fichier du témoin négatif, la qualification est [PASS, PASS, non qualifiée], avec la note « negative witness gave PASS: the control does not detect the defect it claims to cover; 1001 findings reduced to the first 1000; … » ; avec la violation du fichier du témoin positif placée après 1000 violations du projet, elle est [PASS, FAIL, qualifiée], sans note (sondé sur `main` à ebf6a20 avec `GenericControlRunner`, `qualifyControl` et le contrôle `pmd-xml` de `test/v1-adapters/pmd-reports.test.ts`)

## 5. Hors périmètre

- Les autres capteurs qui situent leurs constats, `cpd`, ESLint et jscpd, partagent la borne de 1000
  constats ; leur témoin tombé au-delà n'est pas une promesse de cette story.
- La comparaison, à G5, des constats d'un candidat à ceux de la référence quand le rapport dépasse la
  borne : elle n'a pas été tracée et aucune entrée du registre ne la nomme.
- La borne elle-même et la note « findings reduced to the first 1000 » de la preuve, qui restent.
- Les autres défauts ouverts du registre, dont BUG-2026-09-27T170100, qui attend l'epic e13, et
  BUG-2026-10-03T220000 et BUG-2026-10-03T233000, inscrits à part.
