# Le contrôleur stable de pi-495

`config.json` est la configuration du contrôleur stable quand pi-495 conduit un changement de
pi-495 : une version identifiée de l’extension, construite à part, chargée dans Pi, juge une autre
copie du dépôt, le candidat. Elle se copie dans le répertoire de données de ce contrôleur
(`HARNESS495_DATA_DIR`) ; ce dossier-ci ne sert jamais de répertoire de données, le registre et les
objets d’une campagne n’ont rien à faire dans le dépôt.

## Les contrôles déclarés

La technologie Node détecte la suite de tests ; elle ne sait rien du reste de `npm run check`.
`policy.project_controls` déclare donc chaque contrôle que `npm run check` enchaîne, sous son nom
(`lint-code`, `typecheck`, `lint-layers`, `lint-architecture`, `lint-exports`, `lint-distribution`,
`lint-story-format`, et `test`, partagé en deux contrôles : `test`, confiné, et `test-sandbox`, hors confinement), plus `build`, qui reconstruit `dist/` avant ceux qui le lisent
(`typecheck` lit `dist/stack.d.ts`, `lint-distribution` compare `dist/` à `src/`, des tests
importent `pi-495/stack`). Chacun tourne sur la référence et sur le candidat, est lu par son code de
sortie, et G5 exige qu’il passe sur le candidat : une suite verte ne tient pas lieu d’un import
refusé. Les scripts qu’ils lancent, `package.json` et ce que chacun lit pour juger sont protégés : un
producteur ne les modifie pas. `test/v4-platform/dogfood-controls.test.ts` vérifie que la liste suit
`npm run check`.

## La suite, confinée et hors confinement

Les contrôles du candidat tournent dans le bac à sable de la plateforme (Seatbelt sur macOS), sous le
profil de vérification : lecture de la copie, écriture dans ce que le contrôle déclare et dans le
répertoire temporaire. Mesuré le 2026-10-12 à `01c0ab8a` sur une copie de pi-495, chaque génération
lancée comme le noyau lance un contrôle : `v0-pure`, `test/cycle` et `v2-kernel` (494 tests, 2 min)
passent entièrement ; 38 fichiers échouent — 6 de `v1-adapters`, 10 de `v3-pi`, 22 de `v4-platform` —
parce qu’ils lancent eux-mêmes Seatbelt, ou l’extension qui en lance un, et que Seatbelt refuse un second
profil. La configuration git de l’hôte n’y joue plus : un contrôle ne la lit pas (e40s01).

La suite de `npm run test` est donc jugée par deux contrôles, et chaque fichier par un seul :

- `test`, confiné, lance `test/**/*.test.ts` sauf ces 38 fichiers, exclus par leur nom, avec
  `test-output/` pour seule écriture. Un fichier de test qu’un candidat ajoute y tourne, s’il ne porte pas l’un des
  38 noms ; s’il démarre
  un bac à sable, il y échoue et bloque le changement tant que le propriétaire ne l’a pas ajouté à
  `test-sandbox` ;
- `test-sandbox`, que le propriétaire déclare hors confinement (`"unconfined": true`), lance ces 38
  fichiers, nommés un par un : aucun motif ne fait tourner hors confinement un fichier que le candidat
  ajoute ou renomme. Les deux protègent `test/`, `scripts/`, `package.json` et ce dossier : l’implémentation
  ne modifie aucun de ces fichiers ; une préparation peut mettre à jour un test existant, et le code que ces
  tests importent ou lancent hors de ces chemins, `src/` et `examples/` compris, est celui du candidat. Ses 150 tests passent en 2 min hors confinement. Il lit `~/.ssh` et les
  identifiants de l’hôte, a le réseau, et le code du candidat que ces tests importent tourne sans
  protection, comme sous la Preflight ; son évidence et le verdict G5 le disent (`D-90`).

Un contrôle déclaré doit passer sur le candidat : un échec qu’il partage avec la référence n’est pas
toléré comme un constat préexistant. `test/v4-platform/dogfood-controls.test.ts` vérifie que chaque
fichier de la suite est lancé par l’un des deux contrôles, et par un seul.

La technologie Node, elle, lit `scripts.test` (`node --test 'test/**/*.test.ts'`) comme une suite
`node --test` et la lance sans motif, sur tout l’arbre : c’est son contrôle `unit`, celui qui juge les
exigences et la suite préparée. Lancé ainsi, confiné, il rencontre les mêmes échecs que la suite
entière et dépasse ses dix minutes : la recette a lu deux préparations INDETERMINATE (« timeout after
600035 ms ») et aucun G2. `policy.suite_paths` borne donc ce contrôle aux fichiers de test qui tournent
confinés : ceux posés à la racine de `test/` en `.js`, `.mjs` et `.ts` — où une préparation écrit ses
tests, et où la technologie écrit ses témoins, en `.mjs` pour la couverture et la mutation —, `test/v0-pure`
et `test/cycle`, ajoutés à sa commande. La même borne s'applique à la mutation : Stryker y lance cette
commande, et non `npm test` sur tout l'arbre. `policy.writable_paths` donne à `unit` un seul droit
d'écriture de plus, `test-output/`, où les aides de test de pi-495 créent leurs dossiers ; il s'accorde
par le chemin écrit, et un `test-output` que le candidat poserait comme lien fait refuser le contrôle.
Cette borne, ce droit et le délai du contrôle se lisent dans la configuration du contrôleur, jamais dans
un fichier du candidat : un candidat qui réécrit `scripts.test` ne restreint pas ce qui juge ses
exigences et n’en allonge pas le délai ; `test/v4-platform/dogfood-preparation.test.ts` le vérifie sur une
cible façonnée comme pi-495. Le mandat de préparation nomme ces motifs, et un fichier de test qu’une
préparation ajoute ailleurs n’est pas retenu, avec la raison : sous `test/v2-kernel/`, où l’usage de
pi-495 range un test du noyau, il ne tournerait pas. La borne ne s’élargit pas au noyau : la mutation y
relancerait 494 tests de plus à chaque mutant.

## La campagne

`node cycle/src/dogfood.ts --objectif "<le changement>" [--controleur <révision>] [--candidat <révision>]` extrait
le contrôleur à sa révision (`main` par défaut) avec ses dépendances, extrait le candidat (`HEAD` par
défaut) dans une copie dont il fait un dépôt d’un commit — l’une et l’autre installées sans qu’aucun script
d’installation ne tourne et sans leur `.npmrc`, remis en place après : les scripts du candidat, comme un
programme que sa configuration de npm nommerait — le `git` qui récupère une dépendance git —, s’exécuteraient
hors de tout bac à sable, à côté de l’arbre du contrôleur, avant que celui-ci ne s’identifie —, puis passe la main à
`cycle/src/dogfood-controleur.ts` tel que la révision du contrôleur le porte, lancé depuis l’arbre extrait du
contrôleur. C’est ce code-là qui construit le contrôleur, lit `config.json` à la révision du contrôleur, le pose
dans son répertoire de données, conduit le changement dans un vrai Pi chargé de sa propre extension, avec un vrai
modèle, jusqu’à l’intégration dans la copie, juge le dossier et écrit le relevé. Lancée depuis l’arbre d’un
candidat qui retire un contrôle de `config.json` ou réécrit `cycle/src/dogfood-controleur.ts`, la campagne reste
celle du contrôleur ; une révision de contrôleur qui ne porte pas `cycle/src/dogfood-controleur.ts` ne conduit aucune
campagne. Le lanceur, `cycle/src/dogfood.ts`, est celui de l’arbre d’où on le lance : c’est lui qui
choisit la campagne à exécuter et l’arbre où elle tourne. Il ne lance donc rien s’il n’est pas, octet pour octet,
celui que porte la révision du contrôleur : un candidat qui le réécrit ne se juge que depuis un arbre dont le lanceur
est celui du contrôleur, l’arbre du contrôleur par exemple. Il se lance par `node` seul, sans script de
`package.json` : la ligne d’un script est celle de l’arbre d’où l’on lance, et celle d’un candidat chargerait ce
qu’elle veut avant le lanceur.
`releve.json` identifie les deux révisions, la version et l’empreinte de la construction du contrôleur, relue
identique à la fin, l’arbre intégré, les contrôles déclarés — leurs commandes se lisent à la révision du
contrôleur —, la décision de promotion — jamais prise par la campagne — et le verdict lu dans le dossier. Ce que
le candidat construit (`dist/` de la copie) ne remplace pas le contrôleur. `test/cycle/dogfood.test.ts` joue la
campagne avec un `npm` et un `pi` de substitution.

Les témoins de la campagne — un test lié à aucune exigence, une preuve périmée, une recette absente,
une faute de couches — se jouent avec un agent scripté, sur une cible façonnée comme pi-495 et le
contrôle de couches de ce dépôt : `test/v4-platform/dogfood-process.test.ts`. Un vrai modèle ne commet
pas une faute sur commande.

## Où en est le dogfooding, le 12 octobre 2026

Les campagnes de la recette de `e38s13` et de `e40s03` (`~/.495/campagnes/dogfood-2026101*`, hors du dépôt), un vrai
modèle et un changement réel de pi-495 — couper au dernier mot le titre d'une demande de plus de 80 caractères —,
ont montré ce qui empêchait le contrôleur stable d'aller au bout :

- le 11 octobre, aucune n'atteint G2 : les tests préparés échouent sans pouvoir créer leur dossier sous
  `test-output/`, et la mutation de pi-495 sort sur `ts.parseConfigFileTextToJson`, que TypeScript 7 n'a plus
  (`dogfood-20261011T090513`) ;
- le 12 octobre, avec `test-output/` donné à `unit` et un réglage de Stryker posé dans la cible, G2, G3 et G4
  passent ; G5 échoue sur le linter, qui lit la copie de travail qu'une mutation en échec a laissée sous
  `.stryker-tmp`, et sur la mutation (`dogfood-20261012T140626`).

La configuration donne désormais `test-output/` à `unit`, et la borne couvre les témoins `.mjs`. Le contrôle de
mutation lance Stryker par son API : il copie tel quel le `tsconfig.json` d'une copie en TypeScript 7, efface sa copie
de travail quelle que soit l'issue, et tourne sous la borne. La campagne qui intègre, le nombre d'essais et le témoin
négatif sous le contrôleur d'avant se lisent dans `specs/verifications/e40s05/`.

Depuis le 12 octobre au soir, toute la suite est jugée : `test` confiné, `test-sandbox` hors confinement ; la campagne
qui intègre se lit dans `specs/verifications/e40s07/`. Deux pièges connus peuvent encore arrêter une campagne : un test préparé qui lit le texte de
son module échoue sous l'instrumentation de Stryker (`BUG-2026-10-12T171000`), et le propriétaire simulé ne répond qu'à
l'adoption, à l'acceptation et à l'intégration (`BUG-2026-10-12T171500`).
