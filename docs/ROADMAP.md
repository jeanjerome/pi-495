# Feuille de route — au-delà du socle P0

`PLAN.md` couvre le socle livré. Ce document couvre ce qui reste : la moitié de P0 qui n'a pas été
commencée, les exigences marquées au-delà de P0, et l'ordre dans lequel les prendre.

L'expression de besoins compte 93 exigences [P0], 18 [P1] et 1 [P2].

## 1. Le principe qui les unifie : le contrôle de l'introduit

Le registre de références retient, pour la vérification du changement : « baseline, constats
stables, contrôle de l'introduit, preuves déterministes puis revue bornée ». Chacune des exigences
restantes est une instance de ce même geste — **analyser la référence, analyser le candidat,
statuer sur le delta** — appliqué à un analyseur différent.

| Exigence | Ce qu'on compare à la référence |
| --- | --- |
| PRE-01 | la capacité de détection des contrôles existants |
| QLT-02 | les constats de qualité |
| QLT-04 | les violations introduites par le code nouveau ou modifié |
| ARC-01, ARC-04 | les frontières, cycles et dépendances |
| VER-04 | les mutants survivants |

L'enveloppe est déjà dans le contrat v1 : `Finding` porte `baseline_state` avec les valeurs
`new`, `preexisting`, `removed`, `unknown`. Le runner écrit `new` en dur. Il ne manque donc pas un
sous-système, il manque la comparaison à la référence — un mécanisme, N analyseurs.

Ce principe a une conséquence directe sur les seuils : un ratio global mesure l'hygiène d'un dépôt,
pas un changement. Il bloque un composant historiquement sous le seuil quel que soit le candidat, et
laisse passer un ajout non testé quand le reste compense. QLT-04 demande explicitement l'inverse :
des règles sur le code nouveau ou modifié, des tolérances nommées pour la dette antérieure, et la
non-aggravation comme critère.

## 2. La moitié de P0 non commencée

| Exigence | Objet | État |
| --- | --- | --- |
| PRE-01 | distinguer fichier de test présent, test découvrable, test exécuté, contrôle capable de détecter le défaut visé | échelle implémentée au premier niveau seulement |
| PRE-04 | tests de caractérisation d'un existant sans consacrer ses défauts | absent |
| PRE-05 | compléter et requalifier la capacité de vérification à chaque incrément | absent |
| ARC-01..04 | architecture réalisée, cible, migration progressive, contrainte sur la génération | absents |
| QLT-01..05 | référentiel, baseline, réduction de dette, non-dégradation, conformité démontrée | absents |

### Le défaut que cette absence produit

G2 exige qu'un contrôle qualifié passe sur la référence : c'est la condition pour qu'il ne crie pas
au loup. Il en découle que **tout contrôle qualifié est vert sur la référence**, donc qu'il rend le
même verdict que l'exigence soit satisfaite ou absente. Aucun contrôle qualifié ne peut, seul,
prouver une exigence qui affirme un comportement nouveau.

La seule source de discrimination du protocole est la suite préparée, dont l'adoption exige
`on_reference: FAIL`. Or la préparation n'est ouverte que si la cible ne contient aucun fichier de
test. Tout projet qui en contient un seul saute la préparation, n'obtient aucune discrimination, et
voit ses exigences déclarées satisfaites par une suite qui les ignore.

La conséquence est observable : un candidat ajoutant 276 lignes instrumentées dont 93 ne sont
exercées par aucun test, et 44 branches non couvertes, passe G5 en `accepted`, y compris pour des
exigences portant explicitement sur l'existence de scénarios de test.

C'est précisément la recette de PRE-01 : sur un dépôt dont les tests n'atteignent pas le
comportement visé, le diagnostic doit signaler l'insuffisance « sans la convertir en couverture
satisfaisante ».

## 3. Ce qui est prévu au-delà de P0

| Domaine | Exigences |
| --- | --- |
| Vérification | VER-04 angles multiples (propriétés, fuzzing, mutation), VER-05 qualifier la détection, VER-07 performance et exploitation |
| Amélioration | IMP-01 défauts échappés, IMP-02 renforcement par changement séparé, IMP-03 comparer modèles et configurations, IMP-04 optimiser une métrique sous contraintes [P2] |
| Connaissance | CON-04 réutilisation, CON-05 connaissance versionnée, RAG-03 passages traçables, RAG-05 corpus, CTX-03 chargement progressif |
| Architecture | ARC-05 suivre la dérive et la réalisation de la cible |
| Divers | REQ-05 liens sémantiques, AGT-05 délégation, AGT-07 changement de modèle, DEC-04 stagnation, GIT-04 changements concurrents, EXT-05 profils partagés |

Une règle de cadrage encadre ce découpage : une capacité requise par un incrément P0 ne peut être
écartée au motif qu'une intégration avancée est prévue ensuite. L'orchestration générique de tests
natifs est P0 ; les intégrations spécialisées pour mutation, fuzzing ou indexation documentaire
viennent après. Un contrôle de mutation exécuté par le runner générique relève donc du socle ; un
intégrateur dédié à un outil de mutation relève de la suite.

Les contrôles coûteux peuvent recevoir un budget propre. Si ce budget empêche de produire une preuve
obligatoire, le changement reste indéterminé : le seuil n'est pas abaissé pour terminer.

## 4. Familles d'instruments et autorité

Deux régimes, qui ne se remplacent pas : ce qui contraint avant l'écriture, et ce qui observe après.

| Famille | Régime | Rattachement | Peut fonder un verdict |
| --- | --- | --- | --- |
| Couverture, mutation, propriétés, fuzzing | observation | contrôles du protocole gelé | oui |
| Analyseurs de code (diagnostics de langage, règles syntaxiques, cycles, dépendances) | observation | adaptateurs derrière l'enveloppe `Finding` ; alimentent PRE-01, QLT-02, ARC-01 | oui, une fois qualifiés |
| Hooks d'édition | contrainte | profil d'intervention, worker | non |
| Compétences et gabarits d'instructions | contrainte | contexte d'intervention | non |

Les deux derniers régimes améliorent ce que le producteur remet du premier coup. Ils ne peuvent pas
fonder un verdict : ils agissent sur l'inférence même qui produit le code. Tout ce qui est
vérifiable mécaniquement doit l'être par un contrôle exécuté ; le jugement d'un modèle n'intervient
que là où la règle ne s'exprime pas encore mécaniquement.

Les analyseurs restent derrière des adaptateurs natifs par écosystème, avec une enveloppe de constat
commune : l'homogénéité porte sur les identités, localisations, empreintes, niveaux de confiance et
verdicts, pas sur un moteur unique imposé à tous les langages.

## 5. Ordre proposé

| Étage | Exigence | Objet | Appui existant |
| --- | --- | --- | --- |
| 0 | PRE-01 | échelle de capacité à quatre niveaux ; la préparation s'ouvre sur l'absence de discrimination, non sur l'absence de fichiers de test | `preparation.ts` calcule déjà `on_reference` et `discriminant` |
| 1 | QLT-04 | contrôle de couverture sur les lignes introduites ; `baseline_state` renseigné | rapport de couverture déjà produit par le contrôle gelé ; `diff.ts` fournit les lignes modifiées |
| 2 | ARC-04 | constats structurels (frontières, cycles, dépendances interdites) dans la même enveloppe | `Finding`, `runner.ts`, profils d'exécution |
| 3 | VER-04 | mutation sur les classes modifiées | runner générique, budget de contrôle dédié |

Les étages 0 et 1 relèvent du socle, se branchent sur du code existant et n'exigent aucune exécution
supplémentaire : le rapport de couverture est déjà écrit par le contrôle de test. Les étages 2 et 3
ajoutent des analyseurs et un budget.

## 6. Interactions humaines concernées

IH-04, arbitrage de vérifiabilité, est prévue pour l'oracle insuffisant : obligation, lacune,
options et risque, avec pour issues préparer, assigner une revue humaine ou réviser l'exigence.
Elle n'est pas implémentée — `buildDecisionRequest` et `requestDecision` l'excluent de leur domaine.
C'est l'issue attendue lorsqu'une exigence reste non discriminable après préparation.
