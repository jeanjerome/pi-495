# Relevé des specs — ce qu'une ligne dit, et ce qu'elle devrait dire

Ce relevé ne réécrit rien. Il applique un seul critère, ligne à ligne, et rend le fichier, la
ligne, la question échouée et ce que la ligne devrait dire à la place.

**Q1 — cette ligne dit-elle ce que quelqu'un gagne, ou comment le construire ?**
**Q2 — porte-t-elle un chiffre, une mesure, un compte ou un nom de fichier qui périmera ?**

## Portée couverte

| Lu | État |
|---|---|
| `epics/e23…/e23s02-…md` | intégral |
| `archive/amont/expression-besoins.md` | §4.1–4.11, §5, §12, §13 ; §4.12–4.18 et §6–§11 non lus |
| `archive/amont/specification-fonctionnelle.md` | §7 (PF-01..24), §8.7, §8.10, §10, §13 (SA-001..045), §14, §15, §16 ; §6, §9, §11, §12 non lus |
| `archive/amont/conception-verification.md` | relevé de mesures seulement |
| `archive/amont/conception-technique.md` | relevé de mesures seulement |
| `adr/` (76 décisions) | relevé de mesures seulement ; D-33, D-40, D-46 lus |

Non lu : `archive/chantiers/`, `archive/revues/`, `spikes/`, `verifications/`, `security/`,
`product/`, les autres stories d'`e23`.

## Ce que le corpus fait déjà bien, et qui sert de modèle

`specification-fonctionnelle.md` §16 (L1264–1274) diffère chaque valeur à la qualification et écrit
en regard la **contrainte déjà acquise** : « Aucune opération de revue ne peut disparaître »,
« Toute limite reste visible et annulable », « Les valeurs restent explicites, bornées et révisables
par décision ». Une contrainte de cette forme dit ce que le lecteur gagne, survit au chiffre, et
reste vraie quelle que soit la mécanique retenue. C'est la forme que les lignes relevées plus bas
n'ont pas prise.

## 1. `specs/epics/e23-second-fournisseur-de-modele-qualifie/e23s02-le-manifeste-declare-la-strate-imposee-par-le-fournisseur.md`

| Ligne | § | Q | Ce que la ligne devrait dire à la place |
|---|---|---|---|
| 34–36 | 1 | Q1 | Que le lecteur d'un dossier peut savoir si la déclaration correspond encore à ce que le fournisseur impose — sans dire par quelle lecture. |
| 52–54 | 1 *After* | Q1 | Le même acquis au niveau de l'exigence modifiée : la déclaration ne peut pas vieillir en silence. |
| 73–74 | 3 | Q1 | Nommer l'acteur par ce qu'il garantit au lecteur, non par le fichier qu'il relit. |
| 85–86 | 4 | Q1 | Rien : cette précondition n'existe que pour la mécanique retenue et disparaît avec elle. |
| **105–107** | **5.8** | **Q1** | **Cas d'école du propriétaire.** Que l'écart entre déclaration et réalité est constaté avant que le harnais reparte. |
| 126–132 | 6d, 6e | Q1 | Deux situations vécues par un lecteur — la déclaration est fausse, la déclaration n'est plus vérifiable — au lieu de deux états du paquet. |
| 211–213 | 13 | Q1 | Que la déclaration est relue quand le fournisseur change, non que « le contrôle passe ». |
| 219–220 | 14 | Q2 | Que la déclaration ne coûte rien à l'exécution ; « soit une entrée aujourd'hui » est un compte daté. |
| **221–223** | **14** | **Q2** | **Cas d'école du propriétaire.** Rien : `12 ms`, `275 fichiers`, `10,2 Mo` mesurent une version et périment avec elle. |
| 224–226 | 14 | Q1+Q2 | Une règle de relevé chiffrée n'est pas un attribut de qualité ; l'acquis est qu'une ambiguïté ne passe pas pour une confirmation. |
| 238–239 | 15 | Q1 | Que rien de déclaré ne peut diverger sans être vu ; « comparaison mot pour mot » est la méthode. |
| 248–250 | 16 | Q1 | Que la correction se déduit du refus sans ouvrir le paquet — la langue et le libellé sont de l'implémentation. |
| 284–294 | 17 | Q1 | Deux critères d'acceptation adossés à ce que perd le lecteur, non au comportement interne du contrôle. |
| 315–317 | 18 | Q1 | Que la divergence entre paquet épinglé et paquet installé n'est pas couverte — l'acquis, pas le chemin non pris. |

**Ce qui passe le critère sans réserve :** §2 (L58–60), §8 *Raison de la profondeur* (L170–175),
§15 *Limite revendiquée* (L240–244), §19 (L328–335). Ces quatre passages nomment un bénéficiaire et
une garantie, et ne portent aucun chiffre. La tranche que trois rondes de relecture n'ont pas
attaquée est exactement celle qu'ils décrivent.

## 2. `specs/archive/amont/expression-besoins.md`

### Q1 — des maquettes écrites en exigences `[P0]`

| Ligne | Id | Ce que la ligne devrait dire à la place |
|---|---|---|
| 530–534 | UX-06 | Qu'un relecteur voit tout ce que le candidat a touché et ne peut pas confondre « non lu » avec « intact » ; « deux panneaux, arborescence à gauche, lecteur à droite » est une maquette. |
| 538–542 | UX-07 | Que le relecteur lit le code tel qu'il est écrit et distingue l'ancien du nouveau ; l'absence de `+`/`-`, de numéros de ligne et d'en-têtes de patch est un choix de rendu. |
| 546–548 | UX-08 | Qu'une revue se mène entièrement au clavier sans perdre sa place et sans jamais rien engager ; les neuf gestes énumérés sont l'inventaire d'un widget. |
| 570–572 | UX-11 | Que la même comparaison est disponible hors du TUI ; la liste des champs transmis est un contrat, pas un besoin. |
| 556 | UX-09 | *(mineur)* « doit utiliser des instantanés cohérents » nomme le moyen ; l'acquis est qu'une approbation ne glisse jamais sur une révision non vue. |
| 564 | UX-10 | *(mineur)* « chargés progressivement, avec bornes de ressources » nomme le moyen ; l'acquis est en fin de ligne, et suffit. |

### Q2 — des chiffres dans des exigences

| Ligne | Id / § | Ce que la ligne devrait dire à la place |
|---|---|---|
| 850 | NFR-04 | Que l'utilisateur garde la main : l'état répond sans attente perceptible et une annulation est honorée. Les trois durées sont des valeurs de configuration, pas l'exigence. |
| 852 | NFR-04 recette | Rien : `10 000 événements` et « une machine de référence documentée » figent une recette dans une exigence. |
| 350 | VER-04 recette | Qu'un survivant de mutation appelle un jugement, non un verdict ; `100 %` transforme un seuil en règle. |
| 400 | DEC-04 recette | Que la répétition sans progrès est reconnue avant l'épuisement du budget ; `trois candidats` est la valeur configurée. |
| 1236–1245 | §12 | La table est à sa place — ce sont des valeurs de départ configurables, et L1247 le dit. Le défaut n'est pas la table : c'est que ses chiffres sont recopiés ailleurs (voir §5). |

## 3. `specs/archive/amont/specification-fonctionnelle.md`

| Ligne | § | Q | Ce que la ligne devrait dire à la place |
|---|---|---|---|
| 663–672 | 10.1 | Q1 | Ce qu'un relecteur doit pouvoir établir sans quitter la vue : ce qui a changé, où, et sur quelle preuve. L'en-tête, les deux panneaux et la zone de contexte sont un plan d'écran. |
| 688–697 | 10.3 | Q1 | Que le relecteur choisit entre lire le changement, lire le fichier entier et lire ce qu'on lui reproche ; quatre modes numérotés sont un menu. |
| 699–717 | 10.4 | Q1 | Que la consultation n'engage jamais rien — ce que L717 dit déjà en une phrase. Les treize actions énumérées ajoutent un inventaire, pas une garantie. |
| 604–611 | 8.10 | Q2 | Voir §5 : cette table est la seconde copie des valeurs d'`expression-besoins.md` §12. |

### Une contradiction interne

`specification-fonctionnelle.md` L1256 pose en critère de complétude que « les règles de la vue de
revue sont testables **sans imposer un composant graphique précis** ». `expression-besoins.md` L530
(UX-06, `[P0]`) impose « une vue intégrée à deux panneaux ». Le document aval énonce le critère que
le document amont enfreint. C'est le même défaut que le §5.8 d'`e23s02`, une strate plus haut.

## 4. Mesures relevées ailleurs

| Fichier:ligne | Q2 | Lecture |
|---|---|---|
| `conception-verification.md:349` | `p95 état < 1 s`, `annulation < 2 s`, `grâce de 10 s` | Troisième copie de NFR-04. |
| `adr/D-33:7–9` | `NARROW_THRESHOLD` 100, `CONTENT_PAGE_LINES` 2 000, `FILE_READ_BUDGET_BYTES` 2 Mio | **Acceptable.** Un chiffre dans une décision est daté ; D-33 écrit son mécanisme de révision (L15). C'est la bonne place pour un nombre. |
| `adr/D-33:16–18` | « l'aide clavier de la revue, large de 123 colonnes » | Mesure du code d'alors écrite en conséquence, sans date ni mécanisme de révision. |
| `adr/D-40:34–35`, `D-41:14–22`, `D-42:18–19,37–38`, `D-43:7,10` | divers | **Acceptable.** Chiffres en *Motif* ou en *Conséquence* observée : une observation datée qui justifie une décision, non une obligation. |

Le corpus d'ADR ne porte pas le défaut. Il le porte d'autant moins qu'il nomme la mesure comme une
observation. Le défaut est dans les documents qui *obligent*.

## 5. Le même couple de nombres, écrit à quatre endroits

`20 min d'intervention` / `120 min d'incrément` existe en quatre exemplaires :

| Emplacement | Statut |
|---|---|
| `src/domain/policy.ts:69–70` | la valeur exécutée |
| `expression-besoins.md:1238` | valeur de départ proposée |
| `specification-fonctionnelle.md:606–607` | valeur de départ héritée |
| `adr/D-46:27–28` | **déclaré à remesurer** — « avec un modèle frontière la borne n'est plus le temps mais la fenêtre d'abonnement » |

Une décision a déjà périmé ce couple ; trois documents continuent de l'écrire. C'est la
démonstration matérielle de Q2 : un chiffre écrit dans une exigence se recopie, et la copie ne
sait pas qu'elle est fausse. Le même constat vaut pour les durées de NFR-04, présentes en trois
exemplaires (`expression-besoins.md:850`, `:1238`, `conception-verification.md:349`).

## 6. Ce que le critère coûte à Preflight

Deux contrôles lisent le corpus archivé et ne gardent leur pouvoir de refus que pour cette raison
(`specs/README.md`). `check-traceability.ts` refuse « une exigence `[P0]` absente de la matrice »,
sur les 85 exigences `[P0]` d'`expression-besoins.md`. UX-06 à UX-11 en font partie :
`archive/TRACEABILITY.md:53–54` trace donc aujourd'hui une maquette d'écran comme une obligation
produit.

Conséquence pratique pour la reprise : retirer une maquette d'une exigence `[P0]` déplace une ligne
de la matrice ; ce n'est pas un effet de bord à découvrir en route, c'est le prix annoncé du
critère.

## 7. Ce que ce relevé dit des deux branches en attente

La deuxième décision ouverte de `state.yaml` demande ce que chaque contrôle retiré doit établir.
Le relevé ne tranche pas, il donne l'élément qui manquait :

- **`controle-du-bloc-fournisseur`** — tout ce que le relevé retient contre `e23s02` (L34–36,
  L52–54, L73–74, L85–86, L105–107, L126–132, L211–213, L224–226, L238–239, L248–250, L284–294,
  L315–317) décrit ce contrôle. Aucune de ces douze lignes ne nomme un bénéficiaire. Le seul acquis
  qu'elles visent — que la déclaration ne vieillisse pas en silence — n'est écrit nulle part comme
  tel, et `e23s06` propose de l'obtenir autrement, en lisant ce que le modèle a réellement reçu.
- **`controle-de-capsule`** — hors du périmètre de ce relevé. Son bénéficiaire est nommé dans
  `D-54` (rien ne refuse une story dite faite sans preuve) et non dans une ligne relevée ici.

## 8. Les 24 parcours `PF-*` et les 45 scénarios `SA-*`

**Ces deux sections sont la partie saine du corpus.** 22 parcours sur 24 et 41 scénarios sur 45
passent le critère sans réserve. Les `SA-*` sont écrits en Gherkin sur des résultats observables —
`SA-012` (« les vérifications sont NOT_RUN »), `SA-020` (« l'intégration n'est pas répétée
automatiquement »), `SA-030` (« aucune décision humaine n'est créée ») — et ne portent ni mécanique
ni chiffre. Les `PF-*` décrivent un ordre et une condition de passage de gate, pas une construction.

Le relevé ne retient que ce qui suit.

### Q1 — quatre parcours et scénarios écrits sur le widget

| Ligne | Id | Ce que la ligne devrait dire à la place |
|---|---|---|
| 345, 347–348 | PF-12 (étapes 3, 5, 6) | Ce que le relecteur doit pouvoir établir ; « l'arbre », « ajuster la largeur » et « alterne arbre et lecteur » supposent l'écran retenu. Les étapes 2 et 8 et la phrase L352 sont déjà l'acquis et suffisent. |
| 1012 | SA-023 | Rien : L1011 (« les caractères source sont conservés exactement ») est le seul acquis du scénario, et il se suffit. L1012 énumère ce qu'un rendu ne doit pas faire. |
| 1027–1029 | SA-025 | Que la revue reste entièrement menable sur un terminal étroit — ce que L1030 et L1031 disent déjà. Les deux panneaux et leur alternance sont le moyen. |
| 1019 | SA-024 | *(mineur)* « change de panneau » cite le widget dans un scénario dont l'acquis (L1020–1021) n'en dépend pas. |

### Q2 — le budget de tentatives, en cinq exemplaires

| Ligne | Id | Écrit |
|---|---|---|
| 372 | PF-14 étape 6 | « Après la troisième tentative d'implémentation par défaut » |
| 927 | SA-015 | « un budget de trois tentatives dont une est consommée » |
| 937 | SA-016 | « trois tentatives d'implémentation consommées » |

Avec `expression-besoins.md:1236` et `specification-fonctionnelle.md:604`, **le nombre 3 est écrit
cinq fois**. Aucun des cinq ne se sait valeur configurée : `SA-016` conclut « aucune **quatrième**
tentative ne démarre », ce qui n'a de sens que pour ce chiffre-là. L'acquis est qu'un changement
s'arrête avant d'épuiser son budget sans décision, et il est indépendant de la valeur.

C'est le même mécanisme que le couple `20 min / 120 min` du §5, à un détail près qui l'aggrave :
là où `D-46` a au moins *daté* la péremption, rien ici ne dit que 3 est une valeur de départ.

## 9. Le défaut est un cluster, pas une dérive générale

Le relevé complet permet maintenant de le dire. Tout ce qui échoue Q1 dans la spécification
fonctionnelle et l'expression de besoins appartient à **un seul sujet, la vue de revue**, et ce
sujet est déclaré comme tel par le corpus lui-même (`specification-fonctionnelle.md:1241`) :

| Strate | Porteurs |
|---|---|
| Exigences `[P0]` | `UX-06`, `UX-07`, `UX-08`, `UX-11` |
| Spécification | §10.1, §10.3, §10.4 |
| Parcours | `PF-12` |
| Règle métier | `RM-062` |
| Acceptation | `SA-023`, `SA-025` |
| Traçabilité | `archive/TRACEABILITY.md:53–54` |

Partout ailleurs — 85 exigences fonctionnelles, 86 règles métier, 24 parcours, 45 scénarios — le
corpus dit ce que quelqu'un gagne. Le défaut n'est pas une manière d'écrire installée dans tout le
dépôt : c'est un sujet qui a été spécifié en dessinant un écran, et dont le dessin a ensuite été
recopié dans les cinq strates qui le suivent.

### La démonstration tient en deux lignes voisines

```
RM-062 | Le rendu par défaut n'affiche ni préfixes +/-, ni marqueurs de patch, ni colonne de numéros de ligne.
RM-063 | Les caractères + et - appartenant au code sont conservés intégralement.
```

`RM-063` dit ce que le relecteur gagne : le code qu'il lit est celui qui est écrit. `RM-062` dit
comment on a choisi de le lui donner. Supprimer `RM-062` ne retire rien à personne ; c'est `RM-063`
qui refuse. C'est le rapport du §2 au §5.8 d'`e23s02`, à une ligne de distance, dans le même tableau.

Neuf des dix règles de `§8.7` sont de la forme de `RM-063`. C'est la preuve que le corpus sait
écrire la bonne forme, et qu'il l'a fait ici même, la ligne d'après.
