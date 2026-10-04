# Un rapport JUnit au-delà de la borne de lecture n'est pas lu

Story : e28s14
Epic : e28
Statut : à faire

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-09-30T180000 du registre. Le rapport JUnit qu'un contrôle `junit-xml` lit est
une sortie du projet jugé, et le lecteur le borne à 16 Mio (`MAX_REPORT_BYTES`,
`src/adapters/execution/parsers.ts`). Mais `readReports` (`src/adapters/execution/runner.ts`) lit chaque
fichier en entier dans une chaîne, et le runner le range dans le magasin d'objets, avant que la borne ne
s'applique : un rapport de 17 Mio est chargé, gardé comme preuve `report:<chemin>`, puis seulement déclaré
illisible. Un rapport plus gros que ce qu'une chaîne peut tenir fait échouer la lecture, que `readReports`
avale : le contrôle dit alors « no JUnit report found at the declared report path » pour un rapport qui
est bien là.

Le propriétaire qui conduit un changement gagne un 495 qui ne charge pas en mémoire ce que le projet jugé
a choisi d'écrire, et un dossier qui dit la vérité sur ce rapport : il existe, il dépasse la borne, il n'a
pas été lu. C'est un défaut et non une préférence : la borne existe pour que le projet jugé ne décide pas
de la mémoire de 495, et le lecteur de Stryker vérifie déjà la taille du fichier avant de le lire
(`readBoundedReport`).

## 2. Promesses

Scenario: Un rapport JUnit déclaré, plus gros que la borne, est illisible sans être lu
  Given un contrôle `junit-xml` dont `report_path` est `reports/junit.xml`
  And la commande du contrôle sort en 0 et laisse à ce chemin un fichier de `MAX_REPORT_BYTES + 1` octets
  When le runner exécute le contrôle
  Then la preuve est `INDETERMINATE`, avec la note « a JUnit report is not readable » qui nomme `reports/junit.xml`, sa taille en octets et la borne de lecture
  And aucun artefact `report:reports/junit.xml` n'est rangé dans la preuve

Scenario: Un rapport JUnit plus gros qu'une chaîne ne passe pas pour absent
  Given un contrôle `junit-xml` dont `report_path` est `reports/junit.xml`
  And la commande du contrôle sort en 0 et laisse à ce chemin un fichier creux de 3 Gio
  When le runner exécute le contrôle
  Then la preuve est `INDETERMINATE`, avec la note « a JUnit report is not readable » qui nomme `reports/junit.xml` et sa taille de 3221225472 octets
  And aucune note ne dit « no JUnit report found at the declared report path »

Scenario: Un rapport Surefire trouvé par le parcours d'un réacteur, plus gros que la borne, est illisible sans être lu
  Given un contrôle `junit-xml` dont `report_path` est `**/target/surefire-reports`
  And `m/target/surefire-reports/TEST-a.xml` fait `MAX_REPORT_BYTES + 1` octets
  When le runner exécute le contrôle
  Then la preuve est `INDETERMINATE`, avec la note « a JUnit report is not readable » qui nomme `m/target/surefire-reports/TEST-a.xml` et sa taille en octets
  And aucun artefact `report:m/target/surefire-reports/TEST-a.xml` n'est rangé dans la preuve

Scenario: Un rapport JUnit de la taille exacte de la borne est lu comme aujourd'hui
  Given un contrôle `junit-xml` dont `report_path` est `reports/junit.xml`
  And un rapport vert d'un cas, complété par un commentaire XML jusqu'à `MAX_REPORT_BYTES` octets exactement
  When le runner exécute le contrôle
  Then la preuve est `PASS`
  And l'artefact `report:reports/junit.xml` est rangé dans la preuve

## 3. Sécurité

La story touche la sortie du projet jugé que 495 charge : un rapport JUnit au-delà de la borne n'entre plus
ni en mémoire ni dans le magasin d'objets. Le bac à sable, la provenance, les secrets et les chemins
protégés ne changent pas.

## 4. Tâches

### Tâche 1 — La taille d'un rapport JUnit est lue avant son contenu

La lecture des rapports du contrôle `junit-xml` (`readReports` et `readRecursiveReports`,
`src/adapters/execution/runner.ts`) lit la taille de chaque fichier avant de le lire, comme
`readBoundedReport` le fait pour Stryker. Un fichier au-delà de `MAX_REPORT_BYTES` est rendu non lu, avec
son chemin et sa taille ; le runner ne le range pas parmi les artefacts, et `parseJUnit` le juge comme le
rapport illisible qu'il juge aujourd'hui, par la même branche, donc sous la même règle quand la commande
sort en erreur. La lecture des rapports des autres contrôles ne change pas.

- Vérifie : `node --test test/v1-adapters/junit-report-bound.test.ts`
- Tient : `test/v1-adapters/junit-report-bound.test.ts`, « un rapport JUnit de `MAX_REPORT_BYTES + 1` octets à `reports/junit.xml`, ou trouvé sous `**/target/surefire-reports`, donne une preuve `INDETERMINATE` dont la note "a JUnit report is not readable" nomme son chemin et sa taille, sans artefact `report:` pour lui ; un fichier creux de 3 Gio donne la même note avec 3221225472 octets, et non "no JUnit report found at the declared report path" ; un rapport vert de `MAX_REPORT_BYTES` octets exactement donne `PASS` et garde son artefact », monté comme « aggregates Surefire reports from every module in a Maven reactor » de `test/v1-adapters/control-runner.test.ts` (`GenericControlRunner` sur `UnconfinedSandbox` et `CasObjectStore`, commande `node -e process.exit(0)`, `controlOf` et `invocationBase` de `test/helpers/execution-fixture.ts`), le fichier écrit puis porté à sa taille par `truncateSync`
- Rouge : sondé sur `main` à 7fb9249 sous Node 24.21.0 avec ce montage : à 17 Mio, la preuve est `INDETERMINATE` avec la note « a JUnit report is not readable: the report exceeds 16777216 bytes », qui ne nomme ni le chemin ni la taille, et l'artefact `report:reports/junit.xml` (ou `report:m/target/surefire-reports/TEST-a.xml`) est rangé ; à 3 Gio, la note est « no JUnit report found at the declared report path » et aucun artefact n'est rangé

## 5. Hors périmètre

- Les autres contrôles qui passent par la même lecture (Jest, LCOV, JaCoCo, PIT, PMD, CPD, ESLint, jscpd) :
  l'entrée porte sur le lecteur JUnit ; leurs rapports restent lus avant la borne de leur lecteur.
- Une borne sur la somme des rapports d'un parcours de réacteur : chaque fichier est borné, le parcours
  garde ses bornes de 500 fichiers et de 10 000 dossiers.
- Les autres défauts ouverts du registre.
