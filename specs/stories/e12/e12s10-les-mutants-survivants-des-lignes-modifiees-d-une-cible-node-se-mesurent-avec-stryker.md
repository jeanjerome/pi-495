# Les mutants survivants sur les lignes modifiées d'une cible Node se mesurent avec Stryker quand la cible l'a installé

Story : e12s10
Epic : e12
Statut : à faire

## 1. Ce que le lecteur gagne

La couverture dit qu'une ligne introduite est exécutée, pas qu'un test s'apercevrait si elle changeait : une ligne
exécutée par un test qui n'asserte rien est couverte et sans protection. Pour une cible Maven, 495 pose déjà la
seconde question avec PIT et bloque un changement dont une ligne écrite survit à sa mutation. Pour une cible Node, le
propriétaire n'a rien de tel : `e12s04` mesure la couverture, et les assertions d'une suite ne se mesurent nulle part.

Après la story, une cible Node qui a installé Stryker (`@stryker-mutator/core`) reçoit un contrôle de mutation. Il
lance Stryker sur les seules lignes que le candidat a écrites, avec le lanceur et la configuration que la cible a
choisis, lit le rapport que Stryker écrit, et refuse le candidat dont une ligne écrite survit : le constat nomme le
fichier, la ligne et l'opérateur appliqué. Ce qui survit sur une ligne que le candidat n'a pas écrite n'est jamais
opposé. Une cible sans Stryker reçoit la recommandation de l'installer, et le rapport dit que la mutation n'y est pas
mesurée. Installer Stryker à la place du propriétaire n'est pas dans cette story.

## 2. Promesses

Scenario: Une cible qui a installé Stryker reçoit un contrôle de mutation
  Given une cible Node dont node_modules/@stryker-mutator/core est installé, et dont scripts.test lance node --test
  When la pile est détectée
  Then les contrôles comptent un contrôle mutation qui lance le Stryker installé dans la copie, avec le rapport JSON pour seul rapporteur et un seul processus de test
  And il ne demande que le réseau de bouclage, alors que les autres contrôles de la cible restent sans réseau
  And la mutation n'est pas listée parmi ce que la cible ne mesure pas

Scenario: Une cible sans Stryker reçoit une recommandation et aucun contrôle de mutation
  Given une cible Node sans @stryker-mutator/core dans node_modules
  When la pile est détectée
  Then aucun contrôle mutation n'est déclaré
  And la recommandation de mutation porte l'outil, sa version, la date où elle a été établie, sa source et le changement demandé, et le rapport dit que la mutation n'est pas mesurée et que le complément n'est pas adopté

Scenario: Le contrôle ne mute que les lignes que le candidat a écrites
  Given un candidat qui introduit les lignes 5 et 6 de src/calc.js, la ligne 10 de src/other.mjs, et un fichier de test
  When le contrôle est lancé
  Then Stryker reçoit pour seule portée les plages de lignes introduites de src/calc.js et de src/other.mjs, et aucun fichier de test
  And ce que la même source contient ailleurs n'est pas muté

Scenario: Un chemin que Stryker prendrait pour un motif ne se règle pas en silence
  Given un candidat qui introduit du code dans src/[id].js, puis dans src/a,b.js, puis dans src/!x.js
  When le contrôle est lancé
  Then le verdict est INDETERMINATE et le constat nomme le chemin qui n'a pu être désigné à Stryker
  And Stryker n'est pas lancé pour ce chemin, et le contrôle n'est jamais un succès

Scenario: Un changement sans code muable ne lance pas Stryker
  Given un candidat qui n'introduit qu'un fichier de test, un fichier de déclaration .d.ts et un README, puis la passe sur la référence, où rien n'est introduit
  When le contrôle est lancé
  Then Stryker n'est pas lancé et le verdict est PASS, la note disant que rien n'était à muter

Scenario: Un mutant qui survit sur une ligne introduite bloque le candidat
  Given un rapport Stryker où un mutant de src/calc.js:6 a le statut Survived et un autre de src/calc.js:5 le statut Killed
  When le contrôle juge le rapport
  Then le verdict est FAIL, avec un constat bloquant à src/calc.js:6 qui nomme l'opérateur appliqué
  And le constat de la ligne 5 n'existe pas

Scenario: Un mutant que rien n'exécute bloque aussi, et un mutant tué par expiration est détecté
  Given un rapport où un mutant d'une ligne introduite a le statut NoCoverage, et un autre le statut Timeout
  When le contrôle juge le rapport
  Then le verdict est FAIL, avec un constat bloquant à la ligne du premier qui dit qu'aucun test ne l'exécute
  And le mutant expiré est compté comme détecté et n'a pas de constat

Scenario: Ce qui survit hors des lignes introduites n'est pas opposé au candidat
  Given un rapport où seul un mutant survivant se trouve sur une ligne que le candidat n'a pas écrite
  When le contrôle juge le rapport
  Then le verdict est PASS, et les notes comptent ce survivant comme dette de la source sans l'opposer

Scenario: Un mutant ignoré par la configuration de la cible n'est pas un constat
  Given un rapport où un mutant d'une ligne introduite est ignoré par une exclusion de la configuration de Stryker
  When le contrôle juge le rapport
  Then l'exclusion de la configuration ne donne aucun constat, et le mutant est compté comme ignoré

Scenario: Un mutant que Stryker n'a pu décider ne vaut jamais un succès
  Given un rapport où un mutant d'une ligne introduite a le statut RuntimeError, sans survivant, puis un autre où il a le statut CompileError
  When le contrôle juge chaque rapport
  Then le premier est INDETERMINATE, le mutant étant nommé
  And le second est PASS, le mutant qui n'a jamais tourné étant compté comme exclu

Scenario: Un rapport absent, incomplet, trop grand ou illisible n'est jamais un succès
  Given une exécution dont la suite initiale échoue et n'écrit aucun rapport, puis une exécution arrêtée par son budget, puis un rapport tronqué, puis un rapport dépassant la borne de lecture, puis un rapport valide sans le champ files
  When le contrôle juge chacune
  Then la première est FAIL, la suite du candidat échouant dans la copie gelée, avec la sortie de Stryker au dossier
  And les quatre autres sont INDETERMINATE, avec un motif qui dit ce qui manque

Scenario: Stryker tourne sous le confinement de vérification, avec le seul réseau de bouclage
  Given un programme qui écoute sur toutes les interfaces, comme Stryker le fait, et écrit un rapport sous reports/mutation
  When il est lancé sous le profil du contrôle mutation, puis sous le profil sans réseau des autres contrôles, puis en écrivant un fichier hors de reports/mutation et de .stryker-tmp
  Then la première exécution écrit son rapport
  And la deuxième échoue à écouter, et la troisième échoue à écrire

Scenario: Les sorties de Stryker ne sont pas des changements du candidat
  Given un candidat dont le producteur a lancé Stryker et laissé reports/mutation/ et .stryker-tmp/ dans sa copie
  When le candidat est gelé
  Then ces deux chemins n'y figurent pas, et G4 ne refuse rien pour eux

Scenario: La configuration de Stryker est protégée
  Given un protocole gelé qui porte le contrôle mutation, et un candidat qui modifie stryker.config.mjs, puis un autre qui modifie stryker.conf.json
  When le noyau juge chacun à G4
  Then chacun est refusé, le motif nommant le fichier comme chemin protégé modifié

Scenario: Le contrôle mutation se qualifie sur ses témoins
  Given une cible Node qui a installé Stryker
  When le protocole est conçu
  Then le témoin positif ajoute un module que son test assert entièrement, et le contrôle mutation le juge PASS
  And le contrôle mutation a un témoin négatif propre : un module que son test appelle sans asserter, sur lequel il rend FAIL
  And le contrôle est qualifié sur ces deux témoins avant d'entrer dans le protocole gelé

Scenario: Dans un vrai Pi, un test sans assertion est refusé et un test qui asserte passe
  Given une cible Node dont Stryker est installé, et un agent scripté, déclaré comme tel, qui écrit une fonction dont le test l'appelle sans asserter, puis, à la correction, un test qui asserte
  When le changement est conduit dans un vrai Pi jusqu'à G5
  Then la première tentative est refusée par le contrôle mutation, avec un constat à la ligne du mutant survivant, et la seconde passe ce contrôle
  And sur la construction d'avant la story, le protocole n'a pas de contrôle mutation, et une cible sans Stryker reçoit la recommandation

## 3. Sécurité

- **Sortie de données.** Aucune. Le contrôle mutation est le premier contrôle Node à demander le profil de bouclage
  qui existe déjà pour PIT : il permet à la copie de se joindre elle-même et à rien d’autre. Stryker écoute
  sur toutes les interfaces pour parler à ses processus de test, et sans ce profil il échoue avec `listen EPERM` ; la
  story n'ajoute aucun droit au confinement. Les autres contrôles gardent le réseau fermé.
- **Code de la cible.** Stryker exécute les tests de la cible sur des copies instrumentées de ses sources, dans
  `.stryker-tmp/` sous la copie : du code de la cible s'exécute comme il s'exécute pour le contrôle des tests. Le
  contrôle n'écrit que sous `reports/mutation` et `.stryker-tmp`.
- **Portée.** La portée donnée à Stryker vient du manifeste du candidat et de ses lignes introduites, jamais d'un
  fichier que le producteur écrit. Stryker lit sa portée comme un motif : un chemin qui porte un caractère que Stryker
  interprète (`*`, `?`, `[`, `]`, `{`, `}`, `(`, `)`, `!`, `,`) muterait autre chose ou rien, et une exécution qui ne
  mute rien ressemble à une suite qui tue tout. Un tel chemin rend le contrôle INDETERMINATE.
- **Chemins protégés.** Les fichiers `stryker.conf.*` et `stryker.config.*` sont protégés avec `package.json` : le
  producteur ne peut pas réduire `mutate`, ajouter une exclusion de mutation ou changer le rapporteur.
- **Rapport non fiable.** Le rapport est une sortie du projet jugé : il est lu comme une donnée bornée en taille, et
  un rapport que la lecture ne peut vérifier complet n'est jamais un succès.
- **Ce que la story ne fait pas tenir.** Un commentaire `Stryker disable` que le candidat écrit fait ignorer les mutants
  de sa ligne, et le contrôle ne le voit pas : c'est `e12s11`. Un runner de Stryker qui ne mesure pas la couverture par test classe les
  lignes que rien n'exécute comme survivantes : le constat dit alors « qu'aucun test ne remarque », et non « qu'aucun
  test n'exécute ». 495 ne prétend pas distinguer les deux sans le runner qui le permet.

## 4. Tâches

### Tâche 1 — Le contrat déclare le lecteur `stryker-json`, différentiel

`stryker-json` rejoint la liste des lecteurs du contrat et celle des lecteurs différentiels, qui jugent les lignes
introduites. `npm run contracts` régénère le contrat publié.

- Vérifie : `node --test test/v0/contracts.test.ts`
- Tient : `test/v0/contracts.test.ts`, « given a control declaring the stryker-json parser, then the protocol schema accepts it and the parser is differential »
- Rouge : le schéma du protocole refuse un contrôle dont le lecteur est `stryker-json`, absent de la liste des lecteurs

### Tâche 2 — Le lecteur juge les mutants des lignes introduites

Une fonction pure lit le rapport JSON de Stryker et les lignes introduites : un mutant `Survived` ou `NoCoverage` d'une
ligne introduite est un constat bloquant qui nomme le fichier, la ligne et l'opérateur ; `Killed` et `Timeout` sont
détectés ; `CompileError` est exclu ; `RuntimeError` laisse le verdict INDETERMINATE ; `Ignored` par la configuration
n'est pas un constat ; un mutant hors des lignes introduites est compté comme dette et jamais opposé.

- Vérifie : `node --test test/v1/stryker-mutation.test.ts`
- Tient : `test/v1/stryker-mutation.test.ts`, « given recorded Stryker reports, then a Survived or NoCoverage mutant on an introduced line is a blocking finding naming file, line and operator, Killed and Timeout are detected, CompileError is excluded, RuntimeError leaves the verdict INDETERMINATE, a config-ignored mutant is no finding, and a survivor off the introduced lines is counted as debt and never opposed »
- Rouge : aucun lecteur ne connaît le format de Stryker : `analyzeMutation` ne lit que le XML de PIT, et un rapport Stryker n'y produit ni constat ni verdict

### Tâche 3 — Un rapport qu'on ne peut vérifier complet n'est jamais un succès

Le lecteur rend INDETERMINATE pour un rapport tronqué, sans le champ `files`, ou plus grand que la borne de lecture, et
pour une exécution arrêtée par son budget ; il rend FAIL, avec la sortie de Stryker au dossier, quand la suite initiale
échoue et qu'aucun rapport n'est écrit. Un rapport complet sans mutant sur les lignes introduites est un PASS dont la
note dit que rien n'était à conclure.

- Vérifie : `node --test test/v1/stryker-mutation.test.ts`
- Tient : `test/v1/stryker-mutation.test.ts`, « given no report after a failing initial run, a run ended by its budget, a truncated report, an oversized report and a report without files, then the first is FAIL with the output kept and the four others are INDETERMINATE naming what is missing »
- Rouge : le lecteur de mutation n'a pas de cas pour un rapport JSON : un rapport tronqué n'est reconnu comme incomplet par aucun code et l'exécution passe pour un succès

### Tâche 4 — La portée de Stryker vient des lignes introduites, ou le contrôle dit qu'il ne peut la désigner

Une fonction pure rend, pour les lignes introduites, l'argument de portée de Stryker (`--mutate=` suivi des plages
`fichier:début-fin`, séparées par des virgules, une plage par suite de lignes) en écartant les fichiers de test, les
déclarations `.d.ts` et ce qui n'est pas du code ; un chemin que Stryker lirait comme un motif est refusé en le
nommant, et la portée vide ne lance rien.

- Vérifie : `node --test test/v1/stryker-mutation.test.ts`
- Tient : `test/v1/stryker-mutation.test.ts`, « given introduced lines in two sources, a test, a declaration file and a README, then the scope names the line ranges of the two sources only, and given src/[id].js, src/a,b.js and src/!x.js, then each is refused by name and the verdict is INDETERMINATE »
- Rouge : la portée d'une mutation est calculée pour des classes Java (`mutationScopeOf` ne retient que `.java`) : un candidat qui introduit un `.js` a une portée vide

### Tâche 5 — L'exécuteur lit le rapport de Stryker, et ne lance rien sans portée

L'exécuteur générique traite le lecteur `stryker-json` : il calcule la portée avant de lancer, n'exécute rien quand
elle est vide, ajoute l'argument de portée à la commande figée, lit `reports/mutation/mutation.json` et conserve le
rapport et la sortie au dossier.

- Vérifie : `node --test test/v1/control-runner.test.ts`
- Tient : `test/v1/control-runner.test.ts`, « given a mutation control with the stryker-json parser and a stand-in for Stryker, then the command carries the scope, nothing is spawned for an empty scope, and the report at reports/mutation/mutation.json is read and kept in the record »
- Rouge : `runControl` ne connaît que `pitest-xml` pour une mutation : un contrôle qui déclare `stryker-json` tombe dans le cas par défaut et n'a ni portée, ni lecture de rapport

### Tâche 6 — Le Node d'une cible qui a installé Stryker déclare le contrôle mutation

Quand `node_modules/@stryker-mutator/core` est installé, l'adaptateur déclare le contrôle `mutation` : le Stryker
installé, lancé par le Node de l'hôte, avec `--reporters json` et un seul processus de test ; le profil de bouclage ;
`reports/mutation` et `.stryker-tmp` pour seuls chemins inscriptibles ; un budget propre ; `stryker.conf.*` et
`stryker.config.*` protégés. Sans Stryker, aucun contrôle et une recommandation qui porte l'outil, sa version, sa date,
sa source et le changement.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a target whose node_modules carries @stryker-mutator/core, then the mutation control runs it with the json reporter and one process, asks for the loopback network only, writes reports/mutation and .stryker-tmp only and protects the Stryker configuration files, and given no Stryker, then no mutation control is declared and the recommendation names the tool, its version, its date and its source »
- Rouge : l'adaptateur Node ne déclare aucun contrôle de mutation et ne recommande pas Stryker : une cible qui l'a installé n'a que ses contrôles de test, de couverture et de lint

### Tâche 7 — Les témoins d'un capteur de mutation

Quand Stryker est installé, le témoin positif ajoute un module `.mjs` dont le test asserte tous les résultats, et le
contrôle `mutation` a un témoin négatif propre : un module dont le test appelle la fonction sans asserter.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a target that installed Stryker, then the positive witness adds a module whose test asserts every result and the mutation control has its own negative witness whose test calls the function without asserting »
- Rouge : les témoins de l'adaptateur Node n'ont de témoin propre que pour la couverture : `own_negative_witness` n'a pas d'entrée `mutation`

### Tâche 8 — Stryker tourne sous le confinement de vérification

Le contrôle `mutation` déclaré à la tâche 6 est lancé sous le bac à sable de vérification, contre un programme qui
écoute sur toutes les interfaces et écrit un rapport sous `reports/mutation` : il l'écrit avec le profil de bouclage,
échoue à écouter avec le profil sans réseau, et échoue à écrire hors de ses deux chemins.

- Vérifie : `node --test test/v1/control-runner.test.ts`
- Tient : `test/v1/control-runner.test.ts`, « given the mutation control run under the verification sandbox against a stand-in that listens on 0.0.0.0 and writes a report under reports/mutation, then it succeeds under loopback, fails to listen under the no-network profile, and fails when writing outside reports/mutation and .stryker-tmp »
- Rouge : aucun contrôle Node ne demande le profil de bouclage : le programme de remplacement ne peut pas écouter, et le contrôle `mutation` n'existe pas pour être lancé

### Tâche 9 — Les sorties de Stryker ne sont pas des changements

La politique du workspace exclut `reports/mutation/` et `.stryker-tmp/` de l'inventaire d'une copie : ce sont des
sorties de l'outil, réécrites à chaque exécution, et un candidat qui n'a fait que lancer les contrôles ne doit pas
être refusé pour elles.

- Vérifie : `node --test test/v0/candidate.test.ts`
- Tient : `test/v0/candidate.test.ts`, « given a workspace where Stryker left reports/mutation and .stryker-tmp, then the frozen candidate lists neither, and a reports/ directory holding other files is still listed »
- Rouge : la politique n'exclut que `target/`, `dist/`, `.pi/`, `__pycache__/`, `build/` et les deux dossiers de vitest : un `.stryker-tmp/` laissé dans la copie apparaît au candidat comme des centaines de fichiers ajoutés

### Tâche 10 — Le README dit ce que l'adaptateur Node mesure

La ligne « Node » de la table des piles du README dit qu'une cible qui a installé Stryker reçoit un contrôle de mutation
des lignes introduites, et que sans lui la mutation n'est pas mesurée et 495 recommande de l'installer.

- Vérifie à la main : lire la ligne « Node » de la table des piles dans `README.md`, puis `npm run lint:distribution`
- Tient : la ligne nomme la mutation des lignes introduites et ce qui la demande
- Rouge : la ligne ne dit rien de la mutation d'une cible Node

### Tâche 11 — La recette dans un vrai Pi, avec Stryker installé

La recette conduit une cible Node dont Stryker est installé par son auteur, dans un vrai Pi, avec un agent scripté déclaré
comme tel : une première tentative dont le test appelle la fonction sans asserter, refusée par le contrôle mutation avec
un constat à la ligne survivante, puis une correction dont le test asserte, qui passe. Ses contrôles négatifs : la
construction d'avant la story (le protocole n'a pas de contrôle mutation) et une cible sans Stryker (la recommandation
est au rapport, sans contrôle).

- Vérifie à la main : créer la cible de recette hors du dépôt, dans `~/.495-campagnes`, avec `@stryker-mutator/core` installé par l'auteur de la cible ; lancer la campagne scriptée dans un vrai Pi jusqu'à G5 ; lire le dossier, où la première tentative est refusée à la ligne du mutant survivant, où la seconde passe, et où le protocole porte le contrôle mutation qualifié ; rejouer sur la construction d'avant la story, puis sur une cible sans Stryker
- Tient : `specs/verifications/`, « la preuve de la recette de e12s10 » nomme le dossier lu, le constat de la première tentative, la durée du contrôle et les deux contrôles négatifs
- Rouge : sur la construction d'avant la story, le protocole n'a pas de contrôle mutation et la première tentative n'est pas refusée pour ses assertions

## 5. Hors périmètre

- Installer Stryker à la place du propriétaire, avec le réseau ouvert : le catalogue choisirait alors une version, et
  les deux protections que le propriétaire a écartées pour `e12s08` (une base publique de paquets malveillants, un délai
  d'ancienneté) se rouvrent avec ce choix. Une story à part, une fois celle-ci vérifiée par une exécution réelle.
- Un commentaire `Stryker disable` introduit par le candidat, qui fait ignorer les mutants de sa ligne : `e12s11`.
- Créer ou modifier la configuration de Stryker de la cible : 495 lance Stryker avec la configuration que la cible a, ou
  sans, et Stryker lance alors `npm test` comme sa commande de test.
- Distinguer « aucun test n'exécute cette ligne » de « aucun test ne la remarque » : le statut `NoCoverage` n'existe que
  pour un runner de Stryker qui mesure la couverture par test. Le contrôle juge les deux comme des lignes non protégées
  et le constat dit ce que le rapport dit.
- Un score de mutation opposé au candidat, ou un seuil : ce qui bloque est un mutant survivant sur une ligne écrite,
  jamais un ratio (`QLT-04`). Le seuil `break` que la cible fixerait ne change pas le verdict.
- Un rapport que la configuration de la cible redirige ailleurs que `reports/mutation/mutation.json` : le contrôle ne le
  trouve pas et rend INDETERMINATE, en le disant.
- Le coût d'un contrôle de mutation sur une grosse cible : le budget est celui de PIT, la mesure vient de la recette.
- Un espace de travail (`packages/a/…`) où Stryker est installé dans un paquet et non à la racine : le contrôle cherche
  Stryker à la racine du projet, comme les autres contrôles de la pile Node.
