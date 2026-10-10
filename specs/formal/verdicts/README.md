# Combinaison des verdicts de G5 en Lean

`Verdicts/Defs.lean` définit en Lean la combinaison des verdicts d'une obligation que G5 applique
(`combine` dans `src/domain/gates/g5.ts`) : la règle `all_pass` ou `any_pass`, la liste vide et
NOT_APPLICABLE. `Verdicts/Statements.lean` énonce ce qui en est prouvé, chaque énoncé étant une proposition
nommée. Définitions et énoncés sont approuvés avant toute recherche de preuve ; une preuve porte sur l'un d'eux
par son nom et ne les modifie pas.

La définition Lean est une référence, pas le code de production : la fonction TypeScript n'est pas déclarée
prouvée. Le caractère obligatoire d'une exigence et les autres conditions de G5 (exécution de recette, revues,
décisions humaines, paquet formel) restent hors de la définition ; les tests qui observent `evaluateG5` les
traitent.

## Table de correspondance

`correspondance.json` relie chaque règle de la combinaison à ses énoncés Lean et à son comportement dans
`g5.ts`, avec des cas dont le résultat est approuvé.

| Règle | Énoncés | Ce que G5 en fait pour une exigence obligatoire |
|---|---|---|
| `all_pass` | `AllPassRejectsBlocking`, `AllPassNeedsEveryPass` | un FAIL, INDETERMINATE ou NOT_RUN pertinent empêche PASS |
| `any_pass` | `AnyPassKeepsPass` | un PASS suffit, quels que soient les autres verdicts |
| liste vide | `EmptyIsNotRun`, `PassNeedsAPass` | NOT_RUN, donc indéterminée : rien ne passe sans un PASS |
| `NOT_APPLICABLE` | `OnlyNotApplicable`, `NotApplicableIsNeutral` | écarté du calcul ; une liste qui n'en contient que lui reste NOT_APPLICABLE, donc indéterminée |

`test/v0-pure/lean-verdict-contract.test.ts` confronte la table aux définitions Lean et aux énoncés qu'elles
portent, et chacun de ses cas au verdict que rend `evaluateG5` sur une exigence obligatoire.

## Preuves et vérification

`Verdicts/Proofs.lean` prouve chaque énoncé, et `Verdicts.lean` est le module racine du projet Lake
(`lakefile.toml`, `lean-toolchain`, `lake-manifest.json` : aucune dépendance hors de la bibliothèque standard de
Lean). La génération des preuves et leur vérification sont séparées : `manifest.json` approuve par leur sha256 les
définitions, les énoncés et les trois fichiers qui fixent le projet et ses dépendances, nomme chaque théorème avec
l'énoncé qu'il doit prouver, la chaîne d'outils approuvée et les axiomes permis (`propext`, `Classical.choice`,
`Quot.sound`) ; `scripts/check-lean.ts` vérifie.

```sh
node scripts/check-lean.ts specs/formal/verdicts/manifest.json [--project <dossier>] [--toolchain <dossier>]
```

Le contrôle refuse un fichier protégé qui n'est pas l'approuvé avant toute construction. Il copie le projet, sans ce
qu'une construction antérieure y a laissé, dans un dossier jetable, et l'y construit avec Lake sous le bac à sable de la
plateforme (la copie seule inscriptible, ni `$TMPDIR` ni `/tmp`, réseau refusé), depuis le seul `lakefile.toml` protégé
: un `lakefile.lean`, que Lake préférerait, n'est jamais lu. Le cache d'artefacts de Lake est coupé : chaque module est
compilé depuis sa source, et aucun cache livré avec le projet ne restitue sous la clé d'un module approuvé ce qu'une
autre source a compilé. Les modules protégés sont construits d'abord, seuls, sans qu'aucune preuve ne s'exécute, et ce
qu'ils compilent est mis de côté hors de portée de la construction des preuves, qui ne peut pas le remplacer. Il compare
les fichiers protégés après la construction. Le noyau et l'inspection ne lisent ensuite que le `.olean` de chaque module
mis de côté, jamais les parties `.olean.server` et `.olean.private` que `leanchecker` rejouerait à sa place : les
modules protégés tels que compilés d'abord, les autres modules du projet tels que la construction les a laissés, aucun
module hors de l'espace de noms du projet. Le noyau rejoue chaque module du projet (`leanchecker`), puis
`scripts/lean/Inspect.lean`, hors de portée des preuves, lit chaque théorème : sa nature, son type, le module de son
énoncé et les axiomes qu'il atteint transitivement, tels que `#print axioms` les collecte. Une déclaration que l'import
range sous un autre nom que le sien est refusée : le noyau la rejoue sous son propre nom, l'inspection la lirait sous
l'autre. Un nom qu'un module du projet déclare alors qu'un module importé avant lui le déclare déjà est refusé : le
noyau saute un théorème que ses imports portent sous le même nom et le même type, l'import garde la dernière copie, que
l'inspection lirait sans qu'aucun noyau l'ait vérifiée. Un théorème n'est prouvé que s'il est un théorème dont le type
est exactement l'énoncé approuvé, venu d'un fichier protégé, et qu'il n'atteint aucun axiome hors de la liste :
`sorryAx` est refusé, `Lean.ofReduceBool` aussi. Ni le code de sortie de Lake ni un message de Lean ne tiennent lieu de
preuve. Le rapport JSON est imprimé ; sortie 0 `proved`, 1 `refused`, 3 `error`.

`test/v4-platform/lean-verdict-proof.test.ts` qualifie le contrôle sur des témoins faits en copie jetable : le projet
approuvé est prouvé ; une preuve qui s'appuie sur un lemme utilisant `sorry`, et une preuve d'un autre énoncé sous le
nom approuvé, sont refusées ; un énoncé altéré est refusé avant toute construction. Des énoncés forgés ne sont pas pris
pour les approuvés, qu'un `lakefile.lean` les désigne, que la construction réécrive les `.olean` des modules protégés,
qu'un cache d'artefacts de Lake livré avec le projet les restitue, que des parties `.olean.server` et `.olean.private`
écrites à côté d'un `.olean` forgé fassent rejouer au noyau autre chose que ce que l'inspection lit, ou que des énoncés
`True` rangés dans les preuves compilées sous d'autres noms que les leurs soient rejoués par le noyau pendant que
l'inspection lit les approuvés. Des preuves en `sorry` ne passent pas pour prouvées quand la construction fait déclarer
de nouveau leurs théorèmes par un module suivant, avec une valeur mal typée que le noyau ne rejoue pas. La construction
n'écrit ni sous `$TMPDIR` ni sous `/tmp` et n'atteint aucun port de l'hôte. Sont refusés une construction qui réécrit un
fichier protégé, une définition qui prouve l'énoncé sans être un théorème, un énoncé venu d'un module non protégé et une
chaîne d'outils qui n'imprime pas la version et le commit approuvés.

## Comparaison du TypeScript à la référence

`Reference.lean` est l'interface par laquelle les tests évaluent la référence : il lit un cas par ligne (`all PASS
FAIL`, ou la règle seule pour une obligation sans verdict) et imprime le verdict que donne `combine` des définitions
approuvées, qu'il importe sans rien définir lui-même. `test/v4-platform/lean-verdict-differential.test.ts` construit ces
définitions dans une copie jetable et compare la référence au noyau sur un corpus déclaré : toutes les listes de
verdicts jusqu'à la longueur 4 sous les deux règles, les plus courtes d'abord, puis 100 listes de longueur 5 à 16 par
graine (495, 20261010, 11, générateur mulberry32), puis les cas de la table. Le noyau est observé par `evaluateG5` seul,
les autres conditions de G5 tenues (ni recette, ni revue, ni paquet formel, ni acceptation humaine) : l'issue d'une
exigence obligatoire, le verdict qu'une exigence facultative rapporte sans bloquer, et l'issue d'une exigence
obligatoire à côté d'une obligation any_pass de PASS et FAIL, qui ne la change pas. Une variante de `g5.ts` faite en
copie jetable, dont `combine` accepte la liste vide, diverge dès le premier cas, `all` sans verdict.

La concordance porte sur ce corpus ; elle ne vaut pas preuve d'équivalence entre `g5.ts` et la référence.

## Outillage de développement requis

Rien n'est téléchargé ni installé par le contrôle, et Lean n'est requis ni pour installer ni pour utiliser pi-495. La
chaîne d'outils approuvée est `leanprover/lean4:v4.34.1` (Lean 4.34.1, commit
`5045d0056413266e57c625dcd7c365b10e377c52`), que `elan toolchain install leanprover/lean4:v4.34.1` installe sous
`~/.elan/toolchains/` ; une autre version est refusée (`capability missing`). Approuver une autre version, c'est mettre
à jour `lean-toolchain` et le manifeste après l'avoir qualifiée sur ces témoins. Sans cette chaîne d'outils, les tests
qui exécutent Lean se déclarent sautés.
