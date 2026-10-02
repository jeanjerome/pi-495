# Le rapport JUnit se lit avec un analyseur XML et se recompte depuis ses tests

Story : e12s02
Epic : e12
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui lit le verdict d'un contrôle de tests lit des comptes que 495 tire d'un rapport
JUnit avec des expressions régulières, en additionnant les attributs `tests`, `failures`, `errors` et
`skipped` de chaque élément `<testsuite>`. Deux défauts en découlent. Un rapport dont les suites
s'imbriquent compte deux fois les tests de la suite intérieure : le rapporteur `junit` de `node:test`,
sur trois tests répartis dans deux `describe` imbriqués, en fait quatre (défaut enregistré). Et un
attribut que l'émetteur omet ou remplit autrement passe pour un zéro. Le rapport est de plus la sortie
d'un processus que le projet jugé a écrit : lu à coups d'expressions régulières, il n'est ni borné ni
vérifié comme un document.

Après la story, le rapport est lu par un analyseur XML, les comptes viennent des éléments
`<testcase>` eux-mêmes, et un document qui n'est pas du XML lisible, qui dépasse la borne ou qui tente
une expansion d'entités n'est jamais un succès.

## 2. Promesses

Scenario: Un rapport dont les suites s'imbriquent compte chaque test une fois
  Given un rapport JUnit enregistré depuis le rapporteur junit de Node 24.21.0, dont deux suites imbriquées portent trois tests qui passent
  When le contrôle qui le lit rend son évidence
  Then l'évidence dit PASS et ses faits comptent trois tests

Scenario: Les comptes viennent des tests du rapport, pas des attributs de ses suites
  Given un rapport JUnit dont l'élément testsuite déclare tests="0" et n'a pas d'attribut errors, et qui porte deux éléments testcase dont l'un a un enfant failure
  When le contrôle qui le lit rend son évidence
  Then l'évidence dit FAIL en nommant le test en échec
  And ses faits comptent deux tests dont un en échec

Scenario: Les rapports que 495 lisait se lisent de la même façon
  Given des rapports enregistrés depuis vitest 5.0.x, Maven Surefire et mocha 12.0.2, l'un vert, l'un avec un test en échec, l'un avec un test ignoré
  When le contrôle qui les lit rend son évidence
  Then l'évidence dit PASS, FAIL en nommant le test, puis INDETERMINATE en disant qu'un test ignoré n'est pas un succès, comme avant

Scenario: Un document qui déclare une entité externe est lu sans que rien soit résolu
  Given un rapport JUnit vert qui commence par un DOCTYPE à identifiant public et à identifiant système, comme celui de JaCoCo, et un autre dont le DOCTYPE référence une entité externe qui pointe un fichier de la machine
  When le contrôle qui les lit rend son évidence
  Then le premier dit PASS
  And le second ne lit aucun contenu du fichier référencé et n'est pas un succès

Scenario: Un document qui n'est pas du XML lisible n'est jamais un succès
  Given un rapport tronqué, un rapport dont le DOCTYPE déclare des entités qui s'emboîtent, un rapport imbriqué sur deux cent mille niveaux, et un rapport de plus de 16 Mio
  When le programme qui l'a écrit sort avec le code 0, puis avec le code 1
  Then l'évidence dit INDETERMINATE pour le code 0, dans les quatre cas
  And elle dit FAIL pour le code 1, en disant que le rapport n'est pas lisible

## 3. Sécurité

- Le rapport est une entrée non fiable : il est écrit par le processus que le projet jugé a lancé. Il est
  lu par un analyseur qui ignore le DOCTYPE sans résoudre ni entité ni DTD externe, borné en taille avant
  toute lecture, et dont une erreur, y compris de pile sur une imbrication extrême, se rattrape.
- Un document illisible n'est jamais un succès : il donne INDETERMINATE, ou FAIL quand le programme est
  sorti en erreur, comme un rapport absent.
- Une dépendance d'exécution entre dans le paquet : son attribution est dans le NOTICE et sa licence est
  sur la liste permissive (`D-77`).

## 4. Tâches

### Tâche 1 — Le lecteur compte depuis les tests, sur un analyseur XML

`summarizeJUnit` lit chaque document avec l'analyseur XML : chaque `<testcase>` est un test, il est en
échec quand il a un enfant `failure` ou `error`, ignoré quand il a un enfant `skipped`, et une suite
imbriquée n'ajoute rien à ce que ses tests ont déjà compté. Les attributs des suites ne servent plus.

- Vérifie : `node --test test/v1-adapters/junit-reader.test.ts test/v1-adapters/control-runner.test.ts test/v1-adapters/node-stack.test.ts`
- Tient : `test/v1-adapters/junit-reader.test.ts`, « given a report recorded from the node:test junit reporter with two nested suites and three passing tests, then the summary counts three tests », « given a suite declaring tests="0" and two test cases one of which has a failure child, then the summary counts two tests, one failed, and names it » et « given recorded vitest, Surefire and mocha reports, then the counts and the failed case names are those the regular-expression reader gave » ; `test/v1-adapters/control-runner.test.ts` et `test/v1-adapters/node-stack.test.ts` restent verts sans modification
- Rouge : `summarizeJUnit` additionne les attributs `tests` de chaque `<testsuite>` : il rend quatre tests pour le rapport imbriqué de trois, et zéro test pour le rapport dont l'attribut vaut `tests="0"`

### Tâche 2 — Un document hostile ou illisible n'est jamais un succès

Le lecteur borne le document à 16 Mio avant de l'analyser, ne résout aucune entité, rattrape toute erreur
d'analyse, y compris un dépassement de pile, et un document illisible se traite comme un rapport absent :
INDETERMINATE quand le programme sort avec le code 0, FAIL en disant que le rapport n'est pas lisible
quand il sort en erreur.

- Vérifie : `node --test test/v1-adapters/junit-reader.test.ts`
- Tient : `test/v1-adapters/junit-reader.test.ts`, « given a report with a public and a system DOCTYPE, then it is read and no entity is resolved, and one whose DOCTYPE references an external file yields none of that file's content », « given a truncated report, nested entity declarations, two hundred thousand levels of nesting and a report over 16 MiB, then the verdict is INDETERMINATE when the program exits 0 and FAIL saying the report is not readable when it exits with an error »
- Rouge : `parseJUnit` lit un document tronqué comme un rapport sans test et renvoie « JUnit reports contain no test », et aucune borne de taille ne s'applique avant la lecture

### Tâche 3 — La dépendance est déclarée et attribuée

`@rgrove/parse-xml` entre dans `dependencies` à sa dernière version, 5.0.0, et le NOTICE le nomme avec sa
licence (ISC).

- Vérifie à la main : `npm run build`, puis `npm run lint:distribution`
- Tient : `package.json` déclare `@rgrove/parse-xml` à 5.0.0 et le NOTICE le nomme avec sa licence
- Rouge : `package.json` ne déclare que `@xynogen/pix-pretty` et `jiti` comme dépendances d'exécution, et le NOTICE ne nomme pas l'analyseur XML

## 5. Hors périmètre

- Les lecteurs JaCoCo, PIT et le lecteur TAP : ils gardent leurs expressions régulières. JaCoCo et PIT
  lisent des rapports que leurs outils écrivent en un format stable ; aucun défaut n'y est reproduit. Un
  défaut reproduit y aura sa story.
- Les dialectes que 495 ne lit pas encore (jest-junit, gotestsum, PHPUnit, pytest) : chacun demande sa
  propre mesure avant d'être lu. Cette story ne recompte que d'après ce que l'analyseur donne des
  éléments `<testcase>`.
- Le rapport JSON de jest : `e12s03`.
- Le moteur d'analyse des sources : il entre avec la première story qui en a besoin (`D-77`), pas avant.
