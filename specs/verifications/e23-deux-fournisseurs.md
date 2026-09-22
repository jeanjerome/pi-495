# Le même cas de contrat, conduit sur deux fournisseurs qualifiés

| | |
|---|---|
| Conduite le | 2026-09-22 (UTC) |
| Cible | `~/.495-campagnes/e23s04-cible` — arbre propre, commit `bac3d5b9`, référence `sha256:78a7b98e…`, quatre fichiers, 547 octets |
| Demande | `/495 start greet doit rendre "Hello, <name>!" avec un point d'exclamation final` |
| Dossier local | `~/.495-campagnes/e23-local`, changement `chg_mud7ornsf1ceee37d9`, modèle `omlx/qwen3.8-27b-oq8e` |
| Dossier distant | `~/.495-campagnes/e23-distant`, changement `chg_mud785qka4be7ca845`, modèle `anthropic/claude-sonnet-5` |
| Instrument | `node scripts/compare-dossiers.ts --local ~/.495-campagnes/e23-local --distant ~/.495-campagnes/e23-distant` — sortie 0 |
| Intégration | désactivée ; aucune campagne n'écrit dans la cible, et les deux reposent donc sur la même référence |

La recette d'AGT-02 demande que le même cas de contrat passe avec deux fournisseurs qualifiés. Elle
était tenue par des preuves unitaires : chaque pièce du chemin avait son test, et les campagnes que
le dossier appelait `anthropic` employaient un endpoint local sous un autre nom. Ce relevé est le
premier parcours complet conduit deux fois, une fois sur la machine et une fois hors d'elle.

## Ce que les deux dossiers rendent de la même façon

| | local | distant |
|---|---|---|
| issue | `accepted` | `accepted` |
| arrêt | aucun | aucun |
| G0 à G5 | six `PASS` | six `PASS` |
| référence | `sha256:78a7b98e…` | `sha256:78a7b98e…` |
| contrôle `unit` | `PASS` | `PASS` |
| chemins modifiés | 2 | 2 |
| `src/greet.js` | `sha256:d93ba2d5…`, 60 o | `sha256:d93ba2d5…`, 60 o |
| tentatives | 1 sur 3 | 1 sur 3 |
| reprises techniques | 0 | 0 |

Les deux fournisseurs écrivent le même `src/greet.js`, à l'octet près. C'est le seul endroit où la
paire se rejoint par le contenu, et rien ne l'exigeait : ce que la recette oppose, ce sont les
portes, la référence, les chemins touchés et les verdicts de contrôle, pas le texte produit.

## Ce que chaque campagne a coûté

| | local (`omlx/qwen3.8-27b-oq8e`) | distant (`anthropic/claude-sonnet-5`) |
|---|---|---|
| specify | 79 s, 7 appels d'outils, 10 372 jetons | 21 s, 5 appels, 13 629 jetons |
| prepare | 105 s, 8 appels, 18 980 jetons | 22 s, 7 appels, 31 590 jetons |
| implement | 64 s, 4 appels, 26 173 jetons | 17 s, 4 appels, 33 396 jetons |
| total | 248 s, 19 appels, 55 525 jetons | 60 s, 16 appels, 78 615 jetons |
| débit par intervention | 3,8 à 5,3 appels d'outils par minute | 13,9 à 19,0 |
| débit d'ensemble | 4,6 par minute | 16,0 |
| refus du schéma de sortie | 0 | 0 |
| réécritures du contexte par l'hôte | 0 | 0 |

Le fournisseur distant rend le même contrat en un quart du temps, pour 1,42 fois plus de jetons et
trois appels d'outils de moins. Le débit d'appels d'outils diffère d'un facteur trois et demi.

**Ce que ce chiffre fait aux budgets.** Une intervention dispose de 20 minutes et de 100 appels
d'outils (`DEFAULT_POLICY`, `src/domain/policy.ts`). À 4,6 appels par minute, 100 appels demandent
près de 22 minutes : la borne de durée tombe la première et l'intervention est écourtée vers 92
appels. À 16,0 appels par minute, les 100 appels sont atteints en un peu plus de 6 minutes : c'est
la borne d'appels qui tombe la première, et les deux tiers du budget de durée ne servent jamais.
Les deux bornes ont été calibrées sur le seul modèle local ; cette campagne les mesure et ne les
corrige pas. La correction est le sujet d'`e23s05`.

Le coût en argent n'est pas au dossier : l'hôte le rapporte pour chaque réponse, détaillé par
entrée, sortie et cache, et 495 n'en lit rien. Seuls les jetons sont comptés.

## La strate imposée : les deux cas exercés dans une même paire

`e23s02` avait fait déclarer au manifeste ce qu'un fournisseur écrit au-dessus des instructions
locales, et sa vérification inscrivait en toutes lettres que le vrai chemin d'abonnement n'avait
jamais été exercé. Les trois manifestes de chaque campagne portent aujourd'hui les deux cas :

- **local** — `imposed_layers: []`. Le champ est présent et vide : un fournisseur qui n'impose rien
  le dit, au lieu de laisser un lecteur deviner si la liste manque ou si elle est vide.
- **distant** — une strate, dans les trois manifestes, avec ses quatre champs : `provider_id`
  `anthropic`, `position` `above_local_instructions`, `condition` « the OAuth subscription path is
  used (an access token prefixed sk-ant-oat) », et le texte imposé mot pour mot.

La condition déclarée est cette fois réellement remplie : la campagne est passée par le chemin
d'abonnement. Le versant déclaratif de la clause n'est donc plus une attente.

Ce que le fournisseur a réellement écrit au-dessus des instructions locales reste non observé. Le
manifeste déclare la strate depuis le paquet du fournisseur, non depuis la requête émise ; lire
l'écrit demande la charge utile que l'hôte publie, et c'est `e23s06`.

## Un défaut trouvé en route, et la preuve qui le porte

Entre les deux campagnes, une conduite sur le modèle local s'est bloquée en
`CONFIGURATION_ERROR: specification intervention completed with an invalid structured output`. Le
dossier est conservé : `~/.495-campagnes/e23-local-rapport-refuse`, changement
`chg_mud7dqvg218ee44a5e`.

Le rapport refusé y est gardé en entier, texte brut compris — 2 385 caractères, deux phrases de
prose puis un objet JSON complet et bien formé, sans bloc clôturé. Le repli qui lit un objet nu
s'ancrait sur la **dernière** accolade ouvrante du texte, à l'offset 2 049 sur 2 385 : celle-ci
ouvre un objet imbriqué, dont la tranche court au-delà de sa propre fin et ne s'analyse en rien. Un
modèle qui avait répondu correctement était donc inscrit au dossier comme un modèle qui n'avait pas
su répondre.

Rejoué sur le texte conservé, l'ancrage sur la dernière accolade ne lit aucune valeur ; l'essai de
chaque accolade depuis la première lit l'objet attendu et ses neuf clés. Le correctif est dans
`src/contracts/v1/reports.ts`, avec son cas dans `test/v0/reports.test.ts`.

**Ce que le dossier ne peut pas dire.** Les deux campagnes comptent zéro refus du schéma, et aucune
des deux ne dit si le repli réparé a servi : un rapport accepté ne conserve que sa forme analysée,
jamais son texte. Seul un rapport refusé garde son brut. Le zéro est donc un zéro de refus, pas une
preuve que tous les rapports portaient un bloc clôturé.

## Les trois refus conservés

Chacun est un dossier complet, relisible à froid, et chacun montre un refus qui a un effet avant
qu'une intervention soit inscrite.

| Dossier | Refus | Effet |
|---|---|---|
| `e23-distant-refuse` (21:32 UTC) | `POLICY_DENIED: anthropic is not declared in policy.egress; declared destinations: omlx` | changement bloqué en `clarifying`, **zéro intervention**, aucune requête émise |
| `e23-distant-sans-auth` (21:37 UTC) | `CAPABILITY_MISSING: model anthropic/claude-sonnet-5 cannot carry this intervention: anthropic/claude-sonnet-5 has no complete authentication in Pi` | changement bloqué, **zéro intervention**, rien de facturé |
| `e23-local-rapport-refuse` (21:45 UTC) | `CONFIGURATION_ERROR: specification intervention completed with an invalid structured output` | une intervention inscrite, sortie refusée, rapport brut conservé |

Les deux premiers précèdent la campagne distante de neuf et de quatre minutes : le même modèle, dans
le même répertoire de données, refusé puis conduit. Ce qui les sépare est l'ouverture de session
chez l'hôte, geste du propriétaire, et la déclaration de sortie écrite à la main.

## Ce que la comparaison énonce sans l'opposer

L'instrument sépare ce qui décide de ce qui n'est qu'énoncé : deux modèles n'écrivent pas le même
code, et une comparaison qui l'exigerait refuserait tous les couples de fournisseurs au lieu de ceux
qui se contredisent. Énoncé ici, opposé à aucun des deux :

- `test/greet.test.js` n'a pas le même contenu — 191 octets contre 273.
- Les deux spécifications ne nomment pas les mêmes exigences : `r-greet-exclamation`,
  `r-test-updated`, `r-lint-preserved` contre `r-greet-exclamation`, `r-update-existing-test`.
  Trois obligatoires d'un côté, deux de l'autre.

## Ce que ce relevé n'établit pas

**Les deux campagnes n'ont pas tourné sur la même version du harnais.** Leurs empreintes
d'environnement diffèrent — `sha256:957139c2…` pour la distante, `sha256:e7de231f…` pour la locale
— et cette empreinte couvre le digest du `dist/` exécuté. La campagne distante a précédé le
correctif du repli, la locale l'a suivi ; recalculée sur le `dist/` courant et le bac à sable
`seatbelt`, l'empreinte d'environnement rend exactement celle du dossier local. Ce que la
différence touche est la lecture d'un rapport sans bloc clôturé, rien des portes ni des contrôles ;
il reste que la paire compare deux exécutions de deux versions, et que
`scripts/compare-dossiers.ts` imprime les deux empreintes sans les ranger ni parmi ce qui décide ni
parmi ce qui est énoncé. Reconduire la campagne distante sur le `dist/` courant lèverait la réserve,
au prix d'une seconde dépense ; le propriétaire a tranché le 2026-09-23 de ne pas la reconduire et
de laisser la réserve écrite. Elle vaut donc pour cette paire de dossiers, telle qu'elle est
énoncée ici et dans la matrice, et rien n'attend plus son sujet.

**Un seul couple, un seul cas.** Un cas de contrat minimal, trois interventions, deux fichiers
touchés. Rien ici ne dit ce que deux fournisseurs rendent d'un changement long, d'une cible à
plusieurs modules, ou d'une conduite qui dépense ses trois tentatives.

**Aucune réécriture du contexte n'a eu lieu.** Le mécanisme qu'`e23s04` a réparé — lire ce que
l'hôte rapporte de la réécriture, en compter le coût, l'inscrire au dossier — reste tenu par ses
tests. Les deux campagnes sont restées loin du seuil de la fenêtre.
