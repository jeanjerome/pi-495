# L'état des lieux d'une cible Maven mesure l'existant avec ce référentiel et sépare code propriétaire, code généré et dépendances

Story : e10s02
Epic : e10
Statut : à faire

## 1. Ce que le lecteur gagne

Depuis `e10s01`, le propriétaire d'un projet Maven qui adopte le référentiel de qualité reçoit un
état des lieux qui range chaque violation sous la règle qui la mesure. Il ne peut pourtant pas s'en
servir comme point de départ d'une remise aux standards (`QLT-02`). D'abord, une violation dans une
classe que l'annotation `@Generated` déclare générée y figure comme de la dette du code écrit à la
main. Ensuite, rien n'y donne l'étendue des écarts : combien de violations par règle, et dans quel
module. Enfin, l'état des lieux ne dit pas ce que le référentiel n'a pas regardé. PMD ne lit ni les
sources de test (`includeTests` vaut faux par défaut dans `maven-pmd-plugin` 3.28.0), ni les
dépendances, qui sont des artefacts hors de l'arbre, et CPD ne compare que les fichiers d'un même
module (`aggregate` vaut faux). Un état des lieux muet sur ces trois points laisse lire « aucun écart »
là où rien n'a été mesuré.

Avec cette story, l'état des lieux range chaque violation dans le code propriétaire ou dans le code
généré, compte les violations du code propriétaire par règle et par module, et nomme ce que le
référentiel ne mesure pas, chaque point avec sa raison. Le code généré reste mesuré, et ses violations
comptent dans le verdict : une exclusion demande une justification adoptée (`QLT-04`), et une
annotation ne vaut pas décision.

## 2. Promesses

Scenario: Les violations du code généré sont rangées à part
  Given un projet Maven au référentiel adopté, dont une classe écrite à la main a une méthode de complexité cyclomatique 11, une classe marquée `@javax.annotation.processing.Generated` une autre, et deux classes marquées `@jakarta.annotation.Generated` le même bloc de plus de 100 jetons
  When l'état des lieux mesure le projet
  Then le `survey` range la violation de la classe écrite à la main dans le code propriétaire, et celle de la classe marquée dans le code généré
  And la duplication entre les deux classes marquées est rangée dans le code généré
  And la section état des lieux du rapport présente, sous chaque règle, les violations du code propriétaire et celles du code généré séparément

Scenario: Le code généré ne retire rien au verdict
  Given un projet Maven au référentiel adopté dont la seule méthode de complexité cyclomatique 11 est dans une classe marquée `@javax.annotation.processing.Generated`
  When l'état des lieux mesure le projet
  Then le `survey` mesure l'exigence de qualité par `pmd` en FAIL, avec cette violation rangée dans le code généré

Scenario: L'étendue des écarts se lit par règle et par module
  Given un réacteur Maven au référentiel adopté, dont le module `domain` porte une méthode de complexité cyclomatique 11 et une méthode privée jamais appelée, et le module `infrastructure` une méthode de complexité cyclomatique 11
  When le propriétaire demande `/495 report`
  Then la section état des lieux donne, pour chaque règle, le nombre de violations du code propriétaire de chaque module : `CyclomaticComplexity` 1 dans `domain` et 1 dans `infrastructure`, `UnusedPrivateMethod` 1 dans `domain`

Scenario: Ce que le référentiel ne mesure pas est nommé
  Given un projet Maven au référentiel adopté dont le POM déclare la dépendance `org.junit.jupiter:junit-jupiter`
  When le propriétaire demande `/495 report`
  Then la section état des lieux nomme, sous le référentiel adopté, ce qu'il ne mesure pas, chaque point avec sa raison : les sources de test de chaque module, que PMD ne lit pas ; `org.junit.jupiter:junit-jupiter`, dépendance déclarée hors de l'arbre ; la duplication entre deux modules, que CPD ne compare pas

## 3. Sécurité

Le rangement par périmètre lit les sources de la copie de la référence où les contrôles ont tourné,
sans rien y écrire et sans ouvrir le réseau. Il ne retire aucune violation de la preuve, du verdict ni
du rapport : une classe écrite à la main que l'on marque `@Generated` montre toujours ses violations,
sous le code généré, et le contrôle reste en FAIL. Une annotation ne fait donc disparaître aucun
constat (`QLT-04`). Ce que le référentiel ne mesure pas est déclaré par l'adaptateur Maven à partir
des POM, comme le référentiel lui-même (`D-25`). Aucun fichier de l'arbre analysé ne peut l'étendre
ni le réduire.

## 4. Tâches

### Tâche 1 — L'adaptateur Maven dit ce que son référentiel mesure et ce qu'il ne mesure pas

Avec le référentiel proposé, l'adaptateur Maven déclare son périmètre :
- les sources principales de chaque module, qui sont mesurées ;
- les annotations qui marquent un fichier généré : `javax.annotation.Generated`,
  `javax.annotation.processing.Generated` et `jakarta.annotation.Generated` ;
- ce qui n'est pas mesuré, avec sa raison : les sources de test de chaque module, chaque dépendance
  déclarée hors des profils (par son groupId et son artifactId, sauf les modules du réacteur), et la
  duplication entre deux modules.

Aucune table centrale ne nomme ces annotations.

- Vérifie : `node --test test/v1-adapters/maven-quality-perimeter.test.ts`
- Tient : `test/v1-adapters/maven-quality-perimeter.test.ts`, « la détection d'un projet Maven sans PMD déclare avec le référentiel proposé les sources principales de chaque module comme mesurées, les trois annotations Generated comme marques du code généré, et comme non mesurées ses sources de test, org.junit.jupiter:junit-jupiter et la duplication entre deux modules, chacune avec sa raison »
- Rouge : `qualityOffer`, dans `src/application/stacks/maven.ts`, rend `{ kind: "proposed", rules, recommendation }`, et rien n'y nomme un périmètre. `pomIdentity` ne garde des dépendances que leur artifactId, et seulement pour reconnaître les modules du réacteur.

### Tâche 2 — L'état des lieux range chaque violation dans son périmètre

Le `survey` range chaque violation du référentiel adopté dans le code propriétaire ou dans le code
généré. Un fichier est généré quand un de ses types de premier niveau porte une des annotations que
l'adaptateur déclare, écrite qualifiée ou importée. Une duplication est rangée dans le code généré
quand tous ses emplacements le sont, et dans le code propriétaire sinon. Le verdict de chaque
contrôle reste celui de sa preuve.

- Vérifie : `node --test test/v2-kernel/quality-baseline-perimeter.test.ts`
- Tient : `test/v2-kernel/quality-baseline-perimeter.test.ts`, « la violation d'une classe écrite à la main est rangée dans le code propriétaire et celle d'une classe marquée Generated dans le code généré », « une duplication entre deux classes marquées Generated est rangée dans le code généré » et « une méthode trop complexe dans la seule classe générée laisse l'exigence de qualité mesurée par pmd en FAIL, la violation rangée dans le code généré »
- Rouge : `SurveyFinding`, dans `src/domain/survey.ts`, ne porte que `message`, `path` et `rule_id`, et `surveyOf` n'y ajoute rien. La violation d'une classe marquée `@Generated` ne se distingue pas de celle d'une classe écrite à la main.

### Tâche 3 — Le rapport sépare les périmètres, compte par module et nomme ce qui n'est pas mesuré

Sous chaque règle du référentiel adopté, la section état des lieux du rapport sépare les violations
du code propriétaire de celles du code généré. Elle compte les violations du code propriétaire par
module. Elle nomme aussi ce que le référentiel ne mesure pas, avec ses raisons. Le texte le dit en
anglais et en français.

- Vérifie : `node --test test/v2-kernel/quality-baseline-report.test.ts`
- Tient : `test/v2-kernel/quality-baseline-report.test.ts`, « sous chaque règle, le rapport sépare les violations du code propriétaire de celles du code généré », « le rapport d'un réacteur de deux modules compte CyclomaticComplexity 1 dans domain et 1 dans infrastructure, UnusedPrivateMethod 1 dans domain » et « le rapport nomme sous le référentiel adopté les sources de test, org.junit.jupiter:junit-jupiter et la duplication entre modules comme non mesurées, avec leur raison, en anglais et en français »
- Rouge : `referentialSection`, dans `src/application/report.ts`, ne rend sous chaque règle que `{ message, path }`. Le texte de `formatReport` n'a donc ni périmètre, ni compte par module, ni liste de ce que le référentiel ne mesure pas.

## 5. Hors périmètre

- La gravité d'une violation. Les cinq règles PMD du référentiel ont toutes la priorité 3 dans PMD
  7.17.0 (mesuré dans `category/java/design.xml` et `bestpractices.xml`), si bien que la lire ne
  sépare rien. Une gravité propre à 495 serait un seuil inventé : elle reste au propriétaire, avec la
  priorisation des écarts (`e10s05`).
- Du code tiers recopié dans les sources d'un module, ou du code généré sans l'annotation (comme un
  fichier qui ne porte qu'un commentaire d'en-tête « DO NOT EDIT »), est compté comme code
  propriétaire. De même pour une méthode marquée `@Generated` dans une classe écrite à la main. Les
  déclarer autrement est une exclusion qui demande une justification adoptée (`QLT-04`) ; sa forme
  revient au propriétaire, avec les exceptions de `e10s06`.
- Retirer le code généré de la mesure ou du verdict : ce serait une exclusion, que cette story ne fait
  pas.
- Mesurer les sources de test ou la duplication entre modules (`pmd:aggregate-cpd`) changerait
  l'oracle du référentiel adopté. Ces points sont nommés comme non mesurés, pas mesurés.
- Un fichier que PMD ne sait pas analyser rend toujours tout le contrôle INDETERMINATE. Le présenter
  comme une part non mesurée, le reste du contrôle concluant, est un choix entre deux comportements
  défendables, et il revient au propriétaire.
- Les constats qu'aucun outil ne mesure mécaniquement, à confier à une revue avec leurs limites
  (`QLT-02`) : un état des lieux n'ouvre aucune intervention (`e29`).
- La même séparation pour une cible Node : `e10s03`.
