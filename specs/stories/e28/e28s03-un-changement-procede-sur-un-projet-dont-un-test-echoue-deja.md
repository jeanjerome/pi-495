# Un changement procède sur un projet dont un test échoue déjà

Story : e28s03
Epic : e28
Statut : versée

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-10-02T200100 du registre. Le propriétaire qui confie à 495 un changement sur
un projet dont un test échoue déjà sur la référence voit aujourd'hui le changement s'arrêter à G2, bloqué
`capability_missing` : « control unit: positive witness gave FAIL, expected PASS », le témoin positif
ayant hérité de l'échec du projet. Aucun changement n'est donc possible sur un projet dont la suite est
rouge, alors que la comparaison des deux passes (VER-08) sait déjà tenir un tel échec pour préexistant,
et que l'état des lieux qualifie déjà son capteur de tests par les cas des témoins. Le propriétaire a
tranché le 2026-10-02 : 495 change un projet dont la suite est déjà rouge ; un test qui échoue déjà est
un constat hérité qui ne bloque pas, un test qui se met à échouer bloque, et un test qui échoue encore
avec un autre message compte comme un constat nouveau.

La même décision rattache à cette correction l'entrée BUG-2026-10-02T190000 : la qualification par les
cas des témoins tient le témoin positif pour PASS dès qu'un cas quelconque du projet passe, même quand
son propre cas ne s'exécute pas. Tant qu'elle ne jugeait que l'état des lieux, la faiblesse était faible ;
une fois que cette lecture juge tout changement, un capteur qui n'a jamais vu passer le cas du témoin
gèlerait un protocole. Le propriétaire gagne un changement conduit jusqu'à son verdict sur un projet
rouge, avec un capteur de tests dont la qualification a vu le cas du témoin passer.

## 2. Promesses

Scenario: Un changement sur un projet dont un test échoue déjà passe G2 et est accepté
  Given un projet Node dont `test/greet.test.js` passe et dont `test/farewell.test.js`, qui attend « Goodbye, x » de `greet("x")`, échoue sur la référence
  And un candidat qui ne change pas ce que rend `greet`
  When le changement est conduit
  Then G2 est PASS et le contrôle `unit` est qualifié
  And la preuve du contrôle `unit` sur le candidat porte un constat `preexisting` qui nomme `test/farewell.test.js`
  And le changement est clos `accepted`

Scenario: Un test qui se met à échouer bloque le changement
  Given le même projet, dont `test/farewell.test.js` échoue sur la référence
  And un candidat qui fait rendre à `greet("x")` autre chose que « Hello, x »
  When le changement est conduit
  Then G5 est FAIL avec la raison « requirement R1: FAIL (unit=FAIL) »
  And la preuve du contrôle `unit` sur le candidat porte un constat `new` qui nomme `test/greet.test.js`

Scenario: Un test qui échoue encore avec un autre message est un constat nouveau
  Given un projet Node dont `test/farewell.test.js` attend « Goodbye, x » de `farewell("x")`, qui rend « Bye, x » sur la référence
  And un candidat qui fait rendre « Ciao, x » à `farewell("x")`
  When le changement est conduit
  Then G5 est FAIL avec la raison « requirement R1: FAIL (unit=FAIL) »
  And la preuve du contrôle `unit` sur le candidat porte un constat `new` qui nomme `test/farewell.test.js`

Scenario: Le témoin positif est jugé par son propre cas
  Given une référence dont `test/greet.test.js` passe et `test/farewell.test.js` échoue
  And un témoin positif dont l'unique cas est sauté
  When le capteur de tests est qualifié par les cas des témoins
  Then le témoin positif n'est pas PASS et le contrôle n'est pas qualifié
  And la qualification porte la note « positive witness gave … »

## 3. Sécurité

Sans objet : la story change ce qui qualifie un capteur et ce qui distingue deux constats, sans toucher
ni provenance, ni confinement, ni secrets, ni sortie de données. Le dernier scénario tient que la
qualification ne se relâche pas : un capteur n'est qualifié que s'il a vu passer le cas du témoin.

## 4. Tâches

### Tâche 1 — Le capteur de tests d'un changement est qualifié par les cas des témoins

G2 qualifie le capteur de tests de tout changement par les cas de ses témoins, comme il le fait déjà pour
un état des lieux, au lieu de réserver cette lecture à l'état des lieux ; un échec du projet présent sur
la référence ne fait plus échouer le témoin positif.

- Vérifie : `node --test test/v2-kernel/change-on-failing-project.test.ts`
- Tient : `test/v2-kernel/change-on-failing-project.test.ts`, « un changement sur un projet dont test/farewell.test.js échoue déjà passe G2, la preuve du contrôle unit porte un constat preexisting qui nomme test/farewell.test.js, et le changement est clos accepted » et « un candidat qui fait échouer test/greet.test.js sur ce projet est refusé à G5 par requirement R1: FAIL (unit=FAIL), avec un constat new qui nomme test/greet.test.js »
- Rouge : `verification-design.ts` passe `by_cases: surveysTheProject(unit.state)`, faux pour un changement : le témoin positif rend le FAIL de toute la course, et le changement s'arrête dans `verification_design`, bloqué `capability_missing`, G2 FAIL avec « control unit: positive witness gave FAIL, expected PASS » (sondé sur `main` à ca8b221)

### Tâche 2 — Le message d'échec d'un test entre dans la comparaison des deux passes

Le lecteur de `node --test` garde, pour un test en échec, le message que le test rapporte, et ce message
entre dans l'identité du constat : un test qui échoue sur les deux passes avec le même message reste
`preexisting`, un test qui échoue avec un autre message est `new`.

- Vérifie : `node --test test/v2-kernel/change-on-failing-project.test.ts`
- Tient : `test/v2-kernel/change-on-failing-project.test.ts`, « un candidat qui fait rendre Ciao, x à farewell, dont le test échouait déjà sur Bye, x, est refusé à G5 par requirement R1: FAIL (unit=FAIL), avec un constat new qui nomme test/farewell.test.js »
- Rouge : `parseNodeTestTap` ne retient d'un test en échec que son nom et son fichier (« farewell says goodbye (test/farewell.test.js) »), sans le message de l'assertion : les deux passes donnent la même empreinte, le constat est `preexisting`, et le changement est clos `accepted` (sondé avec la qualification par les cas forcée)

### Tâche 3 — Le témoin positif est PASS quand son propre cas passe

`witnessCases` tient le témoin positif pour PASS quand un cas passant est rapporté dans un fichier que le
témoin positif a écrit, et non plus quand la course compte un cas passant quelconque.

- Vérifie : `node --test test/v1-adapters/control-runner.test.ts`
- Tient : `test/v1-adapters/control-runner.test.ts`, « un témoin positif dont l'unique cas est sauté, à côté de test/greet.test.js qui passe et de test/farewell.test.js qui échoue, n'est pas un PASS : la qualification est [FAIL, FAIL, non qualifié] et porte la note positive witness gave FAIL »
- Rouge : `witnessCases` rend PASS dès que `positive.facts.pass > 0` sans échec dans les fichiers du témoin positif ; le cas qui passe est celui de `test/greet.test.js`, et la qualification est `[PASS, FAIL, qualified]` (sondé sur `main` à ca8b221)

## 5. Hors périmètre

- Les lecteurs qui ne rapportent pas de cas (`junit-xml` de Maven, vitest et mocha, `jest-json`) : le
  témoin y reste jugé par le verdict de la course, pour un changement comme pour un état des lieux, et un
  projet rouge sous ces lanceurs s'arrête encore à G2. Les y faire lire les cas et les messages est une
  autre story.
- Les contrôles de couverture et de mutation sur un projet rouge : leur qualification n'est pas touchée.
- Les autres défauts ouverts du registre, dont BUG-2026-09-27T170100, qui attend l'epic e13.
