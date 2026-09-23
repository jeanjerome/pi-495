# D-59: La borne d'appels arrête le changement et attend le propriétaire

**Status:** Acceptée
**Date:** 2026-09-23

## Context

Une intervention a deux bornes par défaut : 20 minutes et 100 appels d'outils. Seule la durée avait
un effet qui la nommait. Elle suspend l'intervention, et le producteur reprend sur son espace de
travail, dans la même tentative (`D-19`). Le nombre d'appels, lui, annulait l'intervention, et
chaque rôle en tirait une conséquence différente. Sondé avec un producteur scripté, noyau et
application réels, le changement était bloqué comme une erreur d'exécution, avec pour détail
« producer intervention cancelled ». Lu dans le code sans être sondé : la spécification levait une
erreur de configuration réessayable, la préparation continuait sur un résultat partiel, et la revue
était inscrite invalide. Le motif `budget_exhausted` était déclaré parmi les motifs d'arrêt
(`contracts/v1/common.ts`), et rien ne l'émettait. Le dossier ne disait donc jamais ce qui s'était
passé : la limite fixée par le propriétaire avait été atteinte.

Laquelle des deux bornes tombe la première dépend du débit d'appels, et le débit dépend du modèle
comme de la cible. Les deux bornes coïncident à 5 appels par minute. Voici le cas de contrat minimal
de la campagne à deux fournisseurs, relu depuis les dossiers conservés par
`scripts/measure-budgets.ts` :

| Modèle | Débit d'ensemble | Selon l'intervention | Borne qui tombe la première |
|---|---|---|---|
| `anthropic/claude-sonnet-5` | 16,0 appels / min | de 13,9 à 19,0 | le nombre d'appels, au bout de 6 min 15 s |
| `omlx/qwen3.8-27b-oq8e` | 4,6 appels / min | de 3,8 à 5,3 | la durée, vers 92 appels |

Sur le modèle distant, les deux tiers de la durée ne servent jamais. Sur le modèle local, la durée
tombe la première au débit d'ensemble, mais pas pour chaque intervention. Sa spécification a tourné
à 5,3 appels par minute, et à ce débit, c'est le nombre d'appels qui tombe, au bout de 18 min 42 s.
Le chiffre sur lequel les bornes avaient été réglées, 2,5 appels par minute, venait d'une autre
cible, avec le même modèle local. Le même travail avait donc un sort différent selon la vitesse du
modèle et selon le rôle.

`D-46` avait posé qu'avec un modèle frontière, la borne cesserait d'être le temps pour devenir la
fenêtre d'abonnement. Pi dit le contraire (`providers.md` § Subscriptions). L'usage d'un abonnement
Claude Pro ou Max par un harnais tiers est prélevé sur l'usage supplémentaire du compte et facturé
au jeton. Il n'est pas compté sur les plafonds du plan. Sur ce chemin, aucune fenêtre ne borne la
dépense : ce qui la borne, c'est ce que le propriétaire paie. Dans le harnais, c'est le nombre
d'appels qu'une intervention peut conduire.

Deux effets restaient possibles pour la borne d'appels : arrêter le changement jusqu'au geste du
propriétaire, ou reprendre de soi-même, comme la durée.

## Decision

Le propriétaire a tranché le 2026-09-23. Quel que soit le rôle, une intervention qui atteint sa
borne d'appels arrête le changement sous le motif `budget_exhausted`. Le changement attend alors son
propriétaire, et rien n'est dépensé au-delà de la borne sans son geste.

- Le détail de l'arrêt nomme le rôle, la borne, sa valeur et ce qui a été consommé. L'intervention
  reste inscrite `cancelled`. Le changement n'est inscrit ni comme une erreur d'exécution, ni comme
  une erreur de configuration, ni comme une revue invalide. La préparation ne continue pas sur un
  résultat partiel.
- C'est le refus du noyau qui décide, lu côté application, et non l'événement final du worker. Le
  worker contrôle aussi la borne (`budgetCheck`, `worker-main.ts`), mais celui des deux contrôles
  qui la constate le premier ne change pas l'issue.
- Une relance lève l'arrêt. Aucune intervention ne démarre avant elle, puisque le noyau refuse d'en
  lancer une sur un changement bloqué. Pour dépenser davantage, le propriétaire relève la borne dans
  `config.json`. La nouvelle valeur prend effet dans une nouvelle session.
- À la relance, le producteur reprend dans la même tentative, sur le même espace de travail, et on
  lui dit qu'il reprend. La spécification, la préparation et la revue ne gardent rien d'une
  exécution à l'autre : elles refont leur intervention.
- Une relance faite sans relever la borne s'arrête de nouveau dès que la borne est atteinte.

La durée garde son effet (`D-19`). Elle suspend l'intervention, qui reprend d'elle-même dans la
limite des continuations.

L'option écartée est la reprise automatique de la borne d'appels, comme pour la durée. Sur un
fournisseur facturé au jeton, chaque reprise engage une dépense nouvelle que le propriétaire n'a
pas vue.

Le coût est inscrit au dossier, sans être opposé à une limite. Chaque intervention porte le total
que l'hôte calcule pour sa session (`getSessionStats()`), au tarif de son catalogue. Elle dit aussi
si le fournisseur est employé par abonnement (`isUsingSubscription()`). 495 ne tient aucune table
de prix. Le coût est inconnu, avec sa raison, dans trois cas : le catalogue ne tarife pas le modèle,
la session ne rapporte aucun usage, ou la fin a été synthétisée sans le worker. Il n'est jamais
inscrit nul. Aucune borne en argent n'est posée : aucune exigence n'en demande, et la borne d'appels
limite déjà la dépense, intervention par intervention.

Les valeurs par défaut ne changent pas : 100 appels et 20 minutes par intervention, 120 minutes par
incrément. Le cas mesuré est minimal et n'a atteint aucune borne. Aucune de ses interventions n'a
dépassé 8 appels ni 1 min 45 s. Il dit laquelle tombe en premier, pas quelle valeur convient à un
changement long. Chaque borne porte ce motif à côté d'elle, dans `src/domain/policy.ts`.

## Consequences

La prémisse de `D-46` est corrigée là où elle était écrite. La décision porte une révision qui
renvoie ici, et la capsule de l'epic `e23` dit que la dépense se compte au jeton.

Le sort d'une intervention longue dépend encore du débit. Au-dessus de 5 appels par minute, elle
arrête le changement ; en dessous, elle est suspendue et reprend d'elle-même. Mais chacun des deux
sorts est désormais nommé au dossier, et la borne qui tombe la première sur un modèle frontière est
celle qui attend le propriétaire.

La borne d'appels ne limite la dépense qu'intervention par intervention. Chaque continuation est une
intervention nouvelle, avec son propre compte d'appels. Un modèle facturé qui tourne sous 5 appels
par minute, par exemple sur une cible dont les outils sont lents, atteint donc la durée d'abord. Le
producteur reprend alors de lui-même, jusqu'à trois fois. Entre deux gestes du propriétaire, la
dépense est alors limitée par les continuations et par la durée de l'incrément, et non par la seule
borne d'appels. Ce cas est lu dans le code, et aucune campagne ne l'a encore produit.

`budget_exhausted` reçoit son premier émetteur, et il est de ceux qu'une relance lève.

La préparation relancée refait son intervention, car elle ne garde pas son espace de travail. Ce
qu'elle a dépensé avant l'arrêt est donc dépensé une seconde fois. La faire reprendre là où elle en
était serait un autre changement que celui que cet arrêt demande.

Les dossiers écrits avant cette décision ne portent aucun coût. Leur relecture dit « non inscrit »,
jamais zéro. Le journal ne garde pas non plus les bornes sous lesquelles une campagne a tourné. La
relecture lit donc `config.json` tel qu'il est au moment où elle s'exécute, et elle le dit.

Ce qui n'est pas encore observé, c'est la course entre le contrôle du worker, qui lève une erreur
dans l'outil, et le superviseur qui interrompt la session. La décision tient par construction,
puisque le refus du noyau décide. Une campagne réelle sur le fournisseur d'abonnement doit encore
exercer l'arrêt, puis la relance.
