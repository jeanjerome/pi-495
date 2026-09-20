# Transverse E — la commande de test d'une cible Node, et les exclusions de workspace

**État :** ouvert
**Objet :** l'adaptateur node n'atteint qu'une cible dont la suite se lance par `node --test`, et une
copie de travail perd le `dist/` de chacune de ses dépendances
**Ne dépend d'aucun étage**

## Motif

Une campagne conduite depuis Pi sur `~/Projets/495-workspace/cibles/node-demo` — une cible en vitest,
tests sous `tests/` — s'arrête à G2 :

```
control unit: positive witness gave FAIL, expected PASS
unit: positive witness gave FAIL: tests/agenda.test.ts; tests/slot.test.ts
```

Le témoin positif est la référence plus un cas passant : il doit passer, et un contrôle qui ne passe
pas sur la référence n'est pas qualifiable. Le témoin négatif, lui, rend bien `FAIL`, et l'incident de
capteur `INDETERMINATE` : le capteur détecte ce qu'il revendique, il ne s'applique simplement pas à
cette cible. Deux causes indépendantes se cumulent, et la sortie TAP conservée les nomme.

**La commande.** `detectStack` déclare `unit` comme `node --test --test-reporter=tap` et ne lit que
`scripts.lint` ; `scripts.test` n'est jamais lu. La cible déclare pourtant sa commande deux fois : dans
`scripts.test` (`vitest run`) et dans un `.495/project.toml` que le harnais ne lit plus. Dériver la
commande ne suffit pas : le parseur `node-test` est qualifié sur le dialecte TAP de `node:test`, et un
contrôle dont le parseur n'est pas qualifié sur la sortie qu'il lit vaut moins que pas de contrôle.
Vitest sait émettre du TAP, ce qui fait du parseur la vraie question.

**La copie de travail.** Le texte TAP dit :

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../node_modules/vitest/dist/index.js
```

`isExcluded` apparie un motif d'un seul segment terminé par `/` à ce nom à n'importe quelle
profondeur : `dist/` retire donc le `dist/` de chaque dépendance installée. `node_modules/` n'est
exclu par rien : sur cette cible, l'instantané de référence porte 788 entrées pour 22,2 Mo, dont 761
sous `node_modules/`, et trois fichiers dépassent la taille digestible, ce qui marque l'instantané
tronqué. Autrement dit la copie emporte les dépendances mais leur retire la partie qui sert, et aucune
résolution d'import nu n'y aboutit — quelle que soit la commande de test.

## Antériorité dans l'écosystème Pi

`pi-compass` (`github.com/MattDevy/pi-extensions`, `packages/pi-compass/src/analyzers/build-script-detector.ts`)
fait la lecture que l'adaptateur node ne fait pas, et sans rien exécuter : les scripts de
`package.json` filtrés par un ensemble de noms retenus — dont `test`, `lint`, `check`, `typecheck` —,
les cibles d'un `Makefile`, les fichiers de CI et les fichiers de conteneur. Chaque commande détectée
porte sa **provenance** (`package.json`, `Makefile`, `.github/workflows/`), ce qui est exactement ce
qui manque à un contrôle dérivé : `ControlDefinition.title` est l'endroit où cette phrase doit vivre,
pour qu'un lecteur du dossier sache d'où vient la commande qu'on lui oppose.

Ce que cette antériorité ne donne pas, et qui reste le cœur du travail : un parseur qualifié pour la
sortie de la commande ainsi dérivée. Détecter une commande est une lecture ; en faire un contrôle
demande un capteur éprouvé sur trois témoins.

## Prompt

```
Dans ~/Projets/495-pi-package, lis la section « Campagnes depuis Pi sur les cibles » de
specs/archive/QUALIFICATION.md, puis detectStack dans src/application/target.ts et isExcluded dans
src/adapters/workspace/walk.ts.

Deux travaux, indépendants.

1. La commande de test d'une cible Node. Dérive le contrôle de ce que la cible déclare plutôt
   que de le supposer, et qualifie le parseur qui lit la sortie de cette commande sur ses trois
   témoins : témoin positif passant, contre-exemple ciblé, incident de capteur. Un contrôle
   dont le parseur n'est pas qualifié sur la sortie qu'il lit ne doit pas être déclaré : il vaut
   moins que pas de contrôle. Le binaire nommé doit être résolu dans le workspace, pas sur le
   PATH de l'hôte.

2. Les exclusions de workspace. Un motif d'un seul segment terminé par `/` exclut ce nom à
   toute profondeur, ce qui retire le `dist/` de chaque dépendance installée. Décide la
   sémantique — motif ancré à la racine, ou exclusion explicite de node_modules avec ce qu'il
   faut pour que les imports nus résolvent quand même — et écris le test qui la tient.

Critères d'acceptation :
- une cible dont la suite ne se lance pas par `node --test` obtient un contrôle dérivé de sa
  déclaration, avec un parseur qualifié sur trois témoins ;
- la campagne scriptée sur node-demo franchit G2, verdict transcrit depuis la sortie réelle ;
- un test déterministe montre qu'une exclusion ne retire plus le `dist/` d'une dépendance ;
- npm run check passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Contrôles d'une cible Node | `src/application/target.ts`, `detectStack`, `commandFromScript` |
| Parseur TAP de `node:test` | `src/adapters/execution/parsers.ts`, `parseNodeTestTap` |
| Sémantique des exclusions | `src/adapters/workspace/walk.ts`, `isExcluded` |
| Exclusions par défaut | `src/extension/config.ts`, `DEFAULT_CONFIG.workspace_exclusions` |
| Commandes déclarées par la cible | `~/Projets/495-workspace/cibles/node-demo/.495/project.toml` |

## Journal

**17 septembre 2026.** Ouverture. Deux campagnes sur cette cible : avec le modèle local,
l'intervention de spécification rend une sortie structurée invalide et le changement est bloqué avant
tout gate ; avec un agent scripté, le parcours va jusqu'à G2 et s'y arrête sur le témoin positif du
contrôle `unit`. Les deux sont transcrites dans `../QUALIFICATION.md`.
