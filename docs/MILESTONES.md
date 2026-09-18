# Jalons de livraison L0 à L3

`PLAN.md` décrit les incréments d'implémentation et l'organisation des répertoires. `STATUS.md` dit
ce que chacun a réellement livré. Ce document dit autre chose : **quels jalons ces incréments
servent, et à quelles conditions un jalon est franchi.** Le découpage L0 à L3 vient de
`amont/expression-besoins.md` §15 ; les critères de sortie viennent de
`amont/conception-verification.md` §12 et de `amont/conception-technique.md` §16.

Ce document est un document de suivi. En cas de contradiction avec l'amont, c'est l'amont qui fait
foi ; en cas de contradiction avec `STATUS.md` sur l'état réel, c'est `STATUS.md`.

## 1. Priorité et jalon ne sont pas la même chose

| Notion | Sens |
| --- | --- |
| `P0` `P1` `P2` | La priorité d'une **exigence**, portée par l'expression de besoins. Elle ne bouge que par révision de l'amont. |
| `L0` `L1` `L2` `L3` | Un **jalon de livraison**. Il agrège des incréments, mais son verdict est recalculé sur ses propres critères. |

La confusion des deux produit une erreur précise : croire qu'avoir livré les incréments d'un jalon
revient à l'avoir franchi. Un jalon a des critères que les incréments pris un à un ne portent pas —
deux plateformes, cinq entrées, des revues, un dossier de preuves intègre. Le verdict d'un jalon
n'est donc jamais la somme automatique des verdicts de ses enfants.

Quatre états suffisent à décrire un jalon ou une sous-livraison : **non commencé**, **en cours**,
**livré non qualifié** (le code et ses tests existent, les critères du jalon ne sont pas tous
établis), **qualifié**. Ce vocabulaire est un vocabulaire de suivi ; il n'a aucun effet sur la
machine à états d'un changement (`intake → … → closed`), gelée dans les contrats v1.

## 2. Vue d'ensemble

| Jalon | Finalité | État | Ce qui bloque |
| --- | --- | --- | --- |
| `L0` | Lever les inconnues techniques, sans promesse produit | qualifié sur macOS arm64, Linux non revendiqué | rien ; deux lignes de risque portent un travail identifié, pas une décision manquante |
| `L1` | Premier produit conduisant un changement et un programme séquentiel sous contrôle | en cours | la moitié de P0 non commencée, les trois revues obligatoires en attente d'autorité |
| `L2` | Cible produit complète | non commencé | dépend de la qualification de L1 |
| `L3` | Extensions optionnelles | non commencé | une seule exigence `[P2]` formalisée |

## 3. L0 — qualification technique

L0 démontre les propriétés structurantes et produit une décision argumentée pour chaque risque. Il
ne promet aucune capacité produit. La conception technique §18 lui rattache les incréments `IT-0`
à `IT-4`, dont la sortie déclarée est « parcours L0 complet et base du parcours L1 ».

| Incrément | Objet | État |
| --- | --- | --- |
| `IT-0` | contrats v1, noyau, stockage SQLite et CAS, pannes injectées | livré, qualifié ici |
| `IT-1` | package Pi, commandes, liaison de session, modes | livré, qualifié dans les cinq entrées |
| `IT-2` | worker, sandbox, workspace, manifeste de candidat | livré, qualifié sur macOS arm64 |
| `IT-3` | runner, parsers, qualification, G2 à G5, décision | livré, qualifié ici |
| `IT-4` | modèle de revue, composant TUI, intégration Git | livré ; revue humaine non réalisée |

### Ce que la qualification L0 a établi

- **Plateformes.** macOS arm64 est qualifiée : la matrice d'attaque Seatbelt est exécutée par
  `v1/sandbox`. **Linux x86-64 n'est pas revendiquée** — voir ci-dessous.
- **Les cinq entrées.** `v3/pi-entries` couvre print et JSON, `v3/pi-rpc-sdk` couvre un client RPC
  réel et un hôte SDK, `v0/review-surface` couvre le composant TUI. Les quatre entrées structurées
  rendent la même empreinte de candidat, les mêmes gates et le même instantané de revue, ce qui
  clôt `UX-11` pour la concordance des données de revue.
- **Les dix lignes de risque** de `amont/conception-technique.md` §16 possèdent chacune leur
  décision écrite et sa preuve, ou le travail qui manque : [RISQUES-L0.md](RISQUES-L0.md).
- **Les trois paramètres différés** sont fixés avec leur protocole, leur fixture et leur critère de
  décision (`DECISIONS.md` D-33, `v0/review-parameters`).

### Linux x86-64 n'est pas revendiquée

L0 demande une décision argumentée, pas une promesse. La décision est de **ne pas revendiquer
Linux** (`DECISIONS.md` D-31). Il n'existe pas d'état intermédiaire : le backend `bubblewrap` échoue
sa qualification sur toute machine, et la frontière d'exécution refuse alors tout rôle confiné avec
`capability_missing`. Ce refus est éprouvé par exécution sur Linux, pas seulement écrit —
`QUALIFICATION.md`, campagne du 17 septembre 2026.

`NFR-05` est donc **non satisfaite**, et annoncée telle. Ce qui la satisferait est nommé : une
machine Linux x86-64 réelle, la campagne V1 sandbox et une campagne V4 par combinaison de pile
revendiquée.

Un échec L0 ne réduit pas le besoin : il conduit à réviser la solution, l'architecture ou une
dépendance, puis à requalifier. Une plateforme non revendiquée n'est pas un échec du jalon ; c'en
est une sortie, qui borne ce que la suite peut annoncer.

## 4. L1 — socle produit P0

L'amont découpe L1 en quatre sous-livraisons. Elles ne sont pas des lots indivisibles, et aucune
n'autorise à annoncer une capacité P0 avant sa recette.

| Sous-livraison | Familles dominantes | Porté par | État |
| --- | --- | --- | --- |
| Noyau et changement unitaire | `BES`, `REQ-01..04`, `CON-01`, `CON-02`, `CTX-01`, `CTX-02`, `CTX-04`, `CTX-05`, `AGT-01..04`, `AGT-06`, `VER-01..03`, `VER-06`, `DEC-01..03`, `DEC-05`, `DEC-06`, `SEC`, `GIT-01..03`, `GIT-05`, `EVD`, `UX`, `IMP-05` | `IT-0` à `IT-4` | livré non qualifié |
| Préparation et dépôt vierge | `PRE`, `EXT-01..03`, `RAG-01`, `RAG-02`, `RAG-04`, `PRG-01`, `PRG-02` | `IT-5` | partiel : préparation livrée et ouverte sur l'échelle à quatre niveaux de `PRE-01`, `PRE-04` et `PRE-05` absents, `RAG` absent |
| Programme séquentiel | `PRG-03..05`, `BES-04` | `IT-5` | noyau et stockage seulement |
| Diagnostic et remise à niveau | `ARC-01..04`, `QLT-01..05`, `CON-03`, `VER-08`, `EXP-01..04` | — | partiel : `VER-08`, `QLT-04`, `ARC-04` et `CON-03` livrés, `ARC-01` pour sa part observable, le reste non commencé ; l'angle mutation de `VER-04` complète l'échelle du contrôle de l'introduit |

La quatrième sous-livraison est celle que `ROADMAP.md` détaille et que `chantiers/` porte. Elle
n'est pas un complément : sans elle, rien ne mesure ce que la suite discriminante atteint sur le
code introduit, et G2 accepte encore une obligation sans consulter le diagnostic de capacité — voir
`ROADMAP.md` §2.

### Critères de sortie de L1

Aux dix conditions de la règle de décision de livraison s'ajoutent les critères propres au jalon :

1. les 93 exigences `[P0]` possèdent un verdict **discriminant** sur leur périmètre applicable, ou
   l'arbitrage humain qui en tient lieu ; un contrôle vert sur la référence n'est pas un verdict ;
2. TypeScript et Java couvrent les parcours de référence — **non satisfait** : conduits depuis Pi,
   les deux parcours s'arrêtent à G2, l'un sur la qualification du capteur de couverture
   (`chantiers/D`), l'autre sur la commande de test de l'adaptateur node (`chantiers/E`). Ce qui
   traverse les neuf étapes aujourd'hui est une fixture, pas une cible ;
3. macOS arm64 et Linux x86-64 sont qualifiés ; L0 a décidé de ne pas revendiquer Linux, donc ce
   critère est aujourd'hui **non satisfait** et le restera tant qu'une machine Linux ne conduira pas
   les campagnes — à moins qu'une révision de l'amont ne retire cette plateforme de la cible ;
4. le même package est exercé dans les cinq entrées Pi — satisfait depuis L0 ;
5. dépôt vierge, existant contrôlé, existant mal contrôlé et remise à niveau sont démontrés ;
6. les six revues obligatoires sont réalisées et leurs constats bloquants clos, refusés
   explicitement ou couverts par une dérogation ;
7. aucun défaut ouvert ne remet en cause les invariants de décision, de preuve, de sécurité ou
   d'intégration ;
8. les capacités `[P1]` et `[P2]` absentes sont annoncées, jamais simulées par une affirmation P0.

Le point 1 mérite sa formulation exacte. « Posséder un verdict » est satisfait par un contrôle qui
aurait rendu le même verdict en l'absence de l'exigence. C'est la démonstration de `ROADMAP.md` §2,
et c'est la raison d'être des étages 0 et 1.

## 5. L2 — généralisation P1

L2 ne commence qu'après qualification de L1. Chaque travail L2 réutilise les contrats communs et les
entrées Pi, maintient les garanties P0, qualifie tout package ajouté seul puis dans le profil
composé, et fournit une migration des données, profils et preuves persistés.

| Domaine | Exigences | Dépend de |
| --- | --- | --- |
| Ressources, connaissance et profils versionnés | `CON-04`, `CON-05`, `CTX-03`, `EXT-05` | L1 qualifié |
| Angles de vérification et exploitation | `VER-04`, `VER-07`, `REQ-05` | les ressources versionnées ; précède la concurrence et l'amélioration |
| Recherche documentaire et architecture longitudinales | `RAG-03`, `RAG-05`, `ARC-05` | les ressources versionnées |
| Coordination multi-agents et multi-modèles | `AGT-05`, `AGT-07`, `GIT-04` | les angles de vérification |
| Boucle d'amélioration | `IMP-01`, `IMP-02`, `IMP-03` | les angles de vérification, puis les deux domaines précédents |

Les valeurs initiales de délégation sont fixées par la spécification fonctionnelle : deux
interventions simultanées, profondeur un, huit enfants au maximum par changement.

`VER-04` est l'étage 4 de `chantiers/` : la mutation par le runner générique relève du socle, un
intégrateur dédié à un outil de mutation relève de L2. Les deux ne se confondent pas, et le premier
est livré — ce qui reste de `VER-04` pour ce domaine sont ses autres angles et l'activation selon le
risque du changement.

## 6. L3 — extensions optionnelles

L3 est un portefeuille, pas un lot. L'absence d'une extension L3 n'empêche pas la qualification de
L2, et il n'existe pas de statut « P2 complet » tant que le périmètre optionnel n'est pas défini.

Une seule exigence `[P2]` est formalisée : `IMP-04`, optimiser une métrique sous contraintes. Les
autres thèmes évoqués par l'amont — autres hôtes ou interfaces passant par Pi, autres systèmes
d'exploitation, attestations renforcées, adaptateurs distants — ne sont pas des engagements.

Avant d'ouvrir un travail L3, une décision d'opportunité doit fournir le cas d'usage réel et son
bénéficiaire, l'écart que L2 ne couvre pas, les exigences identifiées avec leurs critères de
recette, l'impact sur les frontières de confiance et les coûts, les alternatives y compris ne rien
faire, un protocole d'expérience borné avec sa règle d'arrêt, et une décision entre intégration,
maintien expérimental et abandon.

## 7. Campagnes et revues

Les campagnes `V0` à `V5` et les six revues obligatoires sont définies par
`amont/conception-verification.md` §7 et §11 ; elles ne sont pas redéfinies ici. Le dossier de
chaque revue, et les constats de celles qui sont conduites, sont dans `revues/`. Trois règles
d'application méritent d'être rappelées parce qu'elles sont faciles à contourner sans le vouloir :

- `V4` est obligatoire **pour chaque combinaison revendiquée** de stack et de plateforme. Une
  campagne exécutée une fois, hors suite par défaut, qualifie cette exécution, pas la combinaison.
  La campagne Maven du 17 septembre 2026 en donne la démonstration : `V4` qualifie le capteur de
  couverture en lançant elle-même le contrôle qui écrit le rapport, ce que le cycle ne fait pas, et
  le même capteur échoue donc à se qualifier dès qu'un changement réel le demande.
- Une indisponibilité externe ne transforme pas une propriété déterministe en propriété
  invérifiable. `V0` à `V3` restent exécutables localement sans modèle réel.
- Une revue ne remplace pas un contrôle mécanique disponible. Un constat qu'un programme sait rendre
  devient un contrôle branché sur `npm run check` ; un avis daté se périme au commit suivant.

## 8. Règles de dépendance

1. Un jalon ne se franchit pas parce que ses incréments sont livrés : ses critères propres
   s'appliquent, et son verdict est recalculé.
2. Une capacité différée qui devient nécessaire à un changement bloque ce changement. Sa priorité
   produit ne réduit jamais l'obligation de la cible.
3. Une exigence différée reste dans la matrice avec son contrôle prévu ; elle ne peut pas être
   déclarée satisfaite avant exécution de ce contrôle.
4. Une capacité requise par un incrément P0 ne peut être écartée au motif qu'une intégration avancée
   est prévue ensuite.
5. Toute fusion de travaux parallèles constitue un nouveau candidat et repasse ses contrôles de
   combinaison.
6. Un jalon déjà qualifié ne change pas rétroactivement de verdict : une connaissance nouvelle ouvre
   une analyse, une restriction annoncée ou un changement séparé.
