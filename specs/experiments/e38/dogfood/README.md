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
`lint-story-format`, `test`, limité à ce qui tourne confiné), plus `build`, qui reconstruit `dist/` avant ceux qui le lisent
(`typecheck` lit `dist/stack.d.ts`, `lint-distribution` compare `dist/` à `src/`, des tests
importent `pi-495/stack`). Chacun tourne sur la référence et sur le candidat, est lu par son code de
sortie, et G5 exige qu’il passe sur le candidat : une suite verte ne tient pas lieu d’un import
refusé. Les scripts qu’ils lancent, `package.json` et ce que chacun lit pour juger sont protégés : un
producteur ne les modifie pas. `test/v4-platform/dogfood-controls.test.ts` vérifie que la liste suit
`npm run check`.

## Ce que le contrôleur ne juge pas confiné

Les contrôles du candidat tournent dans le bac à sable de la plateforme (Seatbelt sur macOS), sous le
profil de vérification : lecture de la copie, écriture dans ce que le contrôle déclare et dans le
répertoire temporaire. Mesuré le 2026-10-11 sur une copie de pi-495, chaque contrôle lancé comme le
noyau le lance : les huit contrôles de lint, de typage et de construction passent ; la suite entière
(`npm run test`) y échoue sur 551 de ses 1734 tests, pour deux raisons qui ne tiennent pas au
candidat :

- les générations `v1-adapters`, `v2-kernel`, `v3-pi` et `v4-platform` lancent elles-mêmes Seatbelt ou
  bubblewrap, et les bacs à sable ne s’emboîtent pas ; leur garde `NO_QUALIFIED_SANDBOX` lit la
  plateforme, pas l’emboîtement, et ces tests échouent au lieu de se sauter ;
- leurs dépôts de test commitent avec la configuration git de l’hôte : sur une machine qui signe ses
  commits avec une clé de `~/.ssh`, hors de la copie, `git commit` échoue.

Le contrôle `test` déclaré se limite donc à `test/v0-pure` et `test/cycle`, qui passent confinés
(599 tests, 20 s), avec `test-output/` pour seule écriture. Les générations `v1` à `v4` restent
jugées là où elles ont un sens, sans contournement de l’emboîtement : par la Preflight du cycle, non
confinée (`cycle/README.md` § How the cycle differs from 495), sur la machine de référence, et par
`npm run test:v4` sous Linux dans la machine virtuelle de qualification. Un dogfooding ne les compte
pas comme passées.

La technologie Node, elle, lit `scripts.test` (`node --test 'test/**/*.test.ts'`) comme une suite
`node --test` et la lance sans motif, sur tout l’arbre : c’est son contrôle `unit`, celui qui juge les
exigences et la suite préparée. Lancé ainsi, confiné, il rencontre les mêmes échecs que la suite
entière et dépasse ses dix minutes : la recette a lu deux préparations INDETERMINATE (« timeout after
600035 ms ») et aucun G2. `policy.suite_paths` borne donc ce contrôle aux fichiers de test qui tournent
confinés : ceux posés à la racine de `test/` — où la technologie écrit ses témoins et où une
préparation écrit ses tests —, `test/v0-pure` et `test/cycle`, ajoutés à sa commande. Cette borne et le
délai du contrôle se lisent dans la configuration du contrôleur, jamais dans un fichier du candidat :
un candidat qui réécrit `scripts.test` ne restreint pas ce qui juge ses exigences et n’en allonge pas
le délai. Un test préparé écrit ailleurs ne tourne pas, et la préparation qui le porte n’est pas
qualifiée. `test/v4-platform/dogfood-preparation.test.ts` le vérifie sur une cible façonnée comme
pi-495.

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
