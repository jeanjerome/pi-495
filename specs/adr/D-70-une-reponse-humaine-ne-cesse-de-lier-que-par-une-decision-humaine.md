# D-70: Une réponse humaine ne cesse de lier que par une décision humaine

**Status:** Acceptée ; complète `D-37` et `D-39`, révise `D-38`
**Date:** 2026-09-28

## Contexte

`D-37` a posé qu'une réponse matérielle rouvre la spécification et que G1 refuse l'exigence qui
l'ignore ; `D-39` que le noyau reporte au rapport suivant les déclarations de réponse qu'il a déjà
lues. Les deux décrivent l'état d'avant l'epic e01, qui laissait quatre trous, tous observés sur la
cible Maven des campagnes `java-*` :

- La réouverture ne comptait que les réponses aux questions que le rapport avait lui-même posées,
  et ne jugeait que le rapport présent quand la clarification reprenait, jamais celui qu'elle venait
  d'obtenir. Un rapport rouvert qui renommait l'exigence porteuse d'une réponse, sans rien demander,
  allait au mandat ; G1 le refusait en nommant la réponse perdue, et la reprise reproduisait le même
  document. Le changement était perdu (`~/.495-campagnes/java-flashnext-L2`, événements 183 à 195).
- Un rapport que la borne de progression interdisait de rouvrir était tenu pour établi : mandat
  proposé, adoption demandée au propriétaire sur un rapport qui avait perdu sa réponse, refus à G1
  avec `revise_requirements` qu'aucune commande ne tenait. Passé G0, aucune phase ne revient en
  arrière. Une déclaration qui nommait une exigence absente du rapport, ou aucune obligatoire,
  comptait pourtant comme portant la réponse.
- Le propriétaire n'avait devant une question matérielle que deux issues, répondre ou abandonner,
  tandis que le rapport pouvait seul déclarer qu'une réponse « ne fixe rien d'observable » : la
  réponse était alors adoptée à G1 sans obligation, et aucun contrôle ne la vérifiait. Un modèle
  l'a fait pour passer G1. Une réponse « 422 » ainsi déclarée laisse accepter un changement qui
  rend 400, soit le défaut qui a ouvert l'epic (`D-37`, motif).
- Une réponse donnée par erreur ne se reprenait pas : le noyau savait enregistrer une révocation,
  mais aucune commande de Pi ne l'atteignait, et elle ne défaisait rien.

Les quatre stories de l'epic ont fermé ces trous une à une, et leurs textes ne sont plus dans le
dépôt. Cette décision les tient en un seul lieu.

## Décision

Une réponse humaine à une question matérielle lie le changement jusqu'à ce qu'un humain en décide
autrement. Quatre règles le tiennent.

1. **La réouverture juge toute réponse matérielle enregistrée que le rapport ne porte pas, qu'il
   ait posé la question ou non.** Ce sont les réponses que G1 refuserait. Le rapport qu'une
   réouverture vient de produire est jugé de la même façon, avant que le mandat ne soit proposé. Une
   réponse est portée quand sa déclaration, propre au rapport ou héritée d'un rapport antérieur
   (`D-39`), tient dans ses propres exigences : elle nomme des exigences que le rapport porte, dont
   une obligatoire au moins. Ce qui borne la réouverture reste la progression : le rapport sur lequel
   la dernière réponse a été donnée est rouvert dès qu'il en perd une ; un rapport écrit depuis ne
   l'est que s'il porte une réponse qu'aucun rapport écrit depuis cette réponse, lui compris, ne
   portait. Adopter le mandat ou le voir refusé à G0 n'est pas une réponse.
2. **Une spécification qui ne progresse plus arrête le changement avant G0, en nommant la réponse
   perdue.** L'arrêt est une stagnation levable par une reprise ; son détail nomme chaque réponse
   perdue et les issues que des commandes tiennent : reprendre, clore une question, abandonner. Aucun
   mandat n'est proposé et G0 n'est pas évalué. La reprise produit une nouvelle spécification : la
   borne de progression repart de la dernière réponse matérielle ou de la dernière reprise humaine
   d'un arrêt, et le rapport trouvé est rouvert parce qu'il ignore une réponse. Un refus de G1 ne
   nomme plus que l'abandon, seule issue qu'une commande tienne une fois le mandat adopté.
3. **Seul l'humain clôt une question ou confirme qu'une réponse ne fixe rien d'observable.** IH-01
   offre trois issues : répondre, clore parce que la question n'est plus matérielle, abandonner ;
   devant l'arrêt du point 2, `/495 close <question>` clôt de même. La clôture est un acte humain
   inscrit sous son acteur, à provenance vérifiée comme une réponse. Une question close n'est plus
   posée, G0 ne la compte pas comme ouverte, G1 n'exige d'aucune exigence qu'elle la porte, le
   mandat la porte comme close avec le nom de qui l'a close, et le document d'exigences recopie sa
   réponse, quand elle en a reçu une, comme ne fixant rien d'observable. La déclaration
   `observable: false` d'un rapport n'est plus qu'une proposition : sans clôture, la réponse compte
   comme non portée, le rapport est rouvert ou le changement s'arrête comme au point 2, et l'arrêt
   nomme la proposition.
4. **Une révocation repose la question et défait ce qui a été adopté sur sa foi, jusqu'à la décision
   sur le candidat.** `/495 revoke <question>` révoque la résolution d'une question matérielle, sa
   réponse ou sa clôture, qu'elle vienne d'IH-01 ou de `/495 close`. C'est un acte humain inscrit sous
   son acteur, admis tant que le changement est actif et que son candidat n'est pas accepté, et
   refusé seulement pendant qu'une opération tourne. Dans la même décision, le noyau retire G0 et
   toutes les gates suivantes ; le mandat, les exigences, le protocole, la préparation et la
   conception ne sont plus adoptés et le protocole n'est plus gelé ; les preuves et les relectures
   sont invalidées ; les décisions humaines enregistrées sont révoquées, hors les réponses aux
   questions, les extensions de budget et les réconciliations d'un effet Git, dont l'effet tient ;
   les décisions en attente, hors questions, sont retirées ; la tentative restée ouverte est close ;
   le changement revient en clarification. La question est reposée telle que le journal la tient,
   par IH-01 et ses trois issues. Aucune intervention n'est lancée par la révocation, et aucun
   rapport écrit avant elle n'est repris : la spécification est réécrite sur la nouvelle résolution,
   dont les exigences adoptées à G1 et le protocole gelé à G2 découlent comme après une première
   réponse. L'outil exposé au modèle n'atteint pas la révocation.

**Ce qu'elle complète, et ce qu'elle révise.**

- `D-37` : la réouverture du point 1 y était bornée aux questions que le rapport avait posées, et
  le rapport « qui rend le même terrain » y était « refusé au point 2 », à G1 ; il arrête désormais
  le changement avant G0 (point 2). La dispense qu'une spécification s'accordait en déclarant une
  réponse non observable y était « un acte de la spécification » ; c'est désormais une proposition
  que seul l'humain confirme (point 3). Le refus de G1 reste ce qu'il y était pour ce qui passe
  l'arrêt.
- `D-39` : la déclaration héritée tombe toujours dès que le rapport cesse de porter l'exigence qui
  la tenait ; mais ce qu'elle fait tomber est repris par la réouverture du point 1 avant d'être un
  refus.
- `D-38` : la stagnation du point 2 est un blocage réessayable de plus, levé par `resume` ; mais sa
  reprise n'est pas la seule répétition de l'étape que `D-38` décrit : elle est un acte humain dont
  la borne de progression repart. Et le refus de G1, dont `D-38` disait que la reprise lève l'arrêt
  pour voir le même refus revenir, ne nomme plus que l'abandon.

**Motif.** Le défaut qui a ouvert l'epic est un jugement humain perdu entre le journal qui l'enregistre
et l'artefact qui lie le producteur : un changement accepté en rendant 400 là où le propriétaire avait
décidé 422. `D-37` fermait le premier chemin de cette perte, celui du rapport qui ignore une réponse
qu'il a lui-même demandée. Les trois autres chemins mesurés depuis, le rapport rouvert qui perd une
liaison sans rien demander, le rapport qui se dispense d'une réponse en la disant non observable, et
la réponse erronée que rien ne reprend, aboutissaient au même endroit : soit le changement perdu à
G1, soit un contrat que le propriétaire n'a pas voulu. La règle commune est que rien d'autre qu'un
humain ne peut défaire ce qu'un humain a décidé, et que le noyau s'arrête plutôt que d'adopter ce
qu'il ne peut pas rattacher à une décision.

## Conséquences

Une réponse matérielle coûte toujours une seconde intervention de spécification, comptée où
`D-37` la compte ; l'arrêt du point 2 attend le propriétaire sans limite de temps, et sans humain
entre deux relances rien ne consomme le budget. Une révocation défait aussi une préparation adoptée,
qui sera refaite et payée une seconde fois. Un changement est désormais révocable jusqu'à
l'acceptation du candidat, et ce qu'il avait adopté se relit au dossier comme révoqué, dans le
rapport comme dans l'export.

La recette de l'epic sur la cible Maven est `specs/verifications/e01s05/campagne-maven.md` : une
réponse « 422 » contraire au premier rapport y atteint les exigences adoptées et le protocole gelé,
la clôture et la révocation y sont exercées dans Pi, et le contrôle négatif rejoue le défaut sur la
construction d'avant l'epic. Restent hors de cette décision la révocation d'une décision autre
qu'une réponse ou une clôture, et la reprise depuis une seconde session vivante (`e09`).
