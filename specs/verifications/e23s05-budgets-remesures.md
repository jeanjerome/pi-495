# La borne d'appels arrête le changement, et la relance est celle du propriétaire

| | |
|---|---|
| Conduite le | 2026-09-23 (UTC) |
| Cible | `~/.495-campagnes/e23s04-cible` — arbre propre, commit `bac3d5b9`, référence `ref_78a7b98ea7fe`, `git_clean_head`, `sha256:78a7b98e…` |
| Demande | `/495 start greet doit rendre "Hello, <name>!" avec un point d'exclamation final` |
| Dossier distant | `~/.495-campagnes/e23s05-distant`, changement `chg_mudvf4f122b649e452`, `anthropic/claude-sonnet-5`, borne à 3 puis relevée |
| Dossier local | `~/.495-campagnes/e23s05-local`, changement `chg_mudw3dq9d1b7514b3d`, `omlx/qwen3.8-27b-oq8e`, bornes par défaut |
| Dossier de relance | `~/.495-campagnes/e23s05-relance-locale`, changement `chg_mudxhdlm52dbd65d1f`, `omlx/qwen3.8-27b-oq8e`, borne à 3 puis relevée |
| Instruments | `node scripts/measure-budgets.ts <dossier>` sur chacun, sortie 0 ; `node scripts/compare-dossiers.ts` sur deux paires |
| Intégration | désactivée ; aucune campagne n'écrit dans la cible |

La story demande trois choses d'une campagne réelle. Une borne d'appels atteinte arrête le
changement sous son nom, et rien ne démarre avant la relance. Le dossier porte le coût de chaque
intervention, ou un coût inconnu avec sa raison. Et la relance est un geste du propriétaire,
inscrit à son nom.

La campagne distante a montré l'arrêt et l'attente, et chacune des deux premières a montré son coût,
connu d'un côté, inconnu de l'autre. Elles ont aussi trouvé trois défauts, dont une relance inscrite
au nom du noyau. La troisième a tourné après la correction, sur
le modèle local, pour montrer la relance à son vrai nom. Les deux premières ont tourné sur le même
`dist/`, d'empreinte d'environnement `sha256:54027c76…`. La troisième a tourné sur le `dist/`
corrigé, `sha256:b7b44331…`.

## L'arrêt et la relance, tels que le journal les porte

| | distant | relance locale |
|---|---|---|
| borne en vigueur | 3 appels par intervention | 3 appels par intervention |
| intervention arrêtée | la spécification, la première du changement | la spécification |
| appel refusé | le quatrième, `tool call budget exceeded (4/3)` | le quatrième, `(4/3)` |
| fin inscrite | `cancelled` | `cancelled` |
| détail de cette fin | « …; the workspace keeps the unfinished work » | « …; a resume runs the specify intervention again from the start » |
| arrêt | `status.changed` → `blocked`, `budget_exhausted`, réessayable, par `495-kernel`, 08:58:43 | le même, par `495-kernel`, 09:56:40 |
| entre l'arrêt et la relance | aucun événement, 2 min 36 s | aucun événement, 1 min 37 s |
| relance | `status.changed` → `ready`, par **`495-kernel`** | `status.changed` → `ready`, par **`jeanjerome`**, `human`, `tui_session`, `session` |
| ensuite | spécification refaite, préparation, implémentation | les mêmes |
| issue | `accepted`, G0 à G5 `PASS`, une tentative | `accepted`, G0 à G5 `PASS`, une tentative |

Le détail de l'arrêt est le même dans les deux dossiers : « specify intervention: tool call budget
exceeded (4/3); the change waits for its owner, and a raised bound takes effect in a new session ».
Il nomme le rôle, la valeur de la borne, ce qui a été consommé, et le geste qui lève l'arrêt.
L'arrêt et la relance se suivent dans la chaîne, aux séquences 12 et 13 des deux dossiers.

Le nom de la relance est porté deux fois. L'événement porte l'acteur entier, et la chaîne en garde
l'identifiant dans sa colonne `actor_id`. Dans le dossier distant, les deux disent `495-kernel`.
Dans le dossier de relance, les deux disent `jeanjerome`.

## Les appels en vol au moment du refus

Dans les deux campagnes, le modèle a lancé plusieurs appels d'un coup, et celui qui dépassait la
borne faisait partie d'un lot.

- **distant** : un `grep`, puis trois `read` lancés dans la même milliseconde. Ces `read` sont les
  appels 2, 3 et 4.
- **relance locale** : un `grep` et un `ls` ensemble, puis deux `read` ensemble. Ces `read` sont
  les appels 3 et 4.

Dans les deux cas, tous les `read` du dernier lot finissent en erreur, en moins de deux
millisecondes, y compris ceux qui tenaient dans la borne : deux côté distant, un côté local. Le
dossier ne garde pas le texte de ces erreurs. La spécification étant refaite depuis le début, rien
de ce que ces lectures auraient rendu n'était à garder. Le journal compte trois appels pour l'intervention arrêtée, car l'appel refusé n'est pas
inscrit. Le worker en compte quatre.

Le worker finit dans les deux cas en `failed: This operation was aborted`. C'est l'interruption du
superviseur qui l'emporte sur l'erreur que le worker lève dans l'outil. Le journal inscrit
`cancelled`, qui est ce que le noyau a décidé. Son coût est lu malgré l'interruption.

## La relecture des trois dossiers

Sortie de `node scripts/measure-budgets.ts`, sans l'en-tête ni la section des coûts, reprise plus
bas. La ligne `bornes` dit ce que l'instrument lit **aujourd'hui** dans `config.json`, pas la borne
à 3 sous laquelle l'arrêt a eu lieu. Le journal ne garde pas les bornes en vigueur. La valeur de
celle qui a arrêté la spécification ne se lit que dans le détail de l'arrêt, `4/3`. Les projections
portent donc sur les bornes par défaut.

**Distant.**

```
bornes      100 appels d'outils et 20 min par intervention, lues dans config.json tel qu'il est aujourd'hui : le journal ne garde pas celles sous lesquelles la campagne a tourné

n°        rôle       fin        appels  durée       débit      jetons   coût
1         specify    cancelled  3       7,6 s       23,8 /min  5 768    0,0123 $
2         specify    completed  5       19,8 s      15,2 /min  14 252   0,0268 $
3         prepare    completed  18      1 min 3 s   17,3 /min  104 611  0,0835 $
4         implement  completed  13      48,4 s      16,1 /min  110 882  0,0595 $
ensemble                        39      2 min 18 s  16,9 /min  235 513  0,1822 $

projection — ce que les bornes en vigueur feraient à ce débit, pas ce qui s'est passé
  1         specify    le nombre d'appels tombe le premier, au bout de 4 min 12 s
  2         specify    le nombre d'appels tombe le premier, au bout de 6 min 35 s
  3         prepare    le nombre d'appels tombe le premier, au bout de 5 min 48 s
  4         implement  le nombre d'appels tombe le premier, au bout de 6 min 13 s
  ensemble             le nombre d'appels tombe le premier, au bout de 5 min 55 s
```

**Local, sans borne abaissée.**

```
bornes      100 appels d'outils et 20 min par intervention, valeurs par défaut, faute de config.json dans ce dossier : le journal ne garde pas celles sous lesquelles la campagne a tourné

n°        rôle       fin        appels  durée        débit     jetons   coût
1         specify    completed  7       1 min 8 s    6,2 /min  9 933    inconnu
2         prepare    completed  5       1 min 39 s   3,0 /min  19 424   inconnu
3         implement  completed  7       2 min 55 s   2,4 /min  48 204   inconnu
4         implement  completed  12      6 min 50 s   1,8 /min  109 419  inconnu
ensemble                        31      12 min 31 s  2,5 /min  186 980  inconnu

projection — ce que les bornes en vigueur feraient à ce débit, pas ce qui s'est passé
  1         specify    le nombre d'appels tombe le premier, au bout de 16 min 6 s
  2         prepare    la durée tombe la première, vers 61 appels
  3         implement  la durée tombe la première, vers 48 appels
  4         implement  la durée tombe la première, vers 35 appels
  ensemble             la durée tombe la première, vers 50 appels
```

La première tentative a échoué au contrôle `unit` (G5 `FAIL`), et la seconde l'a passé. D'où les
deux implémentations.

**Relance locale.**

```
bornes      100 appels d'outils et 20 min par intervention, valeurs par défaut, faute de config.json dans ce dossier : le journal ne garde pas celles sous lesquelles la campagne a tourné

n°        rôle       fin        appels  durée       débit     jetons  coût
1         specify    cancelled  3       18,6 s      9,7 /min  3 953   inconnu
2         specify    completed  8       1 min 27 s  5,5 /min  13 216  inconnu
3         prepare    completed  9       1 min 46 s  5,1 /min  21 223  inconnu
4         implement  completed  9       1 min 14 s  7,3 /min  37 265  inconnu
ensemble                        29      4 min 46 s  6,1 /min  75 657  inconnu

projection — ce que les bornes en vigueur feraient à ce débit, pas ce qui s'est passé
  1         specify    le nombre d'appels tombe le premier, au bout de 10 min 19 s
  2         specify    le nombre d'appels tombe le premier, au bout de 18 min 10 s
  3         prepare    le nombre d'appels tombe le premier, au bout de 19 min 34 s
  4         implement  le nombre d'appels tombe le premier, au bout de 13 min 44 s
  ensemble             le nombre d'appels tombe le premier, au bout de 16 min 25 s
```

## Le débit du modèle local ne se fixe pas d'une conduite à l'autre

Même modèle, même cible, même demande. Le débit d'ensemble vaut 4,6 appels par minute dans
`e23-local`, 2,5 dans `e23s05-local` et 6,1 dans `e23s05-relance-locale`. Les deux bornes par
défaut coïncident à 5 appels par minute. Aux deux premiers débits, c'est la durée qui tombe la
première. Au troisième, c'est le nombre d'appels, et il l'est pour chaque intervention.

Le commentaire posé à côté des bornes (`src/domain/policy.ts`) et `D-59` décrivent la mesure
d'`e23-local`, et ils la datent. Ils restent exacts sur cette mesure. Mais « sur le modèle local,
la durée tombe la première au débit d'ensemble » ne vaut que pour une conduite : sur ce cas, le
modèle local passe d'un côté à l'autre de la bascule. Ce relevé ne dit pas pourquoi. Le dossier
garde les durées et les appels, pas ce qui occupait la machine.

## Les coûts

| | distant | local | relance locale |
|---|---|---|---|
| spécification arrêtée | 0,0123 $ | — | inconnu |
| après la relance | 0,1699 $ | — | inconnu |
| total | 0,1822 $ | inconnu | inconnu |
| base | tarif du catalogue de l'hôte, fournisseur employé par abonnement | « the host catalogue has no rate for omlx/qwen3.8-27b-oq8e », hors abonnement | la même raison |

Côté distant, chaque intervention porte le total que l'hôte calcule pour sa session, au tarif de
son catalogue. L'intervention arrêtée porte ce qu'elle a dépensé avant l'arrêt, lu malgré
l'interruption. Ce que la relance a engagé, 0,1699 $, est la somme des trois interventions qui la
suivent. Dans le dossier distant, cette dépense est encore inscrite sous une relance du noyau.

Côté local, les huit interventions des deux dossiers ont un coût inconnu, avec sa raison. Aucun
zéro n'est inscrit, ni au journal ni dans la relecture.

## Ce que la comparaison des dossiers énonce

`compare-dossiers.ts` lit désormais la fin d'une session dans le journal. L'arrêt s'y lit
`cancelled: stopped by the tool call budget: tool call budget exceeded (4/3) …`, sous « unfinished
interventions ». Il n'est plus rangé sous « schema refusals ». Sur les trois dossiers, aucun
rapport n'a été refusé par le schéma de sortie.

- **Local contre distant** — sortie 1. Les portes, la référence et le contrôle `unit` concordent.
  Mais `test/lint.test.js` n'est ajouté que du côté distant, et l'instrument compte un chemin
  modifié d'un seul côté parmi ce qui décide. Les deux spécifications exigent pareillement que
  `lint.mjs` réponde « lint ok » (`r-lint-pass`, `r-lint-var`). Le côté distant a ajouté un fichier
  de test pour le vérifier, et le côté local non. La recette de cette story ne repose pas sur cette
  paire. Elle porte sur l'arrêt, la relance et le coût.
- **Relance locale contre distant** — sortie 0. Le même cas de contrat est rendu des deux côtés :
  six `PASS`, la même référence, les trois mêmes chemins modifiés, le même contrôle. Les deux
  conduites se sont arrêtées sur la spécification, puis ont repris jusqu'au verdict.

## Ce que la correction a changé

Les trois défauts trouvés par les deux premières campagnes sont corrigés, chacun avec son test. La
troisième campagne en montre deux en situation.

1. **La relance est inscrite au nom de celui qui relance** (`src/application/harness.ts`). Avant :
   `495-kernel` dans le dossier distant. Après : `jeanjerome`, `human`, `tui_session`, dans le
   dossier de relance. Le journal dit désormais qui a engagé la dépense d'après l'arrêt.
2. **La fin d'une intervention arrêtée dit ce que la relance en fait**
   (`src/application/intervention.ts`). Avant : « the workspace keeps the unfinished work » pour la
   spécification, qui est pourtant refaite depuis le début. Après : « a resume runs the specify
   intervention again from the start ». Seule l'implémentation garde son espace de travail et la
   formule d'avant.
3. **La comparaison classe l'arrêt d'après le journal** (`scripts/compare-dossiers.ts`). Relu par
   l'instrument corrigé, le dossier distant ne compte plus de refus du schéma. Son arrêt apparaît
   parmi les interventions inachevées.

Les dossiers distant et local restent tels qu'ils ont été écrits. Ils portent la relance du noyau et
l'ancienne formule. Aucune correction ne les réécrit.

## Ce que ce relevé n'établit pas

**La reprise du producteur dans sa tentative.** Les deux arrêts réels sont tombés sur la
spécification. La borne vaut pour tous les rôles. Pour arrêter l'implémentation, elle doit donc
laisser passer la spécification et la préparation, qui la précèdent. Dans ces trois conduites,
l'implémentation n'a jamais consommé plus d'appels que ces deux rôles, sauf à la seconde tentative
locale, que rien ne permettait de prévoir avant le départ. La reprise sur le même espace de
travail, et le message qui la dit, restent tenus par `test/v2/tool-call-budget.test.ts`. Il en va
de même pour l'arrêt de la préparation et pour celui de la revue.

**La borne relevée à la relance.** Le journal ne garde pas les bornes en vigueur. Que la relance
ait tourné sous une borne relevée se déduit de deux faits. La configuration n'est lue qu'à
l'ouverture d'une session (`src/extension/runtime.ts`). Et la spécification refaite a consommé 8
appels sans être arrêtée. De même, `pi_bindings` ne garde qu'une ligne, celle de la session qui a
démarré le changement : qu'une session neuve ait porté la relance se déduit de la même façon, sans
être inscrit.

**Une relance sans propriétaire établi.** En mode `-p`, ou en RPC sans
`HARNESS495_RPC_HUMAN_ACTOR`, la commande n'a aucune origine humaine à transmettre. La relance y
reste inscrite au nom du noyau. Aucune campagne ne l'a exercée.

**La borne de durée.** Aucune intervention n'a approché les 20 minutes. La fin d'une intervention
tronquée par la durée garde « the workspace keeps the unfinished work » pour tous les rôles. C'est
faux pour la spécification, dont l'espace est effacé à la fin de l'intervention. Ce défaut n'est
pas corrigé : ce que la durée fait des rôles autres que le producteur relève de `D-19`.

**Une facture.** Le coût est le calcul de l'hôte au tarif de son catalogue. Aucun montant n'est lu
sur ce que le fournisseur facture.

**Un changement long.** Un cas de contrat minimal, quatre interventions au plus, trois fichiers
touchés au plus. La mesure dit quelle borne tombe la première à un débit donné. Elle ne dit pas
quelle valeur conviendrait à un changement long, et elle ne fixe pas le débit du modèle local.
