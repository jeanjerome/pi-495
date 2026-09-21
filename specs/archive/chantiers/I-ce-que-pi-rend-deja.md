# Transverse I — ce que Pi rend déjà, et ce que la revue réimplémente

**État :** ouvert — une décision à écrire, pas un correctif
**Objet :** `pi-tui` et `pi-coding-agent` exportent des primitives et des composants que
`presentation/tui/review-surface.ts` refait à la main ; l'un d'eux corrigeait un défaut réel, les
autres demandent un arbitrage
**Ne dépend d'aucun étage**

## Ce qui est déjà repris

`pi-tui` exporte `visibleWidth`, `truncateToWidth`, `sliceByColumn`, `wrapTextWithAnsi` et
`stripTerminalSequences` : exactement la mesure d'une ligne stylée que `fit` réimplémentait, et
réimplémentait faux — les séquences d'échappement d'un thème étaient comptées comme des caractères
imprimés, dix colonnes perdues par couleur, le séparateur des deux panneaux à une colonne différente
selon la ligne. `SurfaceOptions.fit` reçoit désormais la mesure de l'hôte et l'invariant est éprouvé
dans `v0/review-surface` (`D-35`). C'est le seul cas où la réponse était évidente : une primitive
sans état, et un défaut mesuré.

### Ce que fait un autre paquet, sur la même primitive

`pi-lens` (`github.com/apmantza/pi-lens`, `clients/deps/pi-tui.ts`) importe exactement ces deux
fonctions — `truncateToWidth` et `visibleWidth` — et en tire trois règles que 495 suit déjà en
partie :

- un **seul module** accède au paquet de l'hôte, pour que la surface de dépendance soit lisible d'un
  coup ; ici c'est la règle de couches qui le tient, plus strictement encore, en réservant les
  imports Pi à `extension/` et `adapters/pi-worker/` ;
- `pi-tui` est déclaré en pair **optionnel** et en dépendance de développement, jamais en dépendance
  d'exécution : une dépendance d'exécution fait embarquer une seconde copie privée à
  `npm install --omit=dev`, que Node évalue à l'import — ils mesurent 97 ms sur 838 ms d'import ;
  `package.json` déclare déjà `pi-tui` en pair, et `check-distribution.ts` vérifie que rien n'est
  redistribué ;
- ils **épinglent cette déclaration par un test de conditionnement**, pour qu'un ajout de dépendance
  ne la défasse pas ; c'est le rôle que `check-distribution.ts` joue ici.

Un détail qu'ils paient et que 495 ne paie pas encore : réexporter des liaisons nommées plutôt qu'un
`export *`, un réexport générique laissant l'espace de noms indéfini à l'exécution quand le paquet
reste externe au bundle.

## Ce qui n'est pas reprenable en l'état

`renderDiff` de `pi-coding-agent` prend un **patch déjà rendu** — il analyse des lignes
`"+123 contenu"` — et rend une chaîne colorée avec préfixes `+`/`-` et numéros de ligne. `UX-07`
demande l'inverse, littéralement : le code et ses modifications se lisent *sans* préfixes de diff,
*sans* marqueurs de patch et *sans* numéros de ligne. Il importe en outre le singleton de thème de
Pi. Ce n'est donc ni la même entrée, ni la même sortie, ni la même dépendance.

`TreeSelectorComponent` est lié au modèle de session de Pi (`SessionTreeNode`) : il sélectionne des
entrées de conversation, pas des chemins d'un candidat.

## Ce qui demande une décision

`SelectList`, `ScrollView`, `HStack`, `Box`, `TruncatedText`, `keyHint`/`keyText` et
`truncateToVisualLines` couvrent ce que la surface fait à la main : défilement d'une liste, partage
en deux panneaux, troncature, aide clavier. Les reprendre supprimerait du code et alignerait le rendu
sur celui du reste de Pi.

L'obstacle n'est pas technique, il est écrit : la règle de couches interdit à `presentation/`
d'importer un paquet Pi, et son motif est `ADR-010` / `UX-11`. Ce motif mérite d'être réexaminé plutôt
que contourné, car ce qui garantit `UX-11` est le **modèle** de revue — `application/review.ts` et sa
projection textuelle —, que print, JSON, RPC et l'hôte SDK partagent, et non la surface TUI, qui n'en
est qu'un rendu parmi d'autres. Le vrai arbitrage est ailleurs : aujourd'hui la surface rend des
chaînes, donc `v0/review-surface` l'éprouve sans Pi, sans terminal et sans thème — 7 tests, dont
l'invariant de largeur. Une surface faite de composants Pi ne s'éprouve plus qu'avec un harnais TUI.

## Prompt

```
Dans ~/Projets/495-pi-package, lis D-35 dans specs/adr/, la règle `presentation` de
scripts/check-layers.ts avec son commentaire, et src/presentation/tui/review-surface.ts.
Regarde ensuite ce qu'exportent @earendil-works/pi-tui (index.d.ts) et
@earendil-works/pi-coding-agent : SelectList, ScrollView, HStack, Box, TruncatedText, keyHint,
truncateToVisualLines.

Un seul travail : décider, et écrire la décision.

Deux options, et une seule question pour les départager — ce qui garantit UX-11 est-il le
modèle de revue ou la pureté de la surface ?

1. La surface reste une fonction de rendu en chaînes, testable sans Pi. Ce que l'hôte apporte
   entre par injection, comme la mesure de D-35 : une option par besoin, jamais un import.
2. La surface devient un arbre de composants Pi et passe sous extension/. UX-11 reste tenue par
   application/review.ts et sa projection textuelle, que les autres entrées utilisent déjà. Il
   faut alors dire comment le rendu reste éprouvé : un harnais TUI, ou des tests de plus bas
   niveau sur le modèle.

Écris la décision retenue dans specs/adr/ avec son motif et sa conséquence, et mets la
règle de couches en accord avec elle. Ne convertis rien avant que la décision soit écrite.

Critères d'acceptation :
- la décision est écrite, avec ce qu'elle coûte en tests ;
- scripts/check-layers.ts et son commentaire disent la même chose que la décision ;
- si la conversion est retenue, les 7 tests de v0/review-surface ont un successeur nommé ;
- npm run check passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Mesure d'une ligne stylée, déjà reprise | `src/presentation/tui/review-surface.ts`, `fit` ; `src/extension/review-command.ts` |
| Règle de couches et son motif | `scripts/check-layers.ts`, règle `presentation` |
| Ce qui garantit la concordance multicanale | `src/application/review.ts`, `src/presentation/structured/review-text.ts` |
| Primitives de l'hôte | `@earendil-works/pi-tui` : `visibleWidth`, `truncateToWidth`, `sliceByColumn`, `wrapTextWithAnsi` |
| Composants de l'hôte | `@earendil-works/pi-tui` : `SelectList`, `ScrollView`, `HStack`, `Box`, `TruncatedText` |
| Rendu de diff de Pi | `@earendil-works/pi-coding-agent` : `renderDiff`, `generateUnifiedPatch` |

## Journal

**18 septembre 2026.** Ouverture après l'observation de la surface de revue dans un vrai terminal.
La primitive de largeur est reprise le jour même, parce qu'un défaut mesuré la justifiait ; le reste
est resté ouvert, faute d'une décision écrite sur ce que la règle de couches protège.
