# Étage 2 — QLT-04 : couverture sur le code introduit

**État :** livré
**Exigence :** QLT-04 [P0], avec QLT-02 en dépendance amont
**Dépend de :** étages 0 et 1

## Motif

QLT-04 demande des règles sur le code nouveau ou modifié, des tolérances nommées pour la dette
antérieure, et la non-aggravation comme critère. Sa recette : un candidat qui diminue un total de
constats mais introduit une violation interdite est refusé.

Un seuil global ne répond pas à cette exigence : il mesure l'hygiène d'un dépôt, bloque un
composant historiquement bas quel que soit le candidat, et laisse passer un ajout non testé quand
le reste compense.

Mesure relevée sur la cible Java pour un candidat accepté : 276 lignes instrumentées modifiées,
93 jamais exercées, 44 branches non couvertes, dont deux fichiers ajoutés à 0 %.

## Prompt

```
Dans ~/Projets/495-pi-package, lis specs/archive/ROADMAP.md (sections 1, 4 et 5) puis QLT-04 dans
specs/archive/amont/expression-besoins.md.

QLT-04 demande des règles sur le code nouveau ou modifié, des tolérances nommées pour la dette
antérieure, et la non-aggravation comme critère. Pas de seuil global : un ratio de dépôt bloque
un composant historiquement bas quel que soit le candidat, et laisse passer un ajout non testé
quand le reste compense.

Ajoute un contrôle de couverture différentielle, en t'appuyant sur ce qui existe :
- la cible Maven produit déjà target/site/jacoco/jacoco.xml à chaque phase test (jacoco
  `report` y est lié hors profil) : aucune exécution supplémentaire n'est nécessaire ;
- `diffLines` (src/application/diff.ts) rend des segments `kind:"new"` avec `new_start`, donc
  les lignes introduites côté candidat ;
- le texte de référence et celui du candidat sont dans le CAS (artefact `files_<candidate_id>`),
  donc le calcul est hors ligne et vérifiable dans un dossier exporté ;
- `Finding.baseline_state` est renseigné par l'étage 1 : appuie-toi sur le classement
  préexistant / introduit plutôt que d'en refaire un propre à la couverture.

`PARSER_IDS` est un enum fermé dans src/contracts/v1/protocol.ts : après modification, lance
`npm run contracts`.

Point difficile à traiter explicitement : ce contrôle doit être qualifié comme les autres
(témoins positif, négatif, incident). Détermine ce que sont ces trois témoins pour un contrôle
de couverture, ou justifie un régime de qualification différent.

Critères d'acceptation :
- sur un candidat ajoutant du code non testé, verdict FAIL localisé au fichier et à la ligne ;
- sur un refactoring qui ne touche que des lignes déjà couvertes, verdict PASS ;
- `npm run check` passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Lignes introduites | `diffLines`, segments `kind:"new"` avec `new_start` |
| Octets de référence et de candidat | CAS, artefacts `files_<candidate_id>` et `base_files_<candidate_id>` |
| État de constat | `Finding.baseline_state`, renseigné par l'étage 1 |
| Enum fermé des parsers | `PARSER_IDS` ; régénérer avec `npm run contracts` |
| Rapport de couverture | produit par le contrôle de test existant, sous `target/site/jacoco/` |

## Journal

**Ce que le contrôle mesure.** Le contrôle `coverage` ne juge que les lignes que le candidat a
écrites. `introducedLinesOf` (`src/application/coverage.ts`) reconstruit, fichier par fichier, les
segments `kind:"new"` de `diffLines` entre le texte de référence et celui du candidat ; le résultat
voyage jusqu'au capteur par `ControlInvocation.introduced_lines`. Une ligne instrumentée par JaCoCo,
introduite par le candidat et jamais exécutée est un constat bloquant, localisé à son fichier, à sa
ligne et à son symbole. Une ligne que le candidat n'a pas écrite est hors de la juridiction du
contrôle : elle est comptée et nommée (`tolerated_uncovered_lines`) sans rien bloquer. C'est là toute
la différence avec un ratio — les deux fixtures de `v1/coverage` le montrent sur le même arbre : un
composant à 40 % de couverture passe quand le candidat n'ajoute rien à sa dette, un composant à 80 %
échoue quand la seule ligne introduite est la ligne manquante.

**Aucune exécution supplémentaire.** La mesure est celle que `mvn test` écrit déjà : JaCoCo lie son
goal `report` à la phase `test`, donc le rapport est dans le workspace quand le contrôle de test a
fini. Le capteur n'exécute rien (`node -e ""`), lit `**/target/site/jacoco` et rend son verdict. Il
est déclaré après le contrôle qui produit son rapport, et la vérification exécute les contrôles dans
l'ordre du protocole gelé, dans le même workspace. Les `pom.xml` sont dans ses `protected_paths` :
désactiver le plugin ou exclure des classes rendrait le capteur muet, et QLT-04 réserve ce genre de
modification à une justification adoptée.

**Les trois témoins.** C'est le point que ce contrôle ne pouvait pas hériter. Le témoin négatif
partagé de la cible Maven est un test qui échoue ; il ne prouve rien ici, pour deux raisons
indépendantes : une suite rouge arrête la construction avant l'écriture de la mesure, et une ligne
non exercée n'est de toute façon pas un échec de test. Le régime de qualification reste celui des
autres contrôles — un témoin positif qui `PASS`, un contre-exemple qui `FAIL`, un capteur cassé qui
rend `INDETERMINATE` — mais l'arbre qui porte le défaut change, et c'est cela qui est devenu
explicite dans `StackDetection.own_negative_witness` :

| Témoin | Arbre | Ce qu'il établit |
| --- | --- | --- |
| positif | référence + `Witness495Covered` et le cas qui l'appelle | du code introduit et exercé ne déclenche rien |
| négatif | référence + témoin positif + `Witness495Uncovered`, que rien n'appelle | le capteur détecte une ligne introduite que la suite n'atteint pas, sur une construction qui aboutit |
| incident | même arbre, binaire de lancement inexistant | un capteur cassé rend `INDETERMINATE`, jamais `PASS` |

`stepVerificationDesign` matérialise un workspace de témoin négatif propre pour un contrôle qui en
déclare un, et le supprime après. Les fichiers du témoin sont aussi ce que le contrôle différentiel
considère comme introduit pendant sa qualification : ce sont les fichiers écrits par-dessus la
référence. L'absence de mesure suit la même règle que l'absence d'analyseur en QLT-02 : pas de
rapport, un fichier source introduit qu'aucun rapport ne mentionne, une attribution ambiguë entre
deux modules ou aucun ensemble de lignes introduites donnent `INDETERMINATE`, jamais `PASS`.

**Classement préexistant / introduit.** Le contrôle n'en refait pas un pour la couverture. Il
s'exécute sur la référence comme les autres, avec un ensemble de lignes introduites vide : la
référence n'introduit rien, le capteur n'a donc rien à dire et rend `PASS` sans même lire de rapport.
`classifyFindings` conclut de ce passage sans constat que chaque constat du candidat est `new`, et la
tolérance `no_aggravation` le laisse bloquant. Le déplacement est traité par le mécanisme existant :
`candidateShape` prouve un renommage par l'égalité des empreintes, et le fichier renommé est alors
comparé à son ancien nom — un déplacement ne crée pas de dette et n'en masque aucune.

**Ce qui bloque et ce qui est seulement rapporté.** Une ligne introduite jamais exécutée est
`blocker`. Une ligne introduite exécutée sur une partie seulement de ses branches est `major` : elle
apparaît au dossier et dans la revue, sans bloquer. La frontière est celle de `findingBlocks`, qui ne
retient que `blocker` ; elle est nommée dans les constats plutôt que réglée par un seuil.

**Obligation.** Un contrôle différentiel rejoint toutes les obligations, quelle que soit la catégorie
de l'exigence : une exigence dont aucune ligne n'est exercée n'est pas démontrée par une suite restée
verte, et une amélioration ailleurs ne la compense pas. Le revers est qu'un refus nomme les deux
contrôles de l'obligation (`maven-test=PASS, coverage=FAIL`).

**Portée.** La cible Maven avec JaCoCo lié hors profil. `bindsJacocoReport` neutralise les blocs
`<profiles>` avant de chercher le plugin et le goal : un rapport qui n'existe que sous un profil
activé n'est pas une mesure que `mvn test` produit. Sans ce rapport, aucun contrôle de couverture
n'est proposé et l'insuffisance est inscrite dans `capability_diagnosis.notes`, où PRE-01 range déjà
ce que les contrôles de la cible ne savent pas décider. La stack Node n'est pas couverte : sa mesure
demanderait un autre format et un autre passage.

**Coût.** Nul côté candidat et côté référence : le capteur n'exécute rien et le passage de référence
conclut avant toute lecture. La qualification paie un workspace et un `mvn test` de plus pour le
témoin négatif propre, mémorisés par `reusableQualification` comme les autres. Le gel du candidat
écrit un artefact de plus, `base_files_<candidate_id>`, qui porte les octets de référence des
fichiers modifiés ou supprimés : sans lui, les lignes introduites ne seraient pas recalculables
depuis un dossier exporté, et le calcul ne serait vérifiable que sur la machine qui l'a fait.

**Limites connues.** Un renommage accompagné d'une modification n'est pas prouvé par le manifeste :
le fichier est lu comme un ajout et toutes ses lignes comptent comme introduites. Le rapport est lu
dans le workspace, où le producteur dispose de `bash` : un rapport plus ancien qu'il aurait laissé
serait lu comme la mesure du candidat — c'est l'exposition que le capteur Surefire porte déjà, et
elle n'est pas traitée ici. Les octets de référence sont lus dans le projet, comme le sont déjà ceux
que la matérialisation d'un workspace recopie : un projet modifié à la main pendant un changement
décale les deux côtés du diff, et rien ici ne le détecte — la garde relèverait de la capture de
référence, pas de ce contrôle. La couverture de branches est rapportée sans bloquer. Enfin, les
autres clauses de QLT-04 — exclusions, annotations de silence et seuils sous justification adoptée —
ne sont tenues que par la protection des `pom.xml` ; QLT-01, QLT-02, QLT-03 et QLT-05 restent
absentes.
