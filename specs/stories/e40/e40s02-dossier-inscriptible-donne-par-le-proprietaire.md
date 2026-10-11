# Le propriétaire donne à un contrôle un dossier inscriptible de la copie, créé par le contrôleur, et un lien ou un fichier du candidat fait refuser au lieu d'élargir

Story : e40s02
Epic : e40
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui fait juger une cible dont les tests écrivent dans un dossier du projet peut donner ce dossier au
contrôle qui les lance, y compris au contrôle de tests que la technologie détecte. Aujourd'hui, seul un contrôle
déclaré reçoit des chemins inscriptibles. Le 11 octobre, les tests préparés de pi-495 ont échoué sans assertion,
`EPERM … mkdir '<copie>/test-output'`, et aucune campagne n'a atteint G2 : le contrôle `unit` détecté n'écrit nulle part.

Le droit essayé ce jour-là a été retiré, parce qu'il s'élargissait au gré du candidat. `profileFor` accorde un chemin
par son chemin réel dès que celui-ci reste dans la copie. Un candidat qui commite `test-output` comme lien vers `.`
rendait donc toute la copie inscriptible, et un lien vers `src` rendait `src` inscriptible. Le droit doit rester celui
que le propriétaire a écrit : le contrôleur crée le dossier, et un lien ou un fichier posé à sa place fait refuser le
contrôle (`D-90`).

## 2. Promesses

Scenario: Le propriétaire donne un dossier de la copie à un contrôle détecté ou déclaré, et la définition figée le porte
  Given une configuration du contrôleur qui donne `test-output/` au contrôle `unit`, détecté par la technologie, et `.lint-cache/` à un contrôle `lint-own` qu'elle déclare
  When le protocole est figé à G2
  Then la définition figée de `unit` porte `test-output/` parmi ses chemins inscriptibles, et celle de `lint-own` porte `.lint-cache/`

Scenario: Le contrôleur crée le dossier inscriptible avant que le contrôle tourne
  Given un contrôle à qui `test-output/` est inscriptible, et une copie où `test-output` n'existe pas
  When le contrôle écrit un fichier directement dans `test-output/`, sans créer le dossier
  Then le fichier est écrit, et l'évidence du contrôle est PASS

Scenario: Un lien posé sur un chemin inscriptible ou au-dessus fait refuser le contrôle sans rien accorder
  Given un contrôle à qui `test-output/` est inscriptible, et une copie où `test-output` est un lien vers `.`, vers `src`, vers un dossier hors de la copie ou vers un chemin absent, ou bien où le contrôle reçoit `out/test-output/` sous un `out` lien vers `.`
  When le contrôle est lancé
  Then aucune commande ne tourne, rien n'est créé, et l'évidence du contrôle est INDETERMINATE avec une note qui nomme le chemin et le lien

Scenario: Un fichier posé à la place d'un dossier inscriptible fait refuser le contrôle
  Given un contrôle à qui `test-output/` est inscriptible, et une copie où `test-output` est un fichier ordinaire
  When le contrôle est lancé
  Then aucune commande ne tourne, et l'évidence du contrôle est INDETERMINATE avec une note qui nomme le chemin et dit qu'un fichier s'y trouve

## 3. Sécurité

Le confinement d'écriture se resserre. Les dossiers que le propriétaire donne à un contrôle se lisent dans la
configuration du contrôleur, hors de la copie, et sont figés avec le protocole à G2, comme `suite_paths` : rien dans la
copie du candidat ne les ajoute ni ne les élargit, et une configuration changée après le gel ne modifie pas le contrôle
figé.

Aucun droit ne s'accorde plus par la cible d'un lien. Le contrôle est refusé avant tout processus quand un chemin
inscriptible, ou un dossier de la copie qui y mène, est un lien. La règle vaut quel que soit l'auteur du chemin :
propriétaire, technologie ou déclaration. Peu importe aussi où mène le lien : dans la copie, hors d'elle ou nulle part.
Ni la cible du lien ni son parent ne sont créés. Cela ferme `test-output -> .`, qui ouvrait toute la copie, et
`test-output -> src`, qui ouvrait un dossier jugé. Un fichier posé là où le contrôle reçoit un dossier fait refuser de
même. Un contrôle refusé ne prouve rien : son évidence INDETERMINATE ne passe aucune porte.

Ce qui reste comme aujourd'hui :
- une écriture faite par un lien posé à l'intérieur du dossier est jugée sur le chemin où elle aboutit, par Seatbelt,
  et par bubblewrap qui ne monte que ce dossier en écriture ;
- un dossier au-dessus de la copie peut être un lien, `/var` vers `/private/var` par exemple, puisque le candidat n'y
  touche pas.

## 4. Tâches

### Tâche 1 — La configuration du contrôleur donne un dossier à un contrôle, figé avec le protocole

Ajouter `policy.writable_paths`, un objet qui associe à l'identifiant d'un contrôle les dossiers de la copie que le
propriétaire lui donne. Le champ va dans le schéma de `src/contracts/v1/config.ts` et dans `ActivePolicy` de
`src/domain/policy.ts`, vide par défaut, et `npm run contracts` régénère le contrat. Dans
`src/application/project-controls.ts`, `withSuitePaths`, pour les contrôles détectés, et `projectControlsOf`, pour les
contrôles déclarés, ajoutent ces dossiers aux chemins inscriptibles du contrôle qui porte cet identifiant, sans
doublon. Une clé qui ne nomme aucun contrôle de la cible n'ajoute rien : la configuration sert toutes les cibles. Le
test, dans `test/v2-kernel/preparation.test.ts`, mène jusqu'au gel du protocole un harnais dont la politique donne
`test-output/` à `unit` et `.lint-cache/` à un contrôle `lint-own` qu'elle déclare.

- Vérifie : `node --test test/v2-kernel/preparation.test.ts`
- Tient : `test/v2-kernel/preparation.test.ts`, « les contrôles figés portent les dossiers que la configuration du contrôleur leur donne : test-output/ pour unit, détecté, et .lint-cache/ pour lint-own, déclaré »
- Rouge : la politique ignore `writable_paths`. `withSuitePaths` n'ajoute que `suite_paths` à la commande, et `projectControlsOf` ne lit que la déclaration ; le `unit` figé ne porte pas `test-output/`, ni `lint-own` `.lint-cache/`.

### Tâche 2 — Le contrôleur crée le dossier inscriptible avant l'exécution

Dans `GenericControlRunner.runControl` (`src/adapters/execution/runner.ts`), un chemin inscriptible qui n'est pas parmi
les fichiers du profil est créé comme dossier avant que la commande tourne. Le contrôleur crée aujourd'hui seulement
son parent. Les fichiers du profil gardent leur traitement : le parent est créé, le fichier non. Le test lance, sous
`UnconfinedSandbox`, un contrôle à qui `test-output/` est inscriptible, dans une copie sans `test-output`. La commande
est `node -e` qui écrit `test-output/f` sans créer le dossier.

- Vérifie : `node --test test/v1-adapters/control-writable-directory.test.ts`
- Tient : `test/v1-adapters/control-writable-directory.test.ts`, « un contrôle qui écrit un fichier directement dans test-output/, absent de la copie, le trouve créé par le contrôleur et son évidence est PASS »
- Rouge : `runControl` crée `dirname` du chemin, c'est-à-dire la copie ; `test-output` n'existe pas, l'écriture échoue sur `ENOENT`, et l'évidence est FAIL.

### Tâche 3 — Un lien sur un chemin inscriptible ou au-dessus fait refuser le contrôle

Avant de créer quoi que ce soit, `runControl` examine chaque chemin inscriptible qui mène dans la copie, sans suivre
de lien : le chemin lui-même et chaque dossier entre la copie et lui. Si l'un d'eux est un lien, le contrôle est
refusé. Aucun processus ne tourne et aucun dossier n'est créé. L'évidence est INDETERMINATE, avec une note qui nomme le
chemin relatif à la copie et le lien. Le test pose, chaque fois dans une copie neuve :
- `test-output` lien vers `.` ;
- `test-output` lien vers `src` ;
- `test-output` lien vers un dossier existant hors de la copie ;
- `test-output` lien vers un chemin absent ;
- `out` lien vers `.`, sous un contrôle qui reçoit `out/test-output/`.

La commande écrit un fichier `ran` à la racine de la copie.

- Vérifie : `node --test test/v1-adapters/control-writable-directory.test.ts`
- Tient : `test/v1-adapters/control-writable-directory.test.ts`, « un lien posé sur le chemin inscriptible ou sur un dossier qui y mène, vers la copie, vers src, hors de la copie ou vers un chemin absent, fait refuser le contrôle : aucune commande ne tourne, ran n'existe pas, rien n'est créé hors de la copie, et l'évidence est INDETERMINATE avec une note qui nomme le chemin et le lien »
- Rouge : `profileFor` garde `test-output -> .`, `test-output -> src`, `test-output -> absent` et `out/test-output` sous `out -> .`, parce que leur chemin réel, celui de la cible pour un lien pendant, reste dans la copie. Il écarte sans bruit le lien qui mène hors de la copie. Dans chaque cas la commande tourne, écrit `ran`, et l'évidence est PASS.

### Tâche 4 — Un fichier à la place d'un dossier inscriptible fait refuser le contrôle

`runControl` refuse de même un chemin inscriptible, hors des fichiers du profil, qui existe dans la copie sans être un
dossier. Un fichier que le profil désigne comme tel reste écrit comme aujourd'hui, ce que tient
`test/v1-adapters/writable-path-seatbelt.test.ts`. Le test pose `test-output` comme fichier ordinaire de la copie,
sous un contrôle à qui `test-output/` est inscriptible et dont la commande écrit `ran`.

- Vérifie : `node --test test/v1-adapters/control-writable-directory.test.ts`
- Tient : `test/v1-adapters/control-writable-directory.test.ts`, « un fichier ordinaire posé à la place de test-output/ fait refuser le contrôle : aucune commande ne tourne, ran n'existe pas, et l'évidence est INDETERMINATE avec une note qui nomme le chemin et le fichier »
- Rouge : `profileFor` accorde `test-output`, dont le chemin réel est dans la copie ; la commande tourne, écrit `ran`, et l'évidence est PASS.

## 5. Hors périmètre

- **Le contenu du dossier ne fait pas refuser.** L'agent lance les tests dans sa copie et y laisse des fichiers sous
  `test-output/`. Un lien posé à l'intérieur n'élargit rien, puisque l'écriture est jugée là où elle aboutit, et le
  dossier est déjà écarté de la comparaison du candidat (`writablePrefixes`). Seul ce qui se trouve à la place du
  dossier, ou sur le chemin qui y mène, fait refuser.
- **La proposition d'un droit manquant** relève de e40s03 sous macOS et de e40s04 sous Linux.
- **La configuration du dogfooding**, qui donnera `test-output/` à `unit`, relève de e40s05.
- **Un chemin inscriptible qui mène hors de la copie** reste écarté sans bruit, comme aujourd'hui : un contrôle
  n'écrit que dans sa copie et dans le temporaire.
- **La recette d'acceptation et le contrôle formel** gardent les chemins que 495 leur fixe, leur rapport et le dossier
  de TLC ; `policy.writable_paths` s'applique aux contrôles détectés et déclarés.
- **Le temporaire, la lecture et les caches des outils** ne changent pas (`D-76`, `D-90`).
