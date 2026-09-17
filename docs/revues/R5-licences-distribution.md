# R5 — Revue licences et distribution

**État :** conduite le 17 septembre 2026 sur `bd7c5be5`
**Sortie exigée (§11) :** inventaire et compatibilité des licences
**Autorité :** ingénierie. Le sujet est le dépôt et l'arbre installé ; aucune autorité extérieure
n'est requise pour les constater. Un avis juridique sur la compatibilité reste hors de cette revue,
et est nommé comme tel dans « Ce que le reviewer ne peut pas conclure ».

## Périmètre exact

- La licence du projet : `LICENSE`, `NOTICE`, `package.json#license`.
- Ce qui est redistribué : le contenu de l'archive `npm pack`, c'est-à-dire `package.json#files` →
  `dist/`, `contracts/`, `README.md`, `LICENSE`, `NOTICE`.
- Ce qui est requis à l'exécution sans être redistribué : `package.json#peerDependencies`.
- L'arbre installé pour construire et vérifier : 263 packages sous `node_modules/`.
- Le packaging Pi : `package.json#pi.extensions`, le chargement par manifeste, l'identité entre les
  sources revues et l'artefact expédié.

Hors périmètre : les licences des cibles que 495 analyse, qui appartiennent à leurs propriétaires et
ne transitent jamais par le package.

## Critères examinés

| Réf | Critère | Exigence amont |
| --- | --- | --- |
| R5-C01 | La licence du projet est déclarée, et son texte voyage avec le package. | §12 point 7 |
| R5-C02 | Rien de tiers n'est redistribué, ou ce qui l'est est inventorié, attribué au NOTICE et compatible. | §11, §13 |
| R5-C03 | Chaque module externe importé par les sources est une dépendance déclarée, installée, dont la licence est lisible. | §11 |
| R5-C04 | Aucune licence de l'arbre de construction n'impose une obligation que la distribution ne tient pas. | §11 |
| R5-C05 | Le package Pi est chargeable par manifeste et ne contient que ce qu'il déclare. | `UX-01`, `EXT-01` |
| R5-C06 | Le build, le package Pi, les sources revues et les artefacts testés possèdent la même identité de livraison. | §12 point 6 |
| R5-C07 | Un inventaire lisible par machine (SBOM) accompagne la livraison. | §13 |

## Preuves disponibles

| Preuve | Où | Ce qu'elle établit |
| --- | --- | --- |
| `scripts/check-distribution.ts`, branché sur `npm run check` | sortie : `dist/ reproduces the sources, 0 dependencies redistributed, 4 provided by the host (…MIT), 263 packages installed under …` | R5-C01 à R5-C06, mécaniquement. |
| `LICENSE`, `NOTICE`, `package.json` | racine | R5-C01, R5-C02, R5-C03. |
| `npm pack --dry-run` | 233 fichiers, 463,2 kB | R5-C05, composition réelle de l'archive. |
| `npm ls --omit=dev --all` | `(empty)` | R5-C02 : aucune dépendance d'exécution. |
| Campagne « Chargement par manifeste » | `QUALIFICATION.md` : `pi -e <package> -p "/495 status"` | R5-C05, sur la machine de référence. |

## Format de constat

Enveloppe `Finding`, catégorie `review`. Voir [README.md](README.md#format-de-constat).

## Ce que le reviewer ne peut pas conclure faute de preuve

- **La compatibilité juridique.** La revue établit que chaque licence rencontrée est permissive et
  figure sur une liste blanche explicite. Elle n'établit pas qu'un juriste conclurait à la
  compatibilité : c'est un avis, il n'est pas rendu ici et il n'est pas remplacé par le contrôle.
- **L'exactitude des licences déclarées.** Les licences sont lues dans le champ `license` du
  `package.json` de chaque package installé. Un package qui déclare mal sa licence est cru sur
  parole ; aucun fichier `LICENSE` n'est comparé au champ déclaré.
- **La provenance de la livraison.** Rien n'est signé et aucune empreinte d'archive publiée n'existe.
  Le contrôle prouve que `dist/` reproduit les sources **de cet arbre de travail** ; il ne prouve
  pas qu'une archive téléchargée ailleurs est celle produite ici.
- **Les licences de ce qui est installé chez l'utilisateur.** Les pairs sont fournis par l'hôte Pi ;
  la revue lit les versions installées sur la machine de référence, pas celles d'une autre
  installation.

## Constats

### R5-C01 — texte de la licence : **constat**, clos

`package.json` déclare `Apache-2.0` et le package expédie `LICENSE`.

| Constat | Sévérité | Statut |
| --- | --- | --- |
| `LICENSE` ne contenait pas la licence : dix-huit lignes renvoyant à `http://www.apache.org/licenses/LICENSE-2.0`. Apache-2.0 §4(a) exige de remettre au destinataire *une copie* de la licence ; une adresse n'en est pas une, et le package est destiné à être vérifiable hors ligne. | `blocker` | **Clos.** `LICENSE` porte le texte intégral des termes. `check-distribution.ts` refuse désormais un `LICENSE` qui ne porte que la référence lorsque `package.json` déclare Apache-2.0. |

### R5-C02 — ce qui est redistribué : **conforme**

`npm ls --omit=dev --all` est vide : le package n'a aucune dépendance d'exécution, donc ne
redistribue aucun code tiers, donc n'a aucune attribution tierce à porter. Le contrôle tient la
règle dans le bon sens — l'attribution suit la redistribution : toute dépendance qui voyagerait dans
le package devrait être nommée au NOTICE, un pair fourni par l'hôte n'a pas à l'être.

### R5-C03 — dépendances requises : **conforme**

Quatre modules externes sont importés par `src/` : `@earendil-works/pi-ai`,
`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui` et `typebox`. Les quatre sont déclarés
en `peerDependencies`, fournis par l'hôte Pi, installés, et sous licence MIT. Le contrôle refuse un
import externe qu'aucun pair ne déclare, un pair absent de l'installation, et un pair dont la
licence n'est pas déclarée ; il publie la licence de chacun à chaque exécution.

### R5-C04 — licences de l'arbre de construction : **conforme**

263 packages installés, répartis sur sept licences, toutes permissives : MIT, Apache-2.0,
BSD-3-Clause, ISC, BlueOak-1.0.0, Unlicense, 0BSD. Aucune licence à réciprocité (GPL, LGPL, AGPL,
MPL, EPL), aucune licence inconnue. Rien de cet arbre n'est redistribué ; l'inventaire est produit
parce qu'un reviewer y a droit, et la liste blanche est explicite dans `check-distribution.ts` pour
qu'une licence nouvelle soit une décision et non une surprise.

### R5-C05 — composition du package : **constat**, clos

L'archive contient 233 fichiers : `dist/` (build et déclarations), `contracts/v1/` (28 schémas JSON),
`README.md`, `LICENSE`, `NOTICE`, `package.json`.

| Constat | Sévérité | Statut |
| --- | --- | --- |
| Les 61 source maps expédiées référençaient `../../src/*.ts`, absent de l'archive : chaque map pointait vers un fichier que le destinataire n'a pas, et la trace d'une erreur en production restait illisible. | `minor` | **Clos.** `inlineSources` est activé dans `tsconfig.build.json` : les sources voyagent dans les maps. L'archive passe de 215 kB à 463 kB. Le contrôle refuse une map sans source inlinée. |
| `contracts/.DS_Store` se trouvait dans un répertoire expédié. `npm` l'exclut de l'archive, mais le dépôt portait un fichier de plateforme dans un répertoire normatif, ce que le projet exclut par ailleurs de tout inventaire. | `minor` | **Clos.** Fichier supprimé ; le contrôle refuse `.DS_Store` et `._*` sous un répertoire expédié. |

### R5-C06 — identité de livraison : **constat**, bloquant clos, résiduel ouvert

C'est le constat principal de cette revue.

| Constat | Sévérité | Statut |
| --- | --- | --- |
| `package.json#pi.extensions` désigne `./dist/extension/index.js` : une installation exécute le build, pas les sources. `dist/` est ignoré par Git, produit à la main par `npm run build`, et **rien ne vérifiait qu'il correspondait aux sources**. À l'ouverture de la revue il ne correspondait plus : 18 fichiers absents et 69 différents, dont les adaptateurs `mutation` et `structure` — c'est-à-dire que les contrôles de mutation et de frontières livrés depuis quatre commits étaient absents du package qu'une installation aurait chargé. Une revue de code portant sur `src/` n'aurait rien dit de ce que le package exécute, ce que §12 point 6 refuse explicitement. | `blocker` | **Clos.** `check-distribution.ts` reconstruit les sources dans un répertoire temporaire de même profondeur que `dist/` et compare octet par octet ; toute différence fait échouer `npm run check`. Le build est déterministe : deux constructions successives des mêmes sources sont identiques. `dist/` a été reconstruit. |
| La comparaison porte sur l'arbre de travail. Aucune archive publiée n'est signée, aucune empreinte de `.tgz` n'est enregistrée ni annoncée : rien ne relie une archive reçue à la révision revue. | `major` | **Ouvert, travail identifié.** Rattaché à `chantiers/C`, clôture du jalon L0. La preuve attendue est une empreinte de l'archive publiée avec la révision Git qui la produit, vérifiable par le destinataire. |

### R5-C07 — SBOM : **indéterminé**

| Constat | Sévérité | Statut |
| --- | --- | --- |
| §13 demande un rapport de licences parmi les artefacts de qualification. L'inventaire existe désormais et est vérifié à chaque `npm run check`, mais aucun fichier lisible par machine n'est produit ni livré : ni CycloneDX, ni SPDX. Pour ce package, le SBOM *redistribué* est presque vide — aucune dépendance d'exécution — et le SBOM utile est celui de l'arbre de construction (263 packages, sept licences). | `major` | **Ouvert, travail identifié.** Le critère est déclaré `indéterminé`, pas `conforme` : la vérification est mécanique, la publication ne l'est pas. Rattaché à `chantiers/C`. |

## Risques résiduels

1. **Une archive n'est rattachable à aucune révision.** Le lien build ↔ sources est tenu dans
   l'arbre de travail, pas entre un dépôt et une archive publiée.
2. **Les licences sont crues sur parole.** Le champ `license` d'un package installé n'est confronté
   à aucun fichier de licence.
3. **Les pairs sont ceux de la machine de référence.** Une installation Pi d'une autre version
   fournit d'autres versions des trois packages `@earendil-works`, dont les licences ne sont pas
   revérifiées.
