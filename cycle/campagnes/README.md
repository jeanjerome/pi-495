# Les campagnes de référence

Deux projets, un npm et un Maven, sur lesquels un vrai modèle conduit un vrai changement dans un vrai
Pi. Ils existent parce que la recette d'une story se fait souvent sur une cible taillée pour elle, avec
un agent scripté : elle prouve la promesse de la story et ne dit rien d'un projet que personne n'a
préparé. Deux défauts de qualification sous vitest (un `include` restreint à `*.test.ts`, un bac à
sable qui refuse l'écriture de la configuration compilée par Vite) n'ont été vus que là.

| Cible | Projet | Contrôles que 495 y déclare | Changement demandé |
|---|---|---|---|
| `npm/` | TypeScript, vitest 5, `@vitest/coverage-v8`, Stryker 10, `include: tests/**/*.test.ts` | unit, coverage, mutation | `lastFit(busy, minutes)` à côté de `firstFit` |
| `maven/` | Java 21, JUnit 5, JaCoCo, PIT | maven-test, coverage, structure, mutation | refuser de renommer un utilisateur vers un nom déjà pris |

## Lancer

```sh
npm run campagne -- npm
npm run campagne -- maven
```

Options : `--thinking <niveau>` (`high` par défaut), `--model <fournisseur/id>`
(`anthropic/claude-sonnet-5-5` par défaut) et `--extension <chemin>`, qui charge une extension Pi de plus
à côté de 495. Pi est lancé sans les extensions de sa configuration (`-ne`) : un fournisseur qu'une
extension déclare ne se charge que par cette option. La commande reconstruit `dist/`, copie la cible sous
`~/.495/campagnes/<cible>-<horodatage>/cible`, y installe ce qu'elle déclare (le réseau est ouvert pour
cela seul ; Maven remplit `~/.m2`), conduit `/495 start` puis `/495 resume` jusqu'à ce que le
changement s'arrête, et lit le dossier laissé sous `…/dossier`. Un projet npm demande `npm`, un projet
Maven demande `mvn` et un JDK 21. Une campagne dure de deux à cinq minutes et consomme l'abonnement
Anthropic de Pi.

## Ce que le verdict juge

Le travail du modèle n'est pas jugé : un candidat dont les tests sont faux échoue à G5 et le rapport
le dit. Est jugé ce que seul 495 peut avoir causé, et la campagne sort en erreur (code 1, une ligne
`DEFECT` par cause) quand :

- le changement est bloqué sur `capability_missing`, ou G2 n'est pas passé : le protocole n'a pas été
  gelé, un capteur n'a pas été qualifié ;
- le candidat n'a pas été vérifié du tout ;
- un contrôle est `INDETERMINATE` sur le candidat ;
- un capteur de couverture ou de mutation n'a lu aucun rapport alors que le candidat a introduit du code.

`verdict-campagne.ts` en est la lecture, testée sans modèle (`test/cycle/verdict-campagne.test.ts`).

## Le contrôle négatif

Un défaut du harnais se voit en lançant la même commande sur la révision d'avant : le script d'un
arbre de la révision fautive, avec ce répertoire et les deux fichiers `campagne.ts` et
`verdict-campagne.ts` copiés dedans, doit sortir en erreur sur le défaut que la correction a levé.

## Les garder à jour

Une cible est un projet que son propriétaire reconnaîtrait : on y ajoute un cas quand un projet réel
met un capteur en défaut, et on ne l'allège pas pour faire passer une campagne. Les versions de
`npm/package.json` suivent la dernière publiée tant que la campagne reste verte. Les dossiers sous
`~/.495/campagnes/` se jettent une fois le verdict lu.
