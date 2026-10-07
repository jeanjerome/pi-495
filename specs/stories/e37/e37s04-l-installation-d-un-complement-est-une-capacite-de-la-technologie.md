# Un complément s'installe ou se résout, s'inspecte et se présente au propriétaire par une capacité de sa technologie

Story : e37s04
Epic : e37
Statut : à faire

## 1. Ce que le lecteur gagne

Celui qui ajoute une technologie à 495 y déclare depuis `e37s03` ses contrôles, ses témoins, ses lecteurs et ce
que ses outils laissent dans une copie. Mais s'il recommande un complément, ou propose un référentiel de qualité,
le code générique ne sait l'apporter que par npm ou par Maven :
- **contrat** : le gestionnaire d'une installation est fermé à `npm` et `maven` (`src/contracts/v1/protocol.ts:211`) ;
- **plan et exécution** : la commande, le refus d'un projet verrouillé par un autre gestionnaire, la requête qui dit où le gestionnaire écrit hors de la copie (cache npm, dépôt local Maven) et les variables de la session qu'il lit sont écrits au nom de npm et de Maven (`src/application/installation.ts`) ;
- **inspection** : ce qu'une installation a le droit de laisser est écrit pour `package.json`, `package-lock.json` et `node_modules/`, ou pour le seul `pom.xml` (`installation.ts`) ;
- **forme** : un référentiel s'apporte soit par un greffon Maven déclaré puis résolu dans une copie à part, soit par des paquets npm installés dans la copie (`src/application/phases/quality-referential.ts:73`, `src/application/phases/verification-design.ts:215`) ;
- **présentation** : ce que la question IH-04 dit de l'adoption, en français et en anglais, choisit son texte selon `npm` ou `maven` (`src/application/decisions.ts:329`, `:408`) ;
- **modification d'un fichier** : la modification exacte qu'une recommandation décrit s'applique à `pom.xml` ou, sinon, au `scripts.test` d'un `package.json` (`src/application/complement.ts:109`).

Un complément d'une troisième technologie ne serait jamais proposé : son référentiel est nommé angle mort parce
qu'il « ne peut être déclaré dans sa construction sans ambiguïté ». Et rien n'empêche un module générique
d'importer le dossier d'une technologie, ce que `D-86` (point 3) interdit.

Il gagne une capacité `install`, déclarée dans son dossier comme les autres. Elle dit comment son gestionnaire
apporte un complément, où il écrit hors de la copie, ce qu'il a le droit de laisser et comment le dire au
propriétaire. Le noyau garde ce qui vaut pour toute technologie : le réseau ouvert pour cette seule étape,
l'inspection avant toute adoption, rien d'écrit dans le projet. La Preflight refuse qu'un module générique importe
une technologie.

## 2. Promesses

Scenario: Le référentiel d'une technologie fictive s'apporte par son propre gestionnaire
  Given la technologie fictive, dont le référentiel de qualité `fict-style 1.0.0` s'apporte par son gestionnaire `fictpm`, qui écrit `fict_modules/fict-style/` dans la copie
  And un projet fictif sans contrôle de qualité, et une exigence sur la qualité du code
  When un état des lieux est demandé
  Then une décision IH-04 propose d'adopter le référentiel, et son issue d'adoption porte la phrase que la technologie fictive déclare pour `fict-style 1.0.0`, avec « réseau ouvert pour cette seule étape » et « rien n'est écrit dans le projet »
  When le propriétaire adopte le référentiel
  Then le protocole gelé porte le référentiel adopté avec la date de la décision, et le contrôle `fict-style`
  And les compléments adoptés sont les fichiers que `fictpm` a écrits sous `fict_modules/fict-style/`
  And le projet garde le même digest

Scenario: Ce que l'inspection d'une technologie refuse n'est pas adopté
  Given la technologie fictive, dont le gestionnaire `fictpm` réécrit aussi `src/greeting.txt`, et dont l'inspection n'accepte que des fichiers ajoutés sous `fict_modules/`
  When le propriétaire adopte le référentiel sur un état des lieux
  Then rien n'est adopté : le protocole gelé ne porte ni référentiel ni contrôle `fict-style`
  And l'état des lieux nomme l'exigence comme angle mort, avec la raison que l'inspection de la technologie fictive donne et qui nomme `src/greeting.txt`

Scenario: Le gestionnaire d'une technologie ne lit que ses variables et n'écrit hors de la copie que là où il l'a dit
  Given la technologie fictive, dont le gestionnaire `fictpm` lit `FICTPM_TOKEN` et dit, par une requête, écrire hors de la copie dans un répertoire `fict-store`
  When le propriétaire adopte le référentiel sur un état des lieux
  Then la requête tourne avant l'installation, réseau fermé et sans chemin inscriptible
  And l'installation tourne réseau ouvert, avec pour seuls chemins inscriptibles la copie et le répertoire `fict-store` que la requête a nommé
  And les variables que l'une et l'autre reçoivent de la session sont celles de tout contrôle et `FICTPM_TOKEN`, sans `NPM_TOKEN` ni `JAVA_HOME`

Scenario: Les compléments de Node et de Maven s'apportent et se présentent comme avant
  Given un projet Node et un projet Maven
  When un complément ou un référentiel leur est proposé, adopté, ou refusé par l'inspection
  Then les questions IH-04 portent, en français et en anglais, les mêmes libellés et les mêmes effets qu'avant
  And les commandes, les profils d'exécution, les fichiers adoptés et les raisons d'un refus sont les mêmes qu'avant
  And les deux campagnes de référence restent vertes

Scenario: La Preflight refuse qu'un module générique importe une technologie
  Given un module de `src/adapters/execution/` qui importe `src/adapters/stacks/node/node.ts`
  When la règle des couches est vérifiée
  Then elle échoue en nommant le module et l'import
  And elle échoue de même pour un module de `src/adapters/stacks/maven/` qui importe `src/adapters/stacks/node/`
  And elle laisse passer `src/extension/runtime.ts`, qui monte la liste des technologies de 495

## 3. Sécurité

L'installation d'un complément est la seule étape où 495 ouvre le réseau et laisse écrire hors de la copie. La
story déplace dans la technologie ce que fait son gestionnaire, et laisse au noyau ce qui borne toute installation :
- la requête qui dit où le gestionnaire écrit hors de la copie tourne avant l'installation, réseau fermé, sans chemin inscriptible ;
- l'installation tourne réseau ouvert, avec pour seuls chemins inscriptibles la copie et le répertoire que la requête a nommé ; une technologie qui ne déclare aucune requête n'écrit que dans la copie ;
- une requête qui ne nomme aucun répertoire fait échouer l'installation, comme aujourd'hui ;
- l'environnement reste une liste fermée : les variables de tout contrôle, plus celles, par nom ou par préfixe, que la technologie déclare pour son gestionnaire. npm garde `NPM_ENV_NAMES` et le préfixe `npm_config_`, Maven garde `MAVEN_ENV_NAMES` ;
- l'inspection est obligatoire : une capacité `install` sans inspection ne se déclare pas, et rien n'est adopté avant qu'elle accepte ;
- la copie est listée avant et après l'installation avec les dépendances installées que la technologie déclare, et non plus avec `node_modules` écrit en dur.

Le contrat ouvre le nom du gestionnaire à toute chaîne non vide. Un dossier écrit avant, dont les installations
portent `npm` ou `maven`, se relit à l'identique. Une installation dont aucune technologie de la liste ne déclare
le gestionnaire n'est pas lancée : sa recommandation dit pourquoi, comme aujourd'hui celle d'un projet que npm ne
peut pas étendre.

## 4. Tâches

### Tâche 1 — Le contrat ne ferme plus la liste des gestionnaires

`PackageInstall.manager` (`src/contracts/v1/protocol.ts:211`) devient une chaîne non vide. `npm run contracts`
régénère les schémas publiés qui le portent.

- Vérifie : `node --test test/v0-pure/open-install-contract.test.ts`
- Tient : `test/v0-pure/open-install-contract.test.ts`, « le champ `manager` de l'installation dans `contracts/v1/protocol.json` est une chaîne non vide sans `enum`, `validate(PackageInstall, …)` accepte `fictpm`, et accepte toujours `npm` et `maven` »
- Rouge : le schéma publié énumère `npm` et `maven`, et `validate` refuse `fictpm`

### Tâche 2 — La technologie apporte, inspecte et présente ses compléments

`StackPlugin` (`src/application/stacks/plugin.ts`) gagne une capacité `install`, qui déclare :
- le nom de son gestionnaire ;
- sa forme : installer dans la copie et garder les fichiers que l'inspection accepte, ou résoudre dans une copie à part et ne garder que la modification de fichier de la recommandation ;
- le plan : la commande à lancer, ou la raison de ne pas la lancer, d'après les fichiers de la référence ;
- l'inspection : ce que l'installation a laissé est accepté, avec les fichiers et les paquets ajoutés, ou refusé avec sa raison ;
- les phrases, en français et en anglais, qui disent au propriétaire ce que fait le gestionnaire et ce que l'inspection accepte.

`src/application/installation.ts` ne garde que le déroulement commun : planifier, lister la copie, lancer,
relister, faire inspecter, garder. `bringingOf` (`quality-referential.ts`) et `adoptInstalls`
(`verification-design.ts`) choisissent la forme par la capacité du gestionnaire, et non plus par `npm` ou `maven`.
`ADOPT_COMPLEMENT` et `REFERENTIAL_ADOPTION` (`decisions.ts`) composent les phrases de la capacité avec celles
du noyau. La modification exacte d'un fichier s'applique selon la règle que déclare la technologie qui la
recommande : Node déclare celle de `scripts.test`, et la règle commune remplace une valeur qui apparaît une seule
fois.

- Vérifie : `node --test test/v2-kernel/fictitious-install.test.ts`
- Tient : `test/v2-kernel/fictitious-install.test.ts`, « un état des lieux d'un projet fictif, dont la technologie apporte `fict-style 1.0.0` par `fictpm`, reçoit une décision IH-04 dont l'issue d'adoption porte la phrase de la technologie fictive ; adoptée, le protocole gelé porte le référentiel daté de la décision et le contrôle `fict-style`, les compléments adoptés sont les fichiers de `fict_modules/fict-style/`, et le digest du projet n'a pas changé »
- Rouge : `bringingOf` ne connaît que `maven` et `npm` et rend null pour `fictpm` ; aucune décision IH-04 n'est demandée, et l'état des lieux nomme l'exigence angle mort parce que « the proposed quality referential cannot be adopted on this target: … cannot be declared in its build without ambiguity »

### Tâche 3 — L'inspection de la technologie décide de ce qui est adopté

Le refus que l'inspection de la capacité rend devient la raison de l'échec, écrite au dossier pour ces exigences
comme aujourd'hui (`recordFailedInstall`), et reprise par l'angle mort de l'état des lieux.

- Vérifie : `node --test test/v2-kernel/fictitious-install.test.ts`
- Tient : `test/v2-kernel/fictitious-install.test.ts`, « quand `fictpm` réécrit aussi `src/greeting.txt`, l'adoption du référentiel fictif n'adopte rien : le protocole gelé ne porte ni référentiel ni contrôle `fict-style`, et l'angle mort de l'exigence porte la raison de l'inspection fictive, qui nomme `src/greeting.txt` »
- Rouge : aucune décision IH-04 n'est demandée et rien n'est lancé ; l'angle mort porte « cannot be declared in its build without ambiguity », et non la raison de l'inspection

### Tâche 4 — Le gestionnaire dit où il écrit hors de la copie, et ne lit que ses variables

La capacité `install` déclare, si son gestionnaire écrit hors de la copie, la requête qui le lui demande et la
lecture de sa réponse, et les variables de la session que lit son gestionnaire, par nom ou par préfixe.
`runInstall` reçoit cette déclaration au lieu de la chercher par le nom du programme
(`OUTSIDE_WRITE_QUERIES`). `PhaseContext.localRepository` (`src/application/phases/phase.ts:73`) devient la
demande, à la capacité, du répertoire où son gestionnaire écrit hors d'une copie. L'issue d'adoption d'un
complément nomme ce répertoire quand la technologie dit que ce qui y est écrit reste après un refus, comme
Maven pour son dépôt local. Ce que le gestionnaire affiche est gardé au dossier quand la technologie le
demande, comme Maven pour sa résolution.

- Vérifie : `node --test test/v2-kernel/fictitious-install.test.ts`
- Tient : `test/v2-kernel/fictitious-install.test.ts`, « à l'adoption du référentiel fictif, la requête de `fictpm` tourne réseau fermé et sans chemin inscriptible, puis l'installation tourne réseau ouvert avec pour seuls chemins inscriptibles la copie et le répertoire `fict-store` qu'a nommé la requête ; les deux reçoivent `FICTPM_TOKEN` et aucune de `NPM_TOKEN` ni `JAVA_HOME` »
- Rouge : `bringingOf` rend null pour `fictpm`, aucune décision IH-04 n'est demandée et le moteur d'exécution n'enregistre ni requête ni installation

### Tâche 5 — npm et Maven apportent leurs compléments depuis leur dossier

À comportement constant. Node et Maven déclarent leur capacité `install` dans `src/adapters/stacks/node/` et
`src/adapters/stacks/maven/` :
- le plan, avec les verrous des autres gestionnaires pour npm et `mavenResolutionCommand` pour Maven ;
- la requête du cache npm et celle du dépôt local Maven, avec `readLocalRepository` ;
- `NPM_ENV_NAMES`, le préfixe `npm_config_` et `MAVEN_ENV_NAMES` ;
- l'inspection d'une installation npm, lecture du verrou comprise, et celle d'une résolution Maven ;
- les phrases d'IH-04, à l'identique ;
- pour Node, la modification de `scripts.test`.

`PMD_PLUGIN` et `PMD_PLUGIN_VERSION` rejoignent le dossier de Maven. Les tests qui les importent suivent les
nouveaux chemins sans perdre une assertion.

- Vérifie à la main : `grep -rnE "npm|maven|Maven|mvn|pom\.xml|package-lock|node_modules|\.m2|localRepository" src --include='*.ts'` ne rend plus, hors de `src/adapters/stacks/<technologie>/`, que `src/extension/runtime.ts`, qui monte la liste, les lignes qui parlent du `package.json` de 495 lui-même (`environment.ts`, `review-command.ts`), et des commentaires qui citent Maven ou npm en exemple sans que le code en dépende ; puis `npm run build`, `npm run check` vert avec au moins autant de tests qu'avant, et les deux campagnes de référence (`npm run campagne -- npm`, `npm run campagne -- maven`) vertes
- Tient : la recherche, la Preflight et les deux campagnes ; les tests des questions IH-04 de Node et de Maven et de leurs installations passent sans qu'une de leurs assertions change
- Rouge : la recherche rend aujourd'hui 74 lignes dans `installation.ts`, 42 dans `decisions.ts`, 19 dans `quality-referential.ts`, 10 dans `verification-design.ts`, 3 dans `install-records.ts` et `complement.ts`, 2 dans `protocol.ts` et `phase.ts`, et `harness.ts:296`

### Tâche 6 — La Preflight refuse qu'un module générique importe une technologie

`scripts/check-layers.ts` refuse qu'un module hors de `src/adapters/stacks/<technologie>/` importe un module de
ce dossier, à la seule exception de `src/extension/runtime.ts`. Il refuse aussi qu'un dossier de technologie
importe celui d'une autre. Ce qui est commun aux technologies sous `src/adapters/stacks/`, hors d'un dossier
de technologie, reste importable.

- Vérifie : `node --test test/v0-pure/layer-rule.test.ts`
- Tient : `test/v0-pure/layer-rule.test.ts`, « la règle des couches refuse, en nommant le module et l'import, un module de `src/adapters/execution/` qui importe `../stacks/node/node.ts`, et un module de `src/adapters/stacks/maven/` qui importe `../node/node.ts` ; elle laisse passer `src/extension/runtime.ts` qui importe `../adapters/stacks/maven/maven.ts` »
- Rouge : la couche `adapters` ne s'interdit que `extension/` et `presentation/` ; les deux imports passent et la règle sort en 0

## 5. Hors périmètre

- L'interface publiée (`pi-495/stack`), le test de conformité et l'exemple documenté d'une technologie : `e37s05`.
- Une technologie chargée hors du dépôt de 495 : écartée par `D-86`.
- Un projet qui mêle plusieurs technologies, et dont les compléments relèveraient de deux gestionnaires dans une même adoption : la détection ne reconnaît qu'une technologie par projet.
- La provenance des paquets qu'un gestionnaire télécharge : elle reste celle du gestionnaire et de ses dépôts, comme aujourd'hui.
- Un chemin inscriptible commité en lien symbolique (`T190000`) et la version du JDK dans l'identité de l'environnement (`T210000`) : au registre, hors de cette story.
