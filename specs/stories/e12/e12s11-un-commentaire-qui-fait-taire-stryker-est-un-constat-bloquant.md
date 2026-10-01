# Un commentaire qui fait taire Stryker, écrit par le candidat, est un constat bloquant

Story : e12s11
Epic : e12
Statut : versée

## 1. Ce que le lecteur gagne

Stryker ignore les mutants d'une ligne que précède un commentaire `Stryker disable` : le rapport les classe
`Ignored` et le contrôle de mutation de `e12s10` ne leur trouve rien à opposer. Un producteur qui veut passer sans
que ses tests protègent une ligne n'a alors qu'à écrire ce commentaire au-dessus : le candidat est accepté, et le
propriétaire qui lit le dossier voit un contrôle de mutation au vert sur une ligne dont plus rien ne prouve qu'un test
la remarquerait.

Après la story, un tel commentaire, écrit par le candidat dans un fichier de code qu'il introduit, est un constat
bloquant localisé au commentaire. Un commentaire déjà présent avant le changement reste toléré et nommé : il n'est pas
l'œuvre du candidat. Ce que `e12s04` fait pour les commentaires de silence de la couverture, cette story le fait pour
la mutation.

## 2. Promesses

Scenario: Un commentaire de silence de Stryker introduit par le candidat est un constat bloquant
  Given un candidat qui introduit un fichier de code portant « // Stryker disable next-line all », « // Stryker disable » et « /* Stryker disable */ »
  When le contrôle mutation juge le candidat
  Then le verdict est FAIL, avec un constat bloquant localisé à chacun des trois commentaires
  And le constat ne dépend pas du rapport de Stryker : il est rendu même quand le rapport est complet et sans survivant

Scenario: Un commentaire déjà présent avant le changement est toléré et nommé
  Given un fichier de la référence qui porte déjà « // Stryker disable next-line », et un candidat qui le modifie ailleurs
  When le contrôle mutation juge le candidat
  Then ce commentaire n'est pas un constat, et les notes le nomment comme toléré

Scenario: Seul le code introduit est lu
  Given un candidat qui introduit un fichier de test, un fichier de déclaration .d.ts et un README portant chacun « Stryker disable »
  When le contrôle mutation juge le candidat
  Then aucun constat n'est rendu pour ces trois fichiers

Scenario: Un mot voisin n'est pas un commentaire de silence
  Given un candidat qui introduit du code portant « Stryker disabled » dans une chaîne de caractères et « stryker restore » dans un commentaire
  When le contrôle mutation juge le candidat
  Then aucun constat de silence n'est rendu

Scenario: Une directive seule sur sa ligne dans un bloc de commentaire est un constat bloquant
  Given un candidat qui introduit un fichier de code dont un bloc « /* » ouvre une ligne, dont « Stryker disable all » occupe seul la ligne suivante, et que « */ » ferme, au-dessus d'une ligne dont le mutant est ignoré dans un rapport complet et sans survivant
  When le contrôle mutation juge le candidat
  Then le verdict est FAIL, avec un constat bloquant localisé à la ligne de « Stryker disable all », et non à celle de « /* »
  And ce constat est rendu aussi pour un bloc dont la directive est seule sur sa ligne sans « all » ni « next-line »
  And un mot voisin seul sur sa ligne dans le même bloc, « Stryker disabled » ou « stryker restore », n'est pas un constat
  And la même directive seule sur une ligne hors de tout commentaire n'est pas un constat

Scenario: Dans un vrai Pi, le commentaire de silence ne fait plus passer un test sans assertion
  Given une cible Node dont Stryker est installé, et un agent scripté, déclaré comme tel, qui écrit une fonction, un test qui l'appelle sans asserter, et « // Stryker disable next-line all » au-dessus de la ligne
  When le changement est conduit dans un vrai Pi jusqu'à G5
  Then le candidat est refusé par le contrôle mutation, avec un constat à la ligne du commentaire
  And sur la construction de `e12s10`, le même candidat passe le contrôle mutation, le mutant étant ignoré

## 3. Sécurité

- **Chemin protégé.** La story garde ce que le candidat écrit dans un fichier de code qu'il introduit ou modifie. Les
  fichiers de configuration de Stryker sont déjà protégés par `e12s10`.
- **Ce qui est lu.** Les commentaires des fichiers de code que le contrôle mute, lus par blocs entiers et non ligne par
  ligne, dans le candidat gelé, et non un fichier que le producteur écrirait hors du candidat : une directive seule sur
  sa ligne dans un bloc `/* */` est lue, et le constat est localisé à cette ligne ; elle est du candidat quand cette
  ligne est une ligne qu'il a introduite.
- **Ce que la story ne fait pas tenir.** Un commentaire de silence n'est pas le seul moyen de rendre une ligne
  invisible à la mutation : un fichier exclu de la portée par l'emplacement où il est écrit, ou un test qui ne
  s'exécute jamais, ne sont pas examinés ici.

## 4. Tâches

### Tâche 1 — Le lecteur rend un constat bloquant pour un commentaire `Stryker disable` introduit

Pour chaque fichier de code introduit, le lecteur de mutation lit les lignes introduites et rend un constat bloquant,
localisé au commentaire, pour `Stryker disable`, sous ses formes `//` et `/* */`, avec ou sans `next-line` ni `all` ;
un commentaire déjà présent avant le changement est nommé comme toléré, et ni un fichier de test, ni une déclaration,
ni un texte hors du code ne sont lus.

- Vérifie : `node --test test/v1/stryker-mutation.test.ts`
- Tient : `test/v1/stryker-mutation.test.ts`, « given introduced files carrying Stryker disable, Stryker disable next-line and a block comment Stryker disable, then the evidence is FAIL with a blocking finding at each comment even when the report is complete and without survivor, a comment already present before the change is named as tolerated, and a test file, a declaration file, a README and the words Stryker disabled in a string are not read »
- Rouge : le lecteur de mutation de `e12s10` ne lit aucune ligne source : un candidat qui introduit « // Stryker disable next-line all » au-dessus d'une ligne dont les mutants sont ignorés reçoit un PASS

### Tâche 2 — L'exécuteur donne au lecteur les lignes introduites

L'exécuteur générique lit les fichiers de code introduits du candidat gelé et de la référence, comme il le fait pour la
couverture, et les donne au lecteur `stryker-json`.

- Vérifie : `node --test test/v1/control-runner.test.ts`
- Tient : `test/v1/control-runner.test.ts`, « given a mutation control and a candidate whose introduced source carries a Stryker disable comment, and a stand-in for Stryker that writes a complete report with no survivor, then the evidence is FAIL with the finding at the comment »
- Rouge : le cas `stryker-json` de l'exécuteur ne lit que le rapport de Stryker : il ne charge aucune source introduite, si bien que la même exécution rend un PASS

### Tâche 3 — La recette dans un vrai Pi, sur la construction de `e12s10` et sur celle-ci

La recette rejoue, sur la cible de `e12s10`, un agent scripté déclaré comme tel qui écrit un test sans assertion sous
`// Stryker disable next-line all` : le candidat est refusé à la ligne du commentaire. Le contrôle négatif rejoue le même
candidat sur la construction de `e12s10`, où il passe le contrôle mutation.

- Vérifie à la main : rejouer la cible de recette de `e12s10` avec l'agent scripté qui ajoute le commentaire ; lire le dossier, où le candidat est refusé avec un constat à la ligne du commentaire ; rejouer le même candidat sur la construction de `e12s10`, où le contrôle mutation passe
- Tient : `specs/verifications/`, « la preuve de la recette de e12s11 » nomme le dossier lu, le constat et le contrôle négatif
- Rouge : sur la construction de `e12s10`, le candidat qui porte le commentaire passe le contrôle mutation

### Tâche 4 — Le lecteur lit les commentaires par blocs entiers

Le lecteur de mutation repère les commentaires `//` et `/* */` du source dans leur étendue entière, et non ligne par
ligne : une directive `Stryker disable` seule sur sa ligne à l'intérieur d'un bloc `/* */` est un constat bloquant
localisé à la ligne de la directive, tandis que la même ligne hors de tout commentaire, ou portant un mot voisin
(`disabled`, `restore`), n'en est pas un.

- Vérifie : `node --test test/v1/stryker-mutation.test.ts`
- Tient : `test/v1/stryker-mutation.test.ts`, « given an introduced source whose block comment opens on one line, carries Stryker disable all alone on the next line and closes on a third, above a line whose mutant the complete report marks Ignored, then the evidence is FAIL with one blocking finding located at the line of the directive and not at the opening of the block, the same directive alone on a line outside any comment and Stryker disabled alone in a block are not findings, and the directive alone in a block of a file already present before the change is named as tolerated »
- Rouge : `silencingComments` (`src/adapters/execution/lcov.ts`) coupe le source en lignes et applique à chacune le motif de `STRYKER_SILENCING` (`src/adapters/execution/mutation.ts`), qui exige `//` ou `/*` devant `Stryker disable` sur la même ligne : la ligne « Stryker disable all » d'un bloc n'en porte aucun, si bien que le même rapport complet, sans survivant et à mutant ignoré, rend un PASS sans constat (mesuré : verdict PASS, findings vide)

## 5. Hors périmètre

- Les autres façons de rendre une ligne invisible à la mutation : un test qui ne s'exécute jamais, un fichier écrit hors
  de la portée du contrôle.
- Le commentaire d'un outil autre que Stryker, ou d'un autre langage : la couverture a sa liste (`e12s04`), PIT n'a pas de
  commentaire de silence.
- Refuser un commentaire déjà présent avant le changement : il est l'héritage de la cible, nommé et toléré.
- Lire comme une directive une ligne de bloc que précède un astérisque de commentaire de documentation
  (`* Stryker disable all`) : Stryker n'y voit pas la directive, qu'il ne lit qu'au début du commentaire, et la story ne
  promet ni constat ni absence de constat pour elle.
- La lecture des commentaires de silence de la couverture (`e12s04`) : elle garde son motif, qui ne dépend pas d'un
  marqueur de commentaire sur la ligne.
