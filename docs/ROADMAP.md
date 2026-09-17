# Feuille de route — au-delà du socle P0

`PLAN.md` couvre les incréments livrés, `MILESTONES.md` les jalons et leurs critères de sortie.
Ce document couvre ce qui reste : la moitié de P0 qui n'a pas été commencée, les exigences marquées
au-delà de P0, et l'ordre dans lequel les prendre.

L'expression de besoins compte 85 exigences fonctionnelles `[P0]` et 8 exigences non fonctionnelles
`NFR-01` à `NFR-08` `[P0]`, soit 93, puis 18 `[P1]` et 1 `[P2]`. Le décompte importe : un
recensement qui ne lit que les exigences fonctionnelles en oublie huit, dont deux non couvertes.

## 1. Le principe qui les unifie : le contrôle de l'introduit

Le registre de références retient, pour la vérification du changement : « baseline, constats
stables, contrôle de l'introduit, preuves déterministes puis revue bornée ». Chacune des exigences
restantes est une instance de ce même geste — **analyser la référence, analyser le candidat,
statuer sur le delta** — appliqué à un analyseur différent.

| Exigence | Ce qu'on compare à la référence |
| --- | --- |
| PRE-01 | la capacité de détection des contrôles existants |
| VER-08 | les constats de tout contrôle, et la stabilité de son verdict |
| QLT-02 | les constats de qualité |
| QLT-04 | les violations introduites par le code nouveau ou modifié |
| ARC-01, ARC-04, CON-03 | les frontières, cycles et dépendances |
| VER-04 | les mutants survivants |

VER-08 tient une place particulière : c'est la seule qui exige le mécanisme lui-même. « Le système
DOIT pouvoir exécuter les contrôles pertinents sur la référence initiale et sur le candidat dans
des environnements comparables. » Les autres exigences nomment chacune un analyseur ; VER-08 nomme
la comparaison sans laquelle aucun d'eux ne peut conclure sur un delta.

L'enveloppe est déjà dans le contrat v1 : `Finding` porte `baseline_state` avec les valeurs
`new`, `preexisting`, `removed`, `unknown`. Le runner écrit `new` en dur et n'exécute que le
candidat. Il ne manque donc pas un sous-système, il manque la comparaison à la référence — un
mécanisme, N analyseurs.

Ce principe a une conséquence directe sur les seuils : un ratio global mesure l'hygiène d'un dépôt,
pas un changement. Il bloque un composant historiquement sous le seuil quel que soit le candidat, et
laisse passer un ajout non testé quand le reste compense. QLT-04 demande explicitement l'inverse :
des règles sur le code nouveau ou modifié, des tolérances nommées pour la dette antérieure, et la
non-aggravation comme critère.

## 2. La moitié de P0 non commencée

| Exigence | Objet | État |
| --- | --- | --- |
| PRE-01, reste | cartographie des contrôles existants : assertions, dépendances, instabilité | l'échelle à quatre niveaux et l'ouverture de la préparation sont livrées ; l'instabilité relève de VER-08 |
| PRE-04 | tests de caractérisation d'un existant sans consacrer ses défauts | absent |
| PRE-05 | compléter et requalifier la capacité de vérification à chaque incrément | absent |
| VER-08 | contrôles exécutés sur la référence, défaut préexistant distingué d'une régression, instabilité traitée par une règle préenregistrée | absent |
| CON-03 | règle architecturale opposable sur la cible, avec vérification exécutable | absent ; la seule règle exécutable porte sur le dépôt 495 lui-même (NFR-07) |
| ARC-01..04 | architecture réalisée, cible, migration progressive, contrainte sur la génération | absents |
| QLT-01..05 | référentiel, baseline, réduction de dette, non-dégradation, conformité démontrée | absents |
| RAG-01, RAG-02, RAG-04 | besoin de connaissance identifié, corpus officiel versionné, utilisation de la documentation vérifiée | absents |
| EXP-01..04 | disciplines applicables, proportionnalité des choix, expertises mobilisées, démarche évaluée | absents |
| NFR-05 | portabilité qualifiée | backend Linux implémenté, jamais exécuté |
| NFR-06 | observabilité sans surveillance imposée | aucun point de télémétrie n'existe, mais aucun contrôle ne l'établit |
| IH-04 | arbitrage de vérifiabilité, l'issue humaine d'une exigence non discriminable | déclarée dans les contrats, exclue du constructeur de demandes de décision |

### Le défaut que cette absence produit

G2 exige qu'un contrôle qualifié passe sur la référence : c'est la condition pour qu'il ne crie pas
au loup. Il en découle que **tout contrôle qualifié est vert sur la référence**, donc qu'il rend le
même verdict que l'exigence soit satisfaite ou absente. Aucun contrôle qualifié ne peut, seul,
prouver une exigence qui affirme un comportement nouveau.

L'amont ne dit pas autre chose : G2 demande « couverture de chaque obligation, capacité de contrôle
opérationnelle, **tests discriminants qualifiés ou décision humaine assignée**, règles gelées ». La
discrimination y est une condition de la gate, pas un raffinement.

La seule source de discrimination du protocole est la suite préparée, dont l'adoption exige
`on_reference: FAIL`. La préparation s'ouvre sur l'absence de discrimination : une exigence qui
affirme un comportement que la référence n'a pas obtient une suite qui échoue sur cette référence,
quel que soit le nombre de fichiers de test déjà présents. Un refactoring, dont l'exigence est le
comportement inchangé, garde la suite verte pour oracle et n'ouvre rien — à condition que cette
suite exécute quelque chose, ce que les niveaux 2 et 3 de l'échelle vérifient.

Ce qui subsiste est la mesure de ce que la suite atteint. La conséquence observée sur la cible Java
— un candidat ajoutant 276 lignes instrumentées dont 93 ne sont exercées par aucun test, et 44
branches non couvertes, accepté à G5 — relève de la couverture du code introduit (QLT-04) et du
classement des constats par rapport à la référence (VER-08), non du déclencheur.

**Un verdict n'est donc pas une preuve.** Toute formulation qui se contente d'exiger qu'une
exigence « possède un verdict » est satisfaite par un contrôle vert qui n'a rien discriminé. La
condition à tenir est qu'elle possède un verdict discriminant, ou l'arbitrage humain qui en tient
lieu.

## 3. Ce qui est prévu au-delà de P0

| Domaine | Exigences |
| --- | --- |
| Vérification | VER-04 angles multiples (propriétés, fuzzing, mutation), VER-07 performance et exploitation |
| Amélioration | IMP-01 défauts échappés, IMP-02 renforcement par changement séparé, IMP-03 comparer modèles et configurations, IMP-04 optimiser une métrique sous contraintes [P2] |
| Connaissance | CON-04 réutilisation, CON-05 connaissance versionnée, RAG-03 passages traçables, RAG-05 corpus, CTX-03 chargement progressif |
| Architecture | ARC-05 suivre la dérive et la réalisation de la cible |
| Divers | REQ-05 liens sémantiques, AGT-05 délégation, AGT-07 changement de modèle, GIT-04 changements concurrents, EXT-05 profils partagés |

VER-05 et DEC-04, marquées `[P1]`, sont couvertes : la qualification par témoin négatif et la
détection de stagnation ont été livrées avec le socle parce que G2 et les budgets les appellent.
Elles ne figurent donc pas dans ce tableau.

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

C'est aussi ce que dit CON-05 pour les ressources versionnées : « un skill peut guider une action ou
fournir un outil, mais sa seule présence ne constitue aucune preuve de conformité ». Et ARC-04 pour
la conception transmise au producteur : « une architecture adoptée ne doit pas rester seulement une
consigne dans le contexte ».

Les analyseurs restent derrière des adaptateurs natifs par écosystème, avec une enveloppe de constat
commune : l'homogénéité porte sur les identités, localisations, empreintes, niveaux de confiance et
verdicts, pas sur un moteur unique imposé à tous les langages.

## 5. Ordre proposé

| Étage | Exigence | Objet | Appui existant |
| --- | --- | --- | --- |
| 0 | PRE-01 | échelle de capacité à quatre niveaux ; la préparation s'ouvre sur l'absence de discrimination, non sur l'absence de fichiers de test | livré : `diagnoseControlCapability`, `Protocol.capability_diagnosis` |
| 1 | VER-08 | exécuter les contrôles sur la référence, classer les constats, traiter l'instabilité par une règle préenregistrée | `Finding.baseline_state` et `fingerprint` existent ; `environment_digest` exprime déjà la comparabilité |
| 2 | QLT-04 | contrôle de couverture sur les lignes introduites | rapport de couverture déjà produit par le contrôle gelé ; `diff.ts` fournit les lignes modifiées |
| 3 | ARC-04, CON-03 | constats structurels (frontières, cycles, dépendances interdites) dans la même enveloppe | `Finding`, `runner.ts`, profils d'exécution, précédent `check-layers.ts` |
| 4 | VER-04 | mutation sur les classes modifiées | runner générique, budget de contrôle dédié |

L'ordre n'est pas une préférence. L'étage 2 mesure la couverture du code introduit : sans l'étage 0
il mesure des tests qui ne prouvent rien, et sans l'étage 1 il ne sait pas distinguer une lacune
héritée d'une lacune créée. Les étages 3 et 4 réutilisent le même classement.

Les étages 0 à 3 portent des exigences `[P0]` et relèvent donc du socle ; seul l'étage 4 porte une
exigence `[P1]`. Le coût, lui, ne suit pas cette frontière. Les étages 0 et 2 se branchent sur du
code existant sans exécution supplémentaire côté candidat : le rapport de couverture est déjà écrit
par le contrôle de test. L'étage 1 ajoute un passage sur la référence, que le protocole peut
mémoriser par référence et par empreinte d'environnement. Les étages 3 et 4 ajoutent des analyseurs
natifs, et l'étage 4 un budget de contrôle propre.

Trois travaux n'appartiennent pas à cette échelle et peuvent avancer en parallèle : la complétude de
la matrice de traçabilité, les six revues obligatoires de qualification, et la clôture du jalon L0.

Chaque étage et chaque travail transverse a sa fiche dans `chantiers/`, avec ses points d'ancrage
dans le code, ses critères d'acceptation et son journal.

## 6. Interactions humaines concernées

IH-04, arbitrage de vérifiabilité, est prévue pour l'oracle insuffisant : obligation, lacune,
options et risque, avec pour issues préparer, assigner une revue humaine ou réviser l'exigence.
Elle n'est pas implémentée — `buildDecisionRequest` et `requestDecision` l'excluent de leur domaine.
C'est l'issue attendue lorsqu'une exigence reste non discriminable après préparation, et le pendant
humain de la condition de G2 rappelée en section 2. En son absence, deux préparations refusées
arrêtent le changement sur `capability_missing` : le constat est juste, mais il n'offre aucune voie
de sortie et le diagnostic qui le motive n'est présenté à personne.
